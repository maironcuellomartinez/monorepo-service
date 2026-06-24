#!/usr/bin/env node
/**
 * combined-simulator.js
 *
 * Simula flujos combinados de Nagios/Thruk y monolito-event-corner_v3
 * hacia api-snowq-service.
 *
 * Uso:
 *   node combined-simulator.js scenario --name <nombre>
 *   node combined-simulator.js list
 *
 * Escenarios:
 *   infra-outage        Nagios detecta host caído → monolito envía incidente relacionado
 *   deploy-incident     Monolito encola change-request → Nagios detecta degradación → recovery
 *   cascade-failure     Múltiples alertas Nagios + monolito genera tickets por cada sistema afectado
 *   full-lifecycle      Ciclo completo: Nagios PROBLEM → procesado → RECOVERY → RESOLVED
 *   parallel-storm      Ambos sistemas envían peticiones en paralelo (prueba de carga)
 *   dedup-cross         Nagios y monolito generan el mismo incidente → verificar dedup individual
 *   dlq-recovery        Monolito encola, falla → DLQ → retry-all → Nagios envía recovery
 *
 * Variables de entorno:
 *   SNOWQ_URL        URL base (default: http://localhost:3090)
 *   SNOWQ_M2M_TOKEN  JWT M2M para autenticación (requerido — ver api-snowq-service/.env)
 *
 * Ejemplos:
 *   node combined-simulator.js scenario --name infra-outage
 *   node combined-simulator.js scenario --name full-lifecycle
 *   node combined-simulator.js list
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

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL  = process.env.SNOWQ_URL       || 'http://localhost:3090';
const M2M_TOKEN = process.env.SNOWQ_M2M_TOKEN || '';

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
    orange:  '\x1b[38;5;208m',
};

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url  = new URL(BASE_URL + path);
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: url.hostname,
            port:     url.port || 80,
            path:     url.pathname,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
                ...(M2M_TOKEN ? { 'Authorization': `Bearer ${M2M_TOKEN}` } : {}),
            },
        };
        const req = http.request(opts, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Print helpers ────────────────────────────────────────────────────────────

function printBanner(title) {
    const line = '═'.repeat(66);
    console.log(`\n${C.bold}${C.cyan}${line}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
    console.log(`${C.bold}${C.cyan}${line}${C.reset}`);
}

function printSection(source, label) {
    const icon  = source === 'nagios' ? '🔔' : '🏦';
    const color = source === 'nagios' ? C.orange : C.blue;
    console.log(`\n${color}${C.bold}  [${source.toUpperCase()}] ${label}${C.reset}`);
}

function printStep(label) {
    console.log(`\n${C.dim}  ┄┄ ${label} ┄┄${C.reset}`);
}

function printReq(method, path, body) {
    console.log(`${C.white}    → ${method} ${path}${C.reset}`);
    console.log(`${C.gray}      ${JSON.stringify(body)}${C.reset}`);
}

function printRes(res, labelOk, labelErr) {
    const ok    = res.status < 300;
    const color = ok ? C.green : C.red;
    const b     = res.body;
    console.log(`${color}    ← HTTP ${res.status}  ${ok ? (labelOk ?? 'OK') : (labelErr ?? 'ERROR')}${C.reset}`);
    if (!ok) {
        console.log(`${C.red}      ${JSON.stringify(b)}${C.reset}`);
        return b;
    }
    // Campos útiles según la respuesta
    if (b?.action)         console.log(`${C.gray}      action         = ${b.action}${C.reset}`);
    if (b?.correlationId)  console.log(`${C.gray}      correlationId  = ${b.correlationId}${C.reset}`);
    if (b?.internalNumber) console.log(`${C.gray}      internalNumber = ${b.internalNumber}${C.reset}`);
    if (b?.status)         console.log(`${C.gray}      status         = ${b.status}${C.reset}`);
    if (b?.sysId)          console.log(`${C.gray}      sysId          = ${b.sysId}${C.reset}`);
    if (b?.snowNumber)     console.log(`${C.gray}      snowNumber     = ${b.snowNumber}${C.reset}`);
    if (b?.sys_id)         console.log(`${C.gray}      sys_id         = ${b.sys_id}${C.reset}`);
    if (b?.reason)         console.log(`${C.gray}      reason         = ${b.reason}${C.reset}`);
    if (b?.requeued !== undefined) console.log(`${C.gray}      requeued       = ${b.requeued}${C.reset}`);
    return b;
}

function printSummary(rows) {
    console.log(`\n${C.bold}${C.cyan}  ── Resumen ────────────────────────────────────────────${C.reset}`);
    for (const { label, value, color } of rows) {
        const c = color ?? C.white;
        console.log(`${C.bold}    ${label.padEnd(20)}${C.reset}${c}${value}${C.reset}`);
    }
}

// ─── Builders Nagios ──────────────────────────────────────────────────────────

function nagiosProblem({ host, service, state = 'CRITICAL', soft = false }) {
    const a = {
        notificationType: 'PROBLEM',
        host,
        state,
        stateType:        soft ? 'SOFT' : 'HARD',
        checkAttempt:     soft ? 1 : 3,
        maxCheckAttempts: 3,
        output:           `${state}: ${service ?? host} no responde.`,
    };
    if (service) a.service = service;
    return a;
}

function nagiosRecovery({ host, service }) {
    const a = {
        notificationType: 'RECOVERY',
        host,
        state:            service ? 'OK' : 'UP',
        stateType:        'HARD',
        checkAttempt:     1,
        maxCheckAttempts: 3,
        output:           `RECOVERY: ${service ?? host} volvió a la normalidad.`,
    };
    if (service) a.service = service;
    return a;
}

// ─── Builders Monolito ────────────────────────────────────────────────────────

function monolithIncident({ source, severity = 'high', priority = 2, impact = 2, urgency = 2, description }) {
    const ts = new Date().toISOString();
    return {
        severity, impact, urgency, priority,
        source: source ?? 'monolito-event-corner_v3',
        payload: {
            short_description: description ?? `[MONOLITH] Falla detectada por ${source} — ${ts}`,
            description:       description ?? 'Incidente generado por monolito-event-corner_v3.',
            urgency, impact,
        },
    };
}

function monolithChangeRequest({ source, description, reason }) {
    const ts   = new Date().toISOString();
    const base = new Date(Date.now() + 86400000).toISOString().substring(0, 10);
    const end  = new Date(Date.now() + 172800000).toISOString().substring(0, 10);
    return {
        severity: 'low', impact: 3, urgency: 3, priority: 3,
        source: source ?? 'monolito-event-corner_v3',
        payload: {
            short_description: description ?? `[MONOLITH] Cambio planificado — ${ts}`,
            description:       description ?? 'Change request generado por monolito.',
            reason:            reason ?? 'Mantenimiento planificado',
            change_type:       'normal',
            start_date:        base,
            end_date:          end,
        },
    };
}

// ─── Acciones atómicas ────────────────────────────────────────────────────────

async function nagiosAlert(label, payload) {
    printSection('nagios', label);
    printReq('POST', '/monitoring/alerts', payload);
    const res = await post('/monitoring/alerts', payload);
    return printRes(res);
}

async function monolithQueue(type, label, payload) {
    const pathMap = {
        incident:             'incidents',
        'change-request':     'change-requests',
        problem:              'problems',
    };
    const path = `/snow-requests/${pathMap[type] ?? type}`;
    printSection('monolito', label);
    printReq('POST', path, payload);
    const res = await post(path, payload);
    return printRes(res, 'ACCEPTED (encolado)');
}

async function monolithImmediate(type, label, payload) {
    const pathMap = {
        incident:             'incidents',
        'change-request':     'change-requests',
        problem:              'problems',
    };
    const path = `/snow-requests/immediate/${pathMap[type] ?? type}`;
    printSection('monolito', label);
    printReq('POST', path, payload);
    const res = await post(path, payload);
    return printRes(res, 'OK (sincrónico)');
}

async function checkStatus(correlationId, label) {
    printStep(label ?? `Estado de ${correlationId}`);
    const res = await get(`/snow-requests/${correlationId}`);
    const b   = res.body;
    const statusColors = { QUEUED: C.yellow, IN_PROGRESS: C.magenta, DELIVERED: C.green, FAILED: C.red, CANCELLED: C.dim };
    const sc = statusColors[b?.status] ?? C.white;
    console.log(`${C.gray}    correlationId  = ${b?.correlationId ?? '?'}${C.reset}`);
    console.log(`${sc}    status         = ${b?.status ?? '?'}${C.reset}`);
    console.log(`${C.gray}    sysId          = ${b?.sysId ?? '-'}${C.reset}`);
    console.log(`${C.gray}    snowNumber     = ${b?.snowNumber ?? '-'}${C.reset}`);
    return b;
}

async function retryAll(label) {
    printStep(label ?? 'Retry-all DLQ');
    const res = await post('/snow-requests/failed/retry-all', {});
    return printRes(res);
}

// ─── Escenarios ───────────────────────────────────────────────────────────────

const SCENARIOS = {

    /**
     * infra-outage
     *
     * Nagios detecta que el servidor de base de datos cae.
     * Simultáneamente, el monolito (que también percibe el fallo a través de
     * sus propios health-checks) encola su propio incidente.
     * Ambos deben crear tickets independientes (distinto fingerprint/source).
     */
    async infraOutage() {
        printBanner('ESCENARIO: infra-outage — Nagios + Monolito detectan la misma caída');

        console.log(`\n${C.dim}  Contexto: db-primary cae. Nagios lo detecta vía ICMP.
  El monolito lo detecta vía health-check propio y encola su incidente.${C.reset}`);

        // Nagios: HOST DOWN
        const nagR = await nagiosAlert(
            'HOST DOWN db-primary',
            nagiosProblem({ host: 'db-primary', state: 'DOWN' }),
        );

        await sleep(200);

        // Monolito: incidente desde app-payments que perdió conexión
        const monR = await monolithQueue('incident', 'Incidente DB desde app-payments', monolithIncident({
            source:      'app-payments',
            severity:    'critical',
            priority:    1, impact: 1, urgency: 1,
            description: '[MONOLITH] app-payments perdió conexión con db-primary',
        }));

        await sleep(200);

        // Monolito: segundo incidente desde app-loans
        const monR2 = await monolithQueue('incident', 'Incidente DB desde app-loans', monolithIncident({
            source:      'app-loans',
            severity:    'critical',
            priority:    1, impact: 1, urgency: 1,
            description: '[MONOLITH] app-loans no puede conectar con db-primary',
        }));

        printSummary([
            { label: 'Nagios action',    value: nagR?.action ?? '?',                    color: C.orange },
            { label: 'Monolito #1',      value: monR?.internalNumber ?? monR?.correlationId ?? '?', color: C.blue },
            { label: 'Monolito #2',      value: monR2?.internalNumber ?? monR2?.correlationId ?? '?', color: C.blue },
            { label: 'Tickets creados',  value: '3 (Nagios + 2 monolito)',              color: C.green },
        ]);
    },

    /**
     * deploy-incident
     *
     * El monolito encola un change-request de deploy.
     * Durante el deploy, Nagios detecta degradación del servicio web.
     * Al finalizar el deploy, Nagios envía RECOVERY.
     */
    async deployIncident() {
        printBanner('ESCENARIO: deploy-incident — Deploy + degradación + recovery');

        console.log(`\n${C.dim}  Contexto: equipo de infra ejecuta deploy. Nagios detecta
  degradación transitoria. Al terminar el deploy, el servicio se recupera.${C.reset}`);

        // Monolito: change-request del deploy
        const cr = await monolithQueue('change-request', 'Change Request — deploy v3.2.1', monolithChangeRequest({
            source:      'deploy-pipeline',
            description: '[MONOLITH] Deploy api-payments v3.2.1 en producción',
            reason:      'Nueva versión con corrección de timeout en gateway',
        }));

        await sleep(400);
        printStep('Deploy en curso... Nagios detecta degradación de latencia');

        // Nagios: WARNING en el servicio HTTP del web01 (latencia alta)
        const nagW = await nagiosAlert(
            'WARNING web01/HTTP — latencia alta durante deploy',
            nagiosProblem({ host: 'web01', service: 'HTTP', state: 'WARNING' }),
        );

        await sleep(300);
        printStep('Deploy finalizado. Nagios confirma recovery');

        // Nagios: RECOVERY del servicio HTTP
        const nagRec = await nagiosAlert(
            'RECOVERY web01/HTTP — deploy completado',
            nagiosRecovery({ host: 'web01', service: 'HTTP' }),
        );

        printSummary([
            { label: 'Change Request',   value: cr?.internalNumber ?? '?',     color: C.blue },
            { label: 'Nagios WARNING',   value: nagW?.action ?? '?',           color: C.yellow },
            { label: 'Nagios RECOVERY',  value: nagRec?.action ?? '?',         color: C.green },
        ]);
    },

    /**
     * cascade-failure
     *
     * Fallo en cascada: cache cae → varios servicios del monolito se degradan.
     * Nagios genera múltiples alertas. El monolito envía un incidente por cada
     * sistema de negocio afectado.
     */
    async cascadeFailure() {
        printBanner('ESCENARIO: cascade-failure — Fallo en cascada cache → apps');

        console.log(`\n${C.dim}  Contexto: Redis cluster cae. Nagios alerta sobre cache.
  Monolito detecta que app-cards, app-transfers y app-auth pierden sesión.${C.reset}`);

        // Nagios: cache caído + servicios dependientes
        const nagios = [
            nagiosProblem({ host: 'cache01', service: 'Redis', state: 'CRITICAL' }),
            nagiosProblem({ host: 'cache02', service: 'Redis', state: 'CRITICAL' }),
        ];

        // Monolito: apps afectadas
        const apps = [
            { source: 'app-cards',     description: '[MONOLITH] app-cards perdió sesiones Redis' },
            { source: 'app-transfers', description: '[MONOLITH] app-transfers — timeout en cache' },
            { source: 'app-auth',      description: '[MONOLITH] app-auth no puede validar tokens (Redis caído)' },
        ];

        printStep('Nagios detecta los dos nodos de cache caídos (paralelo)');
        const nagResults = await Promise.all(
            nagios.map((p, i) => nagiosAlert(`CRITICAL cache0${i + 1}/Redis`, p))
        );

        await sleep(300);

        printStep('Monolito encola incidentes por cada app afectada');
        const monResults = [];
        for (const app of apps) {
            const r = await monolithQueue('incident', `Incidente desde ${app.source}`,
                monolithIncident({ ...app, severity: 'critical', priority: 1, impact: 1, urgency: 1 }));
            monResults.push({ source: app.source, r });
            await sleep(100);
        }

        printSummary([
            { label: 'Nagios alerts',    value: `${nagResults.filter(r => r?.action !== undefined).length}/2 procesadas`, color: C.orange },
            { label: 'Monolito tickets', value: `${monResults.length} encolados`,                                         color: C.blue },
            { label: 'Total en cola',    value: `${nagResults.length + monResults.length} tickets`,                        color: C.green },
        ]);
    },

    /**
     * full-lifecycle
     *
     * Ciclo de vida completo combinando ambos sistemas:
     *   1. Nagios envía PROBLEM → ticket QUEUED
     *   2. Monolito envía incidente relacionado → ticket QUEUED
     *   3. Se espera procesamiento (simula worker con poll)
     *   4. Nagios envía RECOVERY → ticket resuelto en SN
     *   5. Se consulta el estado final de ambos tickets
     */
    async fullLifecycle() {
        printBanner('ESCENARIO: full-lifecycle — Ciclo de vida completo');

        console.log(`\n${C.dim}  Contexto: servidor web01 cae. Ambos sistemas abren tickets.
  Luego el servidor se recupera y el ciclo se cierra.${C.reset}`);

        // 1. Nagios PROBLEM
        printStep('1. Nagios detecta HOST DOWN');
        const nagR = await nagiosAlert('PROBLEM web01 HOST DOWN',
            nagiosProblem({ host: 'web01', state: 'DOWN' }));

        await sleep(200);

        // 2. Monolito encola incidente
        printStep('2. Monolito encola incidente desde app-frontend');
        const monR = await monolithQueue('incident', 'Incidente desde app-frontend',
            monolithIncident({
                source:      'app-frontend',
                severity:    'critical',
                priority:    1, impact: 1, urgency: 1,
                description: '[MONOLITH] app-frontend no puede conectar con web01',
            }));

        await sleep(500);

        // 3. Poll del ticket del monolito (si tenemos correlationId)
        if (monR?.correlationId) {
            printStep('3. Consultando estado del ticket monolito (puede estar QUEUED o IN_PROGRESS)');
            await checkStatus(monR.correlationId, `Estado de ${monR.internalNumber}`);
        }

        await sleep(300);

        // 4. Nagios RECOVERY
        printStep('4. web01 se recupera — Nagios envía RECOVERY');
        const recR = await nagiosAlert('RECOVERY web01',
            nagiosRecovery({ host: 'web01' }));

        await sleep(200);

        // 5. Estado final del ticket Nagios (si quedó correlationId)
        if (nagR?.correlationId) {
            printStep('5. Estado final del ticket Nagios');
            await checkStatus(nagR.correlationId, `Estado de ${nagR.internalNumber}`);
        }

        printSummary([
            { label: 'Nagios PROBLEM',  value: `action=${nagR?.action ?? '?'}  ${nagR?.internalNumber ?? ''}`,  color: C.orange },
            { label: 'Monolito',        value: `${monR?.internalNumber ?? '?'}  status=${monR?.status ?? '?'}`,  color: C.blue },
            { label: 'RECOVERY',        value: `action=${recR?.action ?? '?'}`,                                  color: C.green },
        ]);
    },

    /**
     * parallel-storm
     *
     * Ambos sistemas envían peticiones en paralelo simultáneamente.
     * Prueba de resistencia: bulkhead, circuit breaker, cola de prioridad.
     */
    async parallelStorm() {
        printBanner('ESCENARIO: parallel-storm — Tormenta de peticiones simultáneas');

        console.log(`\n${C.dim}  Contexto: simulación de tormenta. Nagios lanza 4 alertas y
  el monolito envía 4 incidentes, todo en paralelo.${C.reset}`);

        const nagiosAlerts = [
            { host: 'web01',  service: 'HTTP',  state: 'CRITICAL' },
            { host: 'web02',  service: 'HTTPS', state: 'CRITICAL' },
            { host: 'db01',   state: 'DOWN' },
            { host: 'lb01',   service: 'LB',   state: 'WARNING' },
        ];

        const monolithIncidents = [
            { source: 'app-payments',  description: '[MONOLITH] app-payments degradado' },
            { source: 'app-loans',     description: '[MONOLITH] app-loans sin respuesta' },
            { source: 'app-cards',     description: '[MONOLITH] app-cards timeout' },
            { source: 'app-core',      description: '[MONOLITH] app-core error 503' },
        ];

        printStep('Enviando todo en paralelo...');

        const [nagResults, monResults] = await Promise.all([
            Promise.allSettled(
                nagiosAlerts.map(a =>
                    post('/monitoring/alerts', nagiosProblem(a))
                        .then(r => { printSection('nagios', `${a.state} ${a.host}/${a.service ?? 'HOST'}`); return printRes(r); })
                )
            ),
            Promise.allSettled(
                monolithIncidents.map(i =>
                    post('/snow-requests/incidents', monolithIncident({ ...i, severity: 'critical', priority: 1, impact: 1, urgency: 1 }))
                        .then(r => { printSection('monolito', i.description); return printRes(r, 'ACCEPTED'); })
                )
            ),
        ]);

        const nagOk  = nagResults.filter(r => r.status === 'fulfilled').length;
        const monOk  = monResults.filter(r => r.status === 'fulfilled').length;

        printSummary([
            { label: 'Nagios enviadas',   value: `${nagOk}/${nagiosAlerts.length}`,       color: C.orange },
            { label: 'Monolito enviados', value: `${monOk}/${monolithIncidents.length}`,  color: C.blue },
            { label: 'Total',             value: `${nagOk + monOk} peticiones aceptadas`, color: C.green },
        ]);
    },

    /**
     * dedup-cross
     *
     * Nagios y monolito generan alertas para el mismo host/servicio.
     * Nagios usa fingerprint propio (host+service). Monolito usa fingerprint
     * basado en payload.id (si no tiene id, no deduplicará).
     * El escenario verifica que cada sistema mantiene su propia deduplicación.
     */
    async dedupCross() {
        printBanner('ESCENARIO: dedup-cross — Deduplicación independiente por sistema');

        console.log(`\n${C.dim}  Contexto: web01/HTTP cae. Nagios envía la alerta 3 veces
  (re-notificaciones). Monolito también envía su incidente 2 veces.
  Nagios deduplica por fingerprint. Monolito deduplica si incluye payload.id.${C.reset}`);

        printStep('Nagios: 3 notificaciones del mismo PROBLEM (deben deduplicarse)');
        for (let i = 1; i <= 3; i++) {
            await nagiosAlert(`PROBLEM intento ${i}/3 — web01/HTTP`,
                nagiosProblem({ host: 'web01', service: 'HTTP', state: 'CRITICAL' }));
            await sleep(100);
        }

        await sleep(200);
        printStep('Monolito: 2 veces el mismo incidente SIN id en payload (no deduplicará)');
        for (let i = 1; i <= 2; i++) {
            await monolithQueue('incident', `Incidente ${i}/2 sin id — app-frontend`,
                monolithIncident({ source: 'app-frontend', description: '[MONOLITH] web01 sin respuesta' }));
            await sleep(100);
        }

        await sleep(200);
        printStep('Monolito: 2 veces el mismo incidente CON id en payload (deduplicará en el 2do)');
        const payloadConId = {
            severity: 'high', impact: 2, urgency: 2, priority: 2,
            source: 'app-backend',
            payload: {
                short_description: '[MONOLITH] web01 — timeout detectado por app-backend',
                description:       'Detectado por health-check interno',
                id:                'ALERT-WEB01-HTTP-001',   // ← campo de identidad para fingerprint
            },
        };
        for (let i = 1; i <= 2; i++) {
            printSection('monolito', `Incidente ${i}/2 CON id — app-backend`);
            printReq('POST', '/snow-requests/incidents', payloadConId);
            const res = await post('/snow-requests/incidents', payloadConId);
            printRes(res, 'ACCEPTED');
            await sleep(100);
        }

        printSummary([
            { label: 'Nagios',           value: '3 envíos → 1 ticket (deduplicado)',        color: C.orange },
            { label: 'Monolito sin id',  value: '2 envíos → 2 tickets (sin dedup)',          color: C.yellow },
            { label: 'Monolito con id',  value: '2 envíos → 1 ticket (deduplicado por id)',  color: C.blue },
        ]);
    },

    /**
     * dlq-recovery
     *
     * Monolito encola varios incidentes. Algunos quedan FAILED (ej: SN caído).
     * Se usa retry-all para reencolarlos. Luego Nagios envía un recovery
     * que cancela una alerta que nunca llegó a SN.
     */
    async dlqRecovery() {
        printBanner('ESCENARIO: dlq-recovery — DLQ + retry-all + Nagios recovery');

        console.log(`\n${C.dim}  Contexto: se asume que la DLQ tiene registros FAILED previos.
  Se reencola todo, y Nagios envía un recovery de una alerta activa.${C.reset}`);

        // Nagios: problema activo
        printStep('1. Nagios alerta PROBLEM sobre api-gateway');
        const nagR = await nagiosAlert('PROBLEM api-gateway/HTTP',
            nagiosProblem({ host: 'api-gateway', service: 'HTTP', state: 'CRITICAL' }));

        await sleep(300);

        // Monolito: encola incidente relacionado
        printStep('2. Monolito encola incidente desde app-core');
        await monolithQueue('incident', 'Incidente app-core',
            monolithIncident({ source: 'app-core', description: '[MONOLITH] api-gateway no responde' }));

        await sleep(300);

        // Retry-all de la DLQ (si hay registros FAILED de pruebas previas)
        printStep('3. Retry-all DLQ — reencola todos los FAILED');
        await retryAll('Reencolar DLQ completa');

        await sleep(500);

        // Nagios recovery
        printStep('4. api-gateway recuperado — Nagios envía RECOVERY');
        const recR = await nagiosAlert('RECOVERY api-gateway/HTTP',
            nagiosRecovery({ host: 'api-gateway', service: 'HTTP' }));

        printSummary([
            { label: 'Nagios PROBLEM',  value: `action=${nagR?.action ?? '?'}`,   color: C.orange },
            { label: 'RECOVERY',        value: `action=${recR?.action ?? '?'}`,    color: C.green },
        ]);
    },
};

// ─── Metadatos de escenarios ──────────────────────────────────────────────────
const SCENARIO_INFO = {
    'infra-outage':    'Nagios HOST DOWN + monolito encola incidentes desde apps afectadas',
    'deploy-incident': 'Monolito change-request → Nagios WARNING durante deploy → RECOVERY',
    'cascade-failure': 'Redis cae → Nagios alerta × 2 + monolito × 3 apps afectadas',
    'full-lifecycle':  'Ciclo completo: PROBLEM → encolado → RECOVERY → RESOLVED',
    'parallel-storm':  'Tormenta paralela: Nagios × 4 + monolito × 4 simultáneos',
    'dedup-cross':     'Deduplicación independiente: Nagios (fingerprint) vs monolito (payload.id)',
    'dlq-recovery':    'DLQ retry-all + Nagios recovery sobre alerta activa',
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
    const [,, command, ...rest] = process.argv;
    const args = parseArgs(rest);

    console.log(`\n${C.bold}${C.cyan}combined-simulator → ${BASE_URL}${C.reset}`);

    if (!command || command === 'help') {
        console.log(`
Uso: node combined-simulator.js <comando> [opciones]

Comandos:
  scenario  --name <nombre>     Ejecuta un escenario combinado
  list                          Lista todos los escenarios disponibles

Escenarios:
${Object.entries(SCENARIO_INFO).map(([k, v]) => `  ${k.padEnd(18)} ${v}`).join('\n')}

Env:
  SNOWQ_URL   URL base (default: http://localhost:3090)
`);
        return;
    }

    if (command === 'list') {
        console.log(`\n${C.bold}  Escenarios disponibles:${C.reset}\n`);
        for (const [name, desc] of Object.entries(SCENARIO_INFO)) {
            console.log(`  ${C.cyan}${C.bold}${name.padEnd(18)}${C.reset}  ${desc}`);
        }
        console.log('');
        return;
    }

    if (command === 'scenario') {
        const name = args.name;
        if (!name) { console.error(`${C.red}--name requerido${C.reset}`); process.exit(1); }

        const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const fn  = SCENARIOS[key];
        if (!fn) {
            console.error(`${C.red}Escenario desconocido: ${name}${C.reset}`);
            console.error(`Disponibles: ${Object.keys(SCENARIO_INFO).join(', ')}`);
            process.exit(1);
        }

        await fn();
        console.log(`\n${C.dim}${'─'.repeat(66)}${C.reset}\n`);
        return;
    }

    console.error(`${C.red}Comando desconocido: ${command}${C.reset}`);
    process.exit(1);
}

main().catch(err => {
    console.error(`${C.red}Error: ${err.message}${C.reset}`);
    process.exit(1);
});
