# api-middleware-service

Proxy OAuth2 para aplicaciones externas que necesitan consultar incidencias y solicitudes de Event Corner. Emite y valida tokens JWT localmente (HS256 + MySQL) sin depender de un servidor OAuth externo.

Puerto por defecto: **3007**. En staging/producción corre detrás de Apache que termina TLS.

---

## Requisitos previos

- Node.js >= 18
- MySQL 8 con la base de datos `middleware_db` creada
- `api-gateway` corriendo y accesible (para proxear las consultas)
- PM2 instalado globalmente para staging/producción

```sql
CREATE DATABASE IF NOT EXISTS middleware_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## Despliegue por entorno

### Desarrollo

```bash
npm install
npm run start:dev
```

Carga `.env.development` automáticamente. El servidor inicia en `http://localhost:3007`.  
Swagger disponible en `http://localhost:3007/docs`.

Variables con valores de fallback seguros — el servicio arranca sin configurar nada adicional.

---

### Staging

```bash
# 1. Configurar variables en .env.staging
# 2. Compilar y levantar con PM2

npm run build
pm2 start ecosystem.config.js --env staging
```

Apache actúa como reverse proxy y termina TLS. El servicio corre en `http://localhost:3007` internamente y solo acepta requests que lleguen con el header `X-Forwarded-Proto: https`. Acceso directo al puerto 3007 devuelve `426 Upgrade Required`.

Swagger disponible en `/docs`.

---

### Producción

```bash
# 1. Configurar variables de entorno reales en el servidor (NO hardcodear en .env.production)
# 2. Instalar solo dependencias de runtime

npm install --omit=dev
npm run build
pm2 start ecosystem.config.js --env production
```

Archivos necesarios en el servidor:

```
dist/
node_modules/
ecosystem.config.js
package.json
.env.production        (solo si no se usan variables del sistema operativo)
```

Swagger desactivado en producción.

**Variables que DEBEN estar definidas con valores reales** (el servicio falla al iniciar si no están o tienen el prefijo `dev-only--`):

| Variable | Longitud mínima |
|---|---|
| `JWT_SECRET` | 32 caracteres |
| `ADMIN_SESSION_SECRET` | 32 caracteres |

---

## Base de datos y migraciones

### Primera vez (DB en blanco)

Borrar tablas si existen y correr las migraciones desde cero:

```sql
DROP TABLE IF EXISTS migrations;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS external_clients;
DROP TABLE IF EXISTS admins;
```

```bash
npm run migration:run
```

Ejecuta las tres migraciones en orden:

1. `1740000000000-InitialSchema` — crea tablas `admins`, `external_clients`, `refresh_tokens`
2. `1745000000000-AddJtiHashToRefreshTokens` — agrega columna `jtiHash` + índice
3. `1748302418000-AddGrantedScopesToRefreshTokens` — agrega columna `grantedScopes`

### Verificar estado

```bash
npm run migration:show
```

### Revertir última migración

```bash
npm run migration:revert
```

---

## Configuración inicial del administrador

Antes de registrar clientes se debe crear el administrador. Solo funciona si no existe ninguno.

```bash
# Verificar si hace falta
curl http://localhost:3007/admin/setup-required

# Crear administrador
curl -X POST http://localhost:3007/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password123"}'
```

Login para obtener la cookie de sesión:

```bash
curl -X POST http://localhost:3007/admin/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username": "admin", "password": "password123"}'
```

---

## Uso del proxy

### 1. Registrar una aplicación externa

Requiere sesión de administrador (cookie).

```bash
curl -X POST http://localhost:3007/clients \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Mi Aplicacion",
    "description": "Sistema externo de reportes",
    "tokenExpiresInSeconds": 3600,
    "allowedScopes": ["requests:read"]
  }'
```

La respuesta incluye `clientId` (prefijo `mc_`) y `clientSecret`. **El `clientSecret` solo se muestra una vez.**

```json
{
  "clientId": "mc_a1b2c3d4e5",
  "clientSecret": "s3cr3t-plain-text-only-once",
  "name": "Mi Aplicacion"
}
```

---

### 2. Obtener un access token (OAuth2 client_credentials)

Credenciales via Basic Auth: `clientId:clientSecret` codificado en base64.

```bash
curl -X POST http://localhost:3007/oauth/token \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'mc_a1b2c3d4e5:s3cr3t-plain-text-only-once' | base64)" \
  -d '{"grant_type": "client_credentials", "scope": "requests:read"}'
```

Respuesta:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "client_name": "Mi Aplicacion",
  "scope": ["requests:read"]
}
```

---

### 3. Renovar el access token

```bash
curl -X POST http://localhost:3007/oauth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "eyJhbGciOiJIUzI1NiJ9..."}'
```

El refresh token anterior queda revocado (rotación OWASP). Si se reutiliza un token ya rotado, todos los tokens activos del cliente se revocan automáticamente.

---

### 4. Consultar solicitudes

Usar el `access_token` como Bearer en el header `Authorization`.

#### Obtener solicitud por número

```bash
curl http://localhost:3007/v1/requests/REQ0001234 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9..."
```

#### Listar solicitudes con filtros

```bash
curl "http://localhost:3007/v1/requests?status=CREATED,IN_PROGRESS&page=1&limit=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9..."
```

Parámetros disponibles:

| Parámetro | Descripción | Ejemplo |
|---|---|---|
| `status` | Estado(s) separados por coma | `CREATED,IN_PROGRESS` |
| `issueTypeId` | UUID del tipo de incidencia | `uuid-issue-type` |
| `cornerId` | UUID del corner | `uuid-corner` |
| `companyId` | UUID de la compañía | `uuid-company` |
| `dateFrom` | Fecha inicial | `2026-01-01` |
| `dateTo` | Fecha final | `2026-12-31` |
| `page` | Página (default: 1) | `1` |
| `limit` | Resultados por página, máx 100 (default: 20) | `20` |

#### Listar issues

```bash
curl "http://localhost:3007/v1/issues?page=1&limit=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9..."
```

---

## Gestión de clientes (administración)

Todos los endpoints requieren sesión de administrador.

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/clients` | Registrar nueva aplicación |
| `GET` | `/clients` | Listar aplicaciones (paginado) |
| `GET` | `/clients/:clientId` | Detalle de una aplicación |
| `PATCH` | `/clients/:clientId/rotate-secret` | Rotar el secret |
| `PATCH` | `/clients/:clientId/token-expiry` | Cambiar duración del token |
| `DELETE` | `/clients/:clientId` | Desactivar (soft-delete) |
| `PATCH` | `/clients/:clientId/reactivate` | Reactivar |
| `DELETE` | `/clients/:clientId/permanent` | Eliminar permanentemente |

---

## Health

```bash
# Sin autenticación — solo verifica que el proceso está vivo
curl http://localhost:3007/health/ping

# Con métricas de resiliencia (DB, memoria, disco, circuit breaker, bulkhead)
curl http://localhost:3007/health/status

# Con token si HEALTH_STATUS_TOKEN está configurado
curl http://localhost:3007/health/status \
  -H "x-health-token: <HEALTH_STATUS_TOKEN>"
```

---

## Variables de entorno

| Variable | Descripción | Requerida en prod |
|---|---|---|
| `PORT` | Puerto del servidor (default: 3007) | No |
| `DB_HOST` | Host MySQL | Sí |
| `DB_PORT` | Puerto MySQL (default: 3306) | No |
| `DB_USERNAME` | Usuario MySQL | Sí |
| `DB_PASSWORD` | Password MySQL | Sí |
| `DB_DATABASE` | Nombre de la base de datos (default: middleware_db) | No |
| `JWT_SECRET` | Secreto para firmar tokens (min 32 chars) | Sí |
| `JWT_EXPIRATION` | Duración del access token en segundos (default: 3600) | No |
| `ADMIN_SESSION_SECRET` | Secreto para la cookie de sesión admin (min 32 chars) | Sí |
| `ADMIN_API_KEY` | API key alternativa para endpoints admin | No |
| `API_GATEWAY_URL` | URL del api-gateway (default: http://localhost:3000) | Sí |
| `ABAC_M2M_TOKEN` | Token M2M para llamadas al api-gateway | Sí |
| `CORS_ALLOWED_ORIGINS` | Orígenes permitidos separados por coma | Sí |
| `HEALTH_STATUS_TOKEN` | Token para proteger `/health/status` | No |
| `HTTP_BULKHEAD_CONCURRENCY` | Concurrencia máxima entrante (default: 50) | No |
| `HTTP_BULKHEAD_MAX_QUEUE` | Cola máxima del bulkhead (default: 100) | No |
| `EXT_ISSUES_URL` | URL del sistema externo de issues | No |
| `EXT_ISSUES_TOKEN` | Token de autenticación para el sistema de issues | No |
