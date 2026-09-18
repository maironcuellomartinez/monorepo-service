// scripts/start-infra-dev.js
//
// Alternativa a scripts/start-infra.js SIN pm2 — para entornos donde pm2 no
// puede correr (ej. una VM cuyo EDR/antivirus bloquea la creación de
// procesos detached/en background: "spawn EPERM" justo en `pm2 start`, no
// en `pm2 --version` — porque start necesita forkear el daemon + la app, y
// version no forkea nada).
//
// Solo para development local. No toca configuración de ninguna app, no
// construye dist/ — corre cada servicio con su propio `npm run start:dev` /
// `npm run dev` que YA EXISTE (watch mode, hot-reload), como hijo directo
// de este proceso. Cuando se despliega de verdad a un servidor, cada app
// sigue arrancando independiente vía su propio pm2 (esto no cambia eso).
//
// No hay --status/--down: el propio proceso en foreground ES el estado.
// Ctrl+C mata el árbol completo de procesos hijos.
//
// Uso:
//   node scripts/start-infra-dev.js

'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// dir: carpeta desde la que se corre `cmd` (relativa a ROOT)
// cmd: comando npm que ya existe en ese package.json (watch mode, sin build)
// port: puerto en el que debe responder
// hasDb / envFile: igual que en start-infra.js, para el chequeo de MySQL
const SERVICES = {
    'servicenow-clone-backend': {
        dir: 'servicenow-clone-backend',
        cmd: 'npm run start:dev',
        port: 3010,
        hasDb: true,
        envFile: null, // sin .env.development — defaults de ConfigService (localhost:3306)
    },
    abac: {
        dir: 'abac-microservice',
        cmd: 'npm run start:dev',
        port: 3005,
        hasDb: true,
        envFile: 'abac-microservice/.env.development',
    },
    'observability-service': {
        dir: 'observability-service',
        cmd: 'npm run start:dev',
        port: 3099,
        hasDb: true,
        envFile: 'observability-service/.env.development',
    },
    'minerva-app': {
        dir: 'minerva-app',
        cmd: 'npm run start:dev',
        port: 3015,
        hasDb: false,
        envFile: null,
    },
    'api-snowq-service': {
        dir: 'api-snowq-service',
        cmd: 'npm run start:dev',
        port: 3090,
        hasDb: true,
        envFile: 'api-snowq-service/.env.development',
    },
    micorner: {
        dir: 'monolito-event-corner_v3',
        cmd: 'npm run start:micorner:dev',
        port: 3002,
        hasDb: true,
        envFile: 'monolito-event-corner_v3/apps/micorner/.env.development',
    },
    'observability-dashboard': {
        dir: 'observability-dashboard',
        cmd: 'npm run dev',
        port: 5174,
        hasDb: false,
        envFile: null,
    },
    'auth-configuration-app': {
        dir: 'auth-configuration-app',
        cmd: 'npm run dev',
        port: 5173,
        hasDb: false,
        envFile: null,
    },
    'api-gateway': {
        dir: 'monolito-event-corner_v3',
        cmd: 'npm run start:api-gateway:dev',
        port: 4000,
        hasDb: false,
        envFile: null,
    },
    'integration-service': {
        dir: 'integration-service',
        cmd: 'npm run start:dev',
        port: 3008,
        hasDb: false,
        envFile: null,
    },
    'event-corner-app': {
        dir: 'event-corner-app',
        cmd: 'npm run dev',
        port: 5175,
        hasDb: false,
        envFile: null,
    },
};

// Mismo orden de dependencias que start-infra.js (ver CLAUDE.md), aplanado
// y secuencial: un servicio a la vez, se espera su puerto antes de arrancar
// el siguiente.
const ORDER = [
    'servicenow-clone-backend', 'abac', 'observability-service', 'minerva-app',
    'api-snowq-service', 'micorner', 'observability-dashboard', 'auth-configuration-app',
    'api-gateway',
    'integration-service', 'event-corner-app',
];

const HEALTH_TIMEOUT_MS = 90000;
const MYSQL_TIMEOUT_MS = 5000;

const children = []; // { name, pid }
let shuttingDown = false;

function parseEnvFile(filePath) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const result = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return result;
}

function resolveDbTarget(envFileRel) {
    if (!envFileRel) return { host: 'localhost', port: 3306 };
    const filePath = path.join(ROOT, envFileRel);
    if (!fs.existsSync(filePath)) return { host: 'localhost', port: 3306 };
    const vars = parseEnvFile(filePath);
    const pairs = [
        ['DB_HOST', 'DB_PORT'],
        ['HOST_DATABASE', 'PORT_DATABASE'],
    ];
    for (const [hostKey, portKey] of pairs) {
        if (vars[hostKey]) return { host: vars[hostKey], port: Number(vars[portKey]) || 3306 };
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

async function checkMysql() {
    console.log('\n=== Verificando MySQL ===');
    const targets = new Map();
    for (const svc of Object.values(SERVICES)) {
        if (!svc.hasDb) continue;
        const t = resolveDbTarget(svc.envFile);
        targets.set(`${t.host}:${t.port}`, t);
    }
    for (const [key, t] of targets) {
        const ok = await waitForPort(t.host, t.port, MYSQL_TIMEOUT_MS);
        if (!ok) {
            console.error(`✗ MySQL no responde en ${key}. Levantalo antes de continuar.`);
            process.exit(1);
        }
        console.log(`✓ MySQL responde en ${key}`);
    }
}

function killTree(pid) {
    if (!pid) return;
    try {
        if (process.platform === 'win32') {
            execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        } else {
            process.kill(-pid, 'SIGTERM');
        }
    } catch {
        // ya estaba muerto, o no se pudo — no es fatal
    }
}

function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n\nApagando todo...');
    for (const { name, pid } of children) {
        console.log(`  (${name}) kill`);
        killTree(pid);
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function startService(name) {
    const svc = SERVICES[name];
    console.log(`\n(${name}) ${svc.cmd}  [cwd: ${svc.dir}]`);
    // shell:true porque `cmd` es un string tipo "npm run x" — en Windows
    // esto resuelve via cmd.exe. `npm run <script>` es a su vez un padre de
    // otro proceso node (nest/ts-node o vite) — por eso el kill es por
    // árbol completo (taskkill /T), no solo el pid de este hijo directo.
    const child = spawn(svc.cmd, {
        cwd: path.join(ROOT, svc.dir),
        shell: true,
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'development' },
    });
    children.push({ name, pid: child.pid });
    child.on('exit', (code, signal) => {
        if (shuttingDown) return;
        console.log(`\n⚠ (${name}) se cerró (code=${code} signal=${signal}) — este modo no reinicia automáticamente.`);
    });
}

async function main() {
    await checkMysql();

    for (const name of ORDER) {
        const svc = SERVICES[name];
        startService(name);
        process.stdout.write(`  esperando ${name} en :${svc.port}... `);
        const ok = await waitForPort('localhost', svc.port, HEALTH_TIMEOUT_MS);
        if (!ok) {
            console.log('✗');
            console.error(`\n${name} no respondió en :${svc.port} tras ${HEALTH_TIMEOUT_MS / 1000}s.`);
            console.error('El log de arriba es del propio servicio (stdio heredado) — revisar ahí.');
            shutdown();
            return;
        }
        console.log('✓');
    }

    console.log('\n=== Ecosistema arriba (sin pm2) ===');
    console.log('Todos los servicios corren como hijos directos de este proceso, en modo watch.');
    console.log('Dejá esta terminal abierta. Ctrl+C acá apaga todo.\n');
}

main().catch((err) => {
    console.error(err.message || err);
    shutdown();
});
