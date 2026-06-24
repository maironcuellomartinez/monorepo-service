// scripts/seed-m2m-services.ts
// Registra los Servicios M2M (type='m2m_service') en ABAC y emite sus JWT.
// Idempotente: si ya existen, re-emite el JWT y muestra ABAC_M2M_TOKEN.
//
// Diseño: el applicationId es la identidad del servicio (sub = applicationId).
// No se crean service accounts, roles ni permisos — el ecosistema se controla
// con ownerApplicationId en el JWT y ABAC_APP_ID en cada gateway.
//
// Uso:
//   npx ts-node -r tsconfig-paths/register src/scripts/seed-m2m-services.ts
//
// Variables de entorno requeridas (o usa los valores por defecto para dev):
//   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME
//   ED25519_PRIVATE_KEY  — 64 bytes Base64 (nacl secretKey, generado por npm run seed)

import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { config } from 'dotenv';
import * as path from 'path';
import { JwtEd25519Service } from '../common/crypto/jwt-ed25519.service';

const env = process.env.NODE_ENV || 'development';
config({ path: path.resolve(process.cwd(), `.env.${env}`) });

// ─── Tipo de servicio ──────────────────────────────────────────────────────────

interface ServiceDefinition {
    name: string;
    description: string;
    tokenDurationDays: number;
    /** UUID de la App Nativa propietaria. null = servicio global (sin ecosistema). */
    ownerApplicationId?: string | null;
}

// ─── Definiciones de servicios ────────────────────────────────────────────────
// ownerApplicationId: dejar undefined/null para servicios globales.
// Actualizar con el UUID de la App Nativa correspondiente si aplica.

const SERVICE_DEFINITIONS: ServiceDefinition[] = [
    {
        name: 'api-gateway',
        description: 'API Gateway — proxy hacia monolith e integration-service',
        tokenDurationDays: 180,
    },
    {
        name: 'monolith',
        description: 'Monolith — lógica de negocio core',
        tokenDurationDays: 180,
    },
    {
        name: 'integration-service',
        description: 'Integration Service — conectores externos (Minerva, Droppoint, ServiceNow)',
        tokenDurationDays: 90,
    },
    {
        name: 'api-snowq-service',
        description: 'api-snowq-service — cola y circuit breaker hacia ServiceNow',
        tokenDurationDays: 365,
    },
    {
        name: 'api-middleware-service',
        description: 'Middleware de integración para apps externas — proxy OAuth hacia monolith',
        tokenDurationDays: 180,
    },
    {
        name: 'observability-service',
        description: 'Observability Service — ingesta y consulta de logs, traces y métricas',
        tokenDurationDays: 365,
    },
];

// ─── Setup DataSource ──────────────────────────────────────────────────────────

async function createDataSource(): Promise<DataSource> {
    const ds = new DataSource({
        type: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3308'),
        username: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'abac_db',
        entities: [path.join(__dirname, '../entities/*.entity.{ts,js}')],
        synchronize: false,
        logging: false,
    });

    await ds.initialize();
    return ds;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const privateKey = process.env.ED25519_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('ED25519_PRIVATE_KEY no está definido en .env — requerido para firmar los tokens M2M.');
    }

    const kid = process.env.ED25519_KID ?? 'abac-m2m-v1';
    const issuer = process.env.JWT_ISSUER ?? 'abac-service';
    const audience = process.env.JWT_AUDIENCE ?? 'abac-clients';

    const ds = await createDataSource();

    console.log('\n🔧  Seed M2M — Event Corner\n');

    try {
        // ── Limpieza de datos legacy (service accounts + roles M2M del diseño anterior) ──
        console.log('🧹 Limpiando datos legacy M2M...');

        // 1. Roles con nombre svc-* asociados a apps m2m_service
        const legacyRoles = await ds.query(
            `SELECT r.id FROM roles r
             INNER JOIN applications a ON r.applicationId = a.id
             WHERE r.name LIKE 'svc-%' AND a.type = 'm2m_service'`,
        );
        if (legacyRoles.length > 0) {
            const roleIds = legacyRoles.map((r: any) => r.id);
            const placeholders = roleIds.map(() => '?').join(',');
            await ds.query(`DELETE FROM role_permissions WHERE roleId IN (${placeholders})`, roleIds);
            await ds.query(`DELETE FROM user_roles WHERE roleId IN (${placeholders})`, roleIds);
            await ds.query(`DELETE FROM roles WHERE id IN (${placeholders})`, roleIds);
            console.log(`   ✓ ${roleIds.length} roles legacy eliminados`);
        } else {
            console.log('   ✓ Sin roles legacy');
        }

        // 2. Service accounts svc-*@*.internal (accountType='service')
        const legacyUsers = await ds.query(
            `SELECT id FROM users WHERE email LIKE 'svc-%@%.internal' AND accountType = 'service'`,
        );
        if (legacyUsers.length > 0) {
            const userIds = legacyUsers.map((u: any) => u.id);
            const placeholders = userIds.map(() => '?').join(',');
            await ds.query(`DELETE FROM user_roles WHERE userId IN (${placeholders})`, userIds);
            await ds.query(`DELETE FROM user_applications WHERE userId IN (${placeholders})`, userIds);
            await ds.query(`DELETE FROM user_policy_assignments WHERE userId IN (${placeholders})`, userIds);
            await ds.query(`UPDATE applications SET ownerId = NULL WHERE ownerId IN (${placeholders})`, userIds);
            await ds.query(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
            console.log(`   ✓ ${userIds.length} service accounts legacy eliminados`);
        } else {
            console.log('   ✓ Sin service accounts legacy');
        }

        console.log('');

        const tokens: Array<{ service: string; token: string; expiresAt: Date; tokenDurationDays: number }> = [];

        for (const svc of SERVICE_DEFINITIONS) {
            console.log(`  📦 ${svc.name}`);

            // Upsert Application (type='m2m_service', sin apiKey/apiSecret, sin ownerId)
            let appId: string;
            const existingApp = await ds.query(
                "SELECT id FROM applications WHERE name = ? AND type = 'm2m_service' LIMIT 1",
                [svc.name],
            );

            if (existingApp.length > 0) {
                appId = existingApp[0].id;
                await ds.query(
                    `UPDATE applications
                        SET description = ?, ownerId = NULL, apiKey = NULL, apiSecret = NULL,
                            tokenDurationDays = ?, updatedAt = NOW()
                      WHERE id = ?`,
                    [svc.description, svc.tokenDurationDays, appId],
                );
                // ownerApplicationId solo si se especifica explícitamente
                if (svc.ownerApplicationId !== undefined) {
                    await ds.query(
                        'UPDATE applications SET ownerApplicationId = ? WHERE id = ?',
                        [svc.ownerApplicationId ?? null, appId],
                    );
                }
                console.log(`     App:   ✓ existente (${appId})`);
            } else {
                appId = crypto.randomUUID();
                await ds.query(
                    `INSERT INTO applications
                       (id, name, description, type, apiKey, apiSecret, ownerId, ownerApplicationId,
                        tokenDurationDays, isActive, usageCount, createdAt, updatedAt)
                     VALUES (?, ?, ?, 'm2m_service', NULL, NULL, NULL, ?, ?, 1, 0, NOW(), NOW())`,
                    [appId, svc.name, svc.description, svc.ownerApplicationId ?? null, svc.tokenDurationDays],
                );
                console.log(`     App:   + creada (${appId})`);
            }

            // Emitir JWT M2M (sub = applicationId)
            // iat/exp los agrega JwtEd25519Service.signWithKey internamente via expiresIn
            const durationDays = svc.tokenDurationDays;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + durationDays);

            const payload: Record<string, any> = {
                sub:             appId,
                type:            'service',
                applicationId:   appId,
                applicationName: svc.name,
                accountType:     'service',
                iss:             issuer,
                aud:             audience,
            };

            if (svc.ownerApplicationId) {
                payload['ownerApplicationId'] = svc.ownerApplicationId;
            }

            const token = JwtEd25519Service.signWithKey(
                privateKey,
                { payload, expiresIn: durationDays * 24 * 60 * 60 },
                { kid },
            );
            tokens.push({ service: svc.name, token, expiresAt, tokenDurationDays: durationDays });

            console.log('');
        }

        // Mostrar tokens
        console.log('\n══════════════════════════════════════════════════════════════');
        console.log('  TOKENS M2M — COPIAR EN .env DE CADA SERVICIO COMO ABAC_M2M_TOKEN');
        console.log('══════════════════════════════════════════════════════════════\n');

        for (const t of tokens) {
            console.log(`  [${t.service}]  (válido ${t.tokenDurationDays} días — expira ${t.expiresAt.toISOString().slice(0, 10)})`);
            console.log(`  ABAC_M2M_TOKEN=${t.token}`);
            console.log('');
        }

        console.log('══════════════════════════════════════════════════════════════');
        console.log('  ⚠  Vuelve a ejecutar este script para re-emitir los tokens.');
        console.log('══════════════════════════════════════════════════════════════\n');

    } finally {
        await ds.destroy();
    }
}

main().catch((err) => {
    console.error('❌  Error en seed M2M:', err);
    process.exit(1);
});
