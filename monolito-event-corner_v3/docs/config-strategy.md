# Estrategia de configuración — Reemplazo de tabla `config` legacy

## Decisión de diseño

La tabla `config` legacy era un key-value store global con ~100 entradas.
Muchas eran artefactos de sistemas que no existen en el nuevo (Minerva, lockers HW, chatbot, NPS, etc.).

**Regla:**
- **DB** → configuración que varía **por entidad** (corner, company, issue type).
- **`.env`** → configuración que varía **por entorno** (dev / staging / prod) o son credenciales.
- **Constante en código** → valores que son **reglas de negocio fijas** y no cambian entre entornos.
- **Ignorado** → sistemas que no existen en el nuevo proyecto.

---

## Categorización completa

### ✅ Ya está en DB (entidades de dominio)

| Config legacy             | Dónde vive ahora                          |
|---------------------------|-------------------------------------------|
| `servicenow_group`        | `Corner.snowAssignmentGroup` ← añadido    |
| Company SN sys_id         | `Company.snowCompanieId`                  |
| Company SN name           | `Company.snowCompanyName`                 |
| Issue type SN category    | `IssueType.servicenowCategory`            |
| Issue type device type    | `IssueType.deviceType`                    |
| Corner schedule / slots   | `CornerSchedule` entity                   |
| `locker_available_places` | `Locker.cornerId` (por corner en DB)      |

---

### ✅ Ya está en `.env` (api-gateway)

| Config legacy             | Variable actual en api-gateway            |
|---------------------------|-------------------------------------------|
| JWT secret                | `JWT_SECRET`                              |
| JWT issuer / audience     | `JWT_ISSUER` / `JWT_AUDIENCE`             |
| ABAC microservice URL     | `ABAC_URL`                                |
| Inventory URL             | `EXTERNAL_INVENTORY_URL`                  |

> ⚠️ **`OUTBOUND_GATEWAY_URL` / `OUTBOUND_GATEWAY_CLIENT_ID` / `OUTBOUND_GATEWAY_SECRET`**: siguen presentes en `apps/api-gateway/.env.*` pero son config **muerta** de un diseño previo ("Corporate Gateway" con OAuth) que fue descartado. No se leen en ningún archivo de `apps/api-gateway/src`. El egress real hacia ServiceNow es vía `SNOWQ_URL` → `api-snowq-service` (ver `apps/api-gateway/src/outbound/servicenow/servicenow-outbound.controller.ts`). Pendiente de limpieza: eliminar esas variables de los `.env.*`.

---

### 🆕 Necesita añadirse al `.env` del monolito

#### ServiceNow — comportamiento global

| Variable                       | Config legacy                           | Dev default                          | Por qué .env                                    |
|--------------------------------|-----------------------------------------|--------------------------------------|-------------------------------------------------|
| `SN_INTEGRATION_ENABLED`       | `servicenow_integration_active: true`   | `false`                              | En dev no queremos crear tickets reales         |
| `SN_DEFAULT_COMPANY_SYS_ID`    | `servicenow_company: 0ae822d8db...`     | (vacío)                              | Fallback cuando `company.snowCompanieId` es null|
| `SN_DEFAULT_PRIORITY`          | `servicenow_default_priority: 3`        | `3`                                  | Puede diferir entre entornos/clientes           |
| `SN_DEFAULT_CATEGORY`          | `servicenow_category: incident_enduser_device` | `incident_enduser_device`   | Fallback cuando `issueType.servicenowCategory` es null |
| `SN_EXTERNAL_ID_FIELD`         | `servicenow_externalid: u_external_system_id` | `u_external_system_id`       | El nombre del campo en SN varía por instancia   |
| `SN_CREATE_REQUESTS_ENABLED`   | `servicenow_create_requests: true`      | `false`                              | Feature flag: habilitar tickets para tipo REQ   |
| `SN_MANUAL_ASSIGNMENT_ENABLED` | `servicenow_manual_active: true`        | `false`                              | Feature flag: permitir cambiar grupo manualmente|

#### Disponibilidad / reservas

| Variable                    | Config legacy                    | Dev default | Por qué .env                                       |
|-----------------------------|----------------------------------|-------------|----------------------------------------------------|
| `AVAILABILITY_DAYS_AHEAD`   | `availability_days: 14`          | `14`        | Podría reducirse a 7 en staging para pruebas       |
| `AVAILABILITY_GAP_MIN`      | `availability_gap_min: 10`       | `10`        | Mínimo de minutos entre citas                      |
| `AVAILABILITY_MONTHS_PAST`  | `availability_months_past: 7`    | `3`         | Cuántos meses atrás mostrar historial              |
| `EXCLUDE_WEEKENDS`          | `exclude_weekends: true`         | `true`      | Regla de negocio que puede variar por cliente      |

---

### 📌 Constantes en código (no necesitan .env ni DB)

Estos valores son reglas de negocio invariables. Hardcodearlos es correcto.

| Constante                   | Config legacy                         | Valor  | Dónde va                        |
|-----------------------------|---------------------------------------|--------|---------------------------------|
| Máx. chars comentario       | `num_max_chars_comments: 2000`        | 2000   | DTO validation `@MaxLength`     |
| Paginación por defecto      | `registers_per_page: 8`               | 10     | Constante en controller         |
| Mín. duración slot          | —                                     | 5 min  | Ya en `CornerSchedule.create()` |
| Máx. duración slot          | —                                     | 60 min | Ya en `CornerSchedule.create()` |
| Retención login history     | `loginhistory_delete_months: 12`      | 12     | Constante en job de limpieza    |

---

### ❌ No necesario — Sistemas que no existen en el nuevo proyecto

| Grupo                    | Config legacy (ejemplos)                                         |
|--------------------------|------------------------------------------------------------------|
| **Minerva** (inventario) | `minerva_url`, `psw_minerva`, `user_minerva`, `check_spare_*`, `warehouses_minerva`, `create_virtual_assets` |
| **Lockers hardware**     | `locker_url`, `locker_token`, `locker_available_boxes`, `locker_available_machineref`, `GET#free_boxes`, `POST#shipment` |
| **Ratings**              | `ratings_url`, `ratings_token`, `ratings_mobile_token`           |
| **Chatbot**              | `token_apichatbot`, `url_apichatbot`, `min_exp_apichatbot`       |
| **NPS**                  | `show_form_nps`, `send_mail_auto_nps`, `closeonservicenow_nps`, `link_mail_auto_nps` |
| **Droppoint**            | `poll_enable_droppoint`, `seconds_pooling_droppoint`, `inbox_update_droppoint` |
| **iOS / mobile**         | `ios_app_bundle_id`, `ios_app_pfx`, `ios_app_psw`, `send_ios_notifications` |
| **Onboarding**           | `create_onboarding`, `onboarding_minerva`, `show_button_create_onboarding` |
| **Depositions**          | `create_depositions`, `deposition_minerva`, `undo_deposition_minerva` |
| **PowerBI**              | `max_days_report_powerbi`, `minutes_cached_powerbi`              |
| **Debug flags**          | `debug_apichatbot`, `debug_apilocker`, `debug_apiservicenow`, etc. |
| **LDAP específico**      | `autocreate_customers_without_ldap`, `autocreate_ldap_customers`, `direct_ldap_login` |

---

### ⏳ No necesario ahora — Poller de ServiceNow (implementación futura)

Estas entradas eran para un worker que sondeaba SN periódicamente para actualizar estados.
No hay poller en el nuevo sistema todavía. Cuando se implemente, estas serán vars del worker.

| Config legacy                             | Descripción                                        |
|-------------------------------------------|----------------------------------------------------|
| `servicenow_seconds_pooling_closeresolved`| Cada cuántos segundos chequear tickets resueltos   |
| `seconds_pooling_check`                   | Intervalo general de sondeo                        |
| `seconds_pooling_queued_requests`         | Intervalo de sondeo de solicitudes en cola         |
| `poll_enable_closed_incidents`            | Habilitar sondeo de incidentes cerrados            |
| `poll_enable_queuedrequests`              | Habilitar sondeo de solicitudes en cola            |
| `queue_requests_frequency`               | Frecuencia de la cola de solicitudes               |
| `queue_requests_if_unsent`               | Reenviar si no fue enviado                         |
| `queue_requests_schedule`               | Horario del poller (`00:00-23:59`)                 |
| `resend_queued_requests`                 | Reenviar requests en cola                          |
| `servicenow_group_requests`              | Prefijos de grupos aceptados para REQ (`SGT_EU_IT_,SGT_EU_ES_`) |
| `servicenow_requests_servicenow_close`   | Códigos de resolución que auto-cierran tickets     |
| `servicenow_transitions`                 | Usar transiciones de estado en SN                  |
| `poll_abort_scan_queued_requests_if_fail`| Abortar scan si falla                              |

---

## Estado de implementación (2026-03-27)

| Variable | Estado | Notas |
|---|---|---|
| `SN_DEFAULT_COMPANY_SYS_ID` | ✅ Implementado | `servicenow-integration.service.ts:32,39` — fallback en `resolveSnowCompanySysId()` |
| `SN_INTEGRATION_ENABLED` | ⏳ Pendiente | Guard antes de llamar al cliente SN |
| `SN_DEFAULT_CATEGORY` | ⏳ Pendiente | Fallback cuando `issueType.servicenowCategory` es null |
| `SN_DEFAULT_PRIORITY` | ⏳ Pendiente | Añadir al payload de SN |
| `SN_EXTERNAL_ID_FIELD` | ⏳ Pendiente | Nombre del campo en SN al actualizar con external ID |
| `SN_CREATE_REQUESTS_ENABLED` | ⏳ Pendiente | Feature flag en `RequestService` |
| `AVAILABILITY_DAYS_AHEAD` | ⏳ Pendiente | En `AvailabilityService` |
| `AVAILABILITY_GAP_MIN` | ⏳ Pendiente | En `AvailabilityService` |
| DTO comentarios `@MaxLength` | ⏳ Pendiente | `@MaxLength(2000)` en campos de comentario |
