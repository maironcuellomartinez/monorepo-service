import http from 'k6/http';
import encoding from 'k6/encoding';
import { K6_CLIENT_ID, K6_CLIENT_SECRET, BASE_URL as ENV_BASE_URL } from '../env.js';

// Prioridad: env.js → variable de shell (-e flag o entorno)
export const BASE_URL      = ENV_BASE_URL || __ENV.BASE_URL || 'http://localhost:3007';
export const CLIENT_ID     = K6_CLIENT_ID     || __ENV.K6_CLIENT_ID     || '';
export const CLIENT_SECRET = K6_CLIENT_SECRET || __ENV.K6_CLIENT_SECRET || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error(
    '\n\nFaltan credenciales. Completá k6/env.js con los valores de tu cliente de prueba.\n' +
    'Copiá k6/env.example.js → k6/env.js y completá K6_CLIENT_ID y K6_CLIENT_SECRET.\n',
  )
}

/**
 * POST /oauth/token — client_credentials flow.
 * @param {string} [scope] - scopes separados por espacios (opcional)
 */
export function postToken(scope) {
  const credentials = encoding.b64encode(`${CLIENT_ID}:${CLIENT_SECRET}`);
  let body = 'grant_type=client_credentials';
  if (scope) body += `&scope=${encodeURIComponent(scope)}`;

  return http.post(`${BASE_URL}/oauth/token`, body, {
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    tags: { endpoint: 'oauth_token' },
  });
}

/**
 * POST /oauth/refresh — rotación de tokens.
 * @param {string} refreshToken
 */
export function postRefresh(refreshToken) {
  return http.post(
    `${BASE_URL}/oauth/refresh`,
    JSON.stringify({ refresh_token: refreshToken }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'oauth_refresh' },
    },
  );
}

/**
 * GET /v1/requests con Bearer token.
 * @param {string} accessToken
 * @param {object} [params]
 */
export function getRequests(accessToken, params) {
  return http.get(`${BASE_URL}/v1/requests`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params,
    tags: { endpoint: 'records_list' },
  });
}

/**
 * GET /health/ping — sin auth.
 */
export function getPing() {
  return http.get(`${BASE_URL}/health/ping`, {
    tags: { endpoint: 'health_ping' },
  });
}
