// scripts/start-infra.js
//
// Orquesta el arranque de todo el ecosistema Event Corner en orden de
// dependencias (ver CLAUDE.md → "Ecosystem Overview"), reusando el
// ecosystem.config.js/.cjs que ya tiene cada servicio (no inventa uno nuevo).
// Para cada servicio: build (si falta dist/, o siempre con --force-build) →
// pm2 start (--only <app>) → espera el puerto antes de pasar al siguiente
// tier. No levanta MySQL — solo verifica que cada servicio pueda alcanzar el
// host:port que tiene configurado (pueden diferir entre servicios) y aborta
// con instrucciones si no responde, en vez de arrancar contenedores a ciegas
// (ver la nota de CLAUDE.md sobre MySQL nativo vs Docker compitiendo por
// :3306). No usa Redis: no está en la ruta crítica de arranque actual.
//
// Uso:
//   node scripts/start-infra.js                 # build-si-falta + start en orden
//   node scripts/start-infra.js --force-build    # reconstruye todo igual
//   node scripts/start-infra.js --status         # pm2 status de los apps del ecosistema
//   node scripts/start-infra.js --down           # pm2 delete de todos los apps del ecosistema

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ── Definición de servicios ──────────────────────────────────────────────────
// dir: carpeta del servicio relativa a ROOT
// build: comando npm para generar dist/ (null = no requiere build)
// distCheck: archivo relativo a dir que indica que el build existe
// pm2.ecosystem: archivo ecosystem relativo a ROOT (varios servicios comparten uno)
// pm2.app: nombre del app dentro de ese ecosystem file
// port: puerto dev en el que debe responder una vez arriba
// envFile: .env.development (relativo a ROOT) de donde leer la conexión a MySQL
//          (solo para servicios con DB propia — pueden diferir entre sí)
const SERVICES = {
    'servicenow-clone-backend': {
        dir: 'servicenow-clone-backend',
        build: 'npm run build',
        distCheck: 'dist/main.js',
        pm2: { ecosystem: 'servicenow-clone-backend/ecosystem.config.js', app: 'servicenow-clone-backend' },
        port: 3010,
        hasDb: true,
        envFile: null, // sin .env.development — usa defaults de ConfigService (localhost:3306)
    },
    abac: {
        dir: 'abac-microservice',
        build: 'npm run build',
        distCheck: 'dist/src/main.js',
        pm2: { ecosystem: 'monolito-event-corner_v3/ecosystem.config.js', app: 'abac' },
        port: 3005,
        hasDb: true,
        envFile: 'abac-microservice/.env.development',
    },
    'observability-service': {
        dir: 'observability-service',
        build: 'npm run build',
        distCheck: 'dist/main.js',
        pm2: { ecosystem: 'monolito-event-corner_v3/ecosystem.config.js', app: 'observability-service' },
        port: 3099,
        hasDb: true,
        envFile: 'observability-service/.env.development',
    },
    'api-snowq-service': {
        dir: 'api-snowq-service',
        build: 'npm run build',
        distCheck: 'dist/main.js',
        pm2: { ecosystem: 'api-snowq-service/ecosystem.config.js', app: 'api-snowq-service' },
        port: 3090,
        hasDb: true,
        envFile: 'api-snowq-service/.env.development',
    },
    micorner: {
        dir: 'monolito-event-corner_v3',
        build: 'npm run build:micorner',
        distCheck: 'dist/apps/micorner/main.js',
        pm2: { ecosystem: 'monolito-event-corner_v3/ecosystem.config.js', app: 'micorner' },
        port: 3002,
        hasDb: true,
        envFile: 'monolito-event-corner_v3/apps/micorner/.env.development',
    },
    'observability-dashboard': {
        dir: 'observability-dashboard',
        build: 'npm run build',
        distCheck: 'dist/index.html',
        pm2: { ecosystem: 'observability-dashboard/ecosystem.config.cjs', app: 'observability-dashboard' },
        port: 5174,
        hasDb: false, // front, sin DB propia
        envFile: null,
    },
    'api-gateway': {
        dir: 'monolito-event-corner_v3',
        build: 'npm run build:api-gateway',
        distCheck: 'dist/apps/api-gateway/main.js',
        pm2: { ecosystem: 'monolito-event-corner_v3/ecosystem.config.js', app: 'api-gateway' },
        port: 4000,
        hasDb: false, // proxy, sin DB propia
        envFile: null,
    },
    'integration-service': {
        dir: 'integration-service',
        build: 'npm run build',
        distCheck: 'dist/main.js',
        pm2: { ecosystem: 'monolito-event-corner_v3/ecosystem.config.js', app: 'integration-service' },
        port: 3008,
        hasDb: false, // capa MySQL/TypeORM eliminada (2026-07-28)
        envFile: null,
    },
    'event-corner-app': {
        dir: 'event-corner-app',
        build: 'npm run build',
        distCheck: 'dist/index.html',
        pm2: { ecosystem: 'event-corner-app/ecosystem.config.cjs', app: 'event-corner-app' },
        port: 5175,
        hasDb: false, // front, sin DB propia
        envFile: null,
    },
    'minerva-app': {
        dir: 'minerva-app',
        build: 'npm run build',
        distCheck: 'dist/main.js',
        pm2: { ecosystem: 'minerva-app/ecosystem.config.js', app: 'minerva-app' },
        port: 3015,
        hasDb: false, // mock REST, sin DB — consumido por integration-service (MINERVA_BASE_URL)
        envFile: null,
    },
    'auth-configuration-app': {
        dir: 'auth-configuration-app',
        build: 'npm run build',
        distCheck: 'dist/index.html',
        pm2: { ecosystem: 'auth-configuration-app/ecosystem.config.cjs', app: 'auth-configuration-app' },
        port: 5173,
        hasDb: false, // front, depende solo de abac (VITE_ABAC_API_URL)
        envFile: null,
    },
};

// Orden de arranque — ver CLAUDE.md "Ecosystem Overview":
//   MySQL → servicenow-clone-backend / abac / observability-service / minerva-app (sin deps entre sí)
//        → api-snowq-service (necesita servicenow-clone-backend) / micorner (necesita abac)
//          / observability-dashboard (necesita observability-service)
//          / auth-configuration-app (necesita abac)
//        → api-gateway (necesita micorner + api-snowq-service + abac)
//        → integration-service (necesita api-gateway + minerva-app) / event-corner-app (necesita api-gateway)
const TIERS = [
    ['servicenow-clone-backend', 'abac', 'observability-service', 'minerva-app'],
    ['api-snowq-service', 'micorner', 'observability-dashboard', 'auth-configuration-app'],
    ['api-gateway'],
    ['integration-service', 'event-corner-app'],
];

const HEALTH_TIMEOUT_MS = 45000;
const MYSQL_TIMEOUT_MS = 5000;

// Usa el pm2 local (devDependency de la raíz) si existe — evita depender de
// una instalación global, que algunas políticas de entorno no permiten. Si
// no está instalado localmente, cae al `pm2` del PATH (entornos donde sí
// hay una instalación global).
const PM2_BIN = (() => {
    const local = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'pm2.cmd' : 'pm2');
    return fs.existsSync(local) ? `"${local}"` : 'pm2';
})();

function parseEnvFile(filePath) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const result = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        result[key] = value;
    }
    return result;
}

// Cada servicio puede nombrar sus variables de DB distinto (DB_HOST/DB_PORT,
// o HOST_DATABASE/PORT_DATABASE en api-snowq-service) — probamos ambos pares.
function resolveDbTarget(envFileRel) {
    if (!envFileRel) return { host: 'localhost', port: 3306 };
    const filePath = path.join(ROOT, envFileRel);
    if (!fs.existsSync(filePath)) return { host: 'localhost', port: 3306 };
    const vars = parseEnvFile(filePath);
    const pairs = [['DB_HOST', 'DB_PORT'], ['HOST_DATABASE', 'PORT_DATABASE']];
    
    for (const [hostKey, portKey] of pairs) {
        if (vars[hostKey]) {
            return { host: vars[hostKey], port: Number(vars[portKey]) || 3306 };
        }
    }
    return { host: 'localhost', port: 3306 };
}

function waitForPort(host, port, timeoutMs) {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const attempt = () => {
            const socket = net.createConnection({ host, port });
            const onFail = () => {
                socket.destroy();
                if (Date.now() > deadline) return resolve(false);
                setTimeout(attempt, 1000);
            };
            socket.once('connect', () => {
                socket.end();
                resolve(true);
            });
            socket.once('error', onFail);
            socket.setTimeout(2000, onFail);
        };
        attempt();
    });
}

// spawn asíncrono — a diferencia de execSync (spawnSync), no bloquea el
// event loop del proceso mientras corre el comando hijo (build, pm2 start).
function run(cmd, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, { shell: true, stdio: 'inherit', ...opts });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Comando falló (exit ${code}): ${cmd}`));
        });
    });
}

function runSilent(cmd, opts = {}) {
    return new Promise((resolve) => {
        const child = spawn(cmd, { shell: true, stdio: 'ignore', ...opts });
        child.on('error', () => resolve(false));
        child.on('exit', (code) => resolve(code === 0));
    });
}

async function ensurePm2Available() {
    const ok = await runSilent(`${PM2_BIN} --version`);
    if (!ok) {
        console.error('✗ pm2 no está disponible. Instalar como devDependency local: npm install --save-dev pm2');
        console.error('  (o, si el entorno lo permite, globalmente: npm install -g pm2)');
        process.exit(1);
    }
}

async function checkMysql() {
    console.log('\n=== Verificando MySQL ===');
    const targets = new Map();
    for (const svc of Object.values(SERVICES)) {
        if (!svc.hasDb) continue; // servicios sin DB propia no entran al chequeo de MySQL
        const target = resolveDbTarget(svc.envFile);
        targets.set(`${target.host}:${target.port}`, target);
    }
    for (const [key, target] of targets) {
        const ok = await waitForPort(target.host, target.port, MYSQL_TIMEOUT_MS);
        if (!ok) {
            console.error(`✗ MySQL no responde en ${key}.`);
            console.error('  Levantalo antes de continuar. Si ya existe una instalación nativa en :3306,');
            console.error('  no levantes un contenedor Docker aparte (genera conexiones ambiguas — ver CLAUDE.md).');
            process.exit(1);
        }
        console.log(`✓ MySQL responde en ${key}`);
    }
}

async function buildIfNeeded(name, force) {
    const svc = SERVICES[name];
    const distPath = path.join(ROOT, svc.dir, svc.distCheck);
    if (!force && fs.existsSync(distPath)) {
        console.log(`  (${name}) dist/ ya existe — salteando build (usar --force-build para forzar)`);
        return;
    }
    console.log(`  (${name}) building...`);
    await run(svc.build, { cwd: path.join(ROOT, svc.dir) });
}

async function startPm2(name) {
    const svc = SERVICES[name];
    const ecosystemPath = path.join(ROOT, svc.pm2.ecosystem);
    console.log(`  (${name}) pm2 start...`);
    // Los apps sin `cwd` propio en su ecosystem file (api-gateway/micorner en
    // monolito-event-corner_v3/ecosystem.config.js) resuelven su `script`
    // relativo contra el cwd desde el que se invoca `pm2 start`, no contra la
    // ubicación del ecosystem file — hay que pararse en esa carpeta.
    await run(`${PM2_BIN} start "${ecosystemPath}" --env development --only ${svc.pm2.app}`, {
        cwd: path.join(ROOT, svc.dir),
    });
}

async function up(force) {
    await ensurePm2Available();
    await checkMysql();

    for (const tier of TIERS) {
        console.log(`\n=== Tier: ${tier.join(', ')} ===`);
        for (const name of tier) await buildIfNeeded(name, force);
        for (const name of tier) await startPm2(name);
        for (const name of tier) {
            const svc = SERVICES[name];
            process.stdout.write(`  esperando ${name} en :${svc.port}... `);
            const ok = await waitForPort('localhost', svc.port, HEALTH_TIMEOUT_MS);
            if (!ok) {
                console.log('✗');
                console.error(`\n${name} no respondió en :${svc.port} tras ${HEALTH_TIMEOUT_MS / 1000}s.`);
                console.error(`Revisar: pm2 logs ${svc.pm2.app}`);
                process.exit(1);
            }
            console.log('✓');
        }
    }

    printSummary();
}

function printSummary() {
    console.log('\n=== Ecosistema arriba ===');
    const rows = [
        ['servicenow-clone-backend', 3010, 'mock local de ServiceNow'],
        ['abac', 3005, 'Swagger: /api-docs'],
        ['observability-service', 3099, 'ingesta: /ingest/{logs,metrics,traces}'],
        ['minerva-app', 3015, 'mock REST de Minerva (inventario)'],
        ['api-snowq-service', 3090, 'queue + circuit breaker SN'],
        ['micorner', 3002, 'internal only'],
        ['observability-dashboard', 5174, 'front Vite'],
        ['auth-configuration-app', 5173, 'front Vite (config ABAC)'],
        ['api-gateway', 4000, 'Swagger: /docs'],
        ['integration-service', 3008, 'Swagger: /api/docs'],
        ['event-corner-app', 5175, 'front Vite (cliente)'],
    ];
    for (const [name, port, note] of rows) {
        console.log(`  ${name.padEnd(26)} :${String(port).padEnd(6)} ${note}`);
    }
    console.log('\npm2 status   → ver estado');
    console.log('pm2 logs     → ver logs de todos');
    console.log('node scripts/start-infra.js --down → apagar todo');
    console.log('\nSi es la primera vez: correr la secuencia de seeds de CLAUDE.md');
    console.log('(abac seed → micorner:seed → abac seed:m2m) antes de usar el ecosistema.');
}

async function down() {
    await ensurePm2Available();
    const names = new Set(Object.values(SERVICES).map((s) => s.pm2.app));
    for (const name of names) {
        try {
            await run(`${PM2_BIN} delete ${name}`);
        } catch {
            console.log(`  (${name} no estaba corriendo)`);
        }
    }
}

async function status() {
    await ensurePm2Available();
    await run(`${PM2_BIN} status`);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--down')) return down();
    if (args.includes('--status')) return status();
    return up(args.includes('--force-build'));
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
