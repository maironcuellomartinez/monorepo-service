---
title: "📦 Transactional Outbox Pattern — Entrega Garantizada de Eventos"
description: "Outbox transaccional + Polling Worker + Dual Event Bus — Entrega at-least-once de eventos de dominio"
aliases:
  - transactional-outbox
  - outbox-pattern
  - polling-worker
  - dual-event-bus
tags:
  - tipo/patrón
  - área/microservicios
  - stack/nestjs
  - patrón/resiliencia
  - patrón/ddd
  - fuente/monolito-event-corner
created: 2026-04-27
updated: 2026-04-27
related:
  - 04-Recursos/Backend/Microservicios/2-shared-library-domain.md
  - 04-Recursos/Backend/Resiliencia/03-pqueue-con-prioridades.md
  - 04-Recursos/Backend/Resiliencia/04-retry-backoff.md
sources:
  - apps/monolith/src/infrastructure/event-bus/ (monolito-event-corner_v3)
---

# 📦 Transactional Outbox Pattern — Entrega Garantizada de Eventos

> **Origen:** `monolito-event-corner_v3/apps/monolith/src/infrastructure/event-bus/`
> **Propósito:** Garantizar que los eventos de dominio se entreguen **al menos una vez** (at-least-once), incluso si el bus de eventos falla inmediatamente después de la transacción de BD.

---

## 🔍 Problema

En una arquitectura de microservicios con DDD, los agregados emiten eventos de dominio (`DomainEvent`) que deben propagarse a otros servicios. El enfoque naive de publicar directamente al bus **no es transaccional**: si el bus falla después del commit de BD pero antes de publicar el evento, el evento se pierde irreversiblemente.

---

## ✅ Solución

Escribir los eventos en una tabla `outbox_events` **dentro de la misma transacción de BD** que los datos del agregado. Un worker independiente (polling cada 5s) lee los eventos pendientes y los publica en el bus real.

### Arquitectura

```
Use Case (transacción DB)
  ├── save(aggregate) en BD
  └── eventBus.publishMany(events)
        └── OutboxAdapter → INSERT en outbox_events (misma transacción)
                                 │
[5s después] OutboxWorker.poll() ←┘
                  │
                  ├── inMemoryBus.publish(event) → handlers ejecutan
                  └── UPDATE published_at = now
```

---

## 🧱 Componentes

### 1. Entidad `outbox_event`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `event_id` | VARCHAR(36) PK | UUID — idempotency key |
| `event_type` | VARCHAR(100) | `INCIDENT_CREATED`, etc. |
| `aggregate_id` | VARCHAR(50) | ID del agregado origen |
| `payload` | JSON | DomainEvent serializado |
| `published_at` | TIMESTAMP NULL | ≠ null → ya procesado |
| `created_at` | TIMESTAMP DEFAULT NOW | |
| `retry_count` | INT DEFAULT 0 | Intentos realizados |
| `max_retries` | INT DEFAULT 3 | Máximo de reintentos |
| `last_error` | TEXT NULL | Último error capturado |
| `retry_after` | TIMESTAMP NULL | Próximo reintento (backoff) |
| `failed_at` | TIMESTAMP NULL | ≠ null → DLQ lógica |

### 2. OutboxEventBusAdapter

Implementa `IEventBus`:
- `publish()` / `publishMany()` → persiste eventos en `outbox_events`
- `subscribe()` → delega al bus in-memory donde están registrados los handlers

```typescript
async publish(event: DomainEvent): Promise<Result<void>> {
    const entity = this.toEntity(event);
    await this.outboxRepo.save(entity);
    return Result.ok(undefined);
}
```

### 3. OutboxWorkerService

Worker con `@Interval(5000)` que:
- Lee hasta 50 eventos elegibles (`published_at IS NULL`, `failed_at IS NULL`, `retry_after` vencido o nulo)
- Publica cada uno en el bus in-memory (con correlationId)
- Marca `published_at = now` si éxito
- Aplica **backoff exponencial** si falla: `2^n * 5s` (cap 5 min)
- Marca `failed_at` si se agotan `max_retries` (DLQ lógica)

```typescript
@Interval(5_000)
async processOutbox(): Promise<void> {
    const pending = await this.outboxRepo.find({
        where: [
            { published_at: IsNull(), failed_at: IsNull(), retry_after: IsNull() },
            { published_at: IsNull(), failed_at: IsNull(), retry_after: LessThanOrEqual(now) },
        ],
        order: { created_at: 'ASC' },
        take: 50,
    });
    // ... procesar cada evento
}
```

### 4. InMemoryEventBusAdapter

Bus simple en memoria: `Map<eventType, handler[]>`.

```typescript
class InMemoryEventBusAdapter implements IEventBus {
    private handlers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();

    async publish(event: DomainEvent): Promise<Result<void>> {
        const eventHandlers = this.handlers.get(event.type) ?? [];
        await Promise.all(eventHandlers.map(h => h(event)));
        return Result.ok(undefined);
    }

    subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
        const handlers = this.handlers.get(eventType) ?? [];
        handlers.push(handler);
        this.handlers.set(eventType, handlers);
    }
}
```

---

## 🔄 Flujo Completo

```
1. Use Case ejecuta lógica de negocio sobre el agregado
2. Agregado.addEvent(new DomainEvent("INCIDENT_CREATED", ...))
3. Repository.save(agregado) → transacción BD
4. eventBus.publishMany(agregado.pullEvents()) → OutboxAdapter
5. OutboxAdapter.toEntity() + outboxRepo.save() → misma transacción ✓
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
6. [5s después] OutboxWorker.processOutbox()
7. InMemoryBus.publish(event) → handlers ejecutan
8. outboxRepo.update(published_at = now) → evento procesado
```

---

## ⚙️ Configuración

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| `BATCH_SIZE` | 50 | Eventos máximos por ciclo |
| `POLL_INTERVAL_MS` | 5.000 | Intervalo entre ciclos |
| `BASE_RETRY_DELAY_MS` | 5.000 | Espera inicial de backoff |
| `MAX_RETRY_DELAY_MS` | 300.000 | Espera máxima (5 min) |
| `max_retries` (por evento) | 3 | Reintentos antes de DLQ |

---

## ⚠️ Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Worker muere antes de marcar `published_at` | 🟡 El evento se reprocesa | Handlers deben ser **idempotentes** |
| `outbox_events` crece sin límite | 🟠 Degradación de queries | Job de limpieza TTL (eventos > 7 días) |
| Handler publica eventos sincrónicamente | 🔴 Deadlock potencial | Handlers NO deben publicar al outbox |
| Latencia 5s entre creación y publicación | 🟡 Aceptable para no críticos | Reducir `POLL_INTERVAL_MS` si necesario |

---

## 🔗 DDL de la tabla

```sql
CREATE TABLE outbox_events (
    event_id      VARCHAR(36) PRIMARY KEY,
    event_type    VARCHAR(100) NOT NULL,
    aggregate_id  VARCHAR(50) NOT NULL,
    payload       JSON NOT NULL,
    published_at  TIMESTAMP NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retry_count   INT DEFAULT 0,
    max_retries   INT DEFAULT 3,
    last_error    TEXT NULL,
    retry_after   TIMESTAMP NULL,
    failed_at     TIMESTAMP NULL,
    INDEX idx_pending (published_at, failed_at, retry_after),
    INDEX idx_created (created_at)
);
```

---

## 📚 Referencias

- [[04-Recursos/Backend/Microservicios/2-shared-library-domain|📚 Shared Library — Domain Building Blocks]]
- [[04-Recursos/Backend/Resiliencia/04-retry-backoff|🔄 Retry + Backoff Exponencial]]
- [[04-Recursos/Backend/Microservicios/1-result-class-domain-shared|📦 Result Class — Manejo Funcional de Errores]]
