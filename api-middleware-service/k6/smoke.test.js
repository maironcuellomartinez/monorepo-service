/**
 * Smoke test — 1 VU, 1 iteración.
 * Verifica que el flujo OAuth completo funciona correctamente.
 *
 * Uso:
 *   k6 run -e K6_CLIENT_ID=mc_xxx -e K6_CLIENT_SECRET=yyy k6/smoke.test.js
 */
import { check, group } from 'k6';
import http from 'k6/http';
import { getPing, postToken, postRefresh, getRequests } from './helpers/auth.js';

// 401 = reuse attack (esperado). 426 = gateway upstream exige HTTPS (infra, no auth).
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 401, 426));

export const options = {
  vus:        1,
  iterations: 1,
  thresholds: {
    checks:             ['rate==1.0'],  // todos los checks deben pasar
    http_req_failed:    ['rate==0'],
    http_req_duration:  ['p(95)<2000'],
  },
};

export default function () {
  // ── 1. Health ──────────────────────────────────────────────────────────────
  group('health', () => {
    const res = getPing();
    check(res, {
      'ping → 200':          (r) => r.status === 200,
      'ping → status ok':    (r) => r.json('status') === 'ok',
      'ping → tiene uptime': (r) => r.json('uptime') >= 0,
    });
  });

  // ── 2. OAuth token ─────────────────────────────────────────────────────────
  let accessToken, refreshToken;
  group('oauth/token', () => {
    const res = postToken();
    check(res, {
      'token → 201 o 200':        (r) => r.status === 200 || r.status === 201,
      'token → tiene access_token':  (r) => !!r.json('access_token'),
      'token → tiene refresh_token': (r) => !!r.json('refresh_token'),
      'token → tipo Bearer':         (r) => r.json('token_type') === 'Bearer',
      'token → expires_in > 0':      (r) => r.json('expires_in') > 0,
    });
    accessToken  = res.json('access_token');
    refreshToken = res.json('refresh_token');
  });

  if (!accessToken) return;

  // ── 3. Records con token ───────────────────────────────────────────────────
  group('v1/requests', () => {
    const res = getRequests(accessToken);
    check(res, {
      // 200=ok, 503=circuit-breaker, 426=gateway upstream exige HTTPS (infra, no auth)
      'records → no es 401':  (r) => r.status !== 401,
      'records → no es 500':  (r) => r.status !== 500,
      'records → token válido': (r) => [200, 503, 426, 502, 504].includes(r.status),
    });
  });

  // ── 4. Refresh token ───────────────────────────────────────────────────────
  group('oauth/refresh', () => {
    const res = postRefresh(refreshToken);
    check(res, {
      'refresh → 200 o 201':          (r) => r.status === 200 || r.status === 201,
      'refresh → nuevo access_token':  (r) => !!r.json('access_token'),
      'refresh → nuevo refresh_token': (r) => !!r.json('refresh_token'),
      'refresh → token distinto':      (r) => r.json('access_token') !== accessToken,
    });
  });

  // ── 5. Reuse attack: usar el refresh viejo debe dar 401 ───────────────────
  group('reuse-attack', () => {
    const res = postRefresh(refreshToken);  // token ya revocado
    check(res, {
      'reuse → 401': (r) => r.status === 401,
    });
  });
}
