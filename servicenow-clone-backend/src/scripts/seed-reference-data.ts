// scripts/seed-reference-data.ts
//
// Pobla servicenow_clone con registros de referencia (empresas y grupos resolutores)
// que imitan las tablas core_company y sys_user_group del ServiceNow real.
//
// Los sys_id definidos aquí son los que hay que configurar en el monolith:
//   servicenow_profiles.snow_company_sys_id  →  uno de los SYS_IDS de core_company
//   corners.snow_assignment_group            →  sys_id de un sys_user_group
//
// Uso:
//   npx ts-node -r tsconfig-paths/register src/scripts/seed-reference-data.ts

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config();

// ─── sys_ids fijos — deben coincidir con los que configures en el monolith ────

const COMPANIES = [
  {
    sys_id: '4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b',
    number: 'COMPANY0000001',
    name: 'Santander Argentina',
    short_name: 'SAN-AR',
    country: 'Argentina',
    city: 'Buenos Aires',
    notes: 'Unidad de negocio Argentina — sede central CABA',
  },
  {
    sys_id: '7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
    number: 'COMPANY0000002',
    name: 'Santander España',
    short_name: 'SAN-ES',
    country: 'España',
    city: 'Madrid',
    notes: 'Unidad de negocio España — sede central Madrid',
  },
  {
    sys_id: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
    number: 'COMPANY0000003',
    name: 'Santander Corporate (Default)',
    short_name: 'SAN-CORP',
    country: 'Global',
    city: 'Santander',
    notes:
      'Empresa por defecto — usar cuando no hay perfil específico (SN_DEFAULT_COMPANY_SYS_ID)',
  },
];

const LOCATIONS = [
  {
    sys_id: 'location001buenosaires0000000001',
    name: 'Corner Buenos Aires',
    city: 'Buenos Aires',
    country: 'Argentina',
    description: 'Corner presencial CABA — codigo ARG-BA-001',
  },
  {
    sys_id: 'location002madrid000000000000001',
    name: 'Corner Madrid',
    city: 'Madrid',
    country: 'España',
    description: 'Corner presencial Madrid — codigo ESP-MD-001',
  },
  {
    sys_id: 'location003barranquilla000000001',
    name: 'Corner Barranquilla',
    city: 'Barranquilla',
    country: 'Colombia',
    description: 'Corner presencial Barranquilla — codigo COL-BQ-001',
  },
];

const GROUPS = [
  {
    sys_id: 'group001itsupportgeneral00000001',
    number: 'GROUP0000001',
    name: 'Soporte IT General',
    type: 'itil',
    email: 'soporte-it@santander.com',
    description: 'Grupo resolutor genérico para incidencias de IT',
    location: 'Global',
  },
  {
    sys_id: 'group002networksupport0000000001',
    number: 'GROUP0000002',
    name: 'Soporte Redes',
    type: 'itil',
    email: 'soporte-redes@santander.com',
    description: 'Incidencias de conectividad, VPN, switches y routers',
    location: 'Global',
  },
  {
    sys_id: 'group003hardwaresupport000000001',
    number: 'GROUP0000003',
    name: 'Soporte Hardware',
    type: 'itil',
    email: 'soporte-hw@santander.com',
    description: 'Reparación y reemplazo de dispositivos físicos',
    location: 'Global',
  },
  {
    sys_id: 'group004softwaresupport000000001',
    number: 'GROUP0000004',
    name: 'Soporte Software',
    type: 'itil',
    email: 'soporte-sw@santander.com',
    description: 'Instalación, licencias y problemas de aplicaciones',
    location: 'Global',
  },
  {
    sys_id: 'group005cornerba0000000000000001',
    number: 'GROUP0000005',
    name: 'Soporte Corner Buenos Aires',
    type: 'itil',
    email: 'corner-ba@santander.com',
    description: 'Grupo resolutor del corner presencial Buenos Aires',
    location: 'ARG-BA-001',
  },
  {
    sys_id: 'group006cornermad000000000000001',
    number: 'GROUP0000006',
    name: 'Soporte Corner Madrid',
    type: 'itil',
    email: 'corner-madrid@santander.com',
    description: 'Grupo resolutor del corner presencial Madrid',
    location: 'ESP-MD-001',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function upsertSnGroups(ds: DataSource) {
  console.log('👥 Poblando tabla sn_groups...');
  for (const g of GROUPS) {
    const exists: unknown[] = await ds.query(
      'SELECT 1 FROM sn_groups WHERE sys_id = ?',
      [g.sys_id],
    );
    if (exists.length > 0) {
      console.log(`   ↩ ${g.name}  (ya existe, omitiendo)`);
      continue;
    }
    await ds.query(
      `INSERT INTO sn_groups (sys_id, name, type, email, description, location, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [g.sys_id, g.name, g.type, g.email, g.description, g.location],
    );
    console.log(`   ✓ ${g.name}  sys_id=${g.sys_id}`);
  }
}

async function upsertSnCompanies(ds: DataSource) {
  console.log('🏢 Poblando tabla sn_companies...');
  for (const c of COMPANIES) {
    const exists: unknown[] = await ds.query(
      'SELECT 1 FROM sn_companies WHERE sys_id = ?',
      [c.sys_id],
    );
    if (exists.length > 0) {
      console.log(`   ↩ ${c.name}  (ya existe, omitiendo)`);
      continue;
    }
    await ds.query(
      `INSERT INTO sn_companies (sys_id, name, short_name, country, city, notes, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [c.sys_id, c.name, c.short_name, c.country, c.city, c.notes],
    );
    console.log(`   ✓ ${c.name}  sys_id=${c.sys_id}`);
  }
}

async function upsertSnLocations(ds: DataSource) {
  console.log('📍 Poblando tabla sn_locations...');
  for (const l of LOCATIONS) {
    const exists: unknown[] = await ds.query(
      'SELECT 1 FROM sn_locations WHERE sys_id = ?',
      [l.sys_id],
    );
    if (exists.length > 0) {
      console.log(`   ↩ ${l.name}  (ya existe, omitiendo)`);
      continue;
    }
    await ds.query(
      `INSERT INTO sn_locations (sys_id, name, city, country, description, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [l.sys_id, l.name, l.city, l.country, l.description],
    );
    console.log(`   ✓ ${l.name}  sys_id=${l.sys_id}`);
  }
}

async function main() {
  console.log(
    '🚀 Iniciando seed de datos de referencia en servicenow_clone...\n',
  );

  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'servicenow_clone',
    entities: [path.join(__dirname, '..', '**', '*.entity{.ts,.js}')],
    synchronize: false,
    logging: false,
  });

  await ds.initialize();
  console.log('✅ Conectado a servicenow_clone\n');

  const now = new Date();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // ── Verificar si ya existen datos ───────────────────────────────────
    const existing = (await qr.query(
      `SELECT COUNT(*) as cnt FROM sn_tickets WHERE table_name IN ('core_company','sys_user_group')`,
    )) as Array<{ cnt: string }>;
    if (parseInt(existing[0].cnt) > 0) {
      console.log(
        '⚠️  Ya existen registros de referencia en sn_tickets. Omitiendo inserción de tickets...',
      );
      console.log(
        '   (borrá los registros con table_name core_company / sys_user_group para re-ejecutar)\n',
      );
      await qr.rollbackTransaction();
      await qr.release();
      // Siempre sincronizar las tablas dedicadas (idempotente)
      await upsertSnGroups(ds);
      await upsertSnCompanies(ds);
      await upsertSnLocations(ds);
      printSummary();
      return; // finally se ejecuta igual y cierra la conexión
    }

    // ── Insertar empresas (core_company) ────────────────────────────────
    console.log('🏢 Insertando empresas (core_company)...');
    for (const c of COMPANIES) {
      await qr.query(
        `INSERT INTO sn_tickets
                   (sys_id, number, table_name, state, payload, resolved_at, created_at, updated_at)
                 VALUES (?, ?, 'core_company', 'active', ?, NULL, ?, ?)`,
        [
          c.sys_id,
          c.number,
          JSON.stringify({
            name: c.name,
            short_name: c.short_name,
            country: c.country,
            city: c.city,
            notes: c.notes,
            sys_id: c.sys_id,
          }),
          now,
          now,
        ],
      );
      console.log(`   ✓ ${c.name}  sys_id=${c.sys_id}`);
    }

    // ── Insertar grupos resolutores (sys_user_group) ────────────────────
    console.log('\n👥 Insertando grupos resolutores (sys_user_group)...');
    for (const g of GROUPS) {
      await qr.query(
        `INSERT INTO sn_tickets
                   (sys_id, number, table_name, state, payload, resolved_at, created_at, updated_at)
                 VALUES (?, ?, 'sys_user_group', 'active', ?, NULL, ?, ?)`,
        [
          g.sys_id,
          g.number,
          JSON.stringify({
            name: g.name,
            type: g.type,
            email: g.email,
            description: g.description,
            location: g.location,
            sys_id: g.sys_id,
          }),
          now,
          now,
        ],
      );
      console.log(`   ✓ ${g.name}  sys_id=${g.sys_id}`);
    }

    await qr.commitTransaction();

    // Poblar la tabla dedicada sn_companies (idempotente, fuera de la transacción de tickets)
    await upsertSnGroups(ds);
    await upsertSnCompanies(ds);
    await upsertSnLocations(ds);

    printSummary();
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('\n❌ Error en seed:', err);
    process.exit(1);
  } finally {
    try {
      await qr.release();
    } catch {
      /* ya liberado en el early return */
    }
    await ds.destroy();
  }
}

function printSummary() {
  const sep = '═'.repeat(72);
  console.log(`\n${sep}`);
  console.log('  SEED COMPLETADO — sys_ids de referencia');
  console.log(sep);

  console.log(
    '\n🏢 EMPRESAS (core_company) — usar en monolith → servicenow_profiles.snow_company_sys_id:\n',
  );
  for (const c of COMPANIES) {
    console.log(`   ${c.name.padEnd(30)} sys_id = ${c.sys_id}`);
  }

  console.log(
    '\n👥 GRUPOS RESOLUTORES (sys_user_group) — usar en monolith → corners.snow_assignment_group:\n',
  );
  for (const g of GROUPS) {
    console.log(`   ${g.name.padEnd(35)} sys_id = ${g.sys_id}`);
  }

  console.log(`\n${sep}`);
  console.log('  CONFIGURAR EN MONOLITH:');
  console.log(sep);
  console.log(`
  1. servicenow_profiles
     snow_company_sys_id → sys_id de la empresa correspondiente

  2. corners
     snow_assignment_group → sys_id del grupo resolutor del corner
     servicenow_location   → código de ubicación (ej: ARG-BA-001)

  3. .env del monolith
     SN_DEFAULT_COMPANY_SYS_ID=${COMPANIES[2].sys_id}
`);
  console.log(sep);
}

main().catch(console.error);
