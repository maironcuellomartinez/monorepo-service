/**
 * Load test — carga sostenida en el endpoint de records.
 *
 * Modelo de uso real:
 *   - Cada VU se autentica UNA sola vez al inicio (los clientes cachean el token 1h-7d).
 *   - El token no expira durante el test (duración << vida del token).
 *   - La carga es exclusivamente sobre GET /v1/requests con token vigente.
 *   - El refresh y la rotación se validan en el smoke test, no aquí.
 *
 * Uso:
 *   npm run k6:load
 *   k6 run -e TARGET_VUS=20 -e DURATION=5m k6/load.test.js
 */
import { check, sleep } from 'k6';
import http from 'k6/http';
import { postToken, getRequests } from './helpers/auth.js';

// 426 = gateway upstream exige HTTPS. 429 = bulkhead en token (solo en auth inicial).
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 426, 429));

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '10');
const DURATION   = __ENV.DURATION || '3m';

export const options = {
  stages: [
    { duration: '30s', target: TARGET_VUS },    // ramp-up
    { duration: DURATION, target: TARGET_VUS }, // carga sostenida
    { duration: '20s', target: 0 },             // ramp-down
  ],
  thresholds: {
    'http_req_duration{endpoint:oauth_token}':  ['p(95)<1500'],
    'http_req_duration{endpoint:records_list}': ['p(95)<2000'],
    'http_req_failed': ['rate<0.01'],
    'checks':          ['rate>0.95'],
  },
};

// Estado por VU — persiste entre iteraciones del mismo VU
let vToken = null;

export default function () {
  // ── Autenticación inicial (sólo primera iteración por VU) ────────────────
  if (!vToken) {
    const res = postToken();
    check(res, {
      'auth → token obtenido': (r) => r.status === 200 || r.status === 201,
      'auth → no es 5xx':      (r) => r.status < 500,
    });
    if (res.status !== 200 && res.status !== 201) {
      sleep(1 + Math.random() * 2);  // jitter para no volver a colapsar el bulkhead
      return;
    }
    vToken = res.json('access_token');
  }

  // ── Carga principal: records ─────────────────────────────────────────────
  const recordsRes = getRequests(vToken);
  check(recordsRes, {
    'records → no es 5xx': (r) => r.status < 500,
    'records → no es 401': (r) => r.status !== 401,
  });

  sleep(0.5);
}
