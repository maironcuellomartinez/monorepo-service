#!/usr/bin/env node
/**
 * snow-request-simulator.js
 *
 * Simula peticiones del monolito (monolito-event-corner_v3) hacia api-snowq-service.
 * Cubre el flujo estándar: enqueue (202) e immediate (200/201) para todos los tipos.
 *
 * Uso:
 *   node snow-request-simulator.js <comando> [opciones]
 *
 * Comandos:
 *   queue     --type <tipo>  [--severity <s>] [--source <src>] [--priority <p>] [--impact <i>] [--urgency <u>]
 *   immediate --type <tipo>  [--severity <s>] [--source <src>] [--priority <p>] [--impact <i>] [--urgency <u>]
 *   status    --id <correlationId>
 *   failed
 *   retry     --id <correlationId>
 *   retry-all
 *   scenario  --name <nombre>
 *
 * Tipos válidos:
 *   incident | change-request | problem | service-catalog | knowledge-article | release-task | configuration-item
 *
 * Escenarios predefinidos (--name):
 *   all-queued       Encola un ticket de cada tipo
 *   all-immediate    Envío inmediato de cada tipo
 *   incident-burst   5 incidentes distintos en ráfaga (prueba bulkhead)
 *   change-workflow  Encola change-request + consulta estado
 *   dlq-cycle        Encola un ticket con source inválido → DLQ → retry
 *
 * Variables de entorno:
 *   SNOWQ_URL        URL base del servicio (default: http://localhost:3090)
 *   SNOWQ_M2M_TOKEN  JWT M2M para autenticación (requerido — ver api-snowq-service/.env)
 *
 * Ejemplos:
 *   node snow-request-simulator.js queue --type incident
 *   node snow-request-simulator.js immediate --type change-request --severity high
 *   node snow-request-simulator.js status --id <correlationId>
 *   node snow-request-simulator.js scenario --name all-queued
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

// Auto-carga simulators/.env si existe (no sobreescribe vars ya exportadas)
try {
    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
        fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        });
    }
} catch {}

// ─── Configuración ────────────────────────────────────────────────────────────
const BASE_URL      = process.env.SNOWQ_URL        || 'http://localhost:3090';
const M2M_TOKEN     = process.env.SNOWQ_M2M_TOKEN  || '';

// ─── Colores ANSI ─────────────────────────────────────────────────────────────
const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    cyan:    '\x1b[36m',
    magenta: '\x1b[35m',
    white:   '\x1b[37m',
    gray:    '\x1b[90m',
    blue:    '\x1b[34m',
};

// ─── Mapeo tipo CLI → ruta y label ───────────────────────────────────────────
const TYPE_MAP = {
    'incident':            { path: 'incidents',            label: 'Incident' },
    'change-request':      { path: 'change-requests',      label: 'Change Request' },
    'problem':             { path: 'problems',             label: 'Problem' },
    'service-catalog':     { path: 'service-catalog',      label: 'Service Catalog' },
    'knowledge-article':   { path: 'knowledge-articles',   label: 'Knowledge Article' },
    'release-task':        { path: 'release-tasks',        label: 'Release Task' },
    'configuration-item':  { path: 'configuration-items',  label: 'Configuration Item' },
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url    = new URL(BASE_URL + path);
        const data   = body ? JSON.stringify(body) : null;
        const opts   = {
            hostname: url.hostname,
            port:     url.port || 80,
            path:     url.pathname,
            method,
            headers:  {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
                ...(M2M_TOKEN ? { 'Authorization': `Bearer ${M2M_TOKEN}` } : {}),
            },
        };
        const req = http.request(opts, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

const post = (path, body) => request('POST', path, body);
const get  = (path)       => request('GET',  path, null);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Constructores de payload ─────────────────────────────────────────────────

/**
 * Construye el BaseSnowRequestDto para cualquier tipo.
 * El campo payload.short_description varía por tipo para dar contexto en los logs.
 */
function makePayload(type, overrides = {}) {
    const label = TYPE_MAP[type]?.label ?? type;
    const ts    = new Date().toISOString();

    const payloadsByType = {
        'incident': {
            short_description: `[SIM] Falla crítica en servicio — ${ts}`,
            description:       'Error simulado por snow-request-simulator. Requiere atención inmediata.',
            urgency:           2,
            impact:            2,
        },
        'change-request': {
            short_description: `[SIM] Cambio de configuración — ${ts}`,
            description:       'Cambio planificado en infraestructura simulado.',
            change_type:       'normal',
            start_date:        new Date(Date.now() + 86400000).toISOString().substring(0, 10),
            end_date:          new Date(Date.now() + 172800000).toISOString().substring(0, 10),
            reason:            'Simulación de cambio por snow-request-simulator',
        },
        'problem': {
            short_description: `[SIM] Problema recurrente detectado — ${ts}`,
            description:       'Problema sistémico simulado. Causa raíz pendiente.',
        },
        'service-catalog': {
            short_description: `[SIM] Solicitud de catálogo — ${ts}`,
            description:       'Solicitud de ítem de catálogo de servicios simulada.',
            cat_item:          'hardware_request',
        },
        'knowledge-article': {
            short_description: `[SIM] Artículo de conocimiento — ${ts}`,
            description:       'Artículo de conocimiento simulado para pruebas.',
            kb_category:       'IT',
        },
        'release-task': {
            short_description: `[SIM] Tarea de release — ${ts}`,
            description:       'Tarea de release simulada.',
            release_phase:     'testing',
        },
        'configuration-item': {
            short_description: `[SIM] Ítem de configuración — ${ts}`,
            description:       'Registro de CMDB simulado.',
            ci_class:          'cmdb_ci_server',
        },
    };

    const innerPayload = { ...(payloadsByType[type] ?? { short_description: `[SIM] ${label} — ${ts}` }) };

    // Campos de routing opcionales — se envían dentro del payload para que
    // buildPayloadForServiceNow los incorpore al ticket en ServiceNow
    if (overrides.group)    innerPayload.assignmentGroup = overrides.group;
    if (overrides.company)  innerPayload.company         = overrides.company;
    if (overrides.category) innerPayload.category        = overrides.category;

    return {
        severity: overrides.severity ?? 'medium',
        impact:   overrides.impact   ?? 2,
        urgency:  overrides.urgency  ?? 2,
        priority: overrides.priority ?? 2,
        source:   overrides.source   ?? 'monolito-event-corner_v3',
        payload:  innerPayload,
    };
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printHeader(title) {
    console.log(`\n${C.bold}${C.cyan}${'─'.repeat(64)}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
    console.log(`${C.bold}${C.cyan}${'─'.repeat(64)}${C.reset}`);
}

function printRequest(label, path, payload) {
    console.log(`\n${C.bold}${C.white}→ ${label}${C.reset}`);
    console.log(`${C.gray}  POST ${BASE_URL}${path}${C.reset}`);
    console.log(`${C.gray}  Payload: ${JSON.stringify(payload)}${C.reset}`);
}

function printQueueResult(res) {
    const ok = res.status === 202;
    const b  = res.body;
    const color = ok ? C.green : C.red;

    console.log(`${color}  ← HTTP ${res.status} ${ok ? '(ACCEPTED)' : '(ERROR)'}${C.reset}`);
    if (ok) {
        console.log(`${C.gray}    correlationId  = ${b?.correlationId ?? '?'}${C.reset}`);
        console.log(`${C.gray}    internalNumber = ${b?.internalNumber ?? '?'}${C.reset}`);
        console.log(`${C.gray}    status         = ${b?.status ?? '?'}${C.reset}`);
    } else {
        console.log(`${C.red}    ERROR: ${JSON.stringify(b)}${C.reset}`);
    }
    return b;
}

function printImmediateResult(res) {
    const ok = res.status < 300;
    const b  = res.body;
    const color = ok ? C.blue : C.red;

    console.log(`${color}  ← HTTP ${res.status} ${ok ? '(OK — sincrónico)' : '(ERROR)'}${C.reset}`);
    if (ok) {
        console.log(`${C.gray}    sys_id     = ${b?.sys_id ?? '?'}${C.reset}`);
        console.log(`${C.gray}    snowNumber = ${b?.snowNumber ?? '?'}${C.reset}`);
    } else {
        console.log(`${C.red}    ERROR: ${JSON.stringify(b)}${C.reset}`);
    }
    return b;
}

function printStatusResult(res) {
    const ok = res.status < 300;
    const b  = res.body;
    const statusColors = {
        QUEUED:      C.yellow,
        IN_PROGRESS: C.magenta,
        DELIVERED:   C.green,
        FAILED:      C.red,
        CANCELLED:   C.dim,
        EXPIRED:     C.dim,
    };
    const sc = statusColors[b?.status] ?? C.white;

    if (ok) {
        console.log(`${C.bold}  correlationId  ${C.reset}${b?.correlationId}`);
        console.log(`${C.bold}  internalNumber ${C.reset}${b?.internalNumber}`);
        console.log(`${C.bold}  type           ${C.reset}${b?.type}`);
        console.log(`${sc}${C.bold}  status         ${C.reset}${sc}${b?.status}${C.reset}`);
        console.log(`${C.bold}  sysId          ${C.reset}${b?.sysId ?? '-'}`);
        console.log(`${C.bold}  snowNumber     ${C.reset}${b?.snowNumber ?? '-'}`);
        console.log(`${C.bold}  createdAt      ${C.reset}${b?.createdAt}`);
        console.log(`${C.bold}  updatedAt      ${C.reset}${b?.updatedAt}`);
    } else {
        console.log(`${C.red}  ← HTTP ${res.status}: ${JSON.stringify(b)}${C.reset}`);
    }
}

// ─── Operaciones atómicas ─────────────────────────────────────────────────────

async function sendQueue(type, overrides = {}) {
    const meta    = TYPE_MAP[type];
    if (!meta) throw new Error(`Tipo desconocido: ${type}. Válidos: ${Object.keys(TYPE_MAP).join(', ')}`);
    const path    = `/snow-requests/${meta.path}`;
    const payload = makePayload(type, overrides);
    printRequest(`QUEUE ${meta.label}`, path, payload);
    const res = await post(path, payload);
    return printQueueResult(res);
}

async function sendImmediate(type, overrides = {}) {
    const meta    = TYPE_MAP[type];
    if (!meta) throw new Error(`Tipo desconocido: ${type}. Válidos: ${Object.keys(TYPE_MAP).join(', ')}`);
    const path    = `/snow-requests/immediate/${meta.path}`;
    const payload = makePayload(type, overrides);
    printRequest(`IMMEDIATE ${meta.label}`, path, payload);
    const res = await post(path, payload);
    return printImmediateResult(res);
}

async function queryStatus(correlationId) {
    const res = await get(`/snow-requests/${correlationId}`);
    printStatusResult(res);
    return res.body;
}

async function queryFailed() {
    const res = await get('/snow-requests/failed');
    const list = Array.isArray(res.body) ? res.body : [];
    console.log(`\n${C.bold}  Registros FAILED (DLQ): ${list.length}${C.reset}`);
    if (list.length === 0) {
        console.log(`${C.dim}  (vacío)${C.reset}`);
    } else {
        list.forEach((e, i) => {
            console.log(`\n${C.red}  [${i + 1}] ${e.internalNumber ?? e.correlationId}${C.reset}`);
            console.log(`${C.gray}      correlationId = ${e.correlationId}${C.reset}`);
            console.log(`${C.gray}      type          = ${e.type}  retryCount=${e.retryCount}/${e.maxRetries}${C.reset}`);
            console.log(`${C.gray}      lastError     = ${e.lastError ?? '-'}${C.reset}`);
            console.log(`${C.gray}      updatedAt     = ${e.updatedAt}${C.reset}`);
        });
    }
    return list;
}

async function retryOne(correlationId) {
    console.log(`\n${C.bold}${C.white}→ RETRY ${correlationId}${C.reset}`);
    const res = await post(`/snow-requests/failed/${correlationId}/retry`, {});
    if (res.status < 300) {
        const b = res.body;
        console.log(`${C.green}  ← HTTP ${res.status} OK — reencolado${C.reset}`);
        console.log(`${C.gray}    status     = ${b?.status}${C.reset}`);
        console.log(`${C.gray}    retryCount = ${b?.retryCount}${C.reset}`);
    } else {
        console.log(`${C.red}  ← HTTP ${res.status}: ${JSON.stringify(res.body)}${C.reset}`);
    }
}

async function retryAll() {
    console.log(`\n${C.bold}${C.white}→ RETRY-ALL (DLQ completa)${C.reset}`);
    const res = await post('/snow-requests/failed/retry-all', {});
    if (res.status < 300) {
        console.log(`${C.green}  ← HTTP ${res.status} OK — reencolados: ${res.body?.requeued ?? 0}${C.reset}`);
    } else {
        console.log(`${C.red}  ← HTTP ${res.status}: ${JSON.stringify(res.body)}${C.reset}`);
    }
}

// ─── Batch ────────────────────────────────────────────────────────────────────

/**
 * Envía un lote de peticiones, opcionalmente en paralelo.
 *
 * @param {string[]} types       - Lista de tipos (se repite `count` veces)
 * @param {number}   count       - Cuántas veces repetir cada tipo
 * @param {'queue'|'immediate'} mode
 * @param {boolean}  parallel    - true → Promise.all, false → secuencial
 * @param {object}   overrides   - severity, source, priority, impact, urgency
 */
async function runBatch(types, count, mode, parallel, overrides) {
    const send = mode === 'immediate' ? sendImmediate : sendQueue;

    // Expandir: [incident x2, problem x2] → [incident, incident, problem, problem]
    const tasks = [];
    for (const type of types) {
        for (let i = 0; i < count; i++) {
            tasks.push({ type, index: i + 1 });
        }
    }

    const total = tasks.length;
    printHeader(`BATCH — mode=${mode}  types=${types.join(',')}  count=${count}  parallel=${parallel}  total=${total}`);

    const results = { ok: 0, error: 0 };

    if (parallel) {
        const settled = await Promise.allSettled(
            tasks.map(({ type }) => send(type, overrides))
        );
        settled.forEach(r => r.status === 'fulfilled' ? results.ok++ : results.error++);
    } else {
        for (const { type } of tasks) {
            try {
                await send(type, overrides);
                results.ok++;
            } catch {
                results.error++;
            }
            await sleep(100);
        }
    }

    console.log(
        `\n${C.bold}  Batch completado — ` +
        `${C.green}ok=${results.ok}${C.reset}${C.bold}  ` +
        `${results.error > 0 ? C.red : C.dim}error=${results.error}${C.reset}${C.bold}  ` +
        `total=${total}${C.reset}`
    );

    return results;
}

// ─── Escenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = {

    /** Encola un ticket de cada tipo — verifica que el enrutador funciona */
    async allQueued() {
        printHeader('ESCENARIO: all-queued — Un ticket encolado por tipo');
        for (const type of Object.keys(TYPE_MAP)) {
            await sendQueue(type);
            await sleep(150);
        }
    },

    /** Envío inmediato de cada tipo — respuesta sincrónica con sys_id */
    async allImmediate() {
        printHeader('ESCENARIO: all-immediate — Envío inmediato por tipo');
        for (const type of Object.keys(TYPE_MAP)) {
            await sendImmediate(type);
            await sleep(200);
        }
    },

    /** 5 incidentes distintos en ráfaga — prueba bulkhead/circuit breaker */
    async incidentBurst() {
        printHeader('ESCENARIO: incident-burst — 5 incidentes en ráfaga');
        const sources = ['app-payments', 'app-loans', 'app-cards', 'app-transfers', 'app-auth'];
        await Promise.all(
            sources.map(source => sendQueue('incident', { source, severity: 'critical', priority: 1, impact: 1, urgency: 1 }))
        );
    },

    /** Encola un change-request y luego consulta su estado */
    async changeWorkflow() {
        printHeader('ESCENARIO: change-workflow — Change Request + consulta de estado');
        const result = await sendQueue('change-request', { severity: 'low', priority: 3, impact: 3, urgency: 3 });
        if (result?.correlationId) {
            await sleep(500);
            console.log(`\n${C.bold}  Consultando estado de ${result.correlationId}...${C.reset}`);
            await queryStatus(result.correlationId);
        }
    },

    /** Incidente con severity crítica en modo immediate + problema encolado */
    async mixedPriority() {
        printHeader('ESCENARIO: mixed-priority — Immediate crítico + encolado bajo');
        await sendImmediate('incident', { severity: 'critical', priority: 1, impact: 1, urgency: 1, source: 'app-core' });
        await sleep(200);
        await sendQueue('problem', { severity: 'low', priority: 3, impact: 3, urgency: 3, source: 'app-monitoring' });
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

function requireArg(args, name) {
    if (!args[name]) {
        console.error(`${C.red}--${name} requerido${C.reset}`);
        process.exit(1);
    }
    return args[name];
}

async function main() {
    const [,, command, ...rest] = process.argv;
    const args = parseArgs(rest);

    console.log(`\n${C.bold}${C.cyan}snow-request-simulator → ${BASE_URL}${C.reset}`);

    if (!command || command === 'help') {
        console.log(`
Uso: node snow-request-simulator.js <comando> [opciones]

Comandos:
  queue     --type <tipo> [--severity critical|high|medium|low] [--source <src>]
            [--priority 1-3] [--impact 1-3] [--urgency 1-3]

  immediate --type <tipo> [mismas opciones que queue]

  batch     --type <t1,t2,...>   tipos separados por coma (o "all" para todos)
            --count <n>          repeticiones por tipo (default: 1)
            --mode queue|immediate  (default: queue)
            --parallel           envío en paralelo (default: secuencial)
            [--severity ...] [--source ...] [--priority ...] [--impact ...] [--urgency ...]

  status    --id <correlationId>
  failed                            Lista DLQ (registros FAILED)
  retry     --id <correlationId>    Reencola un registro FAILED
  retry-all                         Reencola toda la DLQ

  scenario  --name <nombre>

Tipos:
  incident | change-request | problem | service-catalog
  knowledge-article | release-task | configuration-item

Escenarios:
  all-queued       Un ticket encolado de cada tipo
  all-immediate    Un ticket inmediato de cada tipo
  incident-burst   5 incidentes en ráfaga (bulkhead/circuit breaker)
  change-workflow  Change Request encolado + consulta de estado
  mixed-priority   Incident crítico immediate + problem encolado bajo

Ejemplos batch:
  node snow-request-simulator.js batch --type incident --count 5
  node snow-request-simulator.js batch --type incident,problem --count 3 --parallel
  node snow-request-simulator.js batch --type all --mode immediate
  node snow-request-simulator.js batch --type incident --count 10 --parallel --severity critical

Env:
  SNOWQ_URL   URL base (default: http://localhost:3090)
`);
        return;
    }

    switch (command) {
        case 'queue': {
            const type = requireArg(args, 'type');
            printHeader(`QUEUE — ${TYPE_MAP[type]?.label ?? type}`);
            await sendQueue(type, {
                severity: args.severity,
                source:   args.source,
                priority: args.priority  !== undefined ? parseInt(args.priority) : undefined,
                impact:   args.impact    !== undefined ? parseInt(args.impact)   : undefined,
                urgency:  args.urgency   !== undefined ? parseInt(args.urgency)  : undefined,
                group:    args.group,
                company:  args.company,
                category: args.category,
            });
            break;
        }
        case 'immediate': {
            const type = requireArg(args, 'type');
            printHeader(`IMMEDIATE — ${TYPE_MAP[type]?.label ?? type}`);
            await sendImmediate(type, {
                severity: args.severity,
                source:   args.source,
                priority: args.priority  !== undefined ? parseInt(args.priority) : undefined,
                impact:   args.impact    !== undefined ? parseInt(args.impact)   : undefined,
                urgency:  args.urgency   !== undefined ? parseInt(args.urgency)  : undefined,
                group:    args.group,
                company:  args.company,
                category: args.category,
            });
            break;
        }
        case 'batch': {
            const rawTypes = requireArg(args, 'type');
            const types    = rawTypes === 'all'
                ? Object.keys(TYPE_MAP)
                : rawTypes.split(',').map(t => t.trim());

            // Validar tipos
            const invalid = types.filter(t => !TYPE_MAP[t]);
            if (invalid.length) {
                console.error(`${C.red}Tipos desconocidos: ${invalid.join(', ')}. Válidos: ${Object.keys(TYPE_MAP).join(', ')}${C.reset}`);
                process.exit(1);
            }

            await runBatch(
                types,
                args.count    !== undefined ? Math.max(1, parseInt(args.count)) : 1,
                args.mode === 'immediate' ? 'immediate' : 'queue',
                !!args.parallel,
                {
                    severity: args.severity,
                    source:   args.source,
                    priority: args.priority  !== undefined ? parseInt(args.priority) : undefined,
                    impact:   args.impact    !== undefined ? parseInt(args.impact)   : undefined,
                    urgency:  args.urgency   !== undefined ? parseInt(args.urgency)  : undefined,
                    group:    args.group,
                    company:  args.company,
                    category: args.category,
                },
            );
            break;
        }
        case 'status': {
            const id = requireArg(args, 'id');
            printHeader(`STATUS — ${id}`);
            await queryStatus(id);
            break;
        }
        case 'failed': {
            printHeader('DLQ — Registros FAILED');
            await queryFailed();
            break;
        }
        case 'retry': {
            const id = requireArg(args, 'id');
            printHeader(`RETRY — ${id}`);
            await retryOne(id);
            break;
        }
        case 'retry-all': {
            printHeader('RETRY-ALL — Reencolar DLQ completa');
            await retryAll();
            break;
        }
        case 'scenario': {
            const name = requireArg(args, 'name');
            const key  = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); // kebab → camelCase
            const fn   = SCENARIOS[key];
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

    console.log(`\n${C.dim}${'─'.repeat(64)}${C.reset}\n`);
}

main().catch(err => {
    console.error(`${C.red}Error: ${err.message}${C.reset}`);
    process.exit(1);
});
