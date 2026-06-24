
❯ Te doy otro contexto para que lo tengas en cuenta, la autenticacion de los usuarios, va ser via entraId de azure.

  Recalled 1 memory, wrote 2 memories, read 1 file (ctrl+o to expand)

● Eso cambia bastante el panorama. Con Entra ID para usuarios, ABAC se redefine:

  Modelo de seguridad actualizado

  ┌──────────────────────────────────────────────────────────────┐
  │                    Microsoft Entra ID                         │
  │                                                              │
  │  Usuarios corporativos Santander                             │
  │  Emite: JWT con claims (oid, email, groups, roles)           │
  │  JWKS: login.microsoftonline.com/{tenant}/discovery/v2.0/keys│
  └───────────────────────┬──────────────────────────────────────┘
                          │ Bearer token (Entra ID JWT)
                          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                      api-gateway                              │
  │                                                              │
  │  1. Valida JWT contra JWKS de Entra ID (no JWT_SECRET local) │
  │  2. Extrae: oid, email, groups                               │
  │  3. Llama ABAC: ¿qué puede hacer este usuario internamente?  │
  └───────────────────────┬──────────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                   abac-microservice                           │
  │                                                              │
  │  YA NO HACE:                                                 │
  │    ✗ Login (email + password)                                │
  │    ✗ Refresh tokens de usuario                               │
  │    ✗ Sesiones Redis de usuario                               │
  │    ✗ Gestión de passwords / bcrypt                           │
  │                                                              │
  │  SIGUE HACIENDO:                                             │
  │    ✓ Autorización (can-access, roles, permisos, policies)    │
  │    ✓ Mapeo Entra ID oid → usuario interno → roles/permisos  │
  │    ✓ json-rules-engine para políticas dinámicas              │
  │    ✓ Auditoría de decisiones de acceso                       │
  │                                                              │
  │  NUEVO:                                                      │
  │    ✓ M2M auth (API keys + service accounts)                  │
  │    ✓ POST /auth/m2m-token (service-to-service JWT)           │
  │    ✓ Mapeo automático groups de Entra ID → roles internos    │
  └──────────────────────────────────────────────────────────────┘

  Dos flujos de autenticación, un solo motor de autorización

  Flujo usuario (Entra ID)

  Browser/App → Entra ID login → JWT Entra ID
      │
      ▼
  api-gateway:
      1. JwtGuard valida firma contra JWKS de Entra ID
      2. Extrae oid + groups del token
      3. AbacGuard → POST /abac/can-access { userId: oid, resource, action }
      4. ABAC mapea oid → User interno → Roles → Permisos
      5. granted: true/false

  Flujo servicio (M2M via ABAC)

  monolith arranca → POST /auth/m2m-token { apiKey, apiSecret }
      ← JWT M2M con claims: { sub: 'svc-monolith', type: 'service', permissions }
      │
      ▼
  gateway/integration-service:
      Valida JWT M2M (mismo issuer, distinto claim type)

  Lo que se simplifica en ABAC

  ┌─────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────┐
  │        Componente actual        │                                        Nuevo estado                                        │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
  │ POST /auth/login                │ Se elimina o se convierte en endpoint de intercambio: recibe token Entra ID, devuelve      │
  │ (email+password)                │ contexto interno                                                                           │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
  │ POST /auth/refresh              │ Se elimina — Entra ID maneja refresh                                                       │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Sesiones Redis (User)           │ Se eliminan para usuarios. Se mantienen solo si necesitas tracking de actividad            │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
  │ passwordHash en User            │ Se elimina — Entra ID gestiona credenciales                                                │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
  │ POST /auth/validate-token       │ Se adapta para validar tokens de Entra ID (JWKS) en vez de JWT local                       │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
  │ User.email + User.username      │ Se reemplazan por User.entraId (oid) como PK de identidad                                  │
  └─────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────┘

  Lo que se agrega

  ┌────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┐
  │         Componente         │                                            Propósito                                            │
  ├────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ User.entraId (varchar,     │ Object ID de Entra ID — link entre identidad externa y roles internos                           │
  │ unique)                    │                                                                                                 │
  ├────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Mapeo Entra ID groups →    │ Si el usuario pertenece al group SG-EventCorner-Admins en Entra ID, automáticamente tiene role  │
  │ Roles                      │ admin en ABAC                                                                                   │
  ├────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ POST /auth/m2m-token       │ JWT para service accounts (API key + secret)                                                    │
  ├────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ User.type = 'user' |       │ Distinguir cuentas humanas de cuentas de servicio                                               │
  │ 'service'                  │                                                                                                 │
  ├────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ JWKS validation en gateway │ Validar firma de tokens Entra ID contra                                                         │
  │                            │ https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys                                  │
  └────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┘

  Mapeo de grupos Entra ID → Roles internos

  Esto es clave. En vez de asignar roles manualmente en ABAC, se pueden sincronizar desde los grupos de Azure AD:

  Entra ID Group                    →  ABAC Role
  ────────────────────────────────     ──────────────
  SG-EventCorner-Admins             →  admin
  SG-EventCorner-Technicians        →  technician
  SG-EventCorner-Managers           →  corner-manager
  SG-EventCorner-Readonly           →  viewer

  Dos opciones:
  - Lazy sync: cuando el usuario hace login, ABAC lee los groups del token y actualiza los roles
  - Push sync: Azure AD envía webhook cuando cambian los groups (más complejo, requiere Azure Event Grid)

  ---
  Orden de implementación recomendado

  Dado todo el contexto (Opción A para integration-service, Entra ID para usuarios, ABAC para M2M):

  1. Conectar integration-service al gateway con x-internal-token actual (funcional rápido)
  2. Agregar M2M a ABAC (service accounts, POST /auth/m2m-token)
  3. Migrar gateway a Entra ID (JWKS validation, eliminar login local)
  4. Migrar ABAC (eliminar auth de usuarios, agregar mapeo oid → roles)
  5. Reemplazar x-internal-token por JWT M2M en todos los servicios

  ¿Quieres arrancar con el paso 1 (conectar integration-service al gateway)?



   ---
  Fase 1 completada. Todo lo que se hizo:

  ┌─────┬────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────┐
  │ Pas │                                Archivo                                 │                    Cambio                    │
  │  o  │                                                                        │                                              │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.1 │ integration-service/src/infrastructure/config/configuration.ts         │ Puerto default 3000 → 3008, añadido          │
  │     │                                                                        │ security.internalToken                       │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.2 │ integration-service/src/shared/guards/internal-token.guard.ts          │ Guard nuevo — valida x-internal-token        │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.2 │ presentation/controllers/{integration,minerva,droppoint}.controller.ts │ @UseGuards(InternalTokenGuard,               │
  │     │                                                                        │ ThrottlerGuard)                              │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.2 │ presentation/presentation.module.ts                                    │ InternalTokenGuard como provider             │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.3 │ api-gateway/src/outbound/integration/integration-outbound.module.ts    │ Módulo proxy nuevo                           │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.3 │ api-gateway/src/outbound/integration/integration-outbound.controller.t │ 13 endpoints proxy (appointments + Minerva + │
  │     │ s                                                                      │  Droppoint)                                  │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.3 │ api-gateway/src/outbound/outbound-gateway.module.ts                    │ Importa IntegrationOutboundModule            │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.4 │ api-gateway/.env.development                                           │ INTEGRATION_SERVICE_URL=http://localhost:300 │
  │     │                                                                        │ 8                                            │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.5 │ ecosystem.config.js                                                    │ integration-service agregado a PM2           │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.6 │ api-gateway/.env.development                                           │ INTERNAL_API_TOKEN alineado con monolith     │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ 1.6 │ integration-service/.env.development                                   │ Creado con todos los valores dev             │
  ├─────┼────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ Fix │ api-gateway/src/outbound/servicenow/snowq.adapter.ts                   │ Implementado queryIncidentState() faltante   │
  └─────┴────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────┘

 ---
  Resumen de lo implementado en Fase 2 — M2M en ABAC:

  Cambios en ABAC microservice:

  ┌─────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┐
  │               Archivo               │                                         Cambio                                          │
  ├─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ entities/user.entity.ts             │ Nueva columna accountType: 'user' | 'service' (enum, default 'user')                    │
  ├─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ abac/dtos/CheckEmailDto.ts          │ Nuevo M2MTokenDto con apiKey + apiSecret                                                │
  ├─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ abac/services/auth.service.ts       │ Nuevo método generateM2MToken() — stateless, sin sesión Redis, JWT 1h con claims        │
  │                                     │ type:'service' y array de permisos                                                      │
  ├─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ abac/controllers/auth.controller.ts │ Nuevo endpoint POST /auth/m2m-token                                                     │
  ├─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ scripts/seed-m2m-services.ts        │ Script idempotente que crea 4 cuentas de servicio + Applications con credenciales       │
  │                                     │ rotables                                                                                │
  ├─────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ package.json                        │ Nuevo script npm run abac:seed:m2m                                                      │
  └─────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘

  Env vars añadidas:
  - integration-service/.env.development → ABAC_URL, ABAC_API_KEY, ABAC_API_SECRET
  - api-gateway/.env.development → ABAC_M2M_API_KEY, ABAC_M2M_API_SECRET

  Próximos pasos:
  1. Ejecutar npm run abac:seed:m2m para generar las credenciales y copiarlas en los .env
  2. Continuar con Fase 3 (Entra ID / JWKS validation en api-gateway) cuando quieras


  ---

  PS C:\Users\mairon.cuello\development\workspace-santander\monolito-event-corner_v3>
PS C:\Users\mairon.cuello\development\workspace-santander\monolito-event-corner_v3> npm run abac:seed:m2m

> monolito-event-corner_v3@0.0.1 abac:seed:m2m
> ts-node --project apps/abac-microservice/tsconfig.json -r tsconfig-paths/register apps/abac-microservice/src/scripts/seed-m2m-services.ts

[dotenv@17.2.2] injecting env (0) from .env -- tip: 📡 version env with Radar: https://dotenvx.com/radar

🔧  Seed M2M — Event Corner

1️⃣  Creando permisos M2M...
  ✓ integration:create (existente)
  ✓ integration:read (existente)
  ✓ minerva:read (existente)
  ✓ minerva:assign (existente)
  ✓ minerva:release (existente)
  ✓ minerva:sync (existente)
  ✓ droppoint:read (existente)
  ✓ droppoint:create (existente)
  ✓ droppoint:update (existente)
  ✓ droppoint:delete (existente)
  ✓ servicenow:create (existente)
  ✓ servicenow:update (existente)
  ✓ servicenow:read (existente)

2️⃣  Verificando rol service-account...
  Aplicación base: Event Corner (290285ab-d4c5-4da7-9642-283400c88733)
  ✓ Rol existente: 33c438d6-06a8-4de2-b7b4-dd4f20f25398

3️⃣  Creando cuentas de servicio y applications...

  📦 api-gateway
     User: ✓ existente (a1105574-f6d0-4a52-824e-536e73b6cacf)
     App:  ✓ existente (credenciales rotadas)
     Permisos: +15 asignados al rol

  📦 monolith
     User: ✓ existente (fe4711dc-3af6-4a3c-b1ff-8742b35e60dc)
     App:  ✓ existente (credenciales rotadas)

  📦 integration-service
     User: ✓ existente (7427d3a9-1898-40eb-b0fb-28552345ed0c)
     App:  ✓ existente (credenciales rotadas)

  📦 api-snowq-service
     User: ✓ existente (fe521440-a68d-498a-a983-607ce352e057)
     App:  ✓ existente (credenciales rotadas)


══════════════════════════════════════════════════════════════
  CREDENCIALES M2M — GUARDAR EN .env DE CADA SERVICIO
══════════════════════════════════════════════════════════════

  [api-gateway]
  ABAC_API_KEY=ak_0960b0d4ff88504fe30901ed119ffba24886e5540b982a28
  ABAC_API_SECRET=53472594133a1fc1a39ef6f05e5f551262552dc4ac5df0874c4f42bec725e871

  [monolith]
  ABAC_API_KEY=ak_8788ee2312e9a27a3168534ee1560943f4d3bd2e30e672e0
  ABAC_API_SECRET=3a7ab3d59af10e3c67bcc147aac0149e9ebc48d71b3c58b927bf2de3f1e3307f

  [integration-service]
  ABAC_API_KEY=ak_f6db2044962951e94a2280b30b9961911bba34b10c8fe9a8
  ABAC_API_SECRET=9cbc5d76ca0fa7f6c2b7c284d2a9d40b4ad30e934e52f2487335d552503c705d

  [api-snowq-service]
  ABAC_API_KEY=ak_d55fd972cbef60290a073e5399ad6606eb674f542d271105
  ABAC_API_SECRET=14ef14aecf02e47b3a1ef0ad2dbceaff0e3599ce655672fdcdf5e22df63b95b8

══════════════════════════════════════════════════════════════
  ⚠  Las credenciales anteriores NO se pueden recuperar.
     Si se pierden, ejecuta este script de nuevo para rotarlas.
══════════════════════════════════════════════════════════════

