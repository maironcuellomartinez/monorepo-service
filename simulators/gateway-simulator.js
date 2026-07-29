#!/usr/bin/env node
/**
 * gateway-simulator.js
 *
 * Simula el flujo completo de creación de incidencias a través del api-gateway:
 *   1. Login  → JWT
 *   2. Descubre corners e issue-types disponibles (o usa los indicados)
 *   3. Consulta disponibilidad de slots para la fecha pedida
 *   4. Crea incidencias reales con datos válidos
 *
 * Uso:
 *   node gateway-simulator.js incidents --email <e> --password <p> --customer-id <uuid>
 *   node gateway-simulator.js incidents --email <e> --password <p> --customer-id <uuid> --count 5
 *   node gateway-simulator.js incidents --email <e> --password <p> --customer-id <uuid> --count 3 --parallel
 *
 * Opciones:
 *   --email           Email para login  (requerido)
 *   --password        Contraseña        (requerido)
 *   --customer-id     UUID del cliente  (requerido)
 *   --count           Cantidad de incidencias a crear   (default: 1)
 *   --date            Fecha YYYY-MM-DD                  (default: hoy)
 *   --duration        Duración del turno en minutos     (default: 60)
 *   --corner-id       UUID del corner  (auto-descubre el primero si se omite)
 *   --issue-type-id   UUID del issue type (auto-descubre el primero si se omite)
 *   --parallel        Crear todas en paralelo           (default: secuencial)
 *
 * Env:
 *   GATEWAY_URL   URL base del api-gateway  (default: http://localhost:3000)
 */

const http = require('http');

const BASE_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url  = new URL(BASE_URL + path);
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: url.hostname,
            port:     url.port || 80,
            path:     url.pathname + (url.search || ''),
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        };
        const req = http.request(opts, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                const correlationId = res.headers['x-correlation-id'] ?? null;
                try   { resolve({ status: res.statusCode, body: JSON.parse(raw), correlationId }); }
                catch { resolve({ status: res.statusCode, body: raw, correlationId }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function get(path, token, params = {}) {
    const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
    return request('GET', qs ? `${path}?${qs}` : path, null, token);
}

function post(path, body, token) { return request('POST',  path, body, token); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Colors ───────────────────────────────────────────────────────────────────

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

function printHeader(title) {
    console.log(`\n${C.bold}${C.cyan}${'─'.repeat(64)}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  ${title}${C.reset}`);
    console.log(`${C.bold}${C.cyan}${'─'.repeat(64)}${C.reset}`);
}

function ok(label, value)   { console.log(`${C.green}  ✓ ${label}${C.reset}${value !== undefined ? `: ${C.white}${value}${C.reset}` : ''}`); }
function fail(label, detail){ console.log(`${C.red}  ✗ ${label}${C.reset}${detail ? `: ${detail}` : ''}`); }
function info(label, value) { console.log(`${C.gray}    ${label}: ${value}${C.reset}`); }

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function login(email, password, devOid) {
    // Modo dev (sin Azure real): POST /api/auth/dev/login — solo funciona con NODE_ENV=development
    if (devOid) {
        const res = await post('/api/auth/dev/login', { email, oid: devOid });
        if (res.status !== 200 || !res.body?.accessToken) {
            throw new Error(
                `Dev login fallido [${res.status}]: ${JSON.stringify(res.body)}\n` +
                '  Verifica que api-gateway y abac-microservice estén corriendo con NODE_ENV=development.'
            );
        }
        ok('Login (dev/sin Azure)', email);
        info('oid', devOid);
        info('userId', res.body.userId ?? '?');
        return res.body.accessToken;
    }

    // Modo producción: el usuario aporta un Bearer de Azure AD directamente
    if (password) {
        throw new Error(
            'El login por email/password no está disponible.\n' +
            '  En dev usa --dev-oid <oid>  →  POST /api/auth/dev/login\n' +
            '  En prod pasa el Bearer de Azure AD con --token <jwt>'
        );
    }

    throw new Error('--dev-oid o --token es requerido');
}

// ─── Discovery ────────────────────────────────────────────────────────────────

function extractId(obj) {
    // Soporta { id } directo o { props: { id } } (domain entities sin toJSON)
    return obj?.id ?? obj?.props?.id ?? obj?.cornerId ?? obj?.props?.cornerId;
}

function extractName(obj) {
    return obj?.name ?? obj?.props?.name;
}

async function discoverCorner(token, cornerId) {
    if (cornerId) {
        info('Corner (provisto)', cornerId);
        return cornerId;
    }
    const res = await get('/api/corners', token);
    if (res.status !== 200) throw new Error(`No se pudo listar corners [${res.status}]: ${JSON.stringify(res.body)}`);
    const corners = Array.isArray(res.body) ? res.body : (res.body?.data ?? []);
    if (corners.length === 0) throw new Error('No hay corners en el sistema. Creá uno antes de simular.');
    const corner = corners[0];
    const id = extractId(corner);
    const name = extractName(corner);
    ok('Corner auto-descubierto', `${name ?? id}  (${id})`);
    return id;
}

async function discoverIssueType(token, issueTypeId) {
    if (issueTypeId) {
        info('IssueType (provisto)', issueTypeId);
        return issueTypeId;
    }
    const res = await get('/api/admin/issue-types', token);
    if (res.status !== 200) throw new Error(`No se pudo listar issue-types [${res.status}]: ${JSON.stringify(res.body)}`);
    const types = Array.isArray(res.body) ? res.body : (res.body?.data ?? []);
    if (types.length === 0) throw new Error('No hay issue-types en el sistema. Creá uno antes de simular.');
    const first = types[0];
    const id = extractId(first) ?? first?.issueTypeId ?? first?.props?.issueTypeId;
    const name = extractName(first);
    ok('IssueType auto-descubierto', `${name ?? id}  (${id})`);
    return id;
}

async function discoverAvailableSlots(token, cornerId, date, duration) {
    const res = await get(`/api/availability/${cornerId}`, token, { date, duration: String(duration) });
    if (res.status !== 200) {
        throw new Error(`Availability falló [${res.status}]: ${JSON.stringify(res.body)}`);
    }
    const windows = Array.isArray(res.body) ? res.body : (res.body?.data ?? []);
    const available = windows.filter(w => w.available && w.slotIds?.length > 0);
    if (available.length === 0) {
        throw new Error(
            `No hay ventanas disponibles para el ${date} (duración ${duration}min en corner ${cornerId}).\n` +
            `  Total ventanas: ${windows.length}  disponibles con slotIds: ${available.length}\n` +
            `  Primera ventana: ${JSON.stringify(windows[0] ?? 'ninguna')}`
        );
    }
    ok('Ventanas disponibles', available.length);
    return available;
}

// ─── Create Incident ──────────────────────────────────────────────────────────

async function createIncident(token, { cornerId, issueTypeId, customerId, window, origin, serialNumber }) {
    const dto = {
        cornerId,
        issueTypeId,
        customerId,
        slotIds:   window.slotIds,
        startTime: window.startTime,
        endTime:   window.endTime,
        origin:    origin ?? 'gateway-simulator',
        ...(serialNumber ? { device: { serialNumber } } : {}),
    };
    return post('/api/incidents', dto, token);
}

// ─── Create Request ───────────────────────────────────────────────────────────

async function createRequest(token, { cornerId, issueTypeId, customerId, technicianId, companyId, window, notes, serialNumber }) {
    const dto = {
        cornerId,
        issueTypeId,
        customerId,
        technicianId,
        companyId,
        scheduledAt: window.startTime,
        notes,
        device: { serialNumber: serialNumber ?? 'SIM-0000000' },
    };
    return post('/api/requests', dto, token);
}

// ─── Command: requests ────────────────────────────────────────────────────────
// Cubre el camino de citas kind=REQUEST — hasta el remodelado de dominio
// Appointment, este comando no existía (solo `incidents` estaba simulado) y
// era el único camino que ganaba comportamiento nuevo real (reserva de slot,
// sync-back) sin ninguna cobertura de simulador.

async function cmdRequests(args) {
    const email        = requireArg(args, 'email');
    const customerId   = requireArg(args, 'customer-id');
    const technicianId = requireArg(args, 'technician-id');
    const companyId    = requireArg(args, 'company-id');
    const devOid       = args['dev-oid'] ?? null;
    const bearerToken  = args['token'] ?? null;
    const count        = parseInt(args.count    ?? '1');
    const date         = args.date              ?? new Date().toISOString().substring(0, 10);
    const duration     = parseInt(args.duration ?? '30');
    const parallel     = !!args.parallel;
    const serialNumber = args['serial-number']  ?? null;
    const notes        = args.notes ?? 'Solicitud creada por gateway-simulator';

    printHeader(`REQUESTS via api-gateway — count=${count}  date=${date}  parallel=${parallel}`);

    const token = bearerToken ?? await login(email, null, devOid);

    const cornerId    = await discoverCorner(token, args['corner-id']);
    const issueTypeId = await discoverIssueType(token, args['issue-type-id']);
    const windows     = await discoverAvailableSlots(token, cornerId, date, duration);

    console.log('');

    const results = { ok: 0, error: 0 };
    const createdIds = [];

    const doCreate = async (i) => {
        const window = windows[i % windows.length];
        const res = await createRequest(token, { cornerId, issueTypeId, customerId, technicianId, companyId, window, notes, serialNumber });

        if (res.status === 201) {
            const b = res.body;
            ok(`Solicitud #${i + 1}`, b?.id ?? '?');
            info('status', b?.status ?? '?');
            info('scheduledAt', window.startTime);
            if (res.correlationId) {
                console.log(`${C.bold}${C.magenta}    correlationId: ${res.correlationId}${C.reset}  ← usar para buscar en observability-dashboard`);
            }
            results.ok++;
            if (b?.id) createdIds.push(b.id);
        } else {
            fail(`Solicitud #${i + 1}`, `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
            results.error++;
        }
    };

    if (parallel) {
        await Promise.allSettled(Array.from({ length: count }, (_, i) => doCreate(i)));
    } else {
        for (let i = 0; i < count; i++) {
            await doCreate(i);
            if (i < count - 1) await sleep(200);
        }
    }

    console.log(
        `\n${C.bold}  Resultado — ` +
        `${C.green}ok=${results.ok}${C.reset}${C.bold}  ` +
        `${results.error > 0 ? C.red : C.dim}error=${results.error}${C.reset}`
    );

    if (createdIds.length > 0) {
        console.log(`\n${C.gray}  IDs creados:${C.reset}`);
        createdIds.forEach(id => console.log(`${C.gray}    ${id}${C.reset}`));
    }
}

// ─── Command: incidents ───────────────────────────────────────────────────────

async function cmdIncidents(args) {
    const email      = requireArg(args, 'email');
    const customerId = requireArg(args, 'customer-id');
    const devOid     = args['dev-oid'] ?? null;
    const bearerToken = args['token'] ?? null;
    const password   = null; // login por password eliminado — usar --dev-oid o --token
    const count        = parseInt(args.count    ?? '1');
    const date         = args.date              ?? new Date().toISOString().substring(0, 10);
    const duration     = parseInt(args.duration ?? '60');
    const parallel     = !!args.parallel;
    const serialNumber = args['serial-number']  ?? null;

    printHeader(`INCIDENTS via api-gateway — count=${count}  date=${date}  parallel=${parallel}`);

    // 1. Auth
    const token = bearerToken ?? await login(email, password, devOid);

    // 2. Discover
    const cornerId    = await discoverCorner(token, args['corner-id']);
    const issueTypeId = await discoverIssueType(token, args['issue-type-id']);
    const windows     = await discoverAvailableSlots(token, cornerId, date, duration);

    console.log('');

    // 3. Create
    const results = { ok: 0, error: 0 };
    const createdIds = [];

    const doCreate = async (i) => {
        // Round-robin sobre ventanas disponibles
        const window = windows[i % windows.length];
        const res    = await createIncident(token, { cornerId, issueTypeId, customerId, window, origin: 'gateway-simulator', serialNumber });

        if (res.status === 201) {
            const b = res.body;
            ok(`Incidencia #${i + 1}`, b?.id ?? '?');
            info('status',    b?.status ?? '?');
            info('start',     window.startTime);
            info('end',       window.endTime);
            info('slots',     window.slotIds?.length ?? 0);
            if (res.correlationId) {
                console.log(`${C.bold}${C.magenta}    correlationId: ${res.correlationId}${C.reset}  ← usar para buscar en observability-dashboard`);
            }
            results.ok++;
            if (b?.id) createdIds.push(b.id);
        } else {
            fail(`Incidencia #${i + 1}`, `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
            results.error++;
        }
    };

    if (parallel) {
        await Promise.allSettled(Array.from({ length: count }, (_, i) => doCreate(i)));
    } else {
        for (let i = 0; i < count; i++) {
            await doCreate(i);
            if (i < count - 1) await sleep(200);
        }
    }

    console.log(
        `\n${C.bold}  Resultado — ` +
        `${C.green}ok=${results.ok}${C.reset}${C.bold}  ` +
        `${results.error > 0 ? C.red : C.dim}error=${results.error}${C.reset}`
    );

    if (createdIds.length > 0) {
        console.log(`\n${C.gray}  IDs creados:${C.reset}`);
        createdIds.forEach(id => console.log(`${C.gray}    ${id}${C.reset}`));
    }
}

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
        console.error(`${C.red}Error: --${name} es requerido${C.reset}`);
        process.exit(1);
    }
    return args[name];
}

async function main() {
    const [,, command, ...rest] = process.argv;
    const args = parseArgs(rest);

    console.log(`\n${C.bold}${C.cyan}gateway-simulator → ${BASE_URL}${C.reset}`);

    if (!command || command === 'help') {
        console.log(`
Uso: node gateway-simulator.js <comando> [opciones]

Comandos:
  incidents   Crea incidencias reales a través del api-gateway (login + discovery + create)
  requests    Crea solicitudes reales a través del api-gateway (login + discovery + create)

Opciones de requests (además de --email/--dev-oid/--token/--customer-id):
  --technician-id   UUID del técnico creador                        (requerido)
  --company-id      UUID de la empresa del cliente                  (requerido)
  --notes           Notas de la solicitud (opcional)
  --duration        Duración en minutos              (default: 30)

Opciones de incidents:
  --email           Email del usuario                             (requerido)
  --dev-oid         OID simulado (dev sin Azure) — llama POST /api/auth/dev/login
  --token           Bearer JWT de Azure AD (prod) — se usa directamente, sin login
  --customer-id     UUID del usuario/cliente (monolithUserId)     (requerido)
  --count           Cantidad de incidencias a crear  (default: 1)
  --date            Fecha YYYY-MM-DD                 (default: hoy)
  --duration        Duración en minutos              (default: 60)
  --corner-id       UUID del corner  (auto-descubre el primero si se omite)
  --issue-type-id   UUID del issue type (auto-descubre el primero si se omite)
  --serial-number   Número de serie del dispositivo  (opcional)
  --parallel        Envío en paralelo                (default: secuencial)

Env:
  GATEWAY_URL   URL del api-gateway  (default: http://localhost:3000)

Ejemplos (dev sin Azure — requiere NODE_ENV=development en gateway y abac):
  node gateway-simulator.js incidents --email user@eventcorner.com --dev-oid dev-user-001 --customer-id <uuid>
  node gateway-simulator.js incidents --email user@eventcorner.com --dev-oid dev-user-001 --customer-id <uuid> --count 3

Ejemplos (prod/staging — pasar el Bearer de Azure AD):
  node gateway-simulator.js incidents --email admin@test.com --token <azure-jwt> --customer-id <uuid>
  node gateway-simulator.js incidents --email admin@test.com --token <azure-jwt> --customer-id <uuid> --count 5 --parallel

Nota: obtén el customer-id con GET /api/auth/me tras el login (campo monolithUserId).
`);
        return;
    }

    switch (command) {
        case 'incidents':
            await cmdIncidents(args);
            break;
        case 'requests':
            await cmdRequests(args);
            break;
        default:
            console.error(`${C.red}Comando desconocido: ${command}${C.reset}`);
            process.exit(1);
    }
}

main().catch(err => {
    console.error(`\n${C.red}Error fatal: ${err.message}${C.reset}`);
    process.exit(1);
});
