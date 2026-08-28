// apps/micorner/src/scripts/wipe-data.ts
//
// Limpia todos los datos de event_corner DB sin tocar la estructura de tablas.
// Útil durante desarrollo para empezar desde cero y configurar desde el dashboard.
//
// Uso:
//   npm run micorner:wipe
//
// Lo que NO borra:
//   - Estructura de tablas (TypeORM synchronize se encarga)
//   - Tabla "migrations" (para no re-ejecutar migraciones ya aplicadas)

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';

config({ path: path.join(__dirname, '..', '..', '..', '..', '.env.development') });
config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
config();

// Orden de borrado respetando FKs (hijos antes que padres)
const TABLES_IN_ORDER = [
    'batch_draft_items',
    'batch_drafts',
    'incident_slots',
    'incident_timeline',
    'outbox_events',
    'request_activity',
    'requests',
    'incidents',
    'corner_slots',
    'schedule_assignments',
    'corner_schedules',
    'technicians',
    'lockers',
    'devices',
    'users',
    'company_issue_configs',
    'servicenow_groups',
    'corners',
    'issue_types',
    'companies',
    'servicenow_profiles',
    'issue_type_trees',
];

async function confirm(): Promise<boolean> {
    if (process.env.WIPE_FORCE === 'true') return true;

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(
            '\n⚠️  Esto borrará TODOS los datos de event_corner DB.\n¿Continuar? (y/N): ',
            (answer) => {
                rl.close();
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            },
        );
    });
}

async function main() {
    console.log('🧹 Micorner Data Wipe\n');

    const ok = await confirm();
    if (!ok) {
        console.log('   Cancelado.');
        process.exit(0);
    }

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
    console.log('✅ Conectado a', process.env.DB_DATABASE || 'event_corner', '\n');

    const qr = ds.createQueryRunner();
    await qr.connect();

    try {
        await qr.query('SET FOREIGN_KEY_CHECKS = 0');

        for (const table of TABLES_IN_ORDER) {
            try {
                const [result] = await qr.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
                const count = result?.cnt ?? 0;
                await qr.query(`TRUNCATE TABLE \`${table}\``);
                console.log(`   ✅ ${table.padEnd(30)} (${count} filas eliminadas)`);
            } catch (err: any) {
                // La tabla puede no existir todavía si nunca arrancó el micorner
                if (err?.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`   ⏭️  ${table.padEnd(30)} (tabla no existe — ignorada)`);
                } else {
                    throw err;
                }
            }
        }

        await qr.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('\n✅ Limpieza completa. La tabla "migrations" no fue tocada.');
        console.log('   Reiniciá el micorner para que TypeORM sincronice la estructura.\n');
    } catch (err) {
        await qr.query('SET FOREIGN_KEY_CHECKS = 1');
        console.error('\n❌ Error durante el wipe:', err);
        process.exit(1);
    } finally {
        await qr.release();
        await ds.destroy();
    }
}

main();
