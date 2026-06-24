// Copiá este archivo como k6/env.js y completá los valores.
// k6/env.js está en .gitignore — no se commitea nunca.
//
// Cómo obtener las credenciales:
//   1. Hacer login en el dashboard  http://localhost:5173
//   2. Ir a Clients → Nuevo cliente → nombre: "k6-test", scope: "records:read"
//   3. Copiar clientId y clientSecret en este archivo

export const K6_CLIENT_ID     = '';
export const K6_CLIENT_SECRET = '';
export const BASE_URL         = 'http://localhost:3007';
