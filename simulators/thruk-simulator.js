#!/usr/bin/env node
/**
 * thruk-simulator.js
 *
 * Utilidad para simular notificaciones de Nagios/Thruk a api-snowq-service.
 *
 * Uso:
 *   node thruk-simulator.js [comando] [opciones]
 *
 * Comandos:
 *   problem   --host <host> [--service <svc>] [--state <state>] [--soft] [--ttl <s>]
 *   recovery  --host <host> [--service <svc>]
 *   ack       --host <host> [--service <svc>]
 *   flap      --host <host> [--service <svc>]
 *   downtime  --host <host> [--service <svc>]
 *   cancel    --fingerprint <sha256>
 *   status    --id <correlationId>
 *   scenario  --name <nombre>
 *
 * Escenarios predefinidos (--name):
 *   storm         Tormenta: 3 hosts distintos caen al mismo tiempo
 *   dedup         Misma alerta enviada 3 veces (debe deduplicarse)
 *   recovery      Problema + recovery inmediato (cancela el ticket)
 *   flap-ignored  SOFT + FLAPPING (ambos deben ignorarse)
 *   ttl-expire    Alerta con TTL corto (expira sin llegar a SN)
 *
 * Ejemplos:
 *   node thruk-simulator.js problem --host web01 --service HTTP
 *   node thruk-simulator.js recovery --host web01 --service HTTP
 *   node thruk-simulator.js problem --host db01 --state DOWN
 *   node thruk-simulator.js scenario --name storm
 */

const http = require('http');

// ─── Configuración ────────────────────────────────────────────────────────────
const BASE_URL = process.env.SNOWQ_URL || 'http://localhost:3090';
const ALERT_PATH = '/monitoring/alerts';
const CANCEL_PATH = '/monitoring/cancel';
const STATUS_PATH = '/snow-requests';

// ─── Colores ANSI ─────────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function post(path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const data = JSON.stringify(body);
        const options = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        };
        const req = http.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function get(path) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'GET',
        };
        const req = http.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── Constructores de alertas ─────────────────────────────────────────────────

function makeProblem({ host, service, state = 'CRITICAL', soft = false, attempt = 3, maxAttempts = 3, ttlSeconds }) {
    const alert = {
        notificationType: 'PROBLEM',
        host,
        state,
        stateType: soft ? 'SOFT' : 'HARD',
        checkAttempt: soft ? 1 : attempt,
        maxCheckAttempts: maxAttempts,
        output: `${state}: ${service ?? host} no responde. Plugin devolvió estado ${state}.`,
    };
    if (service) alert.service = service;
    if (ttlSeconds) alert.ttlSeconds = ttlSeconds;
    return alert;
}

function makeRecovery({ host, service }) {
    const alert = {
        notificationType: 'RECOVERY',
        host,
        state: service ? 'OK' : 'UP',
        stateType: 'HARD',
        checkAttempt: 1,
        maxCheckAttempts: 3,
        output: `RECOVERY: ${service ?? host} volvió a la normalidad.`,
    };
    if (service) alert.service = service;
    return alert;
}

function makeIgnored(type, { host, service }) {
    const stateMap = {
        ACKNOWLEDGEMENT: 'CRITICAL',
        FLAPPINGSTART: 'WARNING',
        FLAPPINGSTOP: 'OK',
        DOWNTIMESTART: 'CRITICAL',
        DOWNTIMEEND: 'OK',
    };
    const alert = {
        notificationType: type,
        host,
        state: stateMap[type] || 'UNKNOWN',
        stateType: 'HARD',
        checkAttempt: 1,
        maxCheckAttempts: 3,
        output: `${type} event for ${service ?? host}`,
    };
    if (service) alert.service = service;
    return alert;
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printHeader(title) {
    console.log(`\n${C.bold}${C.cyan}${'─'.repeat(60)}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
    console.log(`${C.bold}${C.cyan}${'─'.repeat(60)}${C.reset}`);
}

function printRequest(label, payload) {
    console.log(`\n${C.bold}${C.white}→ ${label}${C.reset}`);
    console.log(`${C.gray}  Payload: ${JSON.stringify(payload)}${C.reset}`);
}

function printResult(res) {
    const action = res.body?.action;
    const color =
        action === 'QUEUED' ? C.green :
            action === 'DEDUPLICATED' ? C.yellow :
                action === 'CANCELLED' ? C.magenta :
                    action === 'RESOLVED_IN_SN' ? C.cyan :
                        action === 'TOO_LATE' ? C.red :
                            action === 'IGNORED' ? C.dim :
                                res.status >= 400 ? C.red : C.white;

    console.log(`${color}  ← HTTP ${res.status} | action=${action ?? '?'} | reason="${res.body?.reason ?? ''}"${C.reset}`);
    if (res.body?.correlationId) console.log(`${C.gray}    correlationId=${res.body.correlationId}${C.reset}`);
    if (res.body?.internalNumber) console.log(`${C.gray}    internalNumber=${res.body.internalNumber}${C.reset}`);
    if (res.body?.sysId) console.log(`${C.gray}    sysId=${res.body.sysId}  snowNumber=${res.body.snowNumber}${C.reset}`);
    if (res.body?.existingStatus) console.log(`${C.gray}    existingStatus=${res.body.existingStatus}${C.reset}`);
    if (res.status >= 400) {
        console.log(`${C.red}  ERROR: ${JSON.stringify(res.body)}${C.reset}`);
    }
}

async function sendAlert(label, payload) {
    printRequest(label, payload);
    const res = await post(ALERT_PATH, payload);
    printResult(res);
    return res;
}

async function sendCancel(fingerprint) {
    const encoded = encodeURIComponent(fingerprint);
    console.log(`\n${C.bold}${C.white}→ CANCEL fingerprint=${fingerprint.substring(0, 16)}...${C.reset}`);
    const res = await post(`${CANCEL_PATH}/${encoded}`, {});
    printResult(res);
    return res;
}

async function getStatus(correlationId) {
    const res = await get(`${STATUS_PATH}/${correlationId}`);
    console.log(`  Status: ${JSON.stringify(res.body, null, 2)}`);
    return res;
}

// ─── Escenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = {

    /** 3 hosts distintos caen al mismo tiempo */
    async storm() {
        printHeader('ESCENARIO: storm — Tormenta de alertas (3 hosts)');
        const hosts = [
            { host: 'web01', service: 'HTTP', state: 'CRITICAL' },
            { host: 'db01', service: undefined, state: 'DOWN' },
            { host: 'cache01', service: 'Redis', state: 'CRITICAL' },
        ];
        for (const h of hosts) {
            await sendAlert(`PROBLEM ${h.host}/${h.service ?? 'HOST'}`, makeProblem(h));
            await sleep(200);
        }
    },

    /** La misma alerta llega 3 veces seguidas — solo la primera genera ticket */
    async dedup() {
        printHeader('ESCENARIO: dedup — Deduplicación (misma alerta x3)');
        const alert = makeProblem({ host: 'web01', service: 'HTTP', state: 'CRITICAL' });
        for (let i = 1; i <= 3; i++) {
            await sendAlert(`PROBLEM intento ${i}/3 — web01/HTTP`, alert);
            await sleep(100);
        }
    },

    /** Problema seguido inmediatamente de recovery → cancela el ticket */
    async recovery() {
        printHeader('ESCENARIO: recovery — Problema + Recovery inmediato');
        await sendAlert('PROBLEM web02/HTTPS', makeProblem({ host: 'web02', service: 'HTTPS', state: 'CRITICAL' }));
        await sleep(300);
        await sendAlert('RECOVERY web02/HTTPS', makeRecovery({ host: 'web02', service: 'HTTPS' }));
    },

    /** SOFT state + FLAPPING → ambos deben ignorarse */
    async flapIgnored() {
        printHeader('ESCENARIO: flap-ignored — SOFT y FLAPPING (deben ignorarse)');
        await sendAlert('PROBLEM SOFT (intento 1/3) web03/DNS', makeProblem({ host: 'web03', service: 'DNS', state: 'CRITICAL', soft: true, attempt: 1 }));
        await sleep(200);
        await sendAlert('FLAPPINGSTART web03/DNS', makeIgnored('FLAPPINGSTART', { host: 'web03', service: 'DNS' }));
        await sleep(200);
        await sendAlert('PROBLEM HARD (intento 3/3) web03/DNS — debe generar ticket', makeProblem({ host: 'web03', service: 'DNS', state: 'CRITICAL', soft: false }));
    },

    /** Alerta con TTL corto — expira en cola antes de llegar a SN */
    async ttlExpire() {
        printHeader('ESCENARIO: ttl-expire — Alerta con TTL de 30 segundos');
        await sendAlert('PROBLEM app01/API (TTL=30s)', makeProblem({ host: 'app01', service: 'API', state: 'WARNING', ttlSeconds: 30 }));
        console.log(`\n${C.dim}  (el ticket expirará si no se procesa en 30s)${C.reset}`);
    },

    /** ACK y DOWNTIME → ignorados */
    async ignored() {
        printHeader('ESCENARIO: ignored — ACK y DOWNTIME (deben ignorarse)');
        await sendAlert('ACKNOWLEDGEMENT lb01/LB', makeIgnored('ACKNOWLEDGEMENT', { host: 'lb01', service: 'LB' }));
        await sleep(200);
        await sendAlert('DOWNTIMESTART lb01/LB', makeIgnored('DOWNTIMESTART', { host: 'lb01', service: 'LB' }));
        await sleep(200);
        await sendAlert('DOWNTIMEEND lb01/LB', makeIgnored('DOWNTIMEEND', { host: 'lb01', service: 'LB' }));
    },
};

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const key = argv[i].slice(2);
            const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
            args[key] = val;
        }
    }
    return args;
}

async function main() {
    const [, , command, ...rest] = process.argv;
    const args = parseArgs(rest);

    console.log(`\n${C.bold}${C.cyan}thruk-simulator → ${BASE_URL}${C.reset}`);

    if (!command || command === 'help') {
        console.log(`
Uso: node thruk-simulator.js <comando> [opciones]

Comandos:
  problem   --host <h> [--service <s>] [--state CRITICAL|WARNING|DOWN] [--soft] [--ttl <s>]
  recovery  --host <h> [--service <s>]
  ack       --host <h> [--service <s>]
  flap      --host <h> [--service <s>]
  downtime  --host <h> [--service <s>]
  cancel    --fingerprint <sha256hex>
  status    --id <correlationId>
  scenario  --name storm|dedup|recovery|flap-ignored|ttl-expire|ignored

Env:
  SNOWQ_URL   URL base del servicio (default: http://localhost:3090)
`);
        return;
    }

    switch (command) {
        case 'problem': {
            if (!args.host) { console.error(`${C.red}--host requerido${C.reset}`); process.exit(1); }
            const payload = makeProblem({
                host: args.host,
                service: args.service,
                state: args.state || 'CRITICAL',
                soft: !!args.soft,
                attempt: parseInt(args.attempt) || 3,
                maxAttempts: parseInt(args.max) || 3,
                ttlSeconds: args.ttl ? parseInt(args.ttl) : undefined,
            });
            printHeader(`PROBLEM — ${args.host}/${args.service ?? 'HOST'}`);
            await sendAlert(`PROBLEM ${args.host}`, payload);
            break;
        }
        case 'recovery': {
            if (!args.host) { console.error(`${C.red}--host requerido${C.reset}`); process.exit(1); }
            printHeader(`RECOVERY — ${args.host}/${args.service ?? 'HOST'}`);
            await sendAlert(`RECOVERY ${args.host}`, makeRecovery({ host: args.host, service: args.service }));
            break;
        }
        case 'ack': {
            if (!args.host) { console.error(`${C.red}--host requerido${C.reset}`); process.exit(1); }
            printHeader(`ACKNOWLEDGEMENT — ${args.host}/${args.service ?? 'HOST'}`);
            await sendAlert(`ACK ${args.host}`, makeIgnored('ACKNOWLEDGEMENT', { host: args.host, service: args.service }));
            break;
        }
        case 'flap': {
            if (!args.host) { console.error(`${C.red}--host requerido${C.reset}`); process.exit(1); }
            printHeader(`FLAPPINGSTART — ${args.host}/${args.service ?? 'HOST'}`);
            await sendAlert(`FLAP ${args.host}`, makeIgnored('FLAPPINGSTART', { host: args.host, service: args.service }));
            break;
        }
        case 'downtime': {
            if (!args.host) { console.error(`${C.red}--host requerido${C.reset}`); process.exit(1); }
            printHeader(`DOWNTIME — ${args.host}/${args.service ?? 'HOST'}`);
            await sendAlert(`DOWNTIME ${args.host}`, makeIgnored('DOWNTIMESTART', { host: args.host, service: args.service }));
            break;
        }
        case 'cancel': {
            if (!args.fingerprint) { console.error(`${C.red}--fingerprint requerido${C.reset}`); process.exit(1); }
            printHeader(`CANCEL fingerprint`);
            await sendCancel(args.fingerprint);
            break;
        }
        case 'status': {
            if (!args.id) { console.error(`${C.red}--id requerido${C.reset}`); process.exit(1); }
            printHeader(`STATUS — ${args.id}`);
            await getStatus(args.id);
            break;
        }
        case 'scenario': {
            const name = args.name;
            if (!name) { console.error(`${C.red}--name requerido${C.reset}`); process.exit(1); }
            const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); // kebab → camelCase
            const fn = SCENARIOS[key];
            if (!fn) {
                console.error(`${C.red}Escenario desconocido: ${name}. Disponibles: ${Object.keys(SCENARIOS).join(', ')}${C.reset}`);
                process.exit(1);
            }
            await fn();
            break;
        }
        default:
            console.error(`${C.red}Comando desconocido: ${command}. Usa "help" para ver opciones.${C.reset}`);
            process.exit(1);
    }

    console.log(`\n${C.dim}${'─'.repeat(60)}${C.reset}\n`);
}

main().catch(err => {
    console.error(`${C.red}Error: ${err.message}${C.reset}`);
    process.exit(1);
});
