// scripts/bootstrap-admin.ts
// Bootstrap mínimo de ABAC sin correr el seed completo (seed-initial-data.ts).
// Crea solo lo indispensable para poder loguearse en auth-configuration-app:
//   1 Application + 1 Role 'super-admin' + 1 User + su UserRole + UserApplication.
//
// No crea el catálogo de permisos ni políticas — el rol 'super-admin' bypasea
// todo chequeo de rol/permiso en RolesGuard (ver roles.guard.ts), así que no
// hace falta esa data para operar el ecosistema desde la UI.
//
// Idempotente: si la Application o el User ya existen, no los duplica.
//
// Uso:
//   npx ts-node -r tsconfig-paths/register src/scripts/bootstrap-admin.ts
//
// Variables de entorno (todas opcionales, con default seguro para dev):
//   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME
//   BOOTSTRAP_APP_NAME      — default: 'Event Corner Dev'
//   BOOTSTRAP_ADMIN_EMAIL   — default: 'superadmin@eventcorner.com'
//   BOOTSTRAP_ADMIN_PASSWORD — default: se autogenera y se imprime al final
//   BOOTSTRAP_ADMIN_FIRSTNAME / BOOTSTRAP_ADMIN_LASTNAME — default: 'Super' / 'Admin'

import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import * as path from 'path';

const env = process.env.NODE_ENV || 'development';
config({ path: path.resolve(process.cwd(), `.env.${env}`) });

function generateSecurePassword(): string {
    return crypto.randomBytes(12).toString('base64url');
}

async function createDataSource(): Promise<DataSource> {
    const ds = new DataSource({
        type: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        username: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'abac_db',
        synchronize: false,
        logging: false,
    });

    await ds.initialize();
    return ds;
}

async function main() {
    const appName = process.env.BOOTSTRAP_APP_NAME || 'Event Corner Dev';
    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'superadmin@eventcorner.com';
    const adminFirstName = process.env.BOOTSTRAP_ADMIN_FIRSTNAME || 'Super';
    const adminLastName = process.env.BOOTSTRAP_ADMIN_LASTNAME || 'Admin';
    const adminPasswordPlain = process.env.BOOTSTRAP_ADMIN_PASSWORD || generateSecurePassword();

    const ds = await createDataSource();
    console.log('\n🚀 Bootstrap mínimo de ABAC (sin seed completo)\n');

    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const now = new Date();

        // ── 1. Application ──────────────────────────────────────────────────
        let appId: string;
        const existingApp = await queryRunner.query(
            'SELECT id FROM applications WHERE name = ? LIMIT 1',
            [appName],
        );

        if (existingApp.length > 0) {
            appId = existingApp[0].id;
            console.log(`📦 Application "${appName}" ya existe (${appId})`);
        } else {
            appId = crypto.randomUUID();
            const apiKey = `ec_${crypto.randomBytes(20).toString('hex')}`;
            const apiSecretPlain = crypto.randomBytes(32).toString('hex');
            const apiSecretHash = await bcrypt.hash(apiSecretPlain, 10);

            await queryRunner.query(
                `INSERT INTO applications
                   (id, name, description, apiKey, apiSecret,
                    environment, status, type, isActive,
                    createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    appId, appName, 'Application de bootstrap mínimo (sin seed completo)',
                    apiKey, apiSecretHash,
                    'development', 'active', 'internal', 1,
                    'bootstrap-script', now, now,
                ],
            );
            console.log(`📦 Application "${appName}" creada (${appId})`);
            console.log(`   apiKey:    ${apiKey}`);
            console.log(`   apiSecret: ${apiSecretPlain}  (guardalo ahora — no se puede recuperar)`);
        }

        // ── 2. Role 'super-admin' para esta Application ─────────────────────
        let roleId: string;
        const existingRole = await queryRunner.query(
            "SELECT id FROM roles WHERE name = 'super-admin' AND applicationId = ? LIMIT 1",
            [appId],
        );

        if (existingRole.length > 0) {
            roleId = existingRole[0].id;
            console.log(`👑 Role 'super-admin' ya existe (${roleId})`);
        } else {
            roleId = crypto.randomUUID();
            await queryRunner.query(
                `INSERT INTO roles
                   (id, name, description, applicationId, type, weight, isActive,
                    createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [roleId, 'super-admin', 'Acceso total al sistema', appId, 'system', 100, 1, 'bootstrap-script', now, now],
            );
            console.log(`👑 Role 'super-admin' creado (${roleId})`);
        }

        // ── 3. User admin ────────────────────────────────────────────────────
        let userId: string;
        const existingUser = await queryRunner.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [adminEmail],
        );

        if (existingUser.length > 0) {
            userId = existingUser[0].id;
            console.log(`👤 User "${adminEmail}" ya existe (${userId}) — no se toca su contraseña`);
        } else {
            userId = crypto.randomUUID();
            const passwordHash = await bcrypt.hash(adminPasswordPlain, 12);

            await queryRunner.query(
                `INSERT INTO users
                   (id, email, firstName, lastName, username, passwordHash,
                    status, isActive, accountType, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, adminEmail, adminFirstName, adminLastName, adminEmail.split('@')[0],
                    passwordHash, 'active', 1, 'user', 'bootstrap-script', now, now,
                ],
            );
            console.log(`👤 User "${adminEmail}" creado (${userId})`);
        }

        // ── 4. UserApplication (membresía) ──────────────────────────────────
        const existingUa = await queryRunner.query(
            'SELECT id FROM user_applications WHERE userId = ? AND applicationId = ? LIMIT 1',
            [userId, appId],
        );
        if (existingUa.length === 0) {
            await queryRunner.query(
                `INSERT INTO user_applications
                   (id, userId, applicationId, membershipType, isActive, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), userId, appId, 'admin', 1, 'bootstrap-script', now, now],
            );
            console.log('🔗 UserApplication creada');
        } else {
            console.log('🔗 UserApplication ya existía');
        }

        // ── 5. UserRole (super-admin) ───────────────────────────────────────
        const existingUr = await queryRunner.query(
            'SELECT id FROM user_roles WHERE userId = ? AND roleId = ? AND applicationId = ? LIMIT 1',
            [userId, roleId, appId],
        );
        if (existingUr.length === 0) {
            await queryRunner.query(
                `INSERT INTO user_roles
                   (id, userId, roleId, applicationId, isActive, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), userId, roleId, appId, 1, now, now],
            );
            console.log('🔗 UserRole (super-admin) creado');
        } else {
            console.log('🔗 UserRole (super-admin) ya existía');
        }

        await queryRunner.commitTransaction();

        console.log('\n✅ Bootstrap completado\n');
        console.log('══════════════════════════════════════════════════════');
        console.log(`  Application : ${appName} (${appId})`);
        console.log(`  Login       : ${adminEmail}`);
        if (existingUser.length === 0) {
            console.log(`  Password    : ${adminPasswordPlain}`);
        } else {
            console.log('  Password    : (usuario ya existía, no se modificó)');
        }
        console.log('══════════════════════════════════════════════════════');
        console.log('\n⚠  No se creó catálogo de permisos ni políticas.');
        console.log('   El rol super-admin bypasea esos chequeos (roles.guard.ts).');
        console.log('   Cargá permisos/roles/políticas después desde la propia UI.\n');
        console.log('   Recordá además setear JWT_SECRET en tu .env — AuthModule');
        console.log('   no arranca sin esa variable.\n');

    } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
        await ds.destroy();
    }
}

main().catch((err) => {
    const error = err as Error & { code?: string; sqlMessage?: string };
    console.error(`❌ Error en bootstrap-admin [${error.code ?? error.name ?? 'Error'}]: ${error.sqlMessage ?? error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
});
