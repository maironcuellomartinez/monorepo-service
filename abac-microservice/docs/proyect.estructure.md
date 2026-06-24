src/
├── abac/
│   ├── entities/
│   │   ├── policy.entity.ts
│   │   ├── application.entity.ts
│   │   ├── user.entity.ts
│   │   ├── user-app.entity.ts
│   │   └── resource.entity.ts
│   ├── engine/
│   │   └── rule-engine.ts
│   ├── services/
│   │   ├── abac.service.ts
│   │   └── policy.service.ts
│   ├── guards/
│   │   └── abac.guard.ts
│   ├── decorators/
│   │   └── permission.decorator.ts
│   ├── controllers/
│   │   ├── policy.controller.ts
│   │   └── abac.controller.ts
│   └── dtos/
│       ├── create-policy.dto.ts
│       └── evaluate-policy.dto.ts
├── common/
│   ├── interceptors/
│   │   └── transaction.interceptor.ts
│   └── base/
│       └── base-entity.ts
├── config/
│   ├── database.config.ts
│   └── swagger.config.ts
├── app.module.ts
└── main.ts





# Generar nueva migración (después de cambiar entidades)
npm run migration:generate --name=CreateNewTable

# Crear migración vacía (para cambios manuales)
npm run migration:create --name=CustomChanges

# Ejecutar migraciones
npm run migration:run

# Revertir última migración
npm run migration:revert

# Mostrar estado de migraciones
npm run migration:show

# Ejecutar migraciones en producción
NODE_ENV=production npm run migration:run




----



● Listo. Resumen de lo que quedó:

  ┌─────────────────────┬───────────────────┬────────────────────────────────────────┐
  │      Servicio       │ tokenDurationDays │              Razonamiento              │
  ├─────────────────────┼───────────────────┼────────────────────────────────────────┤
  │ api-gateway         │ 180 días          │ Rotación semestral estándar            │
  ├─────────────────────┼───────────────────┼────────────────────────────────────────┤
  │ monolith            │ 180 días          │ Rotación semestral estándar            │
  ├─────────────────────┼───────────────────┼────────────────────────────────────────┤
  │ integration-service │ 90 días           │ Conectores externos, mayor exposición  │
  ├─────────────────────┼───────────────────┼────────────────────────────────────────┤
  │ api-snowq-service   │ 365 días          │ Solo habla con ServiceNow, muy estable │
  └─────────────────────┴───────────────────┴────────────────────────────────────────┘

  El flujo operativo queda:
  1. npm run abac:seed:m2m — genera credenciales + muestra duración por servicio
  2. Cada servicio llama una vez a POST /auth/m2m-token con sus ABAC_API_KEY + ABAC_API_SECRET
  3. El JWT resultante va en .env como ABAC_M2M_TOKEN=eyJ...
  4. Cuando el token se acerca a vencer → volver al paso 2 manualmente

  Los valores de 90/180/365 son sugeridos — se pueden cambiar directamente en el ServiceDefinition del seed antes de ejecutarlo.

  ---

  
● Credenciales generadas. Ahora llamo POST /auth/m2m-token para cada servicio para obtener los JWT:

● Bash(curl -s -X POST http://localhost:3005/auth/m2m-token \
        -H "x-api-key: ak_a9cc3d01d0ba7db7c102f8687fab3328b2b96ea650f1a892" \…)
  ⎿  {
       "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMTEwNTU3NC1mNmQwLTRhNTItODI0ZS01MzZlNzNiNmNhY2YiLCJ0eXBl
     Ijoic2VydmljZSIsImFwcGxpY2F0aW9uSWQiOiJkMmE1ZjlkOS1hN2Q1LTQ3MWEtODZiNC03ZDE5ZjQ3MGRkOTIiLCJhcHBsaWNhdGlvbk5hbWUiOiJhcGktZ2F
     … +20 lines (ctrl+o to expand)

● Bash(curl -s -X POST http://localhost:3005/auth/m2m-token \
        -H "x-api-key: ak_5486a1e28be3b88e69f2c2f76ae17e04d656a2da4b3d34d3" \…)
  ⎿  {
       "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmZTQ3MTFkYy0zYWY2LTRhM2MtYjFmZi04NzQyYjM1ZTYwZGMiLCJ0eXBl
     Ijoic2VydmljZSIsImFwcGxpY2F0aW9uSWQiOiI4ZWE1OTI1Mi05YmYxLTQwNGQtOGRmZS03YjdjMWEwYjcxYTgiLCJhcHBsaWNhdGlvbk5hbWUiOiJtb25vbGl
     … +20 lines (ctrl+o to expand)

● Bash(curl -s -X POST http://localhost:3005/auth/m2m-token \
        -H "x-api-key: ak_66ff986bb8c2073d2160efd12f2d8fd8e7d503cefe7e0cd5" \…)
  ⎿  {
       "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3NDI3ZDNhOS0xODk4LTQwZWItYjBmYi0yODU1MjM0NWVkMGMiLCJ0eXBl
     Ijoic2VydmljZSIsImFwcGxpY2F0aW9uSWQiOiIzNjhjZGNiNy05YzljLTQ4ZmQtOWNhYS1jYWVlNjk3MDU0NDAiLCJhcHBsaWNhdGlvbk5hbWUiOiJpbnRlZ3J
     … +19 lines (ctrl+o to expand)

● Bash(curl -s -X POST http://localhost:3005/auth/m2m-token \
        -H "x-api-key: ak_ffc7e829f010b86e7e3648d0983188c30c2badd1064d151b" \…)
  ⎿  {
       "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmZTUyMTQ0MC1hNjhkLTQ5OGEtYTk4My02MDdjZTM1MmUwNTciLCJ0eXBl
     Ijoic2VydmljZSIsImFwcGxpY2F0aW9uSWQiOiJhYTgyYmNlNC04ZDcxLTQ2YjAtOWE2My05YWNmNTZlYTc4ZTAiLCJhcHBsaWNhdGlvbk5hbWUiOiJhcGktc25
     … +19 lines (ctrl+o to expand)


---

  ---
  Dos vías para generar el keypair:

  1. Via npm run seed (primera vez o desde cero)

  El seed ahora:
  1. Detecta si ED25519_PRIVATE_KEY ya existe en el env
  2. Si no existe → genera un keypair nuevo y lo escribe directamente en .env.development
  3. Lo imprime en consola junto al resto de credenciales
  4. Lo incluye en initial-credentials.json (con la clave privada, ya que es generación nueva)

  Salida en consola:
  🔑 Ed25519: generando nuevo keypair...
     ✅ Keypair escrito en /ruta/.env.development

  🔑 Ed25519 KEYPAIR (tokens M2M):
     ED25519_PRIVATE_KEY=<64 bytes base64>
     ED25519_PUBLIC_KEY=<32 bytes base64>
     ED25519_KID=abac-m2m-v1

     ─ PRIVATE_KEY: solo en abac-microservice ─
     ─ PUBLIC_KEY : copiar en api-gateway, monolith, api-snowq-service ─

  2. Via dashboard (rotación posterior)

  Botón "Generar keypair" en la card Ed25519 de la pestaña M2M:
  1. Muestra advertencia — tokens en circulación se invalidan al instante
  2. Genera y activa el keypair en memoria de inmediato (sin reiniciar ABAC)
  3. Muestra la clave privada (oculta por defecto, revelar con un clic) con botón copiar
  4. Muestra la clave pública con botón copiar
  5. Muestra bloques .env listos para pegar — uno para ABAC, otro para los tres verificadores
  6. La clave privada es visible solo en ese dialog — ciérralo y desaparece


---

  ---
  Dos vías para generar el keypair:

  1. Via npm run seed (primera vez o desde cero)

  El seed ahora:
  1. Detecta si ED25519_PRIVATE_KEY ya existe en el env
  2. Si no existe → genera un keypair nuevo y lo escribe directamente en .env.development
  3. Lo imprime en consola junto al resto de credenciales
  4. Lo incluye en initial-credentials.json (con la clave privada, ya que es generación nueva)

  Salida en consola:
  🔑 Ed25519: generando nuevo keypair...
     ✅ Keypair escrito en /ruta/.env.development

  🔑 Ed25519 KEYPAIR (tokens M2M):
     ED25519_PRIVATE_KEY=<64 bytes base64>
     ED25519_PUBLIC_KEY=<32 bytes base64>
     ED25519_KID=abac-m2m-v1

     ─ PRIVATE_KEY: solo en abac-microservice ─
     ─ PUBLIC_KEY : copiar en api-gateway, monolith, api-snowq-service ─

  2. Via dashboard (rotación posterior)

  Botón "Generar keypair" en la card Ed25519 de la pestaña M2M:
  1. Muestra advertencia — tokens en circulación se invalidan al instante
  2. Genera y activa el keypair en memoria de inmediato (sin reiniciar ABAC)
  3. Muestra la clave privada (oculta por defecto, revelar con un clic) con botón copiar
  4. Muestra la clave pública con botón copiar
  5. Muestra bloques .env listos para pegar — uno para ABAC, otro para los tres verificadores
  6. La clave privada es visible solo en ese dialog — ciérralo y desaparece

--


  El flujo correcto es: para asignar un servicio de infrastructura aun ecosistema.

  1. Primero editar el servicio M2M desde el dashboard → asignar "Event Corner" como ecosistema → Guardar
  2. Verificar que la columna ya muestra "Event Corner" (no Global) — esto confirma que el fix de la entidad funciona
  3. Luego emitir el JWT con el botón 🔑 — ese token ya tendrá ownerApplicationId en el payload
  4. Copiar ese JWT al .env como ABAC_M2M_TOKEN y reiniciar el gateway