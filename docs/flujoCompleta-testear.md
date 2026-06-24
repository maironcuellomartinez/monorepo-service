
  SN_DEFAULT_COMPANY_SYS_ID — ya estaba en .env.development pero vacío. Lo completé con el sys_id de Santander Corporate
  (c3d4e5f6...). Listo, no hay que hacer nada más.

  external_id de usuarios — el seed ahora lo resuelve automáticamente en este orden:
  1. Busca initial-credentials.json generado por el abac seed (en la ruta relativa estándar)
  2. Si no lo encuentra, acepta los UUIDs por CLI: --emp1 <uuid> --emp2 <uuid>
  3. Si tampoco, deja un placeholder y avisa — podés hacer un UPDATE después

  Flujo completo para testear:
  # 1. Seed abac (genera initial-credentials.json)
  cd apps/abac-microservice && npx ts-node src/scripts/seed-initial-data.ts

  # 2. Seed servicenow-clone-backend
  cd servicenow-clone-backend && npx ts-node src/scripts/seed-reference-data.ts

  # 3. Seed monolith (lee initial-credentials.json automáticamente)
  cd apps/monolith && npx ts-node src/scripts/seed-test-data.ts

-----

   Ahora los comandos son:

  # Desde la raíz del monorepo (monolito-event-corner_v3)
  npm run abac:seed        # crea usuarios en abac + genera initial-credentials.json
  npm run monolith:seed    # crea empresas, corners, issue-types, usuarios en el monolith

  # Desde servicenow-clone-backend
  npm run seed             # crea empresas y grupos resolutores en servicenow_clone

  Orden correcto:
  1. npm run abac:seed — primero, genera initial-credentials.json
  2. npm run seed (servicenow-clone-backend)
  3. npm run monolith:seed — lee initial-credentials.json automáticamente para los external_id




════════════════════════════════════════════════════════════════
  EVENT CORNER v3 — CREDENCIALES INICIALES
════════════════════════════════════════════════════════════════

🔐 APLICACIÓN (para el API Gateway):
   Application ID : c024341d-49ae-46dc-afd0-5166b0f62040
   API Key        : ec_12102fa5ffb62a07db34a5e75db21ba00c947141
   API Secret     : 270f19bebabc96eedcc85cd945c8aa64e8d42c7b013f3b56f3419bf30319a103
   ─ Agregar en .env del API Gateway: ABAC_APP_ID / ABAC_API_KEY ─

👤 USUARIOS:

   [super-admin]
   Email      : superadmin@eventcorner.com
   Contraseña : superadmin
   User ID    : 17b45144-ec4f-4887-91c3-05a38ce84547

   [admin]
   Email      : admin@eventcorner.com
   Contraseña : j7D4GI#X(7Gxep%s
   User ID    : f9f3790a-0508-45c3-96c3-7fa8932a9322

   [manager]
   Email      : manager@eventcorner.com
   Contraseña : Wb(@2O&0gd2yqNaK
   User ID    : d6d2efc7-05ac-412f-ac38-9d4b54a02007

   [technician] — Carlos Técnico
   Email      : tecnico1@eventcorner.com
   Contraseña : CY$#7$6s2a0$pVz4
   User ID    : 064bed67-e0b4-4793-95bf-67c2d269ab8e

   [technician] — Laura Técnico
   Email      : tecnico2@eventcorner.com
   Contraseña : gih9ArOf#9GxF2Ry
   User ID    : 15a6fb1c-d528-4f59-9fc1-24d54aa69588

   [employee] — Juan Empleado
   Email      : empleado1@eventcorner.com
   Contraseña : wh^(J70uB6oJ6jus
   User ID    : 1ac7fc64-ded6-434a-9d98-e9414dd9b12c

   [employee] — María Empleado
   Email      : empleado2@eventcorner.com
   Contraseña : h!HSDI(mRPr6y@Te
   User ID    : f3a33af9-fb00-4585-a6e8-ac442d3ae264


    creame una tabla donde se especifique que datos de abac se deben configurar en gateway t monolith

● ┌────────────────────┬────────────────────────────────────┬─────────────────────────────────────┬─────────────────────────────────────┐
  │        Dato        │            Valor actual            │    api-gateway .env.development     │      monolith .env.development      │
  ├────────────────────┼────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────┤
  │ ABAC_URL           │ http://localhost:3005              │ ✅ ABAC_URL                         │ ✗ No usa ABAC                       │
  ├────────────────────┼────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────┤
  │ ABAC_API_KEY       │ ec_12102fa5...                     │ ✅ ABAC_API_KEY                     │ ✗ No usa ABAC                       │
  ├────────────────────┼────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────┤
  │ ABAC_APP_ID        │ c024341d-49ae...                   │ ✅ ABAC_APP_ID                      │ ✗ No usa ABAC                       │
  ├────────────────────┼────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────┤
  │ JWT_SECRET         │ dev-jwt-secret-change-in-prod      │ ✅ JWT_SECRET (para validar tokens) │ ✗ No valida JWT                     │
  ├────────────────────┼────────────────────────────────────┼─────────────────────────────────────┼─────────────────────────────────────┤
  │ INTERNAL_API_TOKEN │ dev-internal-secret-change-in-prod │ ✅ INTERNAL_API_TOKEN (lo envía)    │ ✅ INTERNAL_API_TOKEN (lo verifica) │
  └────────────────────┴────────────────────────────────────┴─────────────────────────────────────┴─────────────────────────────────────┘

  Regla simple:
  - Cada vez que corrés npm run abac:seed → actualizás ABAC_API_KEY y ABAC_APP_ID solo en el api-gateway.
  - El monolith no habla con ABAC — solo necesita que INTERNAL_API_TOKEN coincida con el del api-gateway.

---

⚠️  IMPORTANTE:
   1. Copia el API Key en el .env del API Gateway
   2. Cambia las contraseñas en el primer inicio de sesión
   3. Elimina initial-credentials.json después de guardar las credenciales




   
● # ─── CORNERS ──────────────────────────────────────────────────────────────────

  # Listar todos los corners activos
  curl -s http://localhost:3001/internal/corners | jq

  # Obtener un corner por ID
  curl -s http://localhost:3001/internal/corners/corner-buenos-aires-00000001 | jq
  curl -s http://localhost:3001/internal/corners/corner-madrid-000000000000001 | jq

  # Schedules de un corner
  curl -s http://localhost:3001/internal/corners/corner-buenos-aires-00000001/schedules | jq
  curl -s http://localhost:3001/internal/corners/corner-madrid-000000000000001/schedules | jq


  # ─── DISPONIBILIDAD ───────────────────────────────────────────────────────────

  # Ventanas disponibles (duration en minutos)
  curl -s "http://localhost:3001/internal/availability?cornerId=corner-buenos-aires-00000001&date=2026-03-18&duration=60" | jq
  curl -s "http://localhost:3001/internal/availability?cornerId=corner-madrid-000000000000001&date=2026-03-18&duration=60" | jq

  # Disponibilidad de técnicos en un corner para una fecha
  curl -s "http://localhost:3001/internal/availability/technicians?cornerId=corner-buenos-aires-00000001&date=2026-03-18" | jq
  curl -s "http://localhost:3001/internal/availability/technicians?cornerId=corner-madrid-000000000000001&date=2026-03-18" | jq


  # ─── ISSUE TYPES ──────────────────────────────────────────────────────────────

  # Listar todos
  curl -s http://localhost:3001/internal/issue-types

  # Filtrar por categoría
  curl -s "http://localhost:3001/internal/issue-types?category=hardware"

  # Filtrar los visibles al usuario final
  curl -s "http://localhost:3001/internal/issue-types?visibleToUsers=true"

  # Obtener uno por ID
  curl -s http://localhost:3001/internal/issue-types/it-hardware-general-00000001


  # ─── INCIDENCIAS ──────────────────────────────────────────────────────────────

  # Incidencias disponibles para tomar (sin técnico asignado)
  curl -s "http://localhost:3001/internal/incidents/available?cornerId=corner-buenos-aires-00000001"

  # Incidencias de un técnico
  curl -s http://localhost:3001/internal/incidents/technician/tech-ba-001
  curl -s http://localhost:3001/internal/incidents/technician/tech-ba-002
  curl -s http://localhost:3001/internal/incidents/technician/tech-mad-001

  # Obtener una incidencia por ID (reemplazar con UUID real)
  curl -s http://localhost:3001/internal/incidents/6f0e6d3d-6546-4aa4-a96f-b9904bbe9b54
  curl -s http://localhost:3001/internal/incidents/f534998d-2c52-48f8-a6de-e9261f53fc96
  curl -s http://localhost:3001/internal/incidents/85771557-dee1-4c6a-8cf4-dcb029c0d936


  # ─── DEVICES ──────────────────────────────────────────────────────────────────

   # Todos los dispositivos del usuario en caché (reales + virtuales)
  curl -s http://localhost:3001/internal/devices/user/user-empleado1-monolith-000001

  # Solo los virtuales
  # (ya existía internamente, si quisieras exponerlo también se puede)

  # Resolver/cachear un dispositivo por serial (requiere API de inventario)
  curl -s http://localhost:3001/internal/devices/SNTEST001/resolve

  # Forzar re-sync de un dispositivo ya cacheado
  curl -s -X POST http://localhost:3001/internal/devices/SNTEST001/sync

  # Refrescar todos los stale (>15 min sin sync)
  curl -s -X POST http://localhost:3001/internal/devices/refresh-stale

  Una vez que el API de inventario externo esté disponible y se haga un resolve exitoso, el endpoint user/:customerId devolverá los dispositivos cacheados del usuario con todos sus datos: serialNumber, model, brand, deviceType, status, lastSyncAt.

  # Resolver un dispositivo por número de serie
  # Flujo: busca en DB local → si no existe o está stale (>15min) → consulta API externa
  # Devuelve null si el API externo tampoco lo conoce
  curl -s http://localhost:3001/internal/devices/SNTEST001/resolve

  # Sincronizar forzadamente contra el inventario externo
  # Útil para forzar un refresh sin esperar los 15 min de TTL
  curl -s -X POST http://localhost:3001/internal/devices/SNTEST001/sync

  # Refrescar todos los dispositivos con TTL vencido (job de mantenimiento)
  # Devuelve { refreshed: N, errors: N }
  curl -s -X POST http://localhost:3001/internal/devices/refresh-stale

  # Importante: resolve y sync requieren que el API de inventario externo esté levantado, si no devuelven 400 Inventory API error: Request failed with status code 401. No hay endpoint para listar todos los devices en caché — ese acceso es directo a la DB o a través de la incidencia que los referencia (incident.deviceId).


  # ─── REQUESTS ─────────────────────────────────────────────────────────────────

  # Requests de un cliente
  curl -s http://localhost:3001/internal/requests/customer/user-empleado1-monolith-000001

  # Requests de un técnico
  curl -s http://localhost:3001/internal/requests/technician/tech-ba-001

  Nota: Si no tenés jq instalado, reemplazá | jq por | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))" o simplemente quitalo
  para ver el JSON crudo.


  # 4. Simular incidencias via gateway
     node gateway-simulator.js incidents \
    --email empleado1@eventcorner.com \
    --password 'wh^(J70uB6oJ6jus' \
    --customer-id user-empleado1-monolith-000001 \
    --date 2026-03-20 \
    --count 3 \
    --serial-number SNTEST001
---

estructura de un slot
---------------------
  
● Sí, es el ID del slot. Está compuesto por partes que lo hacen autodescriptivo:

  slt  -  ba  -  20260318  -  12
   │       │        │          │
   │       │        │          └── hora de inicio (12:00 UTC)
   │       │        └──────────── fecha (18 de marzo 2026)
   │       └───────────────────── corner (ba = Buenos Aires)
   └───────────────────────────── tipo (slot)

  Para Madrid sería slt-mad-20260318-12. Se generan en el seed con este patrón:

  const slotId = `slt-${cs.short}-${datePart}-${hourPart}`;
  // cs.short  = 'ba' | 'mad'
  // datePart  = '20260318'
  // hourPart  = '12'

  Esto hace que los IDs sean predecibles y legibles sin necesidad de consultar la DB para saber a qué franja corresponden.
