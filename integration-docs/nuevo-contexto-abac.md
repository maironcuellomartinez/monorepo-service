
● Exacto, ese es el principio correcto. El ABAC no distingue de dónde vino el usuario — solo opera sobre un userId. Cada modo de
  autenticación es simplemente una forma diferente de llegar a ese ID.

  ---
  El flujo unificado

  OAuth client_id          Entra ID (oid)        Login usuario
        │                       │                      │
        ▼                       ▼                      ▼
  validateApplicationCreds  JWKS validate         password validate
        │                       │                      │
        │               syncEntraUser()                │
        │                 (find/create User)            │
        │                       │                      │
        ▼                       ▼                      ▼
    owner.id              syncedUser.id            user.id
        │                       │                      │
        └───────────────────────┴──────────────────────┘
                                │
                      request.user.sub = userId
                                │
                                ▼
                      AbacGuard.canAccess(
                        userId,       ← siempre el mismo campo
                        appId,        ← ABAC_APP_ID del gateway
                        resource,
                        action,
                        context
                      )
                                │
                      Roles → Permisos → Políticas
                      (misma lógica para todos)

  ---
  Lo que cambia por modo, lo que no cambia

  ┌────────────────────────┬──────────────────────┬────────────────────────┬─────────────────────┐
  │                        │        OAuth         │        Entra ID        │    Login regular    │
  ├────────────────────────┼──────────────────────┼────────────────────────┼─────────────────────┤
  │ Cómo obtiene el userId │ application.owner.id │ syncEntraUser().userId │ user.id directo     │
  ├────────────────────────┼──────────────────────┼────────────────────────┼─────────────────────┤
  │ Quién crea el userId   │ seed M2M (manual)    │ lazy sync (automático) │ registro de usuario │
  ├────────────────────────┼──────────────────────┼────────────────────────┼─────────────────────┤
  │ request.user.sub       │ ✅ userId            │ ✅ userId              │ ✅ userId           │
  ├────────────────────────┼──────────────────────┼────────────────────────┼─────────────────────┤
  │ AbacGuard              │ igual                │ igual                  │ igual               │
  ├────────────────────────┼──────────────────────┼────────────────────────┼─────────────────────┤
  │ canAccess()            │ igual                │ igual                  │ igual               │
  ├────────────────────────┼──────────────────────┼────────────────────────┼─────────────────────┤
  │ Roles/permisos         │ del service account  │ del usuario Entra      │ del usuario         │
  ├────────────────────────┼──────────────────────┼────────────────────────┼─────────────────────┤
  │ Políticas              │ mismas reglas        │ mismas reglas          │ mismas reglas       │
  └────────────────────────┴──────────────────────┴────────────────────────┴─────────────────────┘

  ---
  Implicación para el plan

  Con esta claridad, el plan no cambia estructuralmente pero sí simplifica cómo pensarlo:

  - validateApplicationCredentials() → produce owner.id
  - syncEntraUser() → produce userId
  - Ambos terminan en request.user = { sub: userId, ... }
  - A partir de ahí el gateway no sabe ni le importa cómo llegó ese userId

  La única diferencia en el JWT que devuelve ABAC es el campo type para logging/auditoría:
  - OAuth → type: 'service'
  - Entra → tokenType: 'entra' (en request.user, no en el JWT de Azure)
  - Regular → sin type especial

  El campo permissions[] en el JWT sirve solo como optimización (evitar llamar a ABAC en cada request si el gateway cachea). La
  fuente de verdad sigue siendo el canAccess() del AbacGuard.

  ¿Arrancamos la implementación?

  ---

  
❯ Cuando se usa el OAuth. en aplicaciones externas a la infrastructura

● El OAuth Client Credentials es para apps fuera del ecosistema Event Corner que necesitan acceso programático a la API. La
  distinción clave con M2M:

  ---
  M2M interno vs OAuth externo

  ┌──────────────────┬────────────────────────────────────────────────────────┬──────────────────────────────────────────┐
  │                  │                 M2M (/auth/m2m-token)                  │        OAuth (/auth/oauth/token)         │
  ├──────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Quién            │ Servicios del ecosistema (monolith, snowq, middleware) │ Apps de terceros fuera del ecosistema    │
  ├──────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Registrado via   │ npm run abac:seed:m2m                                  │ POST /applications/oauth (admin)         │
  ├──────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ application.type │ 'internal'                                             │ 'oauth_client'                           │
  ├──────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Scopes           │ No — todos los permisos del service account            │ Sí — allow-list explícita de permisos    │
  ├──────────────────┼────────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Secret           │ rotado por operaciones                                 │ rotado por el cliente vía /rotate-secret │
  └──────────────────┴────────────────────────────────────────────────────────┴──────────────────────────────────────────┘

  ---
  Casos de uso concretos

  1. Herramienta de BI / reporting
  Power BI, Tableau, script Python de data analytics
    → necesita leer incidencias y requests para dashboards
    → scope: 'incidents:read requests:read'
    → NO necesita crear ni modificar nada

  2. Sistema de auditoría / compliance
  Sistema externo de auditoría (no en la infra de Event Corner)
    → consulta periódicamente el estado de tickets
    → scope: 'incidents:read'

  3. Integración con sistema de RRHH / onboarding
  App que crea incidencias automáticamente cuando un empleado se incorpora
    → scope: 'incidents:create'
    → no tiene usuario, actúa en nombre de un proceso

  4. Portal del cliente (Santander externo)
  Un portal web de Santander que NO es el frontend principal de Event Corner
    → necesita mostrar el estado de las incidencias de sus usuarios
    → scope: 'incidents:read requests:read'

  ---
  Por qué no usar M2M para estos casos

  El M2M interno NO tiene scopes — la app obtiene todos los permisos del service account. Darle a una app de BI acceso M2M
  significaría darle potencialmente incidents:create, incidents:change-status, corners:delete, etc. Con OAuth, el admin define
  exactamente qué puede hacer esa app:

  # Crear cliente OAuth con acceso mínimo
  POST /applications/oauth
  {
    "name": "power-bi-reporting",
    "ownerId": "<service-account-solo-lectura>",
    "scopes": ["incidents:read", "requests:read"]
    # aunque el service account tenga más permisos, la app solo puede estos dos
  }

  ---
  Lo que NO es OAuth en este ecosistema

  - api-middleware-service → usa M2M (es parte de la infraestructura, registrado en el seed)
  - api-snowq-service → usa M2M (infraestructura)
  - integration-service → usa M2M (infraestructura)

  Si una app vive en el mismo repo, la despliegan las mismas operaciones, y consume la API como parte del sistema → M2M. Si es un
  tercero o una app independiente que se integra a través de la API pública → OAuth.


----

  ---
  Resumen comparativo

  ┌──────────────────┬─────────────────────────────┬─────────────────────────┬────────────────────────────┐
  │                  │          Entra ID           │           M2M           │         OAuth 2.0          │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ Quién lo usa     │ Usuarios humanos            │ Servicios internos      │ Apps externas              │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ Autenticación    │ JWKS (RS256, Microsoft)     │ apiKey + bcrypt(secret) │ client_id + bcrypt(secret) │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ Endpoint         │ POST /auth/validate-entra   │ POST /auth/m2m-token    │ POST /auth/oauth/token     │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ Application.type │ N/A                         │ != oauth_client         │ oauth_client               │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ Scopes           │ No                          │ No (todos los permisos) │ Sí (filtrado por scope)    │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ JWT firmado por  │ Microsoft (RS256)           │ ABAC (HS256)            │ ABAC (HS256)               │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ Permisos en JWT  │ No (se resuelven on-demand) │ Sí (embebidos)          │ Sí (embebidos, filtrados)  │
  ├──────────────────┼─────────────────────────────┼─────────────────────────┼────────────────────────────┤
  │ Sesión           │ Ninguna (stateless)         │ Ninguna                 │ Ninguna                    │
  └──────────────────┴─────────────────────────────┴─────────────────────────┴────────────────────────────┘


  ---


  
  Read 5 files (ctrl+o to expand)

● Ahora veamos el controller de ABAC y el guard para ver cómo llega el contexto:

  Read 3 files (ctrl+o to expand)

● Ahora veamos las entidades de user-policy y policy-permission para cerrar el cuadro:

  Read 2 files (ctrl+o to expand)

● Ahora tengo el cuadro completo. Así funciona:

  Motor de políticas y contexto — canAccess()

  Pipeline de evaluación (3 pasos secuenciales con short-circuit)

  canAccess(userId, appId, resource, action, context)
      │
      ├── CACHÉ: abac_granted:{userId}:{appId}:{resource}:{action}
      │          hit? → retorna boolean inmediato (TTL 1h)
      │
      ▼ PASO 1: ¿El usuario pertenece a la app?
      UserApplication (userId + appId, isActive)
      │   no? → DENY
      │
      ▼ PASO 2: ¿Tiene el permiso por roles?
      User → UserRole → Role → RolePermission → Permission
      │   busca: permission.resource = X AND permission.action = Y
      │   effect = 'deny'? → DENY
      │   no existe? → DENY
      │
      ▼ PASO 3: ¿Las políticas lo permiten?
      Policy (appId, tiene PolicyPermission para resource:action)
      │   0 políticas? → ALLOW (el permiso del paso 2 basta)
      │   ≥1 políticas? → evaluar contra facts + context

  Construcción de facts (lo que el motor de reglas puede ver)

  facts = {
      user: {
          id, email, name,
          profile: { ... },          // JSON libre en User.profile
          attributes: { ... },       // JSON libre en UserApplication.attributes
          roles: ['admin', 'tecnico'] // nombres de los roles del usuario
      },
      application: {
          id, name,
          environment: 'production' | 'staging' | 'development'
      },
      membership: {
          type: 'member' | 'admin' | 'owner',
          expiresAt: Date | null,
          isExpired: boolean
      },
      context: {
          ...lo_que_envie_el_caller,  // ← el gateway o servicio pasa lo que quiera
          timestamp: '2026-03-27T...' // siempre inyectado
      }
  }

  Estructura de una Policy

  Policy
  ├─ name: "solo-horario-laboral"
  ├─ type: 'system' | 'role' | 'user' | 'custom'
  ├─ priority: 10              ← se evalúan DESC (mayor primero)
  ├─ effect: 'allow' | 'deny'  ← qué pasa si TODAS las reglas pasan
  ├─ applicationId
  │
  ├─ permissions[] (PolicyPermission)
  │   └─ Permission { resource: 'incidents', action: 'create' }
  │      → esta política aplica cuando se pregunta por incidents:create
  │
  └─ rules[] (PolicyRule, ordenadas por priority DESC)
      ├─ rule 1: { fact: 'user.roles', operator: 'contains', value: 'tecnico' }
      ├─ rule 2: { fact: 'context.hour', operator: 'greaterThanInclusive', value: 8 }
      └─ rule 3: { fact: 'context.hour', operator: 'lessThan', value: 18 }

  Evaluación de políticas (json-rules-engine)

  Para cada Policy (en orden de priority DESC):
      │
      ├─ Sin rules? → aplica policy.effect directamente
      │
      ├─ Con rules:
      │   Se crea un Engine con TODAS las reglas de la política
      │   engine.run(facts)
      │   │
      │   ├─ TODAS las reglas pasan (events.length === rules.length)?
      │   │   → retorna policy.effect ('allow' o 'deny')
      │   │   → STOP (primera política que matchea gana)
      │   │
      │   └─ No todas pasan? → siguiente política
      │
      └─ Ninguna política matcheó? → retorna null → se trata como ALLOW
         (porque el paso 2 ya confirmó que el permiso por rol existe)

  Operadores disponibles (json-rules-engine built-in)

  ┌──────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
  │                 Operador                 │                                   Ejemplo                                   │
  ├──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ equal                                    │ { fact: 'application.environment', operator: 'equal', value: 'production' } │
  ├──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ notEqual                                 │ { fact: 'user.email', operator: 'notEqual', value: 'blocked@x.com' }        │
  ├──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ in                                       │ { fact: 'user.roles', operator: 'in', value: ['admin', 'superadmin'] }      │
  ├──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ contains                                 │ { fact: 'user.roles', operator: 'contains', value: 'tecnico' }              │
  ├──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ greaterThan / lessThan                   │ Para rangos numéricos (hora, prioridad, etc.)                               │
  ├──────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ greaterThanInclusive / lessThanInclusive │ Rangos inclusivos                                                           │
  └──────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

  Composición de condiciones

  // ALL (AND) — todas deben ser true
  { "all": [
      { "fact": "user.roles", "operator": "contains", "value": "tecnico" },
      { "fact": "membership.type", "operator": "equal", "value": "admin" }
  ]}

  // ANY (OR) — al menos una true
  { "any": [
      { "fact": "application.environment", "operator": "equal", "value": "development" },
      { "fact": "user.roles", "operator": "contains", "value": "superadmin" }
  ]}

  // NOT — invierte la condición
  { "not": { "fact": "membership.isExpired", "operator": "equal", "value": true } }

  El contexto llega por 2 vías

  Vía 1 — API directa (POST /abac/can-access):
  {
      "userId": "uuid",
      "applicationId": "uuid",
      "resource": "incidents",
      "action": "create",
      "context": {
          "hour": 14,
          "ip": "10.0.1.50",
          "cornerId": "corner-uuid",
          "deviceType": "ATM"
      }
  }

  Vía 2 — RolesGuard (automático en controllers con @Permissions()):
  // El guard toma context del request
  const hasAccess = await this.abacService.canAccess(
      user.id, app.id, resource, action,
      request.context || {}    // ← lo que el middleware/interceptor haya puesto
  );

  Ejemplo concreto end-to-end

  Política: "incidents-solo-horario-corner"
  ├─ effect: 'deny'
  ├─ priority: 100 (alta, se evalúa primero)
  ├─ permissions: [incidents:create]
  ├─ rules:
  │   ├─ { fact: "context.hour", operator: "lessThan", value: 8 }     // antes de las 8am
  │   └─ { fact: "application.environment", operator: "equal", value: "production" }
  │
  │ Si son las 6am en producción → ambas reglas pasan → effect = DENY
  │ Si son las 10am → regla 1 falla → política no matchea → siguiente política
  │ Si es development → regla 2 falla → no matchea → siguiente política

  Resumen del modelo completo

                       PERMISOS (qué puede hacer)
                       ──────────────────────────
  User ─→ UserRole ─→ Role ─→ RolePermission ─→ Permission (resource:action)
                                                      │
                       POLÍTICAS (bajo qué condiciones)
                       ────────────────────────────────
                       Policy ─→ PolicyPermission ─→ Permission (mismo)
                         │
                         └─→ PolicyRule[] ─→ json-rules-engine
                                                 │
                       FACTS (datos en runtime)   │
                       ───────────────────────    ▼
                       { user, application,   ─→ Engine.run(facts)
                         membership, context }    │
                                                 ▼
                                            ALLOW / DENY

  Los permisos dicen "incidents:create está permitido". Las políticas agregan condiciones: "pero solo en horario laboral, solo en
  producción, solo si eres técnico del corner X". El contexto es el dato dinámico que el caller envía en cada request para que las
  reglas puedan evaluarlo.

---

❯ El user esta relacionado con el tipo de autenticacion para relacionarlo con abac

● Déjame trazar la relación exacta mirando cómo cada flujo auth crea o resuelve el User.

  Read 4 files (ctrl+o to expand)

● Ahora veamos cómo los seeds crean los usuarios de servicio para M2M/OAuth:

  Read 1 file (ctrl+o to expand)

● Ahora tengo toda la trazabilidad. Así es la relación:

  User como pivote universal entre autenticación y ABAC

  La tabla users es el punto de convergencia — no importa cómo te autenticaste, siempre terminas siendo un User.id con roles y
  permisos.

  Dos tipos de User, tres formas de llegar

  ┌─────────────────────────────────────────────────────────────┐
  │                        users table                          │
  │                                                             │
  │  accountType = 'user'              accountType = 'service'  │
  │  ┌──────────────────────┐          ┌──────────────────────┐ │
  │  │ email: juan@corp.com │          │ email: svc-gateway@  │ │
  │  │ entraId: "abc-oid"   │          │   eventcorner.internal│
  │  │ passwordHash: null   │          │ entraId: null         │ │
  │  │                      │          │ passwordHash: dummy   │ │
  │  └──────────┬───────────┘          └──────────┬───────────┘ │
  │             │                                 │             │
  │        Entra ID login                   owner de            │
  │                                      Application            │
  │                                   ┌──────┴───────┐         │
  │                              type:internal   type:oauth_client
  │                                (M2M)           (OAuth)      │
  └─────────────────────────────────────────────────────────────┘

  Cómo se crea cada User

  ┌─────────┬──────────────────────────────────────┬─────────────┬────────────┬─────────────────────┬──────────────────────────┐
  │  Auth   │           ¿Quién lo crea?            │ accountType │  entraId   │    passwordHash     │      Relación clave      │
  ├─────────┼──────────────────────────────────────┼─────────────┼────────────┼─────────────────────┼──────────────────────────┤
  │ Entra   │ syncEntraUser() automático al primer │ 'user'      │ oid de     │ null                │ User directo             │
  │ ID      │  login                               │             │ Azure      │                     │                          │
  ├─────────┼──────────────────────────────────────┼─────────────┼────────────┼─────────────────────┼──────────────────────────┤
  │ M2M     │ seed-m2m-services.ts manual          │ 'service'   │ null       │ dummy hash (no se   │ Application.ownerId →    │
  │         │                                      │             │            │ usa)                │ User                     │
  ├─────────┼──────────────────────────────────────┼─────────────┼────────────┼─────────────────────┼──────────────────────────┤
  │ OAuth   │ Seed o admin manual                  │ 'service'   │ null       │ dummy hash (no se   │ Application.ownerId →    │
  │         │                                      │             │            │ usa)                │ User                     │
  └─────────┴──────────────────────────────────────┴─────────────┴────────────┴─────────────────────┴──────────────────────────┘

  La indirección M2M/OAuth

  El token M2M y OAuth no autentican al User directamente — autentican a una Application. El User es el owner de esa Application:

  POST /auth/m2m-token { apiKey, apiSecret }
                            │
                            ▼
                Application (apiKey match)
                     │
                     │ application.owner
                     ▼
                User (accountType: 'service')
                     │
                     │ UserRole (userId, applicationId)
                     ▼
                Role → RolePermission → Permission

  El apiKey/apiSecret identifica la Application. La Application apunta a un User service. Ese User tiene roles. Esos roles tienen
  permisos. Los permisos van al JWT.

  El seed lo conecta todo

  seed-m2m-services.ts para cada servicio:

  1. Crea User (accountType: 'service')
     svc-api-gateway@eventcorner.internal

  2. Crea Application (type: 'internal')
     name: 'api-gateway', ownerId → User del paso 1

  3. Crea Role 'service-account' (compartido)

  4. Crea UserRole
     userId: User del paso 1
     roleId: 'service-account'
     applicationId: mainApp

  5. Crea RolePermission por cada permiso del servicio
     roleId: 'service-account'
     permissionId: 'incident:create', 'incident:read', etc.

  El camino completo: de auth a ABAC

                      AUTENTICACIÓN                          AUTORIZACIÓN (ABAC)
                ─────────────────────                 ──────────────────────────────

  Entra ID:     token Azure → JWKS validate
                → oid "abc-123"
                → syncEntraUser(oid)
                → findOne({ entraId: oid })  ─────→  User.id ──→ UserRole ──→ Role
                ó crear User si no existe                         │              │
                                                                  ▼              ▼
  M2M:          apiKey + apiSecret                          (applicationId)  RolePermission
                → findOne({ apiKey })                                           │
                → bcrypt.compare(secret)                                        ▼
                → application.owner ──────────────→  User.id ──→ UserRole   Permission
                                                                             resource:action
  OAuth:        client_id + client_secret                                       │
                → findOne({ apiKey: client_id })                                ▼
                → bcrypt.compare(secret)                                  ┌─────────────┐
                → application.owner ──────────────→  User.id ──→ ...      │ canAccess()  │
                → filter by scope ∩ permissions                           │ + policies   │
                                                                          │ + context    │
                                                                          └─────────────┘

  Lo que discrimina el tipo

  ┌─────────────────────┬───────────────┬──────────────────────────────────────────────┐
  │        Campo        │ Entra ID user │              M2M/OAuth service               │
  ├─────────────────────┼───────────────┼──────────────────────────────────────────────┤
  │ User.accountType    │ 'user'        │ 'service'                                    │
  ├─────────────────────┼───────────────┼──────────────────────────────────────────────┤
  │ User.entraId        │ "oid-uuid"    │ null                                         │
  ├─────────────────────┼───────────────┼──────────────────────────────────────────────┤
  │ User.passwordHash   │ null          │ dummy bcrypt (nunca se valida)               │
  ├─────────────────────┼───────────────┼──────────────────────────────────────────────┤
  │ Application.type    │ N/A           │ 'internal' (M2M) / 'oauth_client' (OAuth)    │
  ├─────────────────────┼───────────────┼──────────────────────────────────────────────┤
  │ Application.scopes  │ N/A           │ null (M2M, sin filtro) / ['res:act'] (OAuth) │
  ├─────────────────────┼───────────────┼──────────────────────────────────────────────┤
  │ Application.ownerId │ N/A           │ → User.id                                    │
  └─────────────────────┴───────────────┴──────────────────────────────────────────────┘

  En resumen

  ABAC no sabe ni le importa cómo te autenticaste. Solo necesita un userId para resolver UserRole → Role → RolePermission →
  Permission. La autenticación (Entra ID, M2M, OAuth) es solo el mecanismo para llegar a ese userId:

  - Entra ID: el userId ES el User (creado por lazy sync)
  - M2M/OAuth: el userId es el Application.owner (una cuenta de servicio)

  Después de eso, los 3 caminos convergen en la misma cadena de permisos y el mismo motor de políticas.