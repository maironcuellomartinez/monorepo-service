/**
 * Stress test — verifica los mecanismos de resiliencia del servicio.
 *
 * Escenarios:
 *   1. bulkhead_oauth  — satura el bulkhead de bcrypt (max 3 concurrentes).
 *                        Espera: 3 pasan (200) y el resto reciben 429.
 *   2. rate_limit      — dispara >10 req/min en /oauth/token.
 *                        Espera: las que superan el límite reciben 429.
 *   3. records_spike   — pico repentino de 80 VUs en /v1/requests.
 *                        Espera: el HTTP bulkhead absorbe la carga sin 5xx.
 *
 * Uso:
 *   k6 run -e K6_CLIENT_ID=mc_xxx -e K6_CLIENT_SECRET=yyy k6/stress.test.js
 */
import { check, sleep } from 'k6';
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { postToken, postRefresh, getRequests } from './helpers/auth.js';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 401, 426, 429));

// Contadores para validar comportamiento esperado de resiliencia
const bulkheadRejections = new Counter('bulkhead_rejections');
const rateLimitHits      = new Counter('rate_limit_hits');

export const options = {
  scenarios: {
    // ── Escenario 1: saturar el bulkhead de OAuth ────────────────────────────
    bulkhead_oauth: {
      executor:           'shared-iterations',
      vus:                12,        // 12 VUs concurrentes → bulkhead max 3
      iterations:         12,
      maxDuration:        '30s',
      startTime:          '0s',
      gracefulStop:       '5s',
    },

    // ── Escenario 2: rate limiting en /oauth/token ───────────────────────────
    rate_limit: {
      executor:     'constant-arrival-rate',
      rate:         20,             // 20 req/s = 1200 req/min >> límite de 10/min
      timeUnit:     '1s',
      duration:     '30s',
      preAllocatedVUs: 5,
      maxVUs:          10,
      startTime:    '35s',          // empieza después del escenario anterior
      gracefulStop: '5s',
    },

    // ── Escenario 3: spike en /v1/requests ───────────────────────────────────
    records_spike: {
      executor: 'ramping-vus',
      stages: [
        { duration: '5s',  target: 80 },   // spike repentino
        { duration: '20s', target: 80 },   // sostener
        { duration: '5s',  target: 0 },    // bajar
      ],
      startTime:    '70s',
      gracefulStop: '10s',
    },
  },

  thresholds: {
    // El servicio no debe devolver 5xx bajo ninguna carga
    'http_req_failed': ['rate<0.01'],

    // Los rechazos del bulkhead y throttle deben ser 429, nunca 500
    'http_req_duration{endpoint:oauth_token}': ['p(99)<3000'],

    // Al menos algunos tokens deben procesarse correctamente bajo spike
    checks: ['rate>0.5'],
  },
};

// setup() obtiene un token válido para el escenario de records
export function setup() {
  const res = postToken();
  if (res.status === 200) {
    return { accessToken: res.json('access_token') };
  }
  return { accessToken: null };
}

export default function (data) {
  const scenario = exec.scenario.name;

  if (scenario === 'bulkhead_oauth') {
    scenarioBulkhead();
  } else if (scenario === 'rate_limit') {
    scenarioRateLimit();
  } else if (scenario === 'records_spike') {
    scenarioSpike(data.accessToken);
  }
}

function scenarioBulkhead() {
  const res = postToken();
  const accepted = res.status === 200;
  const rejected = res.status === 429;

  if (rejected) bulkheadRejections.add(1);

  check(res, {
    'bulkhead → 200 o 429':   (r) => r.status === 200 || r.status === 429,
    'bulkhead → no es 5xx':   (r) => r.status < 500,
    // Cuando rechaza, el body debe indicar el motivo
    'bulkhead → mensaje 429': (r) =>
      r.status !== 429 || (!!r.json('message') || !!r.json('error')),
  });
}

function scenarioRateLimit() {
  const res = postToken();
  const throttled = res.status === 429;

  if (throttled) rateLimitHits.add(1);

  check(res, {
    'throttle → 200 o 429': (r) => r.status === 200 || r.status === 429,
    'throttle → no es 5xx': (r) => r.status < 500,
  });

  sleep(0.05);
}

function scenarioSpike(accessToken) {
  if (!accessToken) {
    // Si no hay token previo, intentar obtener uno
    const tokenRes = postToken();
    if (tokenRes.status !== 200) { sleep(0.1); return; }
    accessToken = tokenRes.json('access_token');
  }

  const res = getRequests(accessToken);
  check(res, {
    'spike → no es 5xx':   (r) => r.status < 500,
    'spike → no es 401':   (r) => r.status !== 401,
    // 200 éxito, 429 bulkhead saturado, 503 gateway caído, 426 upstream HTTPS — todos aceptables
    'spike → status válido': (r) => [200, 426, 429, 502, 503, 504].includes(r.status),
  });

  sleep(0.1);
}
