# Event Corner v3 — Backend

Sistema de gestión de incidencias, lockers y corners para soporte técnico empresarial. Construido con NestJS, TypeORM y MySQL 8, siguiendo arquitectura hexagonal.

---

## Arquitectura

El sistema está compuesto por **tres procesos independientes** que se comunican por HTTP:

```
                        ┌─────────────────────────────────────────┐
 Cliente (browser/app)  │           API Gateway (:3000)           │
 ──────────────────────►│  inbound/*  →  MonolithClient           │
                        │  outbound/* →  Servicios externos        │
                        └────────────────┬────────────────────────┘
                                         │ HTTP /internal/*
                        ┌────────────────▼────────────────────────┐
                        │           Monolith (:3001)              │
                        │  Lógica de negocio + TypeORM + MySQL    │
                        │  Egress → API Gateway /outbound/*       │
                        └─────────────────────────────────────────┘

                        ┌─────────────────────────────────────────┐
 API Gateway ──────────►│       ABAC Microservice (:3005)        │
 (auth checks)          │  Roles + Permisos + JWT                 │
                        │  MySQL propio                           │
                        └─────────────────────────────────────────┘
```

### Flujo de una petición autenticada

1. El cliente envía `Authorization: Bearer <jwt>` al API Gateway.
2. `JwtGuard` valida el token con el ABAC microservice.
3. `RolesGuard` verifica que el usuario tenga el rol requerido (caché 60s).
4. `AbacGuard` verifica el permiso específico (`resource:action`) en ABAC.
5. El API Gateway hace proxy al Monolito (`/internal/*`) con header `x-internal-token`.
6. El Monolito ejecuta la lógica de dominio y devuelve la respuesta.

---

## Requisitos

- Node.js >= 20
- npm >= 10
- MySQL 8.0
- PM2 (producción/staging): `npm install -g pm2`

---

## Estructura del proyecto

```
apps/
  api-gateway/        ← Proceso independiente, puerto API_GATEWAY_PORT
    src/
      auth/           ← Guards (JWT, Roles, ABAC), decoradores
      inbound/        ← Controllers públicos (thin proxies)
      outbound/       ← Proxies hacia servicios externos
      client/         ← MonolithClient (HTTP al monolito)
  monolith/           ← Proceso independiente, puerto MONOLITH_PORT
    src/
      internal-api/   ← Controllers /internal/* (solo para API GW)
      infrastructure/ ← TypeORM, cache, adapters externos
  abac-microservice/  ← Proceso independiente, puerto ABAC_PORT
    src/
      auth/           ← Login, JWT, refresh tokens
      users/          ← Usuarios, roles, permisos
      scripts/        ← Seed de datos iniciales

libs/
  core/src/           ← Dominio + puertos + servicios  (@app/core/*)
    domain/           ← Entidades, value objects, enums, errores
    ports/            ← Interfaces (incoming + outgoing) + tokens DI
    services/         ← Implementaciones de casos de uso
  shared/src/         ← Tipos y utils compartidos  (@app/shared/*)
    types/            ← Result<T,E>, branded IDs
    utils/            ← result-to-http, helpers
    filters/          ← HttpExceptionFilter global
```

---

## Instalación

```bash
# Clonar e instalar dependencias
npm install
```

---

## Variables de entorno

Cada app tiene su propio conjunto de variables. Copia los `.env.example` y rellena los valores:

```bash
cp apps/api-gateway/.env.example       apps/api-gateway/.env.development
cp apps/monolith/.env.example          apps/monolith/.env.development
cp apps/abac-microservice/.env.example apps/abac-microservice/.env.development
```

### API Gateway (`apps/api-gateway/.env.example`)

| Variable                        | Descripción                                      |
|---------------------------------|--------------------------------------------------|
| `API_GATEWAY_PORT`              | Puerto donde escucha el gateway (ej: 3000)       |
| `MONOLITH_URL`                  | URL interna del monolito (ej: http://localhost:3001) |
| `ABAC_URL`                      | URL del microservicio ABAC                       |
| `ABAC_API_KEY`                  | API key para llamadas al ABAC                    |
| `INTERNAL_API_TOKEN`            | Token secreto para comunicación interna          |
| `EXTERNAL_INVENTORY_URL`        | URL del sistema de inventario externo            |
| `OUTBOUND_GATEWAY_URL`          | URL del gateway corporativo (ServiceNow)         |
| `OUTBOUND_GATEWAY_TOKEN_URL`    | URL para obtener OAuth2 token                    |
| `OUTBOUND_GATEWAY_CLIENT_ID`    | Client ID OAuth2                                 |
| `OUTBOUND_GATEWAY_CLIENT_SECRET`| Client Secret OAuth2                             |

### Monolith (`apps/monolith/.env.example`)

| Variable             | Descripción                                       |
|----------------------|---------------------------------------------------|
| `MONOLITH_PORT`      | Puerto donde escucha el monolito (ej: 3001)       |
| `API_GATEWAY_URL`    | URL del API Gateway (para egress)                 |
| `INTERNAL_API_TOKEN` | Token secreto para comunicación interna           |
| `DB_HOST`            | Host de MySQL                                     |
| `DB_PORT`            | Puerto de MySQL (ej: 3306)                        |
| `DB_NAME`            | Nombre de la base de datos                        |
| `DB_USER`            | Usuario MySQL                                     |
| `DB_PASSWORD`        | Contraseña MySQL                                  |

### ABAC Microservice (`apps/abac-microservice/.env.example`)

| Variable          | Descripción                                        |
|-------------------|----------------------------------------------------|
| `ABAC_PORT`       | Puerto donde escucha ABAC (ej: 3005)               |
| `DB_HOST`         | Host de MySQL (puede ser distinto al del monolito) |
| `DB_PORT`         | Puerto de MySQL                                    |
| `DB_NAME`         | Nombre de la base de datos ABAC                    |
| `DB_USER`         | Usuario MySQL                                      |
| `DB_PASSWORD`     | Contraseña MySQL                                   |
| `JWT_SECRET`      | Secreto para firmar JWTs                           |
| `JWT_EXPIRES_IN`  | Expiración de access token (ej: 15m)               |
| `REFRESH_SECRET`  | Secreto para refresh tokens                        |
| `REFRESH_EXPIRES_IN` | Expiración de refresh token (ej: 7d)            |
| `ABAC_API_KEY`    | API key que valida el gateway al llamar a ABAC     |

---

## Seeds

### Prerequisito: schema de base de datos

Los seeds usan `synchronize: false`, por lo que las tablas deben existir antes de ejecutar cualquier seed. El esquema lo crea TypeORM al arrancar el ABAC microservice por primera vez (`synchronize: true` en desarrollo):

```bash
# Una sola vez, antes del primer seed:
npm run start:abac:dev   # arranca, crea las tablas, puede cerrarse con Ctrl+C
```

---

### Orden de ejecución (primera vez)

```
1. npm run abac:seed:full    ← crea roles, permisos, usuarios y cuentas de servicio M2M
2. npm run monolith:seed     ← crea companies, corners, issue types, CICs (lee initial-credentials.json)
3. cd ../servicenow-clone-backend && npm run seed   ← datos del simulador de ServiceNow
```

> `abac:seed:full` es equivalente a `abac:seed && abac:seed:m2m` en un solo comando.

---

### Detalle de cada seed

#### `npm run abac:seed` — seed principal ABAC

Crea en la base de datos ABAC:
- Aplicación **Event Corner** con su `appId` y `apiKey`
- 6 roles: `super-admin`, `admin`, `manager`, `technician`, `employee`, `readonly`
- 69+ permisos (`resource:action`)
- Políticas de seguridad (deny + allow con condiciones)
- 7 usuarios de prueba (super-admin, admin, manager, 2 técnicos, 2 empleados)

Al finalizar genera `apps/abac-microservice/initial-credentials.json` con contraseñas y la `apiKey` de la aplicación. **Este archivo está en `.gitignore` — guárdalo en un gestor de secretos.**

Después de ejecutarlo, copiar los valores al gateway:
```env
# apps/api-gateway/.env.development
ABAC_APP_ID=<appId del JSON>
ABAC_API_KEY=<apiKey del JSON>
```

#### `npm run abac:seed:m2m` — cuentas de servicio M2M

Crea 4 cuentas de servicio (`accountType = 'service'`) con sus Applications en ABAC:

| Servicio | Email de cuenta |
|---|---|
| `api-gateway` | `svc-api-gateway@eventcorner.internal` |
| `monolith` | `svc-monolith@eventcorner.internal` |
| `integration-service` | `svc-integration@eventcorner.internal` |
| `api-snowq-service` | `svc-snowq@eventcorner.internal` |

Al finalizar imprime en consola las credenciales M2M (`ABAC_M2M_API_KEY` / `ABAC_M2M_API_SECRET`) de cada servicio. **Son de un solo uso — si se pierden, re-ejecutar el script para rotarlas.**

#### `npm run abac:seed:full` — seed completo (recomendado)

Equivalente a `abac:seed && abac:seed:m2m`. Garantiza el orden correcto de dependencias.

#### `npm run monolith:seed` — datos de negocio

Crea en la base de datos del monolito:
- Companies, ServiceNow profiles, issue types, corners, users, `CompanyIssueConfig`
- Lee `initial-credentials.json` generado por `abac:seed` para enlazar usuarios

---

### Re-seed (destruir y recrear)

Si necesitás resetear el ABAC desde cero:

```bash
npm run abac:seed:full
```

El seed principal detecta datos existentes y pregunta confirmación antes de limpiarlos. Al limpiar elimina también el rol `service-account` y las cuentas M2M, por eso `abac:seed:m2m` **siempre debe correr después** de `abac:seed`. El comando `abac:seed:full` lo hace automáticamente.

Después de un re-seed:
1. Actualizar `ABAC_APP_ID` y `ABAC_API_KEY` en `apps/api-gateway/.env.*`
2. Actualizar `ABAC_M2M_API_KEY` / `ABAC_M2M_API_SECRET` en cada servicio
3. Re-ejecutar `npm run monolith:seed` si querés recrear los datos de negocio

---

## Desarrollo local

Levanta los tres procesos en terminales separadas:

```bash
# Terminal 1 — API Gateway (puerto 3000)
npm run start:api-gateway:dev

# Terminal 2 — Monolito (puerto 3001)
npm run start:monolith:dev

# Terminal 3 — ABAC Microservice (puerto 3005)
npm run start:abac:dev
```

### Documentación Swagger

Con el API Gateway corriendo, abre:

```
http://localhost:3000/docs
```

Todos los endpoints están documentados con sus parámetros, respuestas y requisitos de autenticación.

---

## Despliegue con PM2

El sistema usa PM2 con el archivo `ecosystem.config.js` que lee automáticamente los archivos `.env.[environment]` de cada app.

### Preparar entornos

Para cada entorno, crea los archivos de variables:

```bash
# Development
cp apps/api-gateway/.env.example       apps/api-gateway/.env.development
cp apps/monolith/.env.example          apps/monolith/.env.development
cp apps/abac-microservice/.env.example apps/abac-microservice/.env.development

# Staging
cp apps/api-gateway/.env.example       apps/api-gateway/.env.staging
cp apps/monolith/.env.example          apps/monolith/.env.staging
cp apps/abac-microservice/.env.example apps/abac-microservice/.env.staging

# Production
cp apps/api-gateway/.env.example       apps/api-gateway/.env.production
cp apps/monolith/.env.example          apps/monolith/.env.production
cp apps/abac-microservice/.env.example apps/abac-microservice/.env.production
```

Rellena cada archivo con los valores correctos para el entorno correspondiente.

### Compilar y arrancar

```bash
# Compilar todos los servicios
npm run build:all

# Arrancar en el entorno deseado
npm run pm2:dev        # development
npm run pm2:staging    # staging
npm run pm2:prod       # production
```

### Comandos PM2 útiles

```bash
npm run pm2:status    # Estado de todos los procesos
npm run pm2:logs      # Logs en tiempo real
npm run pm2:stop      # Detener todos los procesos
npm run pm2:delete    # Eliminar todos los procesos de PM2
npm run pm2:save      # Guardar la lista de procesos (para autostart)

# Recompilar y recargar sin downtime
npm run pm2:reload:dev        # development
npm run pm2:reload:staging    # staging
npm run pm2:reload:prod       # production
```

---

## Endpoints principales

Todos los endpoints requieren `Authorization: Bearer <jwt>` salvo los marcados como públicos.

### Auth

| Método | Ruta                   | Descripción                | Público |
|--------|------------------------|----------------------------|---------|
| POST   | `/api/auth/login`      | Login con email/password   | Sí      |
| POST   | `/api/auth/refresh`    | Renovar access token       | Sí      |
| POST   | `/api/auth/logout`     | Cerrar sesión              | Sí      |

### Incidencias

| Método | Ruta                                     | Descripción                      | Roles mínimos                  |
|--------|------------------------------------------|----------------------------------|--------------------------------|
| GET    | `/api/incidents`                         | Listar incidencias               | Cualquier rol autenticado      |
| POST   | `/api/incidents`                         | Crear incidencia                 | employee, technician, admin    |
| GET    | `/api/incidents/:id`                     | Detalle de incidencia            | Cualquier rol autenticado      |
| POST   | `/api/incidents/:id/take`                | Técnico toma la incidencia       | technician, admin              |
| POST   | `/api/incidents/:id/release`             | Técnico libera la incidencia     | technician, admin              |
| PATCH  | `/api/incidents/:id/status`              | Actualizar estado                | technician, admin              |
| POST   | `/api/incidents/:id/deliver`             | Registrar entrega de dispositivo | technician, admin              |
| POST   | `/api/incidents/:id/validate`            | Empleado valida la resolución    | employee, technician, admin    |
| POST   | `/api/incidents/:id/reopen`              | Reabrir incidencia               | employee, technician, admin    |

### Corners

| Método | Ruta                                          | Descripción                      | Roles mínimos     |
|--------|-----------------------------------------------|----------------------------------|-------------------|
| GET    | `/api/corners`                                | Listar corners                   | Autenticado       |
| GET    | `/api/corners/:id`                            | Detalle de corner                | Autenticado       |
| POST   | `/api/corners`                                | Crear corner                     | admin, super-admin|
| PATCH  | `/api/corners/:id`                            | Actualizar corner                | admin, super-admin|
| DELETE | `/api/corners/:id`                            | Eliminar corner                  | admin, super-admin|
| POST   | `/api/corners/:id/schedules`                  | Agregar horario                  | admin, super-admin|
| PUT    | `/api/corners/:id/schedules/:sid/technicians` | Asignar técnicos                 | admin, super-admin|

### Disponibilidad

| Método | Ruta                                     | Descripción                      |
|--------|------------------------------------------|----------------------------------|
| GET    | `/api/availability/slots`                | Slots disponibles por corner     |
| GET    | `/api/availability/technicians`          | Disponibilidad de técnicos       |

### Tipos de incidencia

| Método | Ruta                                     | Descripción                      | Roles mínimos     |
|--------|------------------------------------------|----------------------------------|-------------------|
| GET    | `/api/issue-types`                       | Listar tipos                     | Autenticado       |
| POST   | `/api/issue-types`                       | Crear tipo                       | admin, super-admin|
| PATCH  | `/api/issue-types/:id`                   | Actualizar tipo                  | admin, super-admin|
| DELETE | `/api/issue-types/:id`                   | Eliminar tipo                    | admin, super-admin|

### Solicitudes

| Método | Ruta                                     | Descripción                      | Roles mínimos             |
|--------|------------------------------------------|----------------------------------|---------------------------|
| GET    | `/api/requests`                          | Listar solicitudes               | Autenticado               |
| POST   | `/api/requests`                          | Crear solicitud                  | employee, technician, admin|
| PATCH  | `/api/requests/:id/status`               | Cambiar estado                   | technician, admin         |

### Batch Drafts — Creación masiva de incidencias

| Método | Ruta                             | Descripción                                   |
|--------|----------------------------------|-----------------------------------------------|
| GET    | `/api/batch-drafts`              | Obtener draft activo del técnico              |
| POST   | `/api/batch-drafts/items`        | Agregar item y retener slots (HELD, 15 min)   |
| PATCH  | `/api/batch-drafts/items/:id`    | Editar item (reasigna holds si cambian slots) |
| DELETE | `/api/batch-drafts/items/:id`    | Eliminar item y liberar holds                 |
| POST   | `/api/batch-drafts/submit`       | Confirmar lote → crea incidencias en SN       |
| DELETE | `/api/batch-drafts`              | Descartar draft y liberar todos los holds     |
| POST   | `/api/batch-drafts/renew`        | Renovar TTL de holds activos                  |

Ver documentación completa en `docs/batch-drafts.md`.

---

## Máquina de estados de incidencias

```
CREATED
  └─► IN_PROGRESS        (técnico toma)
        └─► PENDING_PICKUP    (técnico libera temporalmente)
        └─► PENDING_DELIVERY  (dispositivo listo para entrega)
              └─► DELIVERED       (dispositivo entregado al cliente)
                    └─► CLOSED         (resuelto definitivamente)
                          └─► VALIDATED     (empleado confirma resolución)
                    └─► REOPENED       (empleado reabre)
                          └─► IN_PROGRESS   (técnico retoma)
```

---

## Autorización ABAC

El sistema usa un modelo RBAC + ABAC de dos capas:

1. **Roles** (`RolesGuard`): cada endpoint puede requerir uno o más roles mínimos mediante `@Roles(...)`.
2. **Permisos** (`AbacGuard`): cada acción de negocio tiene un permiso explícito (`resource:action`) verificado en el microservicio ABAC.

### Roles disponibles

| Rol          | Descripción                                      |
|--------------|--------------------------------------------------|
| `super-admin`| Acceso total al sistema                          |
| `admin`      | Gestión de corners, issue types, técnicos        |
| `manager`    | Supervisión de incidencias y reportes            |
| `technician` | Gestión operativa de incidencias                 |
| `employee`   | Creación y seguimiento de sus propias incidencias|

### Tokens de comunicación interna

Los endpoints `/outbound/*` del API Gateway solo aceptan llamadas con el header:

```
x-internal-token: <INTERNAL_API_TOKEN>
```

Este token debe ser el mismo en la variable `INTERNAL_API_TOKEN` de ambas apps (API Gateway y Monolito).

---

## Scripts de referencia

```bash
# Desarrollo (watch mode)
npm run start:api-gateway:dev
npm run start:monolith:dev
npm run start:abac:dev

# Build
npm run build:api-gateway
npm run build:monolith
npm run build:abac
npm run build:all

# PM2
npm run pm2:dev / pm2:staging / pm2:prod
npm run pm2:reload:dev / pm2:reload:staging / pm2:reload:prod
npm run pm2:status / pm2:logs / pm2:stop / pm2:delete / pm2:save

# Seeds
npm run abac:seed:full    # seed principal + M2M (recomendado, primera vez)
npm run abac:seed         # solo seed principal ABAC
npm run abac:seed:m2m     # solo cuentas de servicio M2M
npm run monolith:seed     # datos de negocio (requiere initial-credentials.json)

# Tests
npm run test
npm run test:cov
npm run test:e2e

# Lint y formato
npm run lint
npm run format
```
