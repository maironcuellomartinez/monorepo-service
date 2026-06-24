
● Análisis: cierre de incidencias en lote

  Brecha actual

  Antes de hablar del lote, hay un problema en el flujo de una sola incidencia que ya existe:

  PATCH /:id/status  →  changeStatus(CLOSED)  →  save  →  publish INCIDENT_STATUS_CHANGED
                                                                          ↓
                                                                ??? nadie escucha esto

  ServiceNowIntegrationService.closeIncidentTicket() existe, pero ningún event handler está suscrito a INCIDENT_STATUS_CHANGED. Solo
  INCIDENT_CREATED tiene handler. Esto significa que hoy, cuando un técnico cierra una incidencia, ServiceNow no se entera. El cierre
   en lote no puede construirse sobre un flujo que ya está roto.

  ---
  El caso de uso en concreto

  Un técnico resolvió 20 incidencias durante su turno. Al finalizar, necesita registrar la resolución de todas en ServiceNow. Las
  incidencias ya existen en el monolito con estado RESOLVED o similar — solo falta propagarlo al ticket de SN correspondiente.

  Cada ítem necesita:
  - incidentId — qué incidencia
  - closeCategory — categoría de cierre (SN lo requiere)
  - closeNotes — observaciones del técnico

  ---
  Opciones de diseño

  Opción A — N llamadas individuales en paralelo (solución naive)

  POST /incidents/batch-close
  body: [{ incidentId, closeCategory, closeNotes }, ...x20]

  → forEach: IncidentService.changeStatus(id, CLOSED) + closeIncidentTicket()

  Problema: si SN está caído al momento del POST, los 20 cierres fallan. No hay reintentos. El técnico no sabe cuáles fallaron. Y si
  el técnico reintenta todo, los que ya cerraron en SN generan un PATCH de estado redundante.

  No es aceptable.

  ---
  Opción B — Outbox por cada ítem del lote (recomendada)

  Cada incidencia del lote pasa por el mismo camino que un cierre individual, pero en transacción batch:

  POST /incidents/batch-close
     │
     ├─ for each item:
     │     ├─ load incident
     │     ├─ incident.changeStatus(CLOSED, closeCategory, closeNotes)
     │     └─ save (transaccional) + insert INCIDENT_CLOSED en Outbox
     │
     └─ 200 OK  ← responde inmediatamente, SN se notifica de forma asíncrona

  El OutboxWorkerService ya existente procesa los eventos INCIDENT_CLOSED con backoff. Si SN está caído, reintenta. Si falla
  definitivamente, failed_at lo marca para DLQ.

  El técnico recibe un ACK inmediato. La propagación a SN es eventual pero garantizada.

  Lo que hay que agregar:
  1. Un nuevo evento de dominio: INCIDENT_CLOSED (o reutilizar INCIDENT_STATUS_CHANGED con discriminación por status)
  2. Un handler suscrito a ese evento que llame a closeIncidentTicket()
  3. Un nuevo endpoint POST /incidents/batch-close
  4. Un método batchChangeStatus() en IIncidentService

  ---
  Opción C — Command explícito de cierre (más expresivo)

  En lugar de reutilizar changeStatus, crear un comando específico CloseIncidentCommand que encapsula closeCategory y closeNotes —
  campos que el cierre necesita pero que una transición genérica de estado no tiene.

  Esto evita que changeStatus() crezca con parámetros opcionales que solo aplican al cierre.

  interface CloseIncidentCommand {
    incidentId: IncidentId;
    closeCategory: string;
    closeNotes?: string;
  }

  Esta opción es complementaria a la B, no excluyente.

  ---
  Manejo de fallos parciales

  Con 20 incidencias, algunas pueden fallar por datos (incidencia no encontrada, estado inválido para cerrar) y otras por
  infraestructura (SN caído). Hay que distinguir:

  ┌──────────────────────────────┬─────────────────────────────────────────────────────────────────┐
  │        Tipo de fallo         │                            Respuesta                            │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
  │ Incidencia no existe         │ Error inmediato en el batch — se reporta en la respuesta        │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
  │ Estado inválido (ya cerrada) │ Idempotencia — skip silencioso, no es error                     │
  ├──────────────────────────────┼─────────────────────────────────────────────────────────────────┤
  │ SN caído                     │ Encolado en Outbox — éxito desde el punto de vista del monolito │
  └──────────────────────────────┴─────────────────────────────────────────────────────────────────┘

  La respuesta del POST /incidents/batch-close debería retornar algo como:
  {
    "processed": 18,
    "skipped": 1,   // ya estaban cerradas
    "failed": 1,    // datos inválidos
    "errors": [{ "incidentId": "abc", "reason": "Incident not found" }]
  }

  ---
  Consideración de idempotencia

  Si el técnico llama dos veces al endpoint (por error de red, botón doble), el handler de INCIDENT_CLOSED necesita un guard igual al
   que tiene INCIDENT_CREATED:

  if (incident.status !== 'CLOSED') {
    // ya procesada — skip
    return;
  }
  if (ticket already closed in SN) {
    // mismo guard que el servicenowId check en el handler de creación
    return;
  }

  ---
  Resumen de lo que habría que implementar

  1. Dominio: incident.close(closeCategory, closeNotes) — método explícito + almacenar esos campos en la entidad
  2. Evento: INCIDENT_CLOSED en el Outbox
  3. Handler: IncidentCloseServiceNowHandler → suscrito a INCIDENT_CLOSED → llama closeIncidentTicket()
  4. Servicio: IIncidentService.batchClose(commands[]) → transacción, respuesta con processed/skipped/failed
  5. Endpoint: POST /internal/incidents/batch-close
  6. Persistencia: columnas close_category y close_notes en la tabla incidents (las necesita el handler al momento de procesar el
  evento, no en el momento del POST)

  ¿Arrancamos con la implementación? ¿O hay algo del diseño que quieras ajustar primero?

✻ Baked for 2m 55s

❯ que pasa si en batch deben de ir incidencias para cerrar, reabril, con estados diferentes.

● Análisis: batch heterogéneo (estados mixtos)

  El problema central

  Ya no es "cerrar N incidencias", sino "aplicar N transiciones de estado arbitrarias". Cada ítem puede ser:

  [
    { "incidentId": "A", "targetStatus": "CLOSED",    "closeCategory": "resolved", "closeNotes": "..." },
    { "incidentId": "B", "targetStatus": "REOPENED",  "reason": "cliente reporta recurrencia" },
    { "incidentId": "C", "targetStatus": "IN_PROGRESS" },
    ...
  ]

  Esto rompe la idea de un comando especializado por estado — necesitás un modelo más general.

  ---
  Diseño del comando

  interface BatchStatusChangeItem {
    incidentId: IncidentId;
    targetStatus: IncidentStatus;
    // Metadata contextual — solo algunos estados la necesitan
    metadata?: {
      closeCategory?: string;   // requerido si targetStatus === CLOSED
      closeNotes?: string;
      reopenReason?: string;    // requerido si targetStatus === REOPENED
    };
  }

  La validación de qué metadata es requerida para cada transición vive en el dominio, no en el controller:

  // incident.entity.ts
  changeStatus(targetStatus: IncidentStatus, metadata?: StatusChangeMetadata): void {
    this.validateTransition(this.status, targetStatus);

    if (targetStatus === IncidentStatus.CLOSED) {
      if (!metadata?.closeCategory) throw new Error('closeCategory is required to close');
      this._closeCategory = metadata.closeCategory;
      this._closeNotes = metadata.closeNotes ?? null;
    }

    if (targetStatus === IncidentStatus.REOPENED) {
      if (!metadata?.reopenReason) throw new Error('reopenReason is required to reopen');
      this._reopenReason = metadata.reopenReason;
    }

    this._status = targetStatus;
  }

  ---
  El problema del Outbox con estados mixtos

  Con un solo tipo de evento INCIDENT_STATUS_CHANGED, el handler necesita saber qué hacer en SN según el estado. El payload del
  evento tiene que llevar el estado destino:

  // Al publicar en el Outbox:
  outboxEvent.payload = JSON.stringify({
    aggregateId: incident.id,
    newStatus: incident.status,
    closeCategory: incident.closeCategory,   // null si no aplica
    closeNotes: incident.closeNotes,
    reopenReason: incident.reopenReason,
  });

  Y el handler discrimina:

  // incident-status-changed.handler.ts
  private async handle(event: DomainEvent): Promise<void> {
    const payload = JSON.parse(event.payload);

    switch (payload.newStatus) {
      case 'CLOSED':
        return this.handleClose(incident, payload);
      case 'REOPENED':
        return this.handleReopen(incident, payload);
      case 'IN_PROGRESS':
        return this.handleInProgress(incident);
      // ...
    }
  }

  ---
  Mapa de transiciones → acción en ServiceNow

  No todas las transiciones tienen una acción en SN, y algunas acciones en SN no tienen endpoint en el adapter todavía:

  ┌─────────────────────┬─────────────────────────────────────────┬───────────────────────────────────┬─────────────────────────┐
  │   Transición en     │          Acción en ServiceNow           │            Endpoint SN            │      ¿Existe hoy?       │
  │      monolito       │                                         │                                   │                         │
  ├─────────────────────┼─────────────────────────────────────────┼───────────────────────────────────┼─────────────────────────┤
  │ → CLOSED            │ closeIncident(sysId, closeCategory,     │ PATCH incident/{sysId}            │ Sí                      │
  │                     │ closeNotes)                             │                                   │ (closeIncidentTicket)   │
  ├─────────────────────┼─────────────────────────────────────────┼───────────────────────────────────┼─────────────────────────┤
  │ → REOPENED          │ Reabrir ticket                          │ PATCH incident/{sysId} state=open │ Parcial (updateTicket)  │
  ├─────────────────────┼─────────────────────────────────────────┼───────────────────────────────────┼─────────────────────────┤
  │ → IN_PROGRESS       │ Actualizar estado                       │ PATCH incident/{sysId}            │ Parcial (updateTicket)  │
  │                     │                                         │ state=in_progress                 │                         │
  ├─────────────────────┼─────────────────────────────────────────┼───────────────────────────────────┼─────────────────────────┤
  │ → RESOLVED          │ Marcar resuelto, pendiente de cierre    │ PATCH incident/{sysId}            │ Parcial (updateTicket)  │
  └─────────────────────┴─────────────────────────────────────────┴───────────────────────────────────┴─────────────────────────┘

  updateTicket(table, sysId, fields) ya existe en el adapter — puede cubrir REOPENED, IN_PROGRESS, RESOLVED directamente con el campo
   state.

  ---
  Problema de idempotencia amplificado

  Con batch heterogéneo, la misma incidencia podría aparecer dos veces en el mismo lote:

  [
    { "incidentId": "A", "targetStatus": "CLOSED" },
    { "incidentId": "A", "targetStatus": "REOPENED" }   // contradicción
  ]

  Hay dos enfoques:

  Opción 1 — Rechazar duplicados en el lote
  Validar en el service antes de procesar que no haya incidentId repetido. Retornar 400 si hay duplicados.

  Opción 2 — Orden garantizado, aplicar secuencialmente
  Procesar en orden de array, transaccionar cada ítem independientemente. El segundo ítem ve el estado que dejó el primero. Más
  flexible pero más complejo.

  La opción 1 es más segura y más fácil de razonar. El técnico que quiere cerrar y reabrir la misma incidencia en el mismo batch
  probablemente tiene un error de UI.

  ---
  Consideración de la máquina de estados

  El modelo de estados tiene que ser explícito para que validateTransition() pueda rechazar transiciones inválidas:

  OPEN → IN_PROGRESS → RESOLVED → CLOSED
                                ↓ (si falla resolución)
                             REOPENED → IN_PROGRESS

  Si llega un ítem con OPEN → CLOSED directamente, el dominio lo rechaza. Ese error es inmediato (no llega al Outbox) y se reporta en
   el array errors de la respuesta.

  ---
  Estructura de respuesta del endpoint

  interface BatchStatusChangeResponse {
    processed: number;       // llegaron al Outbox OK
    skipped:   number;       // ya estaban en el estado destino (idempotente)
    failed:    number;       // error de datos — no llegaron al Outbox
    errors: Array<{
      incidentId: string;
      reason: string;        // "Invalid transition: CLOSED → IN_PROGRESS"
                             // "Incident not found"
                             // "closeCategory required for CLOSED"
    }>;
  }

  Los processed son eventuales (SN se notifica async). Los failed son definitivos.

  ---
  Lo que se necesita agregar vs. lo que ya existe

  ┌──────────────────────────────────────────────────────┬──────────────────────────────────────────┐
  │                      Componente                      │                  Estado                  │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ incident.changeStatus(status, metadata)              │ Existe parcialmente — hay que extenderlo │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Columnas close_category, close_notes, reopen_reason  │ Hay que agregar                          │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Evento INCIDENT_STATUS_CHANGED con payload           │ Hay que enriquecer el payload            │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ IncidentStatusChangedHandler (discrimina por estado) │ Hay que crear                            │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ IIncidentService.batchChangeStatus(items[])          │ Hay que crear                            │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ updateTicket() en el adapter                         │ Ya existe                                │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ closeIncidentTicket() en el adapter                  │ Ya existe                                │
  ├──────────────────────────────────────────────────────┼──────────────────────────────────────────┤
  │ Endpoint POST /incidents/batch-status                │ Hay que crear                            │
  └──────────────────────────────────────────────────────┴──────────────────────────────────────────┘