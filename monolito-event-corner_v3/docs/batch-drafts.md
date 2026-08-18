# Batch Drafts — Creación masiva de citas

> Nota (remodelado 2026-07): `Incident`/`Request` se unificaron en `Appointment`. Las tablas y algunos nombres de campo de este feature conservan el prefijo histórico `incident_*`/`incidentId` por compatibilidad — hoy retienen slots para citas de **cualquier** `kind` (ISSUE o REQUEST), no solo incidencias de hardware.

Permite que un técnico prepare un lote de citas antes de confirmarlas, con slots "retenidos" (HELD) durante 15 minutos para evitar conflictos de disponibilidad.

---

## Flujo completo

```
1. Técnico abre la página de creación masiva
2. Por cada cita: elige corner → horario → datos del cliente
   └─► POST /api/batch-drafts/items  →  slots pasan a HELD (15 min)
3. Puede editar o eliminar items mientras prepara el lote
4. POST /api/batch-drafts/submit  →  para cada item:
   │   ├─ appointmentService.createAppointment({ heldByUserId })  →  HELD→BOOKED (atómico)
   │   └─ item exitoso: borrado del draft; item fallido: status='error'
5. Draft vacío → se elimina automáticamente
```

---

## API Endpoints

Todos requieren `Authorization: Bearer <jwt>` con permiso `appointment:create`.

### GET `/api/batch-drafts`
Devuelve el draft activo del técnico autenticado, o `null` si no tiene ninguno.

**Response 200:**
```json
{
  "id": "uuid",
  "userId": "abac-user-id",
  "items": [
    {
      "id": "uuid",
      "draftId": "uuid",
      "localId": "client-uuid",
      "cornerId": "corner-1",
      "cornerName": "Corner Av. Corrientes",
      "customerId": "user-id",
      "customerName": "Juan Pérez",
      "customerEmail": "juan@banco.com",
      "deviceSerial": "SN-12345",
      "issueTypeId": "issue-type-1",
      "issueTypeName": "Pantalla rota",
      "slotIds": ["slot-a", "slot-b"],
      "startTime": "2026-05-01T10:00:00.000Z",
      "endTime": "2026-05-01T10:30:00.000Z",
      "description": "Descripción del problema",
      "notes": "",
      "status": "pending",
      "lastError": null,
      "createdAt": "2026-04-19T09:00:00.000Z"
    }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### POST `/api/batch-drafts/items`
Agrega una cita al lote y retiene los slots por 15 minutos.

**Request body:**
```json
{
  "localId": "client-uuid",
  "cornerId": "corner-1",
  "cornerName": "Corner Av. Corrientes",
  "customerId": "user-id",
  "customerName": "Juan Pérez",
  "customerEmail": "juan@banco.com",
  "deviceSerial": "SN-12345",
  "issueTypeId": "issue-type-1",
  "issueTypeName": "Pantalla rota",
  "slotIds": ["slot-a", "slot-b"],
  "startTime": "2026-05-01T10:00:00.000Z",
  "endTime": "2026-05-01T10:30:00.000Z",
  "description": "Descripción",
  "notes": ""
}
```

**Idempotencia:** si ya existe un item con el mismo `localId` en el draft del usuario, devuelve el existente sin crear duplicados.

**Errores posibles:**
- `400` — El horario seleccionado ya pasó
- `400` — El horario seleccionado ya no está disponible (otro usuario lo reservó)

---

### PATCH `/api/batch-drafts/items/:id`
Edita un item del lote. Si cambian los `slotIds`, libera los holds anteriores y retiene los nuevos.

**Request body** (todos los campos son opcionales):
```json
{
  "cornerId": "...",
  "slotIds": ["nuevo-slot"],
  "startTime": "...",
  "endTime": "...",
  "description": "...",
  "notes": "..."
}
```

---

### DELETE `/api/batch-drafts/items/:id`
Elimina un item del lote y libera sus holds. Si el draft queda vacío, se elimina también.

**Response:** `204 No Content`

---

### POST `/api/batch-drafts/submit`
Envía el lote completo. Procesa cada item en orden:
- Convierte HELD→BOOKED creando la cita en el monolito
- Items exitosos se eliminan del draft
- Items fallidos permanecen con `status: 'error'` y `lastError`
- Si todos los items son exitosos, el draft se elimina

**Response 200:**
```json
[
  { "localId": "uuid-1", "status": "success", "incidentId": "appt-uuid" },
  { "localId": "uuid-2", "status": "error", "error": "El horario ya pasó" }
]
```
> El campo se sigue llamando `incidentId` en la respuesta (nombre histórico, `batch-draft.types.ts:69`) pero hoy contiene el `id` del `Appointment` creado, sea `kind=ISSUE` o `kind=REQUEST`.

---

### DELETE `/api/batch-drafts`
Descarta el draft completo y libera todos los holds activos.

**Response:** `204 No Content`

---

### POST `/api/batch-drafts/renew`
Renueva el TTL de todos los holds pendientes del técnico por 15 minutos más.
El frontend llama esto cada 5 minutos automáticamente.

**Response 200:**
```json
{
  "renewedUntil": "2026-04-19T09:15:00.000Z",
  "count": 4
}
```

---

## Sistema de HELD (retención de slots)

### Estados de un slot

| Estado | Significado |
|---|---|
| `AVAILABLE` | Libre para reservar |
| `HELD` | Retenido temporalmente por un usuario (TTL = 15 min) |
| `BOOKED` | Reservado por una cita confirmada |
| `EXPIRED` | Pasado de fecha/hora |

### Reglas de retención

- Un slot HELD puede ser retenido por el mismo usuario que ya lo tiene (renovación idempotente).
- Un slot HELD expirado (`held_until < NOW()`) se trata como AVAILABLE para otros usuarios.
- La transición HELD→BOOKED ocurre atómicamente en `appointmentService.createAppointment()` cuando se pasa `heldByUserId`.
- `holdManyAtomic` usa un UPDATE condicional atómico — protege contra race conditions.

### Columnas en `corner_slots`

```sql
held_by_user_id  VARCHAR(50)  NULL   -- ABAC user ID del propietario del hold
held_until       TIMESTAMP    NULL   -- cuándo expira el hold
```

---

## Tablas de base de datos

### `incident_batch_drafts`

```sql
CREATE TABLE incident_batch_drafts (
  id          VARCHAR(50) PRIMARY KEY,
  user_id     VARCHAR(50) NOT NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_batch_draft_user (user_id)
);
```

### `incident_batch_draft_items`

```sql
CREATE TABLE incident_batch_draft_items (
  id                VARCHAR(50)  PRIMARY KEY,
  draft_id          VARCHAR(50)  NOT NULL,
  local_id          VARCHAR(50)  NOT NULL,
  corner_id         VARCHAR(50)  NOT NULL,
  corner_name       VARCHAR(100) NOT NULL,
  customer_id       VARCHAR(50)  NOT NULL,
  customer_name     VARCHAR(200) NOT NULL,
  customer_email    VARCHAR(200) NOT NULL,
  device_serial     VARCHAR(100) NOT NULL,
  issue_type_id     VARCHAR(50)  NOT NULL,
  issue_type_name   VARCHAR(200) NOT NULL,
  slot_ids          JSON         NOT NULL,
  start_time        TIMESTAMP    NOT NULL,
  end_time          TIMESTAMP    NOT NULL,
  description       TEXT         NULL,
  notes             TEXT         NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
  last_error        TEXT         NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batch_item_draft FOREIGN KEY (draft_id) REFERENCES incident_batch_drafts(id) ON DELETE CASCADE,
  INDEX idx_batch_draft_item_draft (draft_id)
);
```

---

## Comportamiento de idempotencia

El campo `localId` es generado por el cliente (frontend) con `crypto.randomUUID()` antes de llamar a la API. Si el request llega dos veces con el mismo `localId` (ej. retry en red), el servidor devuelve el item ya existente sin duplicar el hold ni el registro.

---

## Frontend — `useBatchDraft` hook

El hook `event-corner-app/src/hooks/use-batch-draft.ts` gestiona todo el estado del batch:

```typescript
const {
  items,          // UIBatchItem[] — items con uiStatus: 'pending'|'sending'|'success'|'error'
  isLoading,      // booleano — cargando estado inicial del servidor
  addItem,        // (values) => Promise<void>
  editItem,       // (id, values) => Promise<void>
  removeItem,     // (id) => Promise<void>
  submit,         // () => Promise<void>
  discard,        // () => Promise<void>
  renewedUntil,   // Date | null — cuándo expiran los holds actuales
  hasLegacyDraft, // boolean — detecta draft viejo en localStorage
  dismissLegacy,  // () => void — limpia el banner de migración
} = useBatchDraft(legacyUserId)
```

- Carga el estado del servidor al montar (`GET /api/batch-drafts`)
- Renueva holds cada 5 minutos cuando hay items pendientes
- Detecta y limpia drafts viejos de localStorage (migración desde versión anterior)

---

## Archivos clave

| Archivo | Propósito |
|---|---|
| `apps/api-gateway/src/inbound/batch-drafts/batch-drafts.controller.ts` | Controlador HTTP — proxea al monolito con `userId` del JWT |
| `apps/monolith/src/core/services/batch-draft/batch-draft.service.ts` | Lógica de negocio — holds, idempotencia, submit |
| `apps/monolith/src/core/services/batch-draft/batch-draft.types.ts` | Interfaces de datos y comandos |
| `apps/monolith/src/infrastructure/persistence/typeorm/entities/batch-draft.entity.ts` | Entidad `incident_batch_drafts` |
| `apps/monolith/src/infrastructure/persistence/typeorm/entities/batch-draft-item.entity.ts` | Entidad `incident_batch_draft_items` |
| `apps/monolith/src/infrastructure/persistence/typeorm/repositories/batch-draft.repository.ts` | Acceso a datos |
| `apps/monolith/src/infrastructure/persistence/typeorm/entities/corner-slot.entity.ts` | Columnas `held_by_user_id` y `held_until` |
| `event-corner-app/src/hooks/use-batch-draft.ts` | Hook React — estado y operaciones del lote |
| `event-corner-app/src/pages/batch-incident-page.tsx` | Página de creación masiva |
