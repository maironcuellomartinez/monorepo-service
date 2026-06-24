---
title: "🎯 Rich Domain Aggregate — Modelo de Dominio Rico con State Machine"
description: "Entidad de dominio rica con métodos de negocio, transiciones de estado, eventos y Result en lugar de excepciones"
aliases:
  - rich-domain-model
  - state-machine-aggregate
  - domain-entity-pattern
tags:
  - tipo/patrón
  - área/microservicios
  - stack/nestjs
  - patrón/ddd
  - fuente/monolito-event-corner
created: 2026-04-27
updated: 2026-04-27
related:
  - 04-Recursos/Backend/Microservicios/2-shared-library-domain.md
  - 04-Recursos/Backend/Microservicios/1-result-class-domain-shared.md
  - 04-Recursos/Backend/Microservicios/6-transactional-outbox-pattern.md
sources:
  - apps/monolith/src/core/domain/entities/incident.entity.ts (monolito-event-corner_v3)
---

# 🎯 Rich Domain Aggregate — Modelo de Dominio Rico con State Machine

> **Origen:** `monolito-event-corner_v3/apps/monolith/src/core/domain/entities/incident.entity.ts`
> **Propósito:** Encapsular toda la lógica de negocio en una entidad de dominio rica que valida, cambia de estado y emite eventos, devolviendo siempre `Result` en lugar de lanzar excepciones.

---

## 🔍 Problema

En enfoques anémicos, la entidad solo tiene getters/setters y la lógica de negocio está dispersa en servicios. Esto:
- Dificulta测试ar la lógica de negocio
- Permite estados inconsistentes
- Acopla reglas de negocio a la infraestructura

---

## ✅ Solución

Una entidad de dominio rica con:
1. **Constructor privado** — solo se crea mediante factories estáticas (`create()`, `reconstitute()`)
2. **Métodos de negocio** que devuelven `Result<T, DomainError>`
3. **Máquina de estados** con transiciones validadas
4. **Buffer de eventos de dominio** (`pullEvents()`)
5. **Reconstitución desde eventos** (`fromEvents()`) para Event Sourcing

---

## 🧱 Estructura de la Entidad

```typescript
export class Incident {
    // ── Buffer de eventos de dominio ──
    private _events: DomainEvent[] = [];

    // ── Constructor privado ──
    private constructor(
        private readonly _id: IncidentId,
        private _issueTypeId: IssueTypeId,
        private _customerId: CustomerId,
        private _cornerId: CornerId,
        private _slotIds: SlotId[],
        private _scheduledRange: DateRange,
        private _durationMinutes: number,
        private _status: IncidentStatus,
        private _origin: IncidentOrigin,
        private _priority: number,
        private _currentTechnicianId: TechnicianId | null,
        // ... más propiedades
        private readonly _createdAt: Date,
        private _updatedAt: Date,
    ) { }

    // ── Getters públicos (solo lectura) ──
    get id(): IncidentId { return this._id; }
    get status(): IncidentStatus { return this._status; }
    // ...
}
```

---

## 🏭 Métodos Factory

### `create()` — Creación con validaciones
```typescript
static create(
    id: IncidentId,
    issueTypeId: IssueTypeId,
    customerId: CustomerId,
    cornerId: CornerId,
    slotIds: SlotId[],
    scheduledRange: DateRange,
    origin: IncidentOrigin,
    metadata: Record<string, any> = {}
): Result<Incident> {
    if (slotIds.length === 0) {
        return Result.err(new Error('Incident must occupy at least one slot'));
    }
    // Validar duración
    // ...
    const incident = new Incident(/* ... */);
    incident.addEvent(new DomainEvent('INCIDENT_CREATED', id, 'Incident', { /* data */ }));
    return Result.ok(incident);
}
```

### `reconstitute()` — Desde persistencia (sin validaciones)
```typescript
static reconstitute(/* todos los campos */): Incident {
    return new Incident(/* ... */);
}
```

### `fromEvents()` — Desde Event Sourcing
```typescript
static fromEvents(events: DomainEvent[]): Result<Incident> {
    // Ordenar por timestamp
    // Aplicar eventos en orden: replayCreated, replayTaken, replayStatusChanged...
    // Retornar incidente reconstruido
}
```

---

## 🔄 Máquina de Estados (State Machine)

### Transiciones válidas
```typescript
// Definidas en INCIDENT_CONSTANTS.VALID_STATUS_TRANSITIONS
const validTransitions = INCIDENT_CONSTANTS.VALID_STATUS_TRANSITIONS[this._status] ?? [];
if (!validTransitions.includes(newStatus)) {
    return Result.err(new InvalidIncidentStateError(this._status, `transition to ${newStatus}`));
}
```

### Métodos de negocio con transiciones
```typescript
// deliver() → CREATED → DELIVERED
deliver(technicianId: TechnicianId): Result<void> {
    if (this._status !== IncidentStatus.CREATED) {
        return Result.err(new InvalidIncidentStateError(this._status, 'deliver'));
    }
    this._status = IncidentStatus.DELIVERED;
    this._currentTechnicianId = technicianId;
    this.addEvent(new DomainEvent('INCIDENT_DELIVERED', ...));
    return Result.ok(undefined);
}

// take() → Asigna técnico sin cambiar estado
take(technicianId: TechnicianId): Result<void> {
    if (!this.isAvailableForTaking()) {
        return Result.err(new IncidentNotAvailableError(this._id));
    }
    this._currentTechnicianId = technicianId;
    this.addEvent(new DomainEvent('INCIDENT_TAKEN', ...));
    return Result.ok(undefined);
}

// changeStatus() → Transición genérica con validación
changeStatus(newStatus: IncidentStatus, technicianId: TechnicianId, comment?: string): Result<void> {
    const validTransitions = INCIDENT_CONSTANTS.VALID_STATUS_TRANSITIONS[this._status] ?? [];
    if (!validTransitions.includes(newStatus)) {
        return Result.err(new InvalidIncidentStateError(this._status, `transition to ${newStatus}`));
    }
    // Aplicar transición
    this._status = newStatus;
    if (newStatus === IncidentStatus.CLOSED) this._closedAt = new Date();
    this.addEvent(new DomainEvent('INCIDENT_STATUS_CHANGED', ...));
    return Result.ok(undefined);
}
```

---

## 📊 Eventos de Dominio Emitidos

| Método | Evento | Datos |
|--------|--------|-------|
| `create()` | `INCIDENT_CREATED` | issueTypeId, customerId, slotIds, scheduledRange |
| `deliver()` | `INCIDENT_DELIVERED` | technicianId, previousStatus |
| `take()` | `INCIDENT_TAKEN` | technicianId, previousTechnicianId |
| `release()` | `INCIDENT_RELEASED` | technicianId, reason |
| `changeStatus()` | `INCIDENT_STATUS_CHANGED` | technicianId, oldStatus, newStatus, comment |
| `validate()` | `INCIDENT_VALIDATED` | — |
| `reopen()` | `INCIDENT_REOPENED` | reason |
| `addComment()` | `INCIDENT_COMMENT_ADDED` | technicianId, comment |
| `assignLocker()` | `INCIDENT_LOCKER_ASSIGNED` | lockerId |
| `releaseLocker()` | `INCIDENT_LOCKER_RELEASED` | lockerId |
| `updateServiceNowInfo()` | `INCIDENT_SERVICENOW_UPDATED` | servicenowId, servicenowNumber |

---

## 🎯 Patrón `pullEvents()`

```typescript
// Extrae y vacía el buffer de eventos
pullEvents(): DomainEvent[] {
    const events = [...this._events];
    this._events = [];
    return events;
}
```

### Flujo de uso
```typescript
// En el Use Case o Repository
const result = incident.deliver(technicianId);
if (result.isSuccess) {
    await incidentRepo.save(incident);          // persiste
    const events = incident.pullEvents();       // extrae eventos
    await eventBus.publishMany(events);         // publica
}
```

---

## ✅ Reglas del Patrón

1. **Constructor privado** — nadie externo puede instanciar directamente
2. **Métodos devuelven `Result`** — nunca lanzan excepciones de negocio
3. **Validaciones de dominio** dentro del método, no en servicios externos
4. **Eventos se emiten** al cambiar estado — nunca manualmente
5. **Reconstitución sin validaciones** — `reconstitute()` asume datos válidos (vienen de BD)
6. **Idempotencia** — operaciones repetidas no deben cambiar el estado si ya está aplicado

---

## ⚠️ Anti-patrones a Evitar

| Anti-patrón | Por qué evitarlo |
|-------------|-----------------|
| Getter/setter públicos para estado | Permite cambios inconsistentes desde fuera |
| Lanzar `throw` para errores de negocio | Rompe el flujo funcional con `Result` |
| Lógica de negocio en servicios | Dificulta testing, duplica reglas |
| Eventos emitidos desde el servicio | El agregado debe auto-documentar sus cambios |
| `reconstitute()` con validaciones | Fallaría al leer datos históricos válidos |

---

## 📚 Referencias

- [[04-Recursos/Backend/Microservicios/2-shared-library-domain|📚 Shared Library — Domain Building Blocks]]
- [[04-Recursos/Backend/Microservicios/1-result-class-domain-shared|📦 Result Class — Manejo Funcional de Errores]]
- [[04-Recursos/Backend/Microservicios/6-transactional-outbox-pattern|📦 Transactional Outbox Pattern]]
- [[04-Recursos/Backend/Microservicios/7-domain-error-hierarchy|📚 Domain Error Hierarchy — Jerarquía de Errores]]
