// scripts/seed-initial-data.ts
// Seed inicial para Event Corner v3
// Crea: aplicación, roles, permisos, políticas y usuarios iniciales.

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { config } from 'dotenv';
import * as readline from 'readline';
import * as path from 'path';
import * as nacl from 'tweetnacl';

const env = process.env.NODE_ENV || 'development';
config({ path: path.resolve(process.cwd(), `.env.${env}`) });

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface AdminInfo {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
}

interface SeededIds {
    appId: string;
    apiKey: string;
    apiSecret: string;
    superAdminUserId: string;
    roles: Record<string, string>;
}

interface Ed25519KeyPair {
    privateKey: string;
    publicKey: string;
    kid: string;
    isNew: boolean;  // true = recién generado, false = ya existía en el env
}

// ─── Mapa de permisos por rol ──────────────────────────────────────────────────
//
//  Cada entrada: [resource, action, description, category, weight]
//
//  Roles definidos:
//    super-admin  → todos los permisos
//    admin        → configuración completa (corners, lockers, usuarios, etc.)
//    manager      → operaciones (incidencias, solicitudes, horarios, técnicos, reportes)
//    technician   → atención de incidencias asignadas
//    employee     → usuario final (crea incidencias / solicitudes)

const ALL_PERMISSIONS: [string, string, string, string, number][] = [
    // ── Incident ──────────────────────────────────────────────────────────────
    ['incident', 'create',         'Crear incidencias',                         'incident', 10],
    ['incident', 'read',           'Ver incidencias',                           'incident',  5],
    ['incident', 'list',           'Listar incidencias propias',                'incident',  5],
    ['incident', 'list-all',       'Listar todas las incidencias',              'incident', 15],
    ['incident', 'deliver',        'Registrar entrega de dispositivo',          'incident', 10],
    ['incident', 'take',           'Tomar incidencia asignada',                 'incident', 10],
    ['incident', 'release',        'Liberar incidencia tomada',                 'incident', 10],
    ['incident', 'change-status',  'Cambiar estado de incidencia',              'incident', 15],
    ['incident', 'validate',       'Validar cierre de incidencia',              'incident', 20],
    ['incident', 'reopen',         'Reabrir incidencia cerrada',                'incident', 20],
    ['incident', 'delete',         'Eliminar incidencia',                       'incident', 40],

    // ── Corner ────────────────────────────────────────────────────────────────
    ['corner', 'create',           'Crear corner',                              'corner', 30],
    ['corner', 'read',             'Ver corner',                                'corner',  5],
    ['corner', 'list',             'Listar corners',                            'corner',  5],
    ['corner', 'update',           'Actualizar corner',                         'corner', 25],
    ['corner', 'delete',           'Eliminar corner',                           'corner', 40],
    ['corner', 'manage-schedules', 'Gestionar horarios del corner',             'corner', 20],
    // Nota: 'corner:assign-technician' se elimino por redundante — la asignacion
    // de tecnicos a horarios se enforced con 'schedule:assign-technicians'.

    // ── Schedule ──────────────────────────────────────────────────────────────
    ['schedule', 'create',             'Crear horario',                         'schedule', 30],
    ['schedule', 'read',               'Ver horario',                           'schedule',  5],
    ['schedule', 'list',               'Listar horarios de un corner',          'schedule',  5],
    ['schedule', 'update',             'Actualizar horario',                    'schedule', 25],
    ['schedule', 'delete',             'Eliminar horario',                      'schedule', 40],
    ['schedule', 'assign-technicians', 'Asignar técnicos a un horario',         'schedule', 15],

    // ── Slot ──────────────────────────────────────────────────────────────────
    ['slot', 'read',               'Ver slot',                                  'slot',  5],
    ['slot', 'list',               'Listar slots disponibles',                  'slot',  5],
    ['slot', 'expire',             'Expirar slots manualmente',                 'slot', 20],

    // ── Locker ────────────────────────────────────────────────────────────────
    ['locker', 'create',           'Crear locker',                              'locker', 30],
    ['locker', 'read',             'Ver locker',                                'locker',  5],
    ['locker', 'list',             'Listar lockers',                            'locker',  5],
    ['locker', 'update',           'Actualizar locker',                         'locker', 25],
    ['locker', 'delete',           'Eliminar locker',                           'locker', 40],
    ['locker', 'assign',           'Asignar locker a incidencia',               'locker', 15],
    ['locker', 'release',          'Liberar locker de incidencia',              'locker', 15],

    // ── Request ───────────────────────────────────────────────────────────────
    ['request', 'create',          'Crear solicitud',                           'request', 10],
    ['request', 'read',            'Ver solicitud',                             'request',  5],
    ['request', 'list',            'Listar solicitudes propias',                'request',  5],
    ['request', 'list-all',        'Listar todas las solicitudes',              'request', 15],
    ['request', 'change-status',   'Cambiar estado de solicitud',               'request', 20],
    ['request', 'update-status',   'Actualizar estado de solicitud (legacy)',   'request', 20],
    ['request', 'delete',          'Eliminar solicitud',                        'request', 40],

    // ── Issue Type ────────────────────────────────────────────────────────────
    ['issue-type', 'create',       'Crear tipo de incidencia',                  'configuration', 30],
    ['issue-type', 'read',         'Ver tipo de incidencia',                    'configuration',  5],
    ['issue-type', 'list',         'Listar tipos de incidencia',                'configuration',  5],
    ['issue-type', 'update',       'Actualizar tipo de incidencia',             'configuration', 25],
    ['issue-type', 'delete',       'Eliminar tipo de incidencia',               'configuration', 40],

    // ── Company ───────────────────────────────────────────────────────────────
    ['company', 'create',          'Crear empresa',                             'configuration', 30],
    ['company', 'read',            'Ver empresa',                               'configuration',  5],
    ['company', 'list',            'Listar empresas',                           'configuration',  5],
    ['company', 'update',          'Actualizar empresa',                        'configuration', 25],
    ['company', 'delete',          'Eliminar empresa',                          'configuration', 40],

    // ── Technician ────────────────────────────────────────────────────────────
    ['technician', 'create',       'Crear técnico',                             'configuration', 30],
    ['technician', 'read',         'Ver técnico',                               'configuration',  5],
    ['technician', 'list',         'Listar técnicos',                           'configuration',  5],
    ['technician', 'update',       'Actualizar técnico',                        'configuration', 25],
    ['technician', 'delete',       'Eliminar técnico',                          'configuration', 40],

    // ── User ──────────────────────────────────────────────────────────────────
    ['user', 'create',             'Crear usuario',                             'user_management', 30],
    ['user', 'read',               'Ver usuario',                               'user_management',  5],
    ['user', 'list',               'Listar usuarios',                           'user_management', 10],
    ['user', 'update',             'Actualizar usuario',                        'user_management', 25],
    ['user', 'delete',             'Eliminar usuario',                          'user_management', 40],

    // ── Device ────────────────────────────────────────────────────────────────
    ['device', 'read',             'Ver dispositivo',                           'device',  5],
    ['device', 'sync',             'Sincronizar dispositivo con Minerva',       'device', 15],
    ['device', 'create-virtual',   'Crear dispositivo virtual (onboarding)',    'device', 10],
    ['device', 'complete-virtual', 'Completar onboarding de dispositivo',       'device', 15],

    // ── Availability ──────────────────────────────────────────────────────────
    ['availability', 'read',              'Consultar disponibilidad de slots',  'availability',  5],
    ['availability', 'read-technicians',  'Consultar disponibilidad de técnicos','availability', 5],

    // ── Report ────────────────────────────────────────────────────────────────
    ['report', 'view',             'Ver reportes',                              'report', 10],
    ['report', 'export',           'Exportar reportes',                         'report', 20],

    // ── Dashboard ─────────────────────────────────────────────────────────────
    // Permisos-marcador para que event-corner-app (dashboard-page.tsx) detecte el
    // rol de forma explícita (isAdmin/isManager/isTechnician) sin inferirlo de
    // permisos de negocio. Cada uno se asigna solo a su rol correspondiente.
    ['dashboard-admin',      'read', 'Marcador de dashboard de admin',      'dashboard', 5],
    ['dashboard-manager',    'read', 'Marcador de dashboard de manager',    'dashboard', 5],
    ['dashboard-technician', 'read', 'Marcador de dashboard de técnico',    'dashboard', 5],
];

// Permisos que tiene cada rol (subconjunto de ALL_PERMISSIONS identificado por "resource:action")
const ROLE_PERMISSIONS: Record<string, string[]> = {
    'super-admin': ALL_PERMISSIONS.map(([r, a]) => `${r}:${a}`),

    'admin': [
        // Incidents — visión total + deliver
        'incident:read', 'incident:list', 'incident:list-all',
        'incident:deliver', 'incident:change-status',
        'incident:validate', 'incident:reopen', 'incident:delete',
        // Corners & schedules — configuración completa
        'corner:create', 'corner:read', 'corner:list', 'corner:update', 'corner:delete',
        'corner:manage-schedules',
        'schedule:create', 'schedule:read', 'schedule:list',
        'schedule:update', 'schedule:delete', 'schedule:assign-technicians',
        'slot:read', 'slot:list', 'slot:expire',
        // Lockers
        'locker:create', 'locker:read', 'locker:list', 'locker:update', 'locker:delete',
        'locker:assign', 'locker:release',
        // Requests
        'request:read', 'request:list', 'request:list-all',
        'request:change-status', 'request:update-status', 'request:delete',
        // Issue types & companies
        'issue-type:create', 'issue-type:read', 'issue-type:list',
        'issue-type:update', 'issue-type:delete',
        'company:create', 'company:read', 'company:list',
        'company:update', 'company:delete',
        // Technicians & users
        'technician:create', 'technician:read', 'technician:list',
        'technician:update', 'technician:delete',
        'user:create', 'user:read', 'user:list', 'user:update', 'user:delete',
        // Devices & availability
        'device:read', 'device:sync', 'device:complete-virtual',
        'availability:read', 'availability:read-technicians',
        // Reports
        'report:view', 'report:export',
        // Dashboard — marcador de rol para event-corner-app
        'dashboard-admin:read',
    ],

    'manager': [
        // Incidents — operación completa
        'incident:create', 'incident:read', 'incident:list', 'incident:list-all',
        'incident:deliver', 'incident:take', 'incident:release', 'incident:change-status',
        'incident:validate', 'incident:reopen',
        // Corners — solo lectura; schedules/slots — gestión completa
        'corner:read', 'corner:list',
        'schedule:create', 'schedule:read', 'schedule:list',
        'schedule:update', 'schedule:delete', 'schedule:assign-technicians',
        'slot:read', 'slot:list', 'slot:expire',
        // Lockers — operación
        'locker:read', 'locker:list', 'locker:assign', 'locker:release',
        // Requests
        'request:create', 'request:read', 'request:list', 'request:list-all',
        'request:change-status', 'request:update-status',
        // Issue types & companies — solo lectura
        'issue-type:read', 'issue-type:list',
        'company:read', 'company:list',
        // Technicians — gestión completa (la asignación a horarios va por 'schedule:assign-technicians')
        'technician:create', 'technician:read', 'technician:list', 'technician:update',
        // Users — lectura
        'user:read',
        // Devices
        'device:read', 'device:sync', 'device:create-virtual', 'device:complete-virtual',
        'availability:read', 'availability:read-technicians',
        // Reports
        'report:view',
        // Dashboard — marcador de rol para event-corner-app
        'dashboard-manager:read',
    ],

    'technician': [
        // Incidents — operativa completa (crear, ver, listar, entregar, tomar, liberar, cambiar estado, validar, reabrir, eliminar)
        'incident:create', 'incident:read', 'incident:list', 'incident:list-all',
        'incident:deliver', 'incident:take', 'incident:release', 'incident:change-status',
        'incident:validate', 'incident:reopen', 'incident:delete',
        // Corners & schedules — lectura
        'corner:read', 'corner:list',
        'schedule:read', 'schedule:list',
        'slot:read', 'slot:list',
        // Lockers — operar
        'locker:read', 'locker:assign', 'locker:release',
        // Requests — gestionar
        'request:read', 'request:list',
        'request:change-status',
        // Issue types — lectura
        'issue-type:read', 'issue-type:list',
        // Devices
        'device:read', 'device:sync',
        'availability:read', 'availability:read-technicians',
        // Dashboard — marcador de rol para event-corner-app
        'dashboard-technician:read',
    ],

    'employee': [
        // Incidents — crear, consultar propias, cancelar (change-status) y cerrar (validate)
        'incident:create', 'incident:read', 'incident:list',
        'incident:change-status', 'incident:validate',
        // Requests — propias
        'request:create', 'request:read', 'request:list',
        // Corners, schedules, slots — lectura para poder reservar
        'corner:read', 'corner:list',
        'schedule:read', 'schedule:list',
        'slot:read', 'slot:list',
        // Issue types — lectura
        'issue-type:read', 'issue-type:list',
        // Device — propio + onboarding
        'device:read', 'device:create-virtual',
        'availability:read',
    ],

    'readonly': [
        // Solo lectura en todos los recursos
        'incident:read', 'incident:list', 'incident:list-all',
        'corner:read', 'corner:list',
        'schedule:read', 'schedule:list',
        'slot:read', 'slot:list',
        'locker:read', 'locker:list',
        'request:read', 'request:list', 'request:list-all',
        'issue-type:read', 'issue-type:list',
        'company:read', 'company:list',
        'technician:read', 'technician:list',
        'user:read', 'user:list',
        'device:read',
        'availability:read', 'availability:read-technicians',
        'report:view',
    ],
};

// ─── Deny policies ─────────────────────────────────────────────────────────────
//
// Definen límites explícitos por rol con prioridad mayor que las allow policies.
// Se evalúan si el rol tiene el permiso asignado; si no, el acceso ya se deniega
// antes de llegar a las políticas. Funcionan como guarda de seguridad futura.
//
const DENY_POLICY_CONFIGS: {
    roleName:       string;
    policyName:     string;
    description:    string;
    priority:       number;
    permissionKeys: string[];
}[] = [
    {
        roleName:       'employee',
        policyName:     'Employee — Deny Operaciones Destructivas',
        description:    'Impide que un empleado elimine recursos o cambie estados administrativos',
        priority:       200,
        permissionKeys: ALL_PERMISSIONS
            .filter(([, action]) => action === 'delete')
            .map(([resource, action]) => `${resource}:${action}`),
    },
    {
        roleName:       'technician',
        policyName:     'Technician — Deny Eliminación de Solicitudes',
        description:    'Impide que un técnico elimine solicitudes (requests)',
        priority:       180,
        permissionKeys: ['request:delete'],
    },
    {
        roleName:       'manager',
        policyName:     'Manager — Deny Eliminación de Entidades Críticas',
        description:    'Impide que un manager elimine usuarios o empresas del sistema',
        priority:       150,
        permissionKeys: ['user:delete', 'company:delete'],
    },
];

// ─── Clase principal ───────────────────────────────────────────────────────────

class SeedInitialData {
    private dataSource: DataSource;

    constructor() {
        this.dataSource = new DataSource({
            type: 'mysql',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            username: process.env.DB_USERNAME || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || process.env.DB_DATABASE || 'abac_db',
            entities: [path.join(__dirname, '..', 'entities', '*.entity.{ts,js}')],
            synchronize: false,
            logging: false,
        });
    }

    async execute(): Promise<void> {
        console.log('🚀 Iniciando seed de Event Corner v3...');

        try {
            await this.dataSource.initialize();
            console.log('✅ Conectado a la base de datos');

            const queryRunner = this.dataSource.createQueryRunner();
            await queryRunner.connect();
            await queryRunner.startTransaction();

            try {
                const hasData = await this.checkExistingData(queryRunner);
                if (hasData) {
                    console.log('⚠️  Ya existen datos en la base de datos.');
                    const proceed = await this.askForConfirmation(
                        '¿Continuar de todas formas? [y/N]: ',
                    );
                    if (!proceed) {
                        console.log('❌ Cancelado.');
                        return;
                    }
                }

                // El seed borra y recrea roles con UUIDs nuevos, por lo que
                // cleanExistingData borra TODAS las user_roles de la app. Los
                // usuarios sincronizados por Entra (tenantId != 'event-corner')
                // sobreviven al borrado de usuarios pero perderían su rol, que el
                // seed no vuelve a asignar. Snapshot antes del wipe → restore por
                // nombre de rol después de recrearlos, para que re-ejecutar el
                // seed sea seguro en entornos con usuarios ya existentes.
                let preservedUserRoles: { userId: string; roleName: string }[] = [];
                if (hasData) {
                    preservedUserRoles = await this.snapshotUserRoles(queryRunner);
                    await this.cleanExistingData(queryRunner);
                }

                const adminInfo = await this.promptAdminInfo();
                const seeded = await this.runSeed(queryRunner, adminInfo);

                if (preservedUserRoles.length > 0) {
                    const restored = await this.restoreUserRoles(
                        queryRunner, seeded, preservedUserRoles,
                    );
                    console.log(
                        `♻️  Asignaciones de rol externas preservadas: ${restored}/${preservedUserRoles.length}`,
                    );
                }

                await queryRunner.commitTransaction();

                const keypair = this.ensureEd25519Keypair();

                console.log('\n✅ Seed completado exitosamente!');
                this.printCredentials(adminInfo, seeded, keypair);
                this.saveCredentialsToFile(adminInfo, seeded, keypair);

            } catch (error) {
                await queryRunner.rollbackTransaction();
                throw error;
            } finally {
                await queryRunner.release();
            }
        } catch (error) {
            const err = error as Error & { code?: string; sqlMessage?: string };
            console.error(`❌ Error en seed [${err.code ?? err.name ?? 'Error'}]: ${err.sqlMessage ?? err.message}`);
            if (err.stack) console.error(err.stack);
            process.exit(1);
        } finally {
            await this.dataSource.destroy();
        }
    }

    // ── Checks & prompts ────────────────────────────────────────────────────────

    private async checkExistingData(queryRunner: any): Promise<boolean> {
        const result = await queryRunner.query(
            `SELECT COUNT(*) as count FROM applications WHERE name = 'Event Corner'`,
        );
        return parseInt(result[0].count) > 0;
    }

    /**
     * Captura las asignaciones (userId, nombre de rol) de la app Event Corner
     * ANTES del wipe, para poder restaurarlas después de recrear los roles.
     * Se guarda el NOMBRE del rol (no el id) porque los roles se recrean con
     * UUIDs nuevos; la restauración remapea por nombre.
     */
    private async snapshotUserRoles(
        queryRunner: any,
    ): Promise<{ userId: string; roleName: string }[]> {
        return await queryRunner.query(
            `SELECT ur.userId AS userId, ro.name AS roleName
               FROM user_roles ur
               JOIN roles ro ON ro.id = ur.roleId
              WHERE ur.applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner')`,
        );
    }

    /**
     * Restaura las asignaciones capturadas por snapshotUserRoles, remapeando el
     * nombre de rol al nuevo id. Salta:
     *  - roles que ya no existen (p.ej. renombrados/eliminados en el seed),
     *  - usuarios que ya no existen (los borrados por tenantId='event-corner'),
     *  - asignaciones ya presentes (el super-admin recién creado ya tiene la suya).
     * Devuelve cuántas asignaciones se restauraron.
     */
    private async restoreUserRoles(
        queryRunner: any,
        seeded: SeededIds,
        preserved: { userId: string; roleName: string }[],
    ): Promise<number> {
        const now = new Date();
        let restored = 0;
        for (const { userId, roleName } of preserved) {
            const roleId = seeded.roles[roleName];
            if (!roleId) continue; // el rol ya no existe en el seed nuevo
            const userRows = await queryRunner.query(
                `SELECT id FROM users WHERE id = ?`, [userId],
            );
            if (userRows.length === 0) continue; // usuario borrado por el wipe
            const existing = await queryRunner.query(
                `SELECT id FROM user_roles WHERE userId = ? AND roleId = ? AND applicationId = ?`,
                [userId, roleId, seeded.appId],
            );
            if (existing.length > 0) continue; // ya asignado (super-admin)
            await queryRunner.query(
                `INSERT INTO user_roles
                   (id, userId, roleId, applicationId, isActive, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), userId, roleId, seeded.appId, 1, now, now],
            );
            restored++;
        }
        return restored;
    }

    private async cleanExistingData(queryRunner: any): Promise<void> {
        console.log('🧹 Limpiando datos anteriores...');
        await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
        await queryRunner.query(`DELETE FROM audit_logs WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner')`);
        await queryRunner.query(`DELETE FROM user_policy_assignments WHERE userId IN (SELECT id FROM users WHERE tenantId = 'event-corner')`);
        await queryRunner.query(`DELETE FROM policy_permissions WHERE policyId IN (SELECT id FROM policies WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner'))`);
        await queryRunner.query(`DELETE FROM policy_rules WHERE policyId IN (SELECT id FROM policies WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner'))`);
        await queryRunner.query(`DELETE FROM policies WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner')`);
        await queryRunner.query(`DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner'))`);
        await queryRunner.query(`DELETE FROM roles WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner')`);
        await queryRunner.query(`DELETE FROM permissions WHERE createdBy = 'system'`);
        await queryRunner.query(`DELETE FROM user_roles WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner')`);
        await queryRunner.query(`DELETE FROM user_applications WHERE applicationId IN (SELECT id FROM applications WHERE name = 'Event Corner')`);
        await queryRunner.query(`DELETE FROM users WHERE tenantId = 'event-corner'`);
        await queryRunner.query(`DELETE FROM applications WHERE name = 'Event Corner'`);
        await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);
        console.log('   ✅ Datos anteriores eliminados');
    }

    private async promptAdminInfo(): Promise<AdminInfo> {
        if (process.env.SEED_FORCE === 'true') {
            return {
                email:     process.env.SEED_ADMIN_EMAIL     || 'superadmin@eventcorner.com',
                firstName: process.env.SEED_ADMIN_FIRSTNAME || 'Super',
                lastName:  process.env.SEED_ADMIN_LASTNAME  || 'Admin',
                password:  process.env.SEED_ADMIN_PASSWORD  || this.generateSecurePassword(),
            };
        }

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string): Promise<string> =>
            new Promise((res) => rl.question(q, res));

        console.log('\n📝 CONFIGURACIÓN DEL SUPER ADMIN\n');
        const email     = await ask('Email     [superadmin@eventcorner.com]: ');
        const firstName = await ask('Nombre    [Super]: ');
        const lastName  = await ask('Apellido  [Admin]: ');
        const password  = await ask('Contraseña (mínimo 12 chars) [auto-generar]: ');
        rl.close();

        return {
            email:     email     || 'superadmin@eventcorner.com',
            firstName: firstName || 'Super',
            lastName:  lastName  || 'Admin',
            password:  password  || this.generateSecurePassword(),
        };
    }

    private async askForConfirmation(question: string): Promise<boolean> {
        if (process.env.SEED_FORCE === 'true') return true;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise((res) => {
            rl.question(question, (a) => {
                rl.close();
                res(a.toLowerCase() === 'y' || a.toLowerCase() === 'yes');
            });
        });
    }

    // ── Seed principal ──────────────────────────────────────────────────────────

    private async runSeed(queryRunner: any, adminInfo: AdminInfo): Promise<SeededIds> {
        const now = new Date();

        // ── 1. APLICACIÓN EVENT CORNER ─────────────────────────────────────────
        console.log('\n📦 Creando aplicación Event Corner...');

        const appId          = crypto.randomUUID();
        const apiKey         = `ec_${crypto.randomBytes(20).toString('hex')}`;
        const apiSecretPlain = crypto.randomBytes(32).toString('hex');
        const apiSecretHash  = await bcrypt.hash(apiSecretPlain, 10);

        await queryRunner.query(
            `INSERT INTO applications
               (id, name, description, apiKey, apiSecret,
                environment, settings, status, isActive,
                createdBy, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                appId,
                'Event Corner',
                'Backend principal de Event Corner v3 — corners, incidencias, solicitudes y dispositivos',
                apiKey,
                apiSecretHash,
                'production',
                JSON.stringify({
                    maxUsers: 50000,
                    allowSelfRegistration: false,
                    requireEmailVerification: false,
                    sessionTimeout: 28800,   // 8 h
                    mfaEnabled: false,
                    passwordPolicy: {
                        minLength: 12,
                        requireUppercase: true,
                        requireNumbers: true,
                        requireSpecialChars: false,
                        preventReuse: 3,
                    },
                    maxConcurrentSessions: 5,
                    isDefaultForRegistration: false,
                    notes: 'API Gateway usa este apiKey para llamar a /abac/can-access',
                }),
                'active',
                1,
                'system',
                now,
                now,
            ],
        );

        // ── 2. PERMISOS ────────────────────────────────────────────────────────
        console.log('🔑 Creando permisos del dominio...');

        const permissionIdMap = new Map<string, string>(); // "resource:action" → UUID

        for (const [resource, action, description, category, weight] of ALL_PERMISSIONS) {
            const permId = crypto.randomUUID();
            permissionIdMap.set(`${resource}:${action}`, permId);

            await queryRunner.query(
                `INSERT INTO permissions
                   (id, resource, action, description, category,
                    weight, isActive, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [permId, resource, action, description, category, weight, 1, 'system', now, now],
            );
        }
        console.log(`   → ${ALL_PERMISSIONS.length} permisos creados`);

        // ── 3. ROLES ───────────────────────────────────────────────────────────
        console.log('👑 Creando roles...');

        // [nombre, descripción, type, weight]
        const roleDefinitions: [string, string, string, number][] = [
            ['super-admin', 'Acceso total al sistema',                          'system',  100],
            ['admin',       'Administrador de configuración',                   'system',   80],
            ['manager',     'Gestor de operaciones (incidencias, solicitudes)', 'custom',   60],
            ['technician',  'Técnico atención de incidencias',                  'custom',   40],
            ['employee',    'Usuario final — empleado de la empresa',           'custom',   20],
            ['readonly',    'Auditor — acceso de sólo lectura al sistema',      'custom',   10],
        ];

        const roleIdMap = new Map<string, string>(); // nombre → UUID

        for (const [name, description, type, weight] of roleDefinitions) {
            const roleId = crypto.randomUUID();
            roleIdMap.set(name, roleId);

            await queryRunner.query(
                `INSERT INTO roles
                   (id, name, description, applicationId,
                    type, weight, isActive,
                    createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    roleId, name, description, appId,
                    type, weight, 1,
                    'system', now, now,
                ],
            );

            // Asignar permisos al rol
            const rolePerms = ROLE_PERMISSIONS[name] ?? [];
            for (const key of rolePerms) {
                const permId = permissionIdMap.get(key);
                if (!permId) {
                    console.warn(`   ⚠️  Permiso no encontrado para rol "${name}": ${key}`);
                    continue;
                }
                await queryRunner.query(
                    `INSERT INTO role_permissions
                       (id, roleId, permissionId, effect,
                        isActive, createdBy, createdAt, updatedAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [crypto.randomUUID(), roleId, permId, 'allow', 1, 'system', now, now],
                );
            }
        }
        console.log(`   → ${roleDefinitions.length} roles creados`);

        // ── 4. POLÍTICAS POR ROL ───────────────────────────────────────────────
        console.log('📜 Creando políticas...');

        const policyConfigs: {
            roleName: string;
            policyName: string;
            description: string;
            priority: number;
        }[] = [
            {
                roleName:    'super-admin',
                policyName:  'Super Admin — Acceso Total',
                description: 'Acceso irrestricto a todos los recursos del sistema',
                priority:    100,
            },
            {
                roleName:    'admin',
                policyName:  'Admin — Gestión de Configuración',
                description: 'Permite configurar corners, lockers, tipos de incidencia, empresas y usuarios',
                priority:    80,
            },
            {
                roleName:    'manager',
                policyName:  'Manager — Gestión de Operaciones',
                description: 'Permite operar sobre incidencias, solicitudes y asignaciones',
                priority:    60,
            },
            {
                roleName:    'technician',
                policyName:  'Technician — Atención de Incidencias',
                description: 'Permite al técnico tomar y gestionar incidencias asignadas',
                priority:    40,
            },
            {
                roleName:    'employee',
                policyName:  'Employee — Autoservicio',
                description: 'Permite al empleado crear y consultar sus propias incidencias y solicitudes',
                priority:    20,
            },
            {
                roleName:    'readonly',
                policyName:  'Readonly — Acceso de Auditoría',
                description: 'Permite al auditor consultar todos los recursos sin modificar nada',
                priority:    10,
            },
        ];

        for (const { roleName, policyName, description, priority } of policyConfigs) {
            const policyId = crypto.randomUUID();

            await queryRunner.query(
                `INSERT INTO policies
                   (id, name, description, applicationId,
                    type, priority, effect,
                    conditions, isActive, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    policyId, policyName, description, appId,
                    'role', priority, 'allow',
                    JSON.stringify({}),
                    1, 'system', now, now,
                ],
            );

            // Regla 1: usuario debe tener el rol correspondiente
            await queryRunner.query(
                `INSERT INTO policy_rules
                   (id, policyId, \`condition\`, \`operator\`,
                    priority, ruleType, isActive, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(),
                    policyId,
                    JSON.stringify({
                        all: [{ fact: 'user.roles', operator: 'contains', value: roleName }],
                    }),
                    'AND', 1, 'role-based', 1, 'system', now, now,
                ],
            );

            // Regla 2 (contexto): condiciones adicionales según perfil de trabajo
            if (roleName === 'technician') {
                // El técnico debe ser miembro activo de la aplicación
                await queryRunner.query(
                    `INSERT INTO policy_rules
                       (id, policyId, \`condition\`, \`operator\`,
                        priority, ruleType, isActive, createdBy, createdAt, updatedAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        crypto.randomUUID(),
                        policyId,
                        JSON.stringify({
                            all: [{ fact: 'membership', path: '$.type', operator: 'equal', value: 'member' }],
                        }),
                        'AND', 2, 'membership-check', 1, 'system', now, now,
                    ],
                );
            }

            if (roleName === 'employee') {
                // El empleado no debe tener la membresía expirada
                await queryRunner.query(
                    `INSERT INTO policy_rules
                       (id, policyId, \`condition\`, \`operator\`,
                        priority, ruleType, isActive, createdBy, createdAt, updatedAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        crypto.randomUUID(),
                        policyId,
                        JSON.stringify({
                            all: [{ fact: 'membership', path: '$.isExpired', operator: 'equal', value: false }],
                        }),
                        'AND', 2, 'membership-check', 1, 'system', now, now,
                    ],
                );
            }

            // Asociar los permisos del rol a la política
            const rolePerms = ROLE_PERMISSIONS[roleName] ?? [];
            for (const key of rolePerms) {
                const permId = permissionIdMap.get(key);
                if (!permId) continue;

                await queryRunner.query(
                    `INSERT INTO policy_permissions
                       (id, policyId, permissionId,
                        isActive, createdBy, createdAt, updatedAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        crypto.randomUUID(), policyId, permId,
                        1, 'system', now, now,
                    ],
                );
            }
        }
        console.log(`   → ${policyConfigs.length} políticas allow creadas`);

        // ── 4b. DENY POLICIES ──────────────────────────────────────────────────
        console.log('🚫 Creando políticas de denegación...');

        for (const { roleName, policyName, description, priority, permissionKeys } of DENY_POLICY_CONFIGS) {
            const denyPolicyId = crypto.randomUUID();

            await queryRunner.query(
                `INSERT INTO policies
                   (id, name, description, applicationId,
                    type, priority, effect,
                    conditions, isActive, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    denyPolicyId, policyName, description, appId,
                    'role', priority, 'deny',
                    JSON.stringify({}),
                    1, 'system', now, now,
                ],
            );

            // Regla: el deny aplica solo si el usuario tiene el rol objetivo
            await queryRunner.query(
                `INSERT INTO policy_rules
                   (id, policyId, \`condition\`, \`operator\`,
                    priority, ruleType, isActive, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(),
                    denyPolicyId,
                    JSON.stringify({
                        all: [{ fact: 'user.roles', operator: 'contains', value: roleName }],
                    }),
                    'AND', 1, 'role-based', 1, 'system', now, now,
                ],
            );

            // Vincular la deny policy a los permisos que cubre
            // (getRelevantPolicies filtra por policy_permissions → permission.resource/action)
            for (const key of permissionKeys) {
                const permId = permissionIdMap.get(key);
                if (!permId) {
                    console.warn(`   ⚠️  Permiso no encontrado para deny policy "${policyName}": ${key}`);
                    continue;
                }
                await queryRunner.query(
                    `INSERT INTO policy_permissions
                       (id, policyId, permissionId,
                        isActive, createdBy, createdAt, updatedAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        crypto.randomUUID(), denyPolicyId, permId,
                        1, 'system', now, now,
                    ],
                );
            }
        }
        console.log(`   → ${DENY_POLICY_CONFIGS.length} políticas deny creadas`);

        // ── 5. SUPER ADMIN ─────────────────────────────────────────────────────
        console.log('👤 Creando super admin...');

        const usersToCreate: {
            key: string;
            email: string;
            firstName: string;
            lastName: string;
            password: string;
            roleName: string;
            membershipType: string;
        }[] = [
            {
                key:            'superAdmin',
                email:          adminInfo.email,
                firstName:      adminInfo.firstName,
                lastName:       adminInfo.lastName,
                password:       adminInfo.password,
                roleName:       'super-admin',
                membershipType: 'admin',
            },
        ];

        const createdUserIds: Record<string, string> = {};

        for (const u of usersToCreate) {
            const userId       = crypto.randomUUID();
            const passwordHash = await bcrypt.hash(u.password, 12);
            createdUserIds[u.key] = userId;

            await queryRunner.query(
                `INSERT INTO users
                   (id, email, firstName, lastName, username,
                    passwordHash, profile, status, isActive,
                    accountType, createdBy, createdAt, updatedAt, tenantId)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    u.email,
                    u.firstName,
                    u.lastName,
                    u.email.split('@')[0],
                    passwordHash,
                    JSON.stringify({
                        role:            u.roleName,
                        createdVia:      'initial-seed',
                        emailVerified:   true,
                        emailVerifiedAt: now.toISOString(),
                    }),
                    'active',
                    1,
                    'user',
                    'system', now, now,
                    'event-corner',
                ],
            );

            // Vincular usuario a la aplicación
            await queryRunner.query(
                `INSERT INTO user_applications
                   (id, userId, applicationId, membershipType,
                    attributes, isActive, createdBy, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(), userId, appId, u.membershipType,
                    JSON.stringify({ createdVia: 'initial-seed' }),
                    1, 'system', now, now,
                ],
            );

            // Asignar rol al usuario
            const roleId = roleIdMap.get(u.roleName)!;
            await queryRunner.query(
                `INSERT INTO user_roles
                   (id, userId, roleId, applicationId,
                    isActive, createdAt, updatedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(), userId, roleId, appId,
                    1, now, now,
                ],
            );
        }
        console.log(`   → ${usersToCreate.length} usuarios creados`);

        // ── 6. AUDITORÍA INICIAL ───────────────────────────────────────────────
        await queryRunner.query(
            `INSERT INTO audit_logs
               (id, entityType, entityId, action,
                userId, userEmail, applicationId,
                details, ipAddress, userAgent,
                isSuccess, description,
                isActive, createdBy, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                crypto.randomUUID(),
                'APPLICATION', appId, 'CREATE',
                createdUserIds['superAdmin'], adminInfo.email, appId,
                JSON.stringify({
                    event:       'Event Corner v3 — seed inicial',
                    timestamp:   now.toISOString(),
                    roles:       roleDefinitions.map(([n]) => n),
                    permissions: ALL_PERMISSIONS.length,
                }),
                '127.0.0.1', 'Seed Script',
                true,
                'Event Corner inicializado correctamente',
                1, 'system', now, now,
            ],
        );

        return {
            appId,
            apiKey,
            apiSecret:        apiSecretPlain,
            superAdminUserId: createdUserIds['superAdmin'],
            roles:            Object.fromEntries(roleIdMap),
        };
    }

    // ── Output ──────────────────────────────────────────────────────────────────

    // ── Ed25519 keypair ─────────────────────────────────────────────────────────

    /**
     * Verifica si ya existe un keypair Ed25519 en el env.
     * Si no existe, genera uno nuevo y lo escribe en .env.development.
     */
    private ensureEd25519Keypair(): Ed25519KeyPair {
        const existing = process.env.ED25519_PRIVATE_KEY;
        const kid      = process.env.ED25519_KID ?? 'abac-m2m-v1';

        if (existing && process.env.ED25519_PUBLIC_KEY) {
            console.log('🔑 Ed25519: keypair existente detectado en .env.development');
            return {
                privateKey: existing,
                publicKey:  process.env.ED25519_PUBLIC_KEY,
                kid,
                isNew: false,
            };
        }

        console.log('🔑 Ed25519: generando nuevo keypair...');
        const kp         = nacl.sign.keyPair();
        const privateKey = Buffer.from(kp.secretKey).toString('base64');
        const publicKey  = Buffer.from(kp.publicKey).toString('base64');

        // Escribir en .env.development
        const envPath = path.join(process.cwd(), '.env.development');
        if (fs.existsSync(envPath)) {
            let content = fs.readFileSync(envPath, 'utf-8');

            // Si la sección Ed25519 ya existe (con valores vacíos), reemplazarla
            if (content.includes('ED25519_PRIVATE_KEY=') || content.includes('ED25519_PUBLIC_KEY=')) {
                content = content
                    .replace(/^ED25519_PRIVATE_KEY=.*$/m, `ED25519_PRIVATE_KEY=${privateKey}`)
                    .replace(/^ED25519_PUBLIC_KEY=.*$/m,  `ED25519_PUBLIC_KEY=${publicKey}`)
                    .replace(/^ED25519_KID=.*$/m,         `ED25519_KID=${kid}`);
            } else {
                content += `\n# ── Ed25519 — firma de tokens M2M ─────────────────────────────────────────────\nED25519_PRIVATE_KEY=${privateKey}\nED25519_PUBLIC_KEY=${publicKey}\nED25519_KID=${kid}\n`;
            }

            fs.writeFileSync(envPath, content, 'utf-8');
            console.log(`   ✅ Keypair escrito en ${envPath}`);
        } else {
            console.log(`   ⚠️  No se encontró ${envPath} — copia manualmente:`);
            console.log(`      ED25519_PRIVATE_KEY=${privateKey}`);
            console.log(`      ED25519_PUBLIC_KEY=${publicKey}`);
            console.log(`      ED25519_KID=${kid}`);
        }

        // Actualizar process.env para que el resto del seed lo vea
        process.env.ED25519_PRIVATE_KEY = privateKey;
        process.env.ED25519_PUBLIC_KEY  = publicKey;
        process.env.ED25519_KID         = kid;

        return { privateKey, publicKey, kid, isNew: true };
    }

    private printCredentials(adminInfo: AdminInfo, ids: SeededIds, keypair: Ed25519KeyPair): void {
        const sep = '═'.repeat(64);
        console.log(`\n${sep}`);
        console.log('  EVENT CORNER v3 — CREDENCIALES INICIALES');
        console.log(sep);

        console.log('\n🔐 APLICACIÓN (para el API Gateway):');
        console.log(`   Application ID : ${ids.appId}`);
        console.log(`   API Key        : ${ids.apiKey}`);
        console.log(`   API Secret     : ${ids.apiSecret}`);
        console.log('   ─ Agregar en .env del API Gateway: ABAC_APP_ID / ABAC_API_KEY ─');

        console.log('\n👤 SUPER ADMIN:\n');
        console.log(`   Email      : ${adminInfo.email}`);
        console.log(`   Contraseña : ${adminInfo.password}`);
        console.log(`   User ID    : ${ids.superAdminUserId}`);

        if (keypair.isNew) {
            console.log('\n🔑 Ed25519 KEYPAIR (tokens M2M):');
            console.log(`   ED25519_PRIVATE_KEY=${keypair.privateKey}`);
            console.log(`   ED25519_PUBLIC_KEY=${keypair.publicKey}`);
            console.log(`   ED25519_KID=${keypair.kid}`);
            console.log('');
            console.log('   ─ PRIVATE_KEY: solo en abac-microservice ─');
            console.log('   ─ PUBLIC_KEY : copiar en api-gateway, monolith, api-snowq-service ─');
        } else {
            console.log(`\n🔑 Ed25519 PUBLIC KEY (kid: ${keypair.kid}):`);
            console.log(`   ED25519_PUBLIC_KEY=${keypair.publicKey}`);
            console.log('   ─ Copiar en api-gateway, monolith, api-snowq-service ─');
        }

        console.log('\n⚠️  IMPORTANTE:');
        console.log('   1. Copia el API Key en el .env del API Gateway');
        console.log('   2. Cambia la contraseña en el primer inicio de sesión');
        console.log('   3. Elimina initial-credentials.json después de guardar las credenciales');
        console.log(`\n${sep}\n`);
    }

    private saveCredentialsToFile(adminInfo: AdminInfo, ids: SeededIds, keypair: Ed25519KeyPair): void {
        const file = path.join(process.cwd(), 'initial-credentials.json');

        const content = {
            warning:   '⚠️  CREDENCIALES SENSIBLES — ELIMINAR DESPUÉS DE USAR',
            timestamp: new Date().toISOString(),
            application: {
                id:        ids.appId,
                name:      'Event Corner',
                apiKey:    ids.apiKey,
                apiSecret: ids.apiSecret,
            },
            envVars: {
                ABAC_APP_ID:  ids.appId,
                ABAC_API_KEY: ids.apiKey,
                ABAC_URL:     process.env.ABAC_URL || 'http://localhost:3005',
            },
            ed25519: {
                kid:        keypair.kid,
                publicKey:  keypair.publicKey,
                ...(keypair.isNew ? { privateKey: keypair.privateKey } : {}),
                note: keypair.isNew
                    ? 'Keypair generado en este seed. Copia PUBLIC_KEY a api-gateway, monolith y api-snowq-service.'
                    : 'Keypair existente. La clave privada no se re-exporta.',
            },
            users: {
                superAdmin: {
                    id:       ids.superAdminUserId,
                    email:    adminInfo.email,
                    password: adminInfo.password,
                    role:     'super-admin',
                },
            },
            roles: ids.roles,
        };

        fs.writeFileSync(file, JSON.stringify(content, null, 2));
        console.log(`🔐 Credenciales guardadas en: ${file}`);
    }

    // ── Utils ───────────────────────────────────────────────────────────────────

    private generateSecurePassword(): string {
        const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lower   = 'abcdefghijklmnopqrstuvwxyz';
        const digits  = '0123456789';
        const special = '!@#$%^&*()';
        const all     = upper + lower + digits + special;

        let pwd = '';
        pwd += upper[Math.floor(Math.random() * upper.length)];
        pwd += lower[Math.floor(Math.random() * lower.length)];
        pwd += digits[Math.floor(Math.random() * digits.length)];
        pwd += special[Math.floor(Math.random() * special.length)];

        for (let i = 0; i < 12; i++) {
            pwd += all[Math.floor(Math.random() * all.length)];
        }

        return pwd.split('').sort(() => Math.random() - 0.5).join('');
    }
}

// ── Ejecutar ────────────────────────────────────────────────────────────────────
new SeedInitialData().execute().catch(console.error);
