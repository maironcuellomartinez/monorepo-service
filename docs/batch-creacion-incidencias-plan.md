# Plan: Creación de Incidencias en Lote — Hardening y Escalado

**Estado:** Fases 1, 2 y 3 COMPLETADAS — ver `monolito-event-corner_v3/docs/batch-drafts.md`
**Fecha inicio:** 2026-04-19
**Fecha última actualización:** 2026-04-19
**Contexto:** empresa cliente con 5000+ empleados, alta concurrencia de técnicos creando/atendiendo incidencias.
**Infraestructura:** sin Redis — cache local in-process + MySQL.

> **Nota 2026-07-31:** plan histórico — describe el código tal como existía en 2026-04-19.
> `incident.service.createIncident()` y `POST /api/incidents` mencionados abajo se renombraron
> a `appointmentService.createAppointment()` y `POST /api/appointments` tras el remodelado
> `Incident`/`Request` → `Appointment` (2026-07). El comportamiento descrito (holds HELD→BOOKED,
> `bookManyAtomic`) sigue vigente — ver `monolito-event-corner_v3/docs/batch-drafts.md` (fuente
> de verdad actualizada).

---

## 1. Contexto

El flujo de **creación en lote** (feature `Lote de Incidencias` en `event-corner-app`) permite a un técnico armar N incidencias antes de enviarlas juntas a ServiceNow. Hoy:

- El lote vive solo en `localStorage` del navegador del técnico, aislado por `monolithUserId`.
- Al enviar, cada item pega a `POST /api/incidents` (mismo endpoint que una incidencia normal).
- Se implementó `bookManyAtomic` en el monolith: el booking del slot es un `UPDATE` condicional (`WHERE status='AVAILABLE'`) que gana solo el primero en llegar.

## 2. Problemas identificados

| # | Problema | Severidad |
|---|---|---|
| P1 | **Slots no reservados durante el draft** — mientras el técnico arma el lote, otro técnico puede crear incidencias "sueltas" sobre los mismos slots. El conflicto aparece solo al enviar (frustración alta: horas de trabajo perdidas). | Alta |
| P2 | **Sin validación de slots en pasado** — si el técnico guarda un lote hoy y lo envía mañana, los slots de hoy ya pasaron. Hoy no se valida. | Media |
| P3 | **Lote no sincronizado entre dispositivos** — técnico que empieza en tablet del corner no puede continuar desde su laptop. | Media |
| P4 | **Sin observabilidad** — no hay métricas de conflictos, lotes abandonados, tasa de fallo. Imposible hacer capacity planning. | Media |

## 3. Diseño objetivo

### 3.1 Estado del slot extendido

Agregar estado intermedio `HELD` al enum `SlotStatus`:

```
AVAILABLE → HELD → BOOKED
     ↑        │
     └────────┘  (expiración, lazy)
```

Schema:

```sql
ALTER TABLE corner_slots
  ADD COLUMN held_by_user_id VARCHAR(50) NULL,
  ADD COLUMN held_until TIMESTAMP NULL,
  ADD INDEX idx_corner_starts_status_held (corner_id, starts_at, status, held_until);
```

### 3.2 Expiración lazy (sin cron obligatorio)

Todas las queries que consultan disponibilidad tratan los `HELD` expirados como `AVAILABLE`:

```sql
-- Reservar (o re-reclamar hold expirado) — atómico
UPDATE corner_slots
SET status = 'HELD', held_by_user_id = ?, held_until = NOW() + INTERVAL 15 MINUTE
WHERE slot_id IN (...)
  AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < NOW()))

-- Availability query
WHERE status = 'AVAILABLE'
   OR (status = 'HELD' AND held_until < NOW())
   OR (status = 'HELD' AND held_by_user_id = :currentUser)  -- mis propios holds los veo
```

Un cron opcional (diario) limpia `HELD` expirados para mantener el índice eficiente, pero no es crítico para la corrección.

### 3.3 Draft del lote en backend

Tablas nuevas:

```sql
CREATE TABLE incident_batch_drafts (
  id             VARCHAR(50) PRIMARY KEY,
  user_id        VARCHAR(50) NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

CREATE TABLE incident_batch_draft_items (
  id                 VARCHAR(50) PRIMARY KEY,
  draft_id           VARCHAR(50) NOT NULL,
  local_id           VARCHAR(50) NOT NULL,  -- id generado en el cliente para tracking
  corner_id          VARCHAR(50) NOT NULL,
  customer_id        VARCHAR(50) NOT NULL,
  device_serial      VARCHAR(100) NOT NULL,
  issue_type_id      VARCHAR(50) NOT NULL,
  slot_ids_json      JSON NOT NULL,
  start_time         TIMESTAMP NOT NULL,
  end_time           TIMESTAMP NOT NULL,
  description        TEXT,
  notes              TEXT,
  status             VARCHAR(20) NOT NULL,  -- pending, error (no guardamos success)
  last_error         TEXT,
  FOREIGN KEY (draft_id) REFERENCES incident_batch_drafts(id) ON DELETE CASCADE,
  INDEX idx_draft (draft_id)
);
```

### 3.4 Endpoints nuevos (api-gateway + monolith)

```
GET    /api/batch-drafts                    → draft del técnico actual (o null)
POST   /api/batch-drafts/items              → agrega item + crea HELD para sus slots
PATCH  /api/batch-drafts/items/:id          → edita item + mueve HELD si cambió slot
DELETE /api/batch-drafts/items/:id          → elimina item + libera HELD
POST   /api/batch-drafts/submit             → envía el lote completo (HELD → BOOKED)
DELETE /api/batch-drafts                    → descarta draft (libera todos los HELD)
POST   /api/slots/hold/renew                → extiende TTL de holds activos del técnico
```

### 3.5 Flujo completo

```
Agregar al lote
  → POST /api/batch-drafts/items
      ├─ valida slots (disponibles + futuros)
      ├─ UPDATE atómico: slots AVAILABLE → HELD (con held_by_user_id = currentUser)
      ├─ si algún slot no se pudo holdear → 409 Conflict con lista de slots perdidos
      └─ inserta en incident_batch_draft_items

Verificar disponibilidad (desde el wizard)
  → GET /api/availability/:cornerId
      └─ filtra HELD de otros técnicos; muestra HELD propios como ocupados del lote

Renovar (mientras el wizard está abierto — polling cada 5min)
  → POST /api/slots/hold/renew
      └─ UPDATE held_until = NOW() + 15min WHERE held_by_user_id = currentUser

Enviar lote
  → POST /api/batch-drafts/submit
      ├─ for each item (secuencial):
      │    ├─ valida que startTime > NOW() (rechaza slots en pasado)
      │    ├─ UPDATE atómico: HELD → BOOKED (solo si held_by_user_id = currentUser)
      │    ├─ crea Incident (mismo flujo que POST /api/incidents)
      │    └─ emite evento INCIDENT_CREATED al Outbox (→ ServiceNow)
      ├─ borra draft al completar todos los items OK
      └─ responde con array de resultados (success/error por item)
```

## 4. Fases de implementación

### Fase 1 — Validaciones básicas y hardening existente

**Objetivo:** eliminar los bugs inmediatos sin cambios de schema. Es baseline antes de tocar nada grande.

- [x] **F1.1** Validación frontend: filtrar/marcar items del lote cuyo `startTime < now` al abrir la página. Banner de advertencia.
- [x] **F1.2** Validación frontend: antes de enviar, rechazar items con slot en pasado (mostrar error rojo en el item).
- [x] **F1.3** Validación backend en `incident.service.ts`: antes de `bookManyAtomic`, validar `slot.timeRange.start > now`. Retornar error claro si no.
- [x] **F1.4** Test unitario: confirmar que `POST /api/incidents` del lote usa el mismo flujo (Outbox + `INCIDENT_CREATED` handler + SnowqAdapter) que una incidencia individual.
- [x] **F1.5** Test e2e: crear 2 lotes en paralelo apuntando al mismo slot → uno gana, el otro recibe error claro.

**Criterios de salida:**
- Tests nuevos en verde.
- No hay posibilidad de enviar slot en pasado.
- Doc confirmando que la ruta a ServiceNow es idéntica.

**Estimación:** 1-2 días.

---

### Fase 2 — Slot reservation (HELD) en la DB

**Objetivo:** reservar slots al momento de agregarlos al lote, para que sean visibles como ocupados para otros técnicos.

- [x] **F2.1** Schema: agregar `held_by_user_id`, `held_until` a `corner_slots`. Extender enum `SlotStatus` con `HELD`.
- [x] **F2.2** Entidad de dominio `Slot`: agregar `hold(userId, ttl)`, `releaseHold(userId)`, `isHeldBy(userId)`, `isHoldExpired()`, `isAvailableForUser(userId?)`.
- [x] **F2.3** `slot-repository.port.ts`: nuevos métodos:
  - `holdManyAtomic(slotIds, userId, ttlMinutes): Result<number>`
  - `releaseHoldsAtomic(slotIds, userId): Result<number>`
  - `convertHoldsToBooked(slotIds, userId): Result<number>` (HELD → BOOKED)
  - `releaseExpiredHolds(olderThanHours?): Result<number>` (para cron)
- [x] **F2.4** Implementación TypeORM con `UPDATE` condicional atómico; `toDomain`/`toEntity` actualizados.
- [x] **F2.5** `availability.service.ts`: HELD expirados tratados como AVAILABLE; HELD propios muestran `heldByCurrentUser: true`. Nuevo campo opcional `userId` en `AvailabilityQuery`. Ambos controllers actualizados.
- [x] **F2.6** `incident.service.createIncident`: `bookManyAtomic(slotIds, heldByUserId?)` — si hay userId convierte HELD → BOOKED, si no solo AVAILABLE → BOOKED.
- [x] **F2.7** `cancelIncident` sin cambios — slots BOOKED vuelven a AVAILABLE correctamente; HELD fields se limpian en `release()` y `expire()`.
- [x] **F2.8** Índice compuesto `@Index('idx_corner_starts_status_held', ...)` en `CornerSlotEntity`.
- [x] **F2.9** `SlotHoldCleanupJob`: cron diario (`@Cron(EVERY_DAY_AT_MIDNIGHT)`) que llama `releaseExpiredHolds(1)`.
- [x] **F2.10** Tests: `slot.entity.spec.ts` con 28 nuevos casos (hold, releaseHold, isHeldBy, isHoldExpired, isAvailableForUser). `incident.service.spec.ts` con 2 nuevos tests para F2.6. 73/73 en verde.

**Criterios de salida:**
- Un técnico puede holdear slots desde el frontend (endpoint aún no, solo desde tests).
- Otro técnico no ve slots holdeados en availability.
- Los holds expirados se auto-ignoran al consultar.

**Estimación:** 5-7 días.

---

### Fase 3 — Draft del lote en backend

**Objetivo:** mover el draft de `localStorage` a la DB. Permite sync entre dispositivos y auditoría.

- [ ] **F3.1** Schema: crear tablas `incident_batch_drafts` y `incident_batch_draft_items`.
- [ ] **F3.2** Entidad de dominio `BatchDraft` + casos de uso: `getMyDraft`, `addItem`, `editItem`, `removeItem`, `submit`, `discard`.
- [ ] **F3.3** Controlador + endpoints en monolith (internal-api) + proxy en api-gateway.
- [ ] **F3.4** El `addItem` hace `holdManyAtomic` → si falla, no se agrega al draft.
- [ ] **F3.5** El `removeItem` hace `releaseHoldsAtomic`.
- [ ] **F3.6** El `submit` convierte HELD → BOOKED por item (atómico) y crea Incidents secuencialmente. Responde array de resultados.
- [ ] **F3.7** Refactor `batch-incident-page.tsx`: hook `useBatchDraft` pega a la API en vez de localStorage. Mantener fallback a localStorage si el user está offline.
- [ ] **F3.8** Endpoint `POST /api/slots/hold/renew` — frontend lo llama cada 5min mientras la página esté abierta.
- [ ] **F3.9** Migración: si un técnico tiene draft en localStorage viejo, migrarlo al backend al primer load.
- [ ] **F3.10** Tests e2e: armar lote desde tablet, completarlo desde laptop, enviarlo.

**Criterios de salida:**
- Draft persistente en backend, accesible desde cualquier dispositivo del técnico.
- Holds se crean/liberan automáticamente al manipular el draft.
- Renovación automática funciona.

**Estimación:** 5-7 días.

---

### Fase 4 — UX y observabilidad

**Objetivo:** cerrar gaps de usabilidad y tener métricas para capacity planning.

- [ ] **F4.1** Countdown en UI: "Tu reserva expira en 12:45" por cada item del lote.
- [ ] **F4.2** Notificación visual cuando un hold expira y el slot queda liberado (polling + toast).
- [ ] **F4.3** Confirmación antes de descartar el draft (por el botón "Borrar lote").
- [ ] **F4.4** Banner con warning si al abrir la página hay items cuyo hold ya expiró.
- [ ] **F4.5** Métricas (Prometheus via `@app/observability`):
  - `batch_holds_active` (gauge) — holds actualmente activos
  - `batch_holds_expired_total` (counter) — holds que expiraron sin convertirse
  - `batch_holds_converted_total` (counter) — holds que terminaron en BOOKED (éxito)
  - `batch_submit_conflicts_total` (counter) — conflictos al enviar (slot ya no disponible)
  - `batch_draft_duration_seconds` (histogram) — tiempo desde primer item hasta submit
- [ ] **F4.6** Dashboard Grafana con las 5 métricas.
- [ ] **F4.7** Alertas: pico de conflictos > X% (indica TTL demasiado corto o UI rota).
- [ ] **F4.8** Logs estructurados con `draft_id` y `user_id` para todas las operaciones de hold.

**Criterios de salida:**
- Dashboard operacional en vivo.
- Técnicos ven estado de sus reservas claramente.
- Oncall puede diagnosticar problemas de concurrencia sin pedir logs.

**Estimación:** 2-3 días.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| TTL corto (15min) frustra técnicos con sesiones largas | Renovación automática cada 5min mientras la página esté abierta + countdown visible. |
| TTL muy largo bloquea slots para todos si un técnico abandonó | 15min es el balance; métricas de abandono pueden justificar ajuste. |
| Carga en DB por holds concurrentes | Índice compuesto + expiración lazy (no requiere cron caliente). UPDATE atómico es O(1) con índice. |
| Migración de localStorage rompe drafts en curso | F3.9 detecta draft local y lo migra al primer load. Feature flag por si hay que revertir. |
| Deploy durante un envío de lote | El submit es secuencial item-por-item; un deploy puede cortar a la mitad. Mitigación: endpoints idempotentes por `local_id`, el cliente reintenta desde donde quedó. |
| HELD no limpiado si cliente cierra abrupto | Expiración lazy lo maneja; cron diario lo barre físicamente. |

## 6. Dependencias con otros equipos / features

- **F2.6** toca `incident.service.createIncident` — coordinar con cualquier cambio paralelo en ese servicio.
- **F2.5** toca `availability.service` — impacta en cualquier app que consume availability (incluidos casos de uso del empleado reservando su propio turno).
- **F3.7** cambia `batch-incident-page.tsx` — verificar que no haya PRs abiertos tocándolo.

## 7. Qué NO está en alcance

- Cierre de incidencias en lote → documento separado: `batch-de-incidencias.md`.
- Lote con transiciones de estado heterogéneas → mismo doc.
- Reserva desde apps externas vía api-middleware-service.
- Cambio de infraestructura (agregar Redis, etc).

---

## Log de progreso

| Fecha | Fase | Nota |
|---|---|---|
| 2026-04-19 | — | Plan creado. Fase 1 lista para arrancar. |
| 2026-04-19 | Fase 1 | F1.1–F1.5 completados. 29/29 tests en verde. |
| 2026-04-19 | Fase 2 | F2.1–F2.10 completados. 73/73 tests en verde. |
