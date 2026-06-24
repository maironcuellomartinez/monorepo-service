// apps/monolith/src/scripts/seed-test-data.ts
//
// Seed de datos de prueba para el monolith de Event Corner.
//
// Crea (en orden por FK):
//   1. issue_type_trees      — árbol compartido Santander
//   2. servicenow_profiles   — perfiles SN con sys_ids que coinciden con servicenow-clone-backend
//   3. companies             — Santander Argentina + Santander España
//   4. issue_types           — tipos de incidencia con categorías ServiceNow
//   5. corners               — 2 corners con assignment_group + servicenow_location
//   6. users                 — empleados de prueba (external_id = UUID del abac-microservice seed)
//
// Los sys_ids de empresas y grupos deben coincidir con seed-reference-data.ts
// (servicenow-clone-backend).
//
// Uso:
//   npm run monolith:seed

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load monolith env (works from monorepo root or from the monolith dir)
config({ path: path.join(__dirname, '..', '..', '..', '..', '.env.development') });
config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
config(); // fallback: .env in cwd

// ─── sys_ids que coinciden con servicenow-clone-backend/seed-reference-data.ts ─

const SN = {
    companies: {
        argentina:  '4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b',
        espana:     '7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
        corporate:  'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
    },
    groups: {
        itGeneral:  'group001itsupportgeneral00000001',
        redes:      'group002networksupport0000000001',
        hardware:   'group003hardwaresupport000000001',
        software:   'group004softwaresupport000000001',
        cornerBA:   'group005cornerba0000000000000001',
        cornerMAD:  'group006cornermad000000000000001',
    },
};

// ─── IDs fijos del seed (para que sea idempotente y referencias cruzadas sean estables) ─

const IDS = {
    tree:    'tree-santander-0000000000000001',

    profiles: {
        argentina:  'profile-santander-ar-000000001',
        espana:     'profile-santander-es-000000001',
        corporate:  'profile-santander-corp-000000001',
    },

    companies: {
        argentina:  'company-santander-ar-00000001',
        espana:     'company-santander-es-00000001',
        default:    'company-santander-default-001',
    },

    issueTypes: {
        hardwareGeneral:   'it-hardware-general-00000001',
        hardwareTeclado:   'it-hardware-teclado-00000001',
        softwareSistema:   'it-software-sistema-00000001',
        softwareApp:       'it-software-app-00000000001',
        redConectividad:   'it-red-conectividad-000000001',
        accesoSistema:     'it-acceso-sistema-0000000001',
    },

    corners: {
        buenosAires: 'corner-buenos-aires-00000001',
        madrid:      'corner-madrid-000000000000001',
    },

    users: {
        empleado1: 'user-empleado1-monolith-000001',
        empleado2: 'user-empleado2-monolith-000001',
    },
};

// ─── Leer UUIDs del seed del abac ─────────────────────────────────────────────

function loadAbacIds(): { employee1: string; employee2: string } {
    // Busca initial-credentials.json en el directorio del abac-microservice
    const candidates = [
        path.join(__dirname, '..', '..', '..', '..', 'abac-microservice', 'initial-credentials.json'),
        path.join(process.cwd(), 'initial-credentials.json'),
        path.join(process.cwd(), 'apps', 'abac-microservice', 'initial-credentials.json'),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            const creds = JSON.parse(fs.readFileSync(p, 'utf-8'));
            const e1 = creds?.users?.employee1?.id;
            const e2 = creds?.users?.employee2?.id;
            if (e1 && e2) {
                console.log(`   📄 initial-credentials.json encontrado en: ${p}`);
                console.log(`   employee1 UUID = ${e1}`);
                console.log(`   employee2 UUID = ${e2}`);
                return { employee1: e1, employee2: e2 };
            }
        }
    }

    // Fallback: acepta UUIDs como argumentos CLI  --emp1 <uuid> --emp2 <uuid>
    const args = process.argv.slice(2);
    const emp1Idx = args.indexOf('--emp1');
    const emp2Idx = args.indexOf('--emp2');
    if (emp1Idx !== -1 && emp2Idx !== -1) {
        const e1 = args[emp1Idx + 1];
        const e2 = args[emp2Idx + 1];
        console.log(`   📄 UUIDs provistos por CLI`);
        return { employee1: e1, employee2: e2 };
    }

    console.warn(`
   ⚠️  No se encontró initial-credentials.json ni se pasaron --emp1 / --emp2.
   Los usuarios se crearán con external_id placeholder — actualizá manualmente.
`);
    return {
        employee1: 'PENDING_EMPLOYEE1_UUID_FROM_ABAC',
        employee2: 'PENDING_EMPLOYEE2_UUID_FROM_ABAC',
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 Iniciando seed de datos de prueba en event_corner...\n');

    const ds = new DataSource({
        type:        'mysql',
        host:        process.env.DB_HOST     || 'localhost',
        port:        parseInt(process.env.DB_PORT || '3306'),
        username:    process.env.DB_USERNAME || 'root',
        password:    process.env.DB_PASSWORD || 'root',
        database:    process.env.DB_DATABASE || 'event_corner',
        entities:    [],
        synchronize: false,
        logging:     false,
    });

    await ds.initialize();
    console.log('✅ Conectado a event_corner\n');

    const now = new Date();
    const qr  = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
        const existing = await qr.query(
            `SELECT COUNT(*) as cnt FROM issue_type_trees WHERE tree_id = ?`,
            [IDS.tree],
        );
        if (parseInt(existing[0].cnt) > 0) {
            console.log('⚠️  Los datos de prueba ya existen. Omitiendo...');
            console.log('   (borrá los registros con los IDs fijos para re-ejecutar)\n');
            printSummary();
            return;
        }

        // ── 1. Issue type tree ──────────────────────────────────────────────
        console.log('🌳 Creando árbol de tipos de incidencia...');
        await qr.query(
            `INSERT INTO issue_type_trees (tree_id, name, created_at, updated_at)
             VALUES (?, ?, ?, ?)`,
            [IDS.tree, 'Santander — Árbol Principal', now, now],
        );
        console.log(`   ✓ tree_id=${IDS.tree}`);

        // ── 2. ServiceNow profiles ──────────────────────────────────────────
        console.log('\n🔗 Creando perfiles ServiceNow...');
        const profiles = [
            {
                id:        IDS.profiles.argentina,
                name:      'Santander Argentina',
                sys_id:    SN.companies.argentina,
                company:   'Santander Argentina',
            },
            {
                id:        IDS.profiles.espana,
                name:      'Santander España',
                sys_id:    SN.companies.espana,
                company:   'Santander España',
            },
            {
                id:        IDS.profiles.corporate,
                name:      'Santander Corporate (Default)',
                sys_id:    SN.companies.corporate,
                company:   'Santander Corporate',
            },
        ];
        for (const p of profiles) {
            await qr.query(
                `INSERT INTO servicenow_profiles
                   (profile_id, name, snow_company_sys_id, snow_company_name, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 1, ?, ?)`,
                [p.id, p.name, p.sys_id, p.company, now, now],
            );
            console.log(`   ✓ ${p.name}  snow_company_sys_id=${p.sys_id}`);
        }

        // ── 3. Companies ────────────────────────────────────────────────────
        console.log('\n🏢 Creando empresas...');
        const companies = [
            {
                id:        IDS.companies.argentina,
                name:      'Santander Argentina S.A.',
                tree:      IDS.tree,
                profile:   IDS.profiles.argentina,
            },
            {
                id:        IDS.companies.espana,
                name:      'Santander España S.A.',
                tree:      IDS.tree,
                profile:   IDS.profiles.espana,
            },
            {
                id:        IDS.companies.default,
                name:      'Santander Corporate (Default)',
                tree:      IDS.tree,
                profile:   IDS.profiles.corporate,
            },
        ];
        for (const c of companies) {
            await qr.query(
                `INSERT INTO companies
                   (company_id, name, tree_id, profile_id, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 1, ?, ?)`,
                [c.id, c.name, c.tree, c.profile, now, now],
            );
            console.log(`   ✓ ${c.name}  company_id=${c.id}`);
        }

        // ── 4. Issue types ──────────────────────────────────────────────────
        console.log('\n📋 Creando tipos de incidencia...');
        const issueTypes = [
            {
                id:              IDS.issueTypes.hardwareGeneral,
                name:            'Hardware — General',
                category:        'hardware',
                device_type:     'computer',
                sn_category:     'hardware',
                sn_close:        'solution_provided',
                work_min:        60,
                spare_min:       30,
                close_min:       10,
                position:        1,
                icon:            'hardware',
            },
            {
                id:              IDS.issueTypes.hardwareTeclado,
                name:            'Hardware — Teclado / Mouse',
                category:        'hardware',
                device_type:     'peripheral',
                sn_category:     'hardware',
                sn_close:        'solution_provided',
                work_min:        30,
                spare_min:       0,
                close_min:       5,
                position:        2,
                icon:            'keyboard',
            },
            {
                id:              IDS.issueTypes.softwareSistema,
                name:            'Software — Sistema Operativo',
                category:        'software',
                device_type:     'computer',
                sn_category:     'software',
                sn_close:        'solution_provided',
                work_min:        90,
                spare_min:       0,
                close_min:       15,
                position:        3,
                icon:            'operating_system',
            },
            {
                id:              IDS.issueTypes.softwareApp,
                name:            'Software — Aplicación Corporativa',
                category:        'software',
                device_type:     null,
                sn_category:     'software',
                sn_close:        'solution_provided',
                work_min:        45,
                spare_min:       0,
                close_min:       10,
                position:        4,
                icon:            'application',
            },
            {
                id:              IDS.issueTypes.redConectividad,
                name:            'Red — Sin Conectividad',
                category:        'network',
                device_type:     null,
                sn_category:     'network',
                sn_close:        'solution_provided',
                work_min:        30,
                spare_min:       0,
                close_min:       5,
                position:        5,
                icon:            'network',
            },
            {
                id:              IDS.issueTypes.accesoSistema,
                name:            'Acceso — Contraseña / Bloqueo',
                category:        'access',
                device_type:     null,
                sn_category:     'access',
                sn_close:        'solution_provided',
                work_min:        15,
                spare_min:       0,
                close_min:       5,
                position:        6,
                icon:            'lock',
            },
        ];
        for (const it of issueTypes) {
            await qr.query(
                `INSERT INTO issue_types
                   (issue_type_id, tree_id, name, category, device_type,
                    servicenow_category, servicenow_close_category,
                    work_minutes, spare_minutes, close_minutes,
                    not_user_visible, position, icon, nps_disabled, is_active,
                    created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 1, ?, ?)`,
                [
                    it.id, IDS.tree, it.name, it.category, it.device_type ?? null,
                    it.sn_category, it.sn_close,
                    it.work_min, it.spare_min, it.close_min,
                    it.position, it.icon,
                    now, now,
                ],
            );
            console.log(`   ✓ ${it.name}  sn_category=${it.sn_category}`);
        }

        // ── 5. Corners ──────────────────────────────────────────────────────
        console.log('\n📍 Creando corners...');
        const corners = [
            {
                id:          IDS.corners.buenosAires,
                name:        'Corner Buenos Aires — CABA',
                client_name: 'Santander Argentina',
                description: 'Corner de atención presencial en sede Buenos Aires',
                sn_location: 'ARG-BA-001',
                sn_group:    SN.groups.cornerBA,
                lat:         -34.6037,
                lon:         -58.3816,
            },
            {
                id:          IDS.corners.madrid,
                name:        'Corner Madrid — Sede Central',
                client_name: 'Santander España',
                description: 'Corner de atención presencial en sede Madrid',
                sn_location: 'ESP-MD-001',
                sn_group:    SN.groups.cornerMAD,
                lat:         40.4168,
                lon:         -3.7038,
            },
        ];
        for (const c of corners) {
            await qr.query(
                `INSERT INTO corners
                   (corner_id, name, client_name, description,
                    servicenow_location, snow_assignment_group,
                    latitude, longitude, only_technicians, is_active,
                    created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
                [c.id, c.name, c.client_name, c.description,
                 c.sn_location, c.sn_group, c.lat, c.lon, now, now],
            );
            console.log(`   ✓ ${c.name}`);
            console.log(`     snow_assignment_group=${c.sn_group}`);
            console.log(`     servicenow_location=${c.sn_location}`);
        }

        // ── 5.1. CompanyIssueConfig (grupos resolutores por company+issueType) ─────────
        console.log('\n⚙️ Creando configuraciones company-issue (CompanyIssueConfig)...');
        const cornerIssueConfigs = [
            // Argentina — Hardware
            { id: 'cic-ar-hw-general-000000001', company: IDS.companies.argentina, issueType: IDS.issueTypes.hardwareGeneral, group: SN.groups.hardware, workMin: null },
            { id: 'cic-ar-hw-teclado-000000001', company: IDS.companies.argentina, issueType: IDS.issueTypes.hardwareTeclado, group: SN.groups.hardware, workMin: 20 },
            { id: 'cic-ar-sw-sistema-000000001', company: IDS.companies.argentina, issueType: IDS.issueTypes.softwareSistema, group: SN.groups.software, workMin: null },
            { id: 'cic-ar-sw-app-0000000000001', company: IDS.companies.argentina, issueType: IDS.issueTypes.softwareApp,    group: SN.groups.software, workMin: null },
            { id: 'cic-ar-red-conectividad-001', company: IDS.companies.argentina, issueType: IDS.issueTypes.redConectividad, group: SN.groups.redes,    workMin: null },
            { id: 'cic-ar-acceso-sistema-0001', company: IDS.companies.argentina, issueType: IDS.issueTypes.accesoSistema,  group: SN.groups.itGeneral, workMin: null },
            // España — Hardware
            { id: 'cic-es-hw-general-000000001', company: IDS.companies.espana, issueType: IDS.issueTypes.hardwareGeneral, group: SN.groups.hardware, workMin: null },
            { id: 'cic-es-hw-teclado-000000001', company: IDS.companies.espana, issueType: IDS.issueTypes.hardwareTeclado, group: SN.groups.hardware, workMin: 20 },
            { id: 'cic-es-sw-sistema-000000001', company: IDS.companies.espana, issueType: IDS.issueTypes.softwareSistema, group: SN.groups.software, workMin: null },
            { id: 'cic-es-sw-app-000000000001', company: IDS.companies.espana, issueType: IDS.issueTypes.softwareApp,    group: SN.groups.software, workMin: null },
            { id: 'cic-es-red-conectividad-01', company: IDS.companies.espana, issueType: IDS.issueTypes.redConectividad, group: SN.groups.redes,    workMin: null },
            { id: 'cic-es-acceso-sistema-0001', company: IDS.companies.espana, issueType: IDS.issueTypes.accesoSistema,  group: SN.groups.itGeneral, workMin: null },
            // Default/Corporate — fallback para compañías sin CompanyIssueConfig propia
            { id: 'cic-def-hw-general-00000001', company: IDS.companies.default, issueType: IDS.issueTypes.hardwareGeneral, group: SN.groups.itGeneral, workMin: null },
            { id: 'cic-def-hw-teclado-00000001', company: IDS.companies.default, issueType: IDS.issueTypes.hardwareTeclado, group: SN.groups.itGeneral, workMin: null },
            { id: 'cic-def-sw-sistema-00000001', company: IDS.companies.default, issueType: IDS.issueTypes.softwareSistema, group: SN.groups.itGeneral, workMin: null },
            { id: 'cic-def-sw-app-000000000001', company: IDS.companies.default, issueType: IDS.issueTypes.softwareApp,    group: SN.groups.itGeneral, workMin: null },
            { id: 'cic-def-red-conectividad-01', company: IDS.companies.default, issueType: IDS.issueTypes.redConectividad, group: SN.groups.itGeneral, workMin: null },
            { id: 'cic-def-acceso-sistema-0001', company: IDS.companies.default, issueType: IDS.issueTypes.accesoSistema,  group: SN.groups.itGeneral, workMin: null },
        ];
        for (const cic of cornerIssueConfigs) {
            await qr.query(
                `INSERT INTO company_issue_configs
                   (config_id, company_id, issue_type_id, servicenow_group, work_minutes_override, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [cic.id, cic.company, cic.issueType, cic.group, cic.workMin, now],
            );
            console.log(`   ✓ ${cic.company} + ${cic.issueType} → ${cic.group}`);
        }

        // ── 5.2. servicenow_groups (catálogo de grupos conocidos) ────────────────────
        console.log('\n🔧 Creando catálogo de grupos ServiceNow...');
        const snGroups = [
            { id: 'sng-it-general-000000000001', name: SN.groups.itGeneral,  desc: 'IT Support General' },
            { id: 'sng-redes-0000000000000001',  name: SN.groups.redes,      desc: 'Network Support' },
            { id: 'sng-hardware-000000000001',   name: SN.groups.hardware,   desc: 'Hardware Support' },
            { id: 'sng-software-000000000001',   name: SN.groups.software,   desc: 'Software Support' },
            { id: 'sng-corner-ba-000000000001',  name: SN.groups.cornerBA,   desc: 'Corner Buenos Aires' },
            { id: 'sng-corner-mad-00000000001',  name: SN.groups.cornerMAD,  desc: 'Corner Madrid' },
        ];
        for (const sg of snGroups) {
            await qr.query(
                `INSERT INTO servicenow_groups
                   (group_id, group_name, description, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, 1, ?, ?)`,
                [sg.id, sg.name, sg.desc, now, now],
            );
            console.log(`   ✓ ${sg.name}`);
        }

        // ── 6. Users (empleados de prueba) ──────────────────────────────────
        console.log('\n👤 Creando usuarios de prueba...');

        const abacIds = loadAbacIds();

        const users = [
            {
                id:          IDS.users.empleado1,
                external_id: abacIds.employee1,
                name:        'Juan',
                last_name:   'Empleado',
                full_name:   'Juan Empleado',
                email:       'empleado1@eventcorner.com',
                company_id:  IDS.companies.argentina,
                domain:      'eventcorner.com',
            },
            {
                id:          IDS.users.empleado2,
                external_id: abacIds.employee2,
                name:        'María',
                last_name:   'Empleado',
                full_name:   'María Empleado',
                email:       'empleado2@eventcorner.com',
                company_id:  IDS.companies.espana,
                domain:      'eventcorner.com',
            },
        ];
        for (const u of users) {
            await qr.query(
                `INSERT INTO users
                   (customer_id, external_id, name, last_name, full_name, email,
                    company_id, domain, principal_name, device_tokens, is_active,
                    created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
                [
                    u.id, u.external_id, u.name, u.last_name, u.full_name, u.email,
                    u.company_id, u.domain, u.email,
                    now, now,
                ],
            );
            console.log(`   ✓ ${u.full_name}  customer_id=${u.id}`);
        }

        await qr.commitTransaction();
        printSummary();

    } catch (err) {
        await qr.rollbackTransaction();
        console.error('\n❌ Error en seed:', err);
        process.exit(1);
    } finally {
        await qr.release();
        await ds.destroy();
    }
}

function printSummary() {
    const sep = '═'.repeat(72);
    console.log(`\n${sep}`);
    console.log('  MONOLITH — DATOS DE PRUEBA CREADOS');
    console.log(sep);

    console.log(`
🔗 ServiceNow Profiles:
   profile-santander-ar  → snow_company_sys_id = ${SN.companies.argentina}
   profile-santander-es  → snow_company_sys_id = ${SN.companies.espana}

🏢 Companies:
   Santander Argentina S.A.       company_id = ${IDS.companies.argentina}
   Santander España S.A.          company_id = ${IDS.companies.espana}
   Santander Corporate (Default)  company_id = ${IDS.companies.default}

📋 Issue Types (tree_id = ${IDS.tree}):
   Hardware — General              sn_category = hardware
   Hardware — Teclado / Mouse      sn_category = hardware
   Software — Sistema Operativo    sn_category = software
   Software — Aplicación           sn_category = software
   Red — Sin Conectividad          sn_category = network
   Acceso — Contraseña / Bloqueo   sn_category = access

📍 Corners:
   Corner Buenos Aires  snow_assignment_group = ${SN.groups.cornerBA}
   Corner Madrid        snow_assignment_group = ${SN.groups.cornerMAD}

⚙️ CompanyIssueConfigs:
   Argentina + hardwareGeneral → ${SN.groups.hardware}
   Argentina + hardwareTeclado → ${SN.groups.hardware} (workMin=20)
   Argentina + softwareSistema → ${SN.groups.software}
   Argentina + softwareApp     → ${SN.groups.software}
   Argentina + redConectividad → ${SN.groups.redes}
   Argentina + accesoSistema   → ${SN.groups.itGeneral}
   España + hardwareGeneral    → ${SN.groups.hardware}
   España + hardwareTeclado    → ${SN.groups.hardware} (workMin=20)
   España + softwareSistema    → ${SN.groups.software}
   España + softwareApp        → ${SN.groups.software}
   España + redConectividad    → ${SN.groups.redes}
   España + accesoSistema      → ${SN.groups.itGeneral}

🔧 ServiceNow Groups (catálogo):
   ${SN.groups.itGeneral}, ${SN.groups.redes}, ${SN.groups.hardware},
   ${SN.groups.software}, ${SN.groups.cornerBA}, ${SN.groups.cornerMAD}

👤 Users (customer_id para usar como --customer-id en gateway-simulator.js):
   Juan Empleado   → ${IDS.users.empleado1}  (empresa Argentina)
   María Empleado  → ${IDS.users.empleado2}  (empresa España)

🌍 .env.development — variables de compañía default:
   SN_DEFAULT_COMPANY_SYS_ID=${SN.companies.corporate}
   SN_DEFAULT_COMPANY_ID=${IDS.companies.default}
`);
    console.log(sep);
}

main().catch(console.error);
