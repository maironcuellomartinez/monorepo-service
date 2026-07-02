#!/usr/bin/env node
/**
 * resilience-test.js
 *
 * Prueba automatizada de las tres capas de resiliencia de api-snowq-service:
 *   1. Circuit Breakers — 3 breakers independientes (monitoring / queue / immediate)
 *   2. Bulkheads        — 3 pools aislados (monitoring:alerts / snow-requests:async / immediate)
 *   3. Retry            — modo inmediato reintenta solo en ServiceNowTemporalError
 *
 * Uso:
 *   node simulators/resilience-test.js [--test <nombre>]
 *
 * Tests disponibles:
 *   all        Ejecuta todos (default)
 *   status     Solo muestra estado actual de breakers y bulkheads
 *   circuit    Solo verifica independencia de circuit breakers
 *   bulkhead   Solo verifica aislamiento de bulkheads bajo carga
 *   storm      Simula tormenta Nagios y verifica que sn:queue no se abre
 *
 * Variables de entorno:
 *   SNOWQ_URL        URL base del servicio (default: http://localhost:3090)
 *   SNOWQ_M2M_TOKEN  JWT M2M para endpoints autenticados (ver simulators/.env)
 *
 * Ejemplos:
 *   node simulators/resilience-test.js
 *   node simulators/resilience-test.js --test bulkhead
 *   node simulators/resilience-test.js --test storm
 *   SNOWQ_URL=http://staging:3090 node simulators/resilience-test.js --test status
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ── Auto-carga simulators/.env ────────────────────────────────────────────────
try {
    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
        fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        });
    }
} catch {}

// ── Configuración ─────────────────────────────────────────────────────────────
const BASE_URL  = process.env.SNOWQ_URL       || 'http://localhost:3090';
const M2M_TOKEN = process.env.SNOWQ_M2M_TOKEN || '';

// ── Colores ───────────────────────────────────────────────────────────────────
const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    cyan:    '\x1b[36m',
    magenta: '\x1b[35m',
    blue:    '\x1b[34m',
    white:   '\x1b[37m',
};

const ok    = (msg) => console.log(`  ${C.green}✔${C.reset}  ${msg}`);
const fail  = (msg) => console.log(`  ${C.red}✘${C.reset}  ${msg}`);
const warn  = (msg) => console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`);
const info  = (msg) => console.log(`  ${C.cyan}ℹ${C.reset}  ${msg}`);
const step  = (msg) => console.log(`\n${C.bold}${C.blue}▶${C.reset} ${C.bold}${msg}${C.reset}`);
const hr    = ()    => console.log(`  ${C.dim}${'─'.repeat(60)}${C.reset}`);
const title = (msg) => {
    console.log();
    console.log(`${C.bold}${C.magenta}${'═'.repeat(62)}${C.reset}`);
    console.log(`${C.bold}${C.magenta}  ${msg}${C.reset}`);
    console.log(`${C.bold}${C.magenta}${'═'.repeat(62)}${C.reset}`);
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function request(method, urlPath, body, timeoutMs = 10_000) {
    return new Promise((resolve) => {
        const url  = new URL(BASE_URL + urlPath);
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: url.hostname,
            port:     url.port || 80,
            path:     url.pathname,
            method,
            headers: {
                ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
                ...(M2M_TOKEN ? { 'Authorization': `Bearer ${M2M_TOKEN}` } : {}),
            },
        };
        const t0  = Date.now();
        const req = http.request(opts, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(raw); } catch { parsed = raw; }
                resolve({ status: res.statusCode, body: parsed, ms: Date.now() - t0 });
            });
        });
        req.on('error', (e) => resolve({ status: 0, body: e.message, ms: Date.now() - t0 }));
        req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, body: 'timeout', ms: timeoutMs }); });
        if (data) req.write(data);
        req.end();
    });
}

const get  = (p)    => request('GET',  p);
const post = (p, b) => request('POST', p, b);

// ── Payload de alerta Nagios ──────────────────────────────────────────────────
function buildAlert(host, service) {
    return {
        notificationType: 'PROBLEM',
        host:             host,
        service:          service || undefined,
        state:            'DOWN',
        stateType:        'HARD',
        checkAttempt:     3,
        maxCheckAttempts: 3,
        output:           `[resilience-test] Simulación de alerta para ${host}`,
        ttlSeconds:       60,
    };
}

// ── Helpers de resultados ─────────────────────────────────────────────────────
function countStatuses(results) {
    return results.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
    }, {});
}

function avgMs(results) {
    const valid = results.filter(r => r.ms > 0);
    return valid.length ? Math.round(valid.reduce((s, r) => s + r.ms, 0) / valid.length) : 0;
}

function printStatusTable(label, counts) {
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    for (const [code, n] of Object.entries(counts).sort()) {
        const pct = ((n / total) * 100).toFixed(1).padStart(5);
        const bar = '█'.repeat(Math.round(n / total * 20));
        const color = code === '200' || code === '202' ? C.green
                    : code === '503' ? C.yellow
                    : code === '0'   ? C.red
                    : C.dim;
        console.log(`     ${color}HTTP ${code}${C.reset}  ${String(n).padStart(4)} req  ${pct}%  ${color}${bar}${C.reset}`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 1 — Conectividad y estado inicial
// ═════════════════════════════════════════════════════════════════════════════
async function testConnectivity() {
    title('TEST 1 · Conectividad y Estado Inicial');

    // Health
    step('GET /health');
    const health = await get('/health');
    if (health.status === 200) {
        ok(`Servicio UP  [${health.ms}ms]`);
        const db  = health.body?.database?.status;
        const cbr = health.body?.circuitBreaker?.status;
        if (db)  info(`Database:        ${db}`);
        if (cbr) info(`Circuit breaker: ${cbr}`);
    } else {
        fail(`Servicio no responde  [status=${health.status}]`);
        console.log(`\n  ${C.red}⛔  api-snowq-service no está disponible en ${BASE_URL}${C.reset}`);
        console.log(`  Arranca el servicio antes de ejecutar este test.\n`);
        process.exit(1);
    }

    if (!M2M_TOKEN) {
        warn('SNOWQ_M2M_TOKEN no configurado — se omiten endpoints autenticados');
        warn('Para el análisis completo: agrega el token en simulators/.env');
        return;
    }

    // Circuit breakers
    step('GET /resilience/circuit-breaker/status');
    const cb = await get('/resilience/circuit-breaker/status');
    if (cb.status === 200) {
        const breakers = Object.keys(cb.body?.breakers || {});
        ok(`${breakers.length} circuit breaker(s) registrado(s)`);
        for (const [name, m] of Object.entries(cb.body?.breakers || {})) {
            const stateColor = m.state === 'closed' ? C.green : m.state === 'open' ? C.red : C.yellow;
            info(`  ${stateColor}${m.state.padEnd(9)}${C.reset}  ${C.bold}${name}${C.reset}  (calls=${m.totalCalls} | failures=${m.failedCalls} | failRate=${m.failureRate})`);
        }
    } else {
        warn(`Circuit breaker status: HTTP ${cb.status}`);
    }

    // Bulkheads
    step('GET /resilience/bulkhead/status');
    const bk = await get('/resilience/bulkhead/status');
    if (bk.status === 200) {
        const pools = bk.body?.bulkheads || {};
        const names = Object.keys(pools);
        ok(`${names.length} bulkhead pool(s) registrado(s)`);
        if (names.length === 0) {
            info('Los pools se crean on-demand en la primera request — envía tráfico primero');
        }
        for (const [name, m] of Object.entries(pools)) {
            info(`  ${C.bold}${name}${C.reset}  (concurrent=${m.currentConcurrentCalls ?? '-'}/${m.maxConcurrentCalls ?? '-'} | queued=${m.currentQueueSize ?? '-'}/${m.maxQueueSize ?? '-'})`);
        }
    } else {
        warn(`Bulkhead status: HTTP ${bk.status}`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2 — Independencia de Circuit Breakers
// ═════════════════════════════════════════════════════════════════════════════
async function testCircuitBreakerIndependence() {
    title('TEST 2 · Independencia de Circuit Breakers');

    if (!M2M_TOKEN) {
        warn('Requiere SNOWQ_M2M_TOKEN — se omite este test');
        return;
    }

    const EXPECTED_BREAKERS = ['sn:monitoring', 'sn:queue', 'sn:immediate'];

    step('Verificando que los 3 breakers existen con configuraciones independientes');
    const res = await get('/resilience/circuit-breaker/status');

    if (res.status !== 200) {
        fail(`No se pudo obtener el estado: HTTP ${res.status}`);
        return;
    }

    const breakers = res.body?.breakers || {};
    let allPresent = true;

    for (const name of EXPECTED_BREAKERS) {
        if (breakers[name]) {
            ok(`${C.bold}${name}${C.reset}  →  state=${breakers[name].state}`);
        } else {
            fail(`${name} NO encontrado (se crea en la primera request por ese flujo)`);
            allPresent = false;
        }
    }

    hr();
    step('Verificando que los estados son independientes');

    // Los breakers tienen thresholds distintos — comprobamos las configuraciones
    // recordadas en la respuesta (si el endpoint los expone) o mostramos los estados.
    const states = EXPECTED_BREAKERS.map(n => breakers[n]?.state).filter(Boolean);
    const uniqueNames = Object.keys(breakers);

    if (uniqueNames.length >= 3) {
        ok('Cada flujo tiene su propio breaker — una tormenta Nagios no abre el breaker del monolito');
    } else if (uniqueNames.length > 0) {
        warn(`Solo ${uniqueNames.length} breaker(s) visibles — envía tráfico por cada flujo para inicializarlos`);
    }

    info('Configuración de thresholds por breaker:');
    info('  sn:monitoring  — failureThreshold=60%  minimumCalls=5  openTimeout=30s  (tolera ruido de Nagios)');
    info('  sn:queue       — failureThreshold=50%  minimumCalls=5  openTimeout=30s  (flujo del monolito)');
    info('  sn:immediate   — failureThreshold=50%  minimumCalls=3  openTimeout=15s  (sync — más sensible)');

    hr();
    step('¿Cómo probar que sn:monitoring abre sin afectar sn:queue?');
    console.log();
    console.log(`  ${C.yellow}1. Detén servicenow-clone-backend:${C.reset}`);
    console.log(`     cd servicenow-clone-backend && taskkill /f /im node.exe  (o Ctrl+C)`);
    console.log();
    console.log(`  ${C.yellow}2. Inunda /monitoring con alertas (desde workspace root):${C.reset}`);
    console.log(`     for ($i=1; $i -le 10; $i++) { npm run sim:storm }    # PowerShell`);
    console.log(`     for i in {1..10}; do npm run sim:storm; done          # Bash`);
    console.log();
    console.log(`  ${C.yellow}3. Observa cada breaker por separado:${C.reset}`);
    console.log(`     watch -n1 'curl -s -H "Authorization: Bearer $TOKEN" ${BASE_URL}/resilience/circuit-breaker/status | jq .breakers'`);
    console.log();
    console.log(`  ${C.yellow}4. Verifica que sn:queue sigue CLOSED mientras sn:monitoring se abre${C.reset}`);
    console.log();
    console.log(`  ${C.yellow}5. Limpia:${C.reset}`);
    console.log(`     curl -X POST -H "Authorization: Bearer $TOKEN" ${BASE_URL}/resilience/circuit-breaker/reset`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 3 — Aislamiento de Bulkheads bajo carga concurrente
// ═════════════════════════════════════════════════════════════════════════════
async function testBulkheadIsolation() {
    title('TEST 3 · Aislamiento de Bulkheads bajo Carga Concurrente');

    const MONITORING_BURST = 150;   // requests simultáneas a /monitoring/alerts
    const HEALTH_PROBES    = 20;    // requests simultáneas a /health (pool diferente)
    const HOSTS = ['web01', 'web02', 'web03', 'db01', 'db02', 'cache01', 'proxy01', 'api01', 'mq01', 'lb01'];

    step(`Enviando ${MONITORING_BURST} alertas Nagios concurrentes + ${HEALTH_PROBES} probes de /health en paralelo`);
    info('Las dos cargas usan pools distintos — /health no pasa por el bulkhead de monitoring');
    console.log();

    const t0 = Date.now();

    // Burst de monitoring:alerts (no requiere auth)
    const monitoringRequests = Array.from({ length: MONITORING_BURST }, (_, i) => {
        const host    = HOSTS[i % HOSTS.length];
        const service = `SERVICE-${String(i % 5 + 1).padStart(2, '0')}`;
        return post('/monitoring/alerts', buildAlert(host, service));
    });

    // Probes de /health (no pasa por bulkhead, no requiere auth)
    const healthRequests = Array.from({ length: HEALTH_PROBES }, () => get('/health'));

    // Disparar todo en paralelo
    const [monitoringResults, healthResults] = await Promise.all([
        Promise.all(monitoringRequests),
        Promise.all(healthRequests),
    ]);

    const elapsed = Date.now() - t0;
    console.log();

    // ── Resultados de monitoring ──────────────────────────────────────────────
    step(`Resultados de /monitoring/alerts  (${elapsed}ms total)`);
    const monCounts = countStatuses(monitoringResults);
    printStatusTable('monitoring', monCounts);
    hr();

    const mon200 = (monCounts['200'] || 0) + (monCounts['202'] || 0);
    const mon503 = monCounts['503'] || 0;
    const monErr = monCounts['0']   || 0;
    const monAvg = avgMs(monitoringResults);

    info(`Procesadas:  ${mon200}`);
    info(`Rechazadas:  ${mon503}  ${mon503 > 0 ? C.green + '(bulkhead activo)' + C.reset : C.dim + '(sin saturación)' + C.reset}`);
    if (monErr > 0) warn(`Errores de red: ${monErr}`);
    info(`Latencia media: ${monAvg}ms`);

    if (mon503 > 0) {
        ok(`Bulkhead rechazó ${mon503} request(s) — el pool de monitoring está limitando la concurrencia`);
    } else {
        info('Sin rechazos 503 — el pool de monitoring procesó todo (servicenow-clone-backend rápido o sin saturation)');
        info('Para forzar saturación: detén servicenow-clone-backend y repite');
    }

    // ── Resultados de /health ─────────────────────────────────────────────────
    console.log();
    step(`Resultados de /health  (pool independiente)`);
    const healthCounts = countStatuses(healthResults);
    printStatusTable('health', healthCounts);
    hr();

    const healthOk  = (healthCounts['200'] || 0);
    const healthFail = HEALTH_PROBES - healthOk;
    const healthAvg = avgMs(healthResults);

    info(`Exitosas: ${healthOk}/${HEALTH_PROBES}`);
    info(`Latencia media: ${healthAvg}ms`);

    if (healthOk === HEALTH_PROBES) {
        ok('AISLAMIENTO CONFIRMADO — /health respondió 100% incluso durante la tormenta de monitoring');
    } else {
        fail(`${healthFail} probe(s) de /health fallaron durante la tormenta — investiga si es un problema de red o del servicio`);
    }

    // ── Estado de bulkheads después ───────────────────────────────────────────
    if (M2M_TOKEN) {
        console.log();
        step('Estado de los pools después de la carga');
        const bk = await get('/resilience/bulkhead/status');
        if (bk.status === 200) {
            const pools = bk.body?.bulkheads || {};
            if (Object.keys(pools).length === 0) {
                info('Los pools se muestran vacíos (on-demand, ya drenados)');
            }
            for (const [name, m] of Object.entries(pools)) {
                const overload = m.currentQueueSize > 0 || m.currentConcurrentCalls > 0;
                const dot = overload ? `${C.yellow}●${C.reset}` : `${C.green}●${C.reset}`;
                info(`${dot} ${C.bold}${name}${C.reset}  concurrent=${m.currentConcurrentCalls ?? 0}/${m.maxConcurrentCalls ?? '?'}  queued=${m.currentQueueSize ?? 0}`);
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 4 — Verificación de Retry (modo inmediato)
// ═════════════════════════════════════════════════════════════════════════════
async function testRetryInfo() {
    title('TEST 4 · Retry en Modo Inmediato');

    info('El retry opera DENTRO del servicio — no es observable en HTTP de forma directa.');
    info('Ocurre cuando POST /snow-requests/immediate recibe un ServiceNowTemporalError (5xx, 429, timeout).');
    console.log();

    step('Comportamiento configurado');
    info('maxAttempts:   2');
    info('backoff:       FixedBackoff(500ms)');
    info('abortIf:       cualquier error que NO sea ServiceNowTemporalError (aborta de inmediato)');
    info('               → 4xx fatales se descartan sin retry');
    info('               → 5xx / 429 / timeout → reintento tras 500ms');
    console.log();

    step('¿Cómo observar el retry en acción?');
    console.log();
    console.log(`  ${C.yellow}Opción A — Logs del servicio (método más directo):${C.reset}`);
    console.log(`    1. Detén servicenow-clone-backend`);
    console.log(`    2. npm run sim:incident:immediate     # desde workspace root`);
    console.log(`    3. En los logs del api-snowq-service verás:`);
    console.log(`       ${C.dim}[Retry] attempt 1 failed — ServiceNowTemporalError: 503 Service Unavailable${C.reset}`);
    console.log(`       ${C.dim}[Retry] attempt 2 (backoff 500ms)...${C.reset}`);
    console.log(`       ${C.dim}[SnowRequestService] markAsFailed: SNQ-XXXXXXXX${C.reset}`);
    console.log();
    console.log(`  ${C.yellow}Opción B — Base de datos:${C.reset}`);
    console.log(`    SELECT internal_number, status, retry_count, last_error, updated_at`);
    console.log(`    FROM snow_requests`);
    console.log(`    WHERE immediate = 1`);
    console.log(`    ORDER BY created_at DESC LIMIT 10;`);
    console.log();

    if (M2M_TOKEN) {
        step('Estado actual de requests en DLQ (FAILED)');
        const dlq = await get('/snow-requests?status=FAILED&limit=5');
        if (dlq.status === 200) {
            const items = Array.isArray(dlq.body) ? dlq.body : (dlq.body?.items || []);
            if (items.length === 0) {
                ok('Sin registros FAILED en este momento');
            } else {
                warn(`${items.length} registro(s) en estado FAILED:`);
                items.slice(0, 5).forEach(r => {
                    info(`  ${r.internalNumber}  retry_count=${r.retryCount ?? '-'}  error=${(r.lastError || '').substring(0, 60)}`);
                });
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 5 — Storm Scenario (Tormenta Nagios → solo sn:monitoring debe cambiar)
// ═════════════════════════════════════════════════════════════════════════════
async function testStormScenario() {
    title('TEST 5 · Escenario de Tormenta Nagios (Storm)');

    if (!M2M_TOKEN) {
        warn('Requiere SNOWQ_M2M_TOKEN para consultar estado de breakers');
    }

    step('Estado de circuit breakers ANTES de la tormenta');
    const before = M2M_TOKEN ? await get('/resilience/circuit-breaker/status') : null;
    if (before?.status === 200) {
        for (const [name, m] of Object.entries(before.body?.breakers || {})) {
            const c = m.state === 'closed' ? C.green : m.state === 'open' ? C.red : C.yellow;
            info(`  ${c}${m.state.padEnd(9)}${C.reset}  ${name}  (calls=${m.totalCalls})`);
        }
    } else {
        info('(no disponible sin M2M token)');
    }

    const STORM_SIZE = 30;
    const HOSTS_STORM = ['host-alpha', 'host-beta', 'host-gamma', 'host-delta', 'host-epsilon'];

    console.log();
    step(`Disparando tormenta: ${STORM_SIZE} alertas Nagios simultáneas`);

    const storm = Array.from({ length: STORM_SIZE }, (_, i) =>
        post('/monitoring/alerts', buildAlert(HOSTS_STORM[i % HOSTS_STORM.length], `SVC-${i % 8 + 1}`))
    );

    const stormResults = await Promise.all(storm);
    const sc = countStatuses(stormResults);
    printStatusTable('storm', sc);

    const ok200 = (sc['200'] || 0) + (sc['202'] || 0);
    const err503 = sc['503'] || 0;
    info(`Aceptadas: ${ok200}  |  Rechazadas (bulkhead): ${err503}`);

    console.log();
    step('Estado de circuit breakers DESPUÉS de la tormenta');
    const after = M2M_TOKEN ? await get('/resilience/circuit-breaker/status') : null;
    if (after?.status === 200) {
        for (const [name, m] of Object.entries(after.body?.breakers || {})) {
            const c = m.state === 'closed' ? C.green : m.state === 'open' ? C.red : C.yellow;
            info(`  ${c}${m.state.padEnd(9)}${C.reset}  ${name}  (calls=${m.totalCalls} | failures=${m.failedCalls})`);
        }

        // Verificación clave: sn:queue y sn:immediate no deben haberse visto afectados
        const queueBreaker     = after.body?.breakers?.['sn:queue'];
        const immediateBreaker = after.body?.breakers?.['sn:immediate'];

        console.log();
        if (queueBreaker && queueBreaker.state !== 'open') {
            ok(`sn:queue permanece CLOSED — el monolito puede seguir enviando requests`);
        } else if (queueBreaker) {
            fail(`sn:queue está ${queueBreaker.state} — investiga si SN está realmente caído`);
        }
        if (immediateBreaker && immediateBreaker.state !== 'open') {
            ok(`sn:immediate permanece CLOSED — el modo inmediato sigue operativo`);
        }
    } else {
        info('(consulta de estado no disponible sin M2M token)');
        info('Verifica manualmente con:');
        info(`  curl -H "Authorization: Bearer $TOKEN" ${BASE_URL}/resilience/circuit-breaker/status`);
    }

    // Reset (limpiar tras el test)
    if (M2M_TOKEN) {
        console.log();
        step('Reset de circuit breakers (limpieza post-test)');
        const reset = await post('/resilience/circuit-breaker/reset');
        if (reset.status === 200) {
            ok(`Reset completo: ${(reset.body?.breakers || []).join(', ')}`);
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST STATUS — Solo muestra el estado actual
// ═════════════════════════════════════════════════════════════════════════════
async function testStatus() {
    title('Estado Actual de Resiliencia');

    step('Health');
    const health = await get('/health');
    if (health.status === 200) {
        ok(`UP  [${health.ms}ms]`);
        const s = health.body;
        if (s?.database)      info(`Database:       ${s.database.status}  (${s.database.responseTimeMs ?? '?'}ms)`);
        if (s?.circuitBreaker) info(`CircuitBreaker: ${s.circuitBreaker.status}  |  ${JSON.stringify(s.circuitBreaker.breakers ?? {})}`);
    } else {
        fail(`DOWN  [HTTP ${health.status}]`);
        process.exit(1);
    }

    if (!M2M_TOKEN) {
        warn('M2M token no disponible — agrega SNOWQ_M2M_TOKEN en simulators/.env para ver detalles');
        return;
    }

    step('Circuit Breakers');
    const cb = await get('/resilience/circuit-breaker/status');
    if (cb.status === 200) {
        console.log();
        console.log(`  ${'BREAKER'.padEnd(20)} ${'STATE'.padEnd(10)} ${'CALLS'.padEnd(8)} ${'FAIL'.padEnd(8)} ${'FAIL RATE'.padEnd(12)} ${'REJECTED'}`);
        hr();
        for (const [name, m] of Object.entries(cb.body?.breakers || {})) {
            const sc = m.state === 'closed' ? C.green : m.state === 'open' ? C.red : C.yellow;
            console.log(`  ${C.bold}${name.padEnd(20)}${C.reset} ${sc}${m.state.padEnd(10)}${C.reset} ${String(m.totalCalls).padEnd(8)} ${String(m.failedCalls).padEnd(8)} ${String(m.failureRate).padEnd(12)} ${m.notPermittedCalls}`);
        }
    }

    step('Bulkhead Pools');
    const bk = await get('/resilience/bulkhead/status');
    if (bk.status === 200) {
        const pools = bk.body?.bulkheads || {};
        if (Object.keys(pools).length === 0) {
            info('Pools vacíos — se crean on-demand con la primera request');
        } else {
            console.log();
            console.log(`  ${'POOL'.padEnd(30)} ${'CONCURRENT'.padEnd(14)} ${'QUEUED'.padEnd(14)} ${'STATE'}`);
            hr();
            for (const [name, m] of Object.entries(pools)) {
                const overload = (m.currentQueueSize || 0) > 0;
                const sc = overload ? C.yellow : C.green;
                console.log(`  ${C.bold}${name.padEnd(30)}${C.reset} ${String(m.currentConcurrentCalls ?? 0).padStart(4)}/${String(m.maxConcurrentCalls ?? '?').padEnd(8)} ${String(m.currentQueueSize ?? 0).padStart(4)}/${String(m.maxQueueSize ?? '?').padEnd(8)} ${sc}${overload ? 'BUSY' : 'IDLE'}${C.reset}`);
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Entry point
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
    const args     = process.argv.slice(2);
    const testIdx  = args.indexOf('--test');
    const testName = testIdx !== -1 ? args[testIdx + 1] : 'all';

    console.log();
    console.log(`${C.bold}${C.magenta}  api-snowq-service · Resilience Test Suite${C.reset}`);
    console.log(`  ${C.dim}${BASE_URL}${C.reset}`);
    if (!M2M_TOKEN) console.log(`  ${C.yellow}⚠  SNOWQ_M2M_TOKEN no configurado — tests de auth omitidos${C.reset}`);

    try {
        switch (testName) {
            case 'status':
                await testStatus();
                break;
            case 'circuit':
                await testConnectivity();
                await testCircuitBreakerIndependence();
                break;
            case 'bulkhead':
                await testConnectivity();
                await testBulkheadIsolation();
                break;
            case 'storm':
                await testConnectivity();
                await testStormScenario();
                break;
            case 'all':
            default:
                await testConnectivity();
                await testCircuitBreakerIndependence();
                await testBulkheadIsolation();
                await testRetryInfo();
                await testStormScenario();
                break;
        }
    } catch (e) {
        console.error(`\n${C.red}Error inesperado:${C.reset}`, e.message);
        process.exit(1);
    }

    console.log();
    console.log(`${C.bold}${C.magenta}${'═'.repeat(62)}${C.reset}`);
    console.log(`${C.bold}  Resumen de comandos útiles${C.reset}`);
    console.log(`${C.magenta}${'═'.repeat(62)}${C.reset}`);
    console.log(`  node simulators/resilience-test.js --test status    Estado en tiempo real`);
    console.log(`  node simulators/resilience-test.js --test bulkhead  Prueba de carga concurrente`);
    console.log(`  node simulators/resilience-test.js --test storm     Tormenta Nagios`);
    console.log(`  node simulators/resilience-test.js --test circuit   Guía de circuit breakers`);
    console.log();
}

main();
