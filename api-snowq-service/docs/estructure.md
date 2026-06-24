src/
├── app.module.ts
├── main.ts
├── common/
│   └── enums/
│       ├── request-priority.enum.ts
│       └── request-type.enum.ts
├── incidence/
│   ├── incidence.controller.ts
│   ├── incidence.module.ts
│   ├── incidence.service.ts
│   └── entities/incidence.entity.ts
├── service-now/
│   ├── service-now.module.ts
│   └── service-now.service.ts
└── database/
    └── database.module.ts

---

```mermaid
classDiagram
  class IncidenceProcessor {
    +process(incidence)
  }

  class IncidentProcessor
  IncidentProcessor --|> IncidenceProcessor

  class ChangeRequestProcessor
  ChangeRequestProcessor --|> IncidenceProcessor

  class ProblemProcessor
  ProblemProcessor --|> IncidenceProcessor

  class IncidenceProcessorFactory {
    +getProcessor(type: RequestType) IncidenceProcessor
  }

  Dispatcher --> IncidenceProcessorFactory
  IncidenceProcessorFactory --> IncidenceProcessor
``` 
---

```mermaid
sequenceDiagram
    participant Thruk as Thruk/Nagios
    participant API as IncidenceController
    participant Queue as IncidenceQueueService
    participant ServiceNow as ServiceNowService
    participant DB as MySQL (Incidence/DLQ/Logs)

    Thruk->>API: POST /incidences
    API->>Queue: enqueue(incidence)
    activate Queue
    Note right of Queue: Genera correlationId con uuidv4()
    Queue->>Queue: correlationIdService.run()
    Queue->>DB: logProcess(action=ENQUEUED, correlationId)
    deactivate Queue

    alt Immediate
        Queue->>ServiceNow: sendRequest(incidence)
        ServiceNow-->>Queue: sys_id
        Queue->>DB: Actualiza incidencia y logProcess(SENT, correlationId)
    else Prioritaria
        Note right of Queue: Incidence se queda en cola por prioridad
        Queue-->>Queue: dispatchPriorityQueues()
        Queue->>ServiceNow: sendRequest(incidence)
        alt Éxito
            ServiceNow-->>Queue: sys_id
            Queue->>DB: Actualiza incidencia y logProcess(SENT, correlationId)
        else Error Temporal
            Queue->>Queue: setTimeout para retry
            Queue->>DB: logProcess(RETRY, correlationId)
        else Error Fatal o 3 reintentos
            Queue->>DB: moveToDLQ(correlationId)
            Queue->>DB: logProcess(DLQ, correlationId)
    end
end
```
---

```mermaid

flowchart TD
      %% ── FUENTES ──────────────────────────────────────────────────────────────
      THRUK["🖥️ Nagios / Thruk"]
      MONOLITH["🏢 Monolith\nevent-corner_v3"]
      OTHER["📦 Otras aplicaciones"]

      %% ── CONTROLLERS ──────────────────────────────────────────────────────────
      subgraph CTRL_MON["Controller /monitoring"]
          MON_CTRL["POST /monitoring/alerts\nPOST /monitoring/cancel/:fingerprint"]
      end

      subgraph CTRL_STD["Controller /snow-requests (sin cambios)"]
          STD_CTRL["POST /snow-requests/{type}\nGET  /snow-requests/{correlationId}\nGET  /snow-requests/failed\nPOST
  /snow-requests/failed/retry-all\nPOST /snow-requests/failed/:id/retry"]
      end

      %% ── CAPA DE DECISIÓN (solo monitoreo) ────────────────────────────────────
      subgraph DECISION["Capa de decisión — MonitoringService"]
          D1{¿Tipo ignorable?\nACK / DOWNTIME\nFLAPPING / SOFT}
          D2{notificationType\n== RECOVERY?}
          D3{¿Fingerprint\nactivo en cola?}
          D4{Estado del\nregistro activo}
      end

      %% ── COLA DB ──────────────────────────────────────────────────────────────
      subgraph QUEUE["Cola DB — snow_requests (MySQL)"]
          DB[("snow_requests\nstatus=QUEUED")]
          WORKER["SnowRequestWorkerService\npoll cada 500ms\nbatch=20\nrecovery IN_PROGRESS al arrancar"]
          EXPIRE["expireOverdue()\ncada 30s"]
          PQUEUE["PQueue global\nconcurrency=5\nprioridad:\nincident 400 › change_request 300 › resto 100\n+ offset nivel
  CRITICAL=4…LOW=1"]
      end

      %% ── PROCESAMIENTO ────────────────────────────────────────────────────────
      subgraph PROC["SnowRequestQueueService — processRequest"]
          SN_CALL["Processor + Bulkhead\n→ ServiceNow API"]
          ERR{Tipo de error}
          RETRY_LOGIC["markAsRetry()\nbackoff por prioridad\nCRITICAL 5s / HIGH 15s\nMEDIUM 30s / LOW 60s"]
      end

      %% ── ESTADOS TERMINALES ───────────────────────────────────────────────────
      DELIVERED(["✅ DELIVERED\nsysId + snowNumber\nguardados"])
      FAILED(["❌ FAILED\nDLQ lógica\nlastError guardado"])
      CANCELLED(["🚫 CANCELLED\nrecovery canceló\nantes de llegar a SN"])
      EXPIRED(["⏱️ EXPIRED\nTTL vencido\nfalso positivo"])
      IGNORED(["— IGNORED\nno genera registro"])
      DEDUP(["♻️ DEDUPLICATED\ndevuelve correlationId\nexistente"])

      %% ── RECONCILER (monolith) ─────────────────────────────────────────────────
      RECONCILER["🔄 MonolithReconcilerJob\n@Interval 30s\nGET /snow-requests/:correlationId"]

      %% ── CONEXIONES ───────────────────────────────────────────────────────────

      THRUK -->|"notificationType\nhost / service\nstate / stateType\nttlSeconds"| MON_CTRL
      MONOLITH -->|"priority / payload\nsource"| STD_CTRL
      OTHER --> STD_CTRL

      MON_CTRL --> D1
      D1 -->|"SÍ"| IGNORED
      D1 -->|"NO"| D2
      D2 -->|"RECOVERY"| D4
      D2 -->|"PROBLEM HARD"| D3

      D4 -->|"QUEUED → cancela"| CANCELLED
      D4 -->|"IN_PROGRESS\ndemasiado tarde"| DEDUP
      D4 -->|"no encontrado"| IGNORED

      D3 -->|"SÍ → mismo ticket"| DEDUP
      D3 -->|"NO → nuevo registro\nfingerprint + expiresAt"| DB

      STD_CTRL -->|"INSERT QUEUED\nsin fingerprint\nsin expiresAt"| DB

      DB --> WORKER
      WORKER --> EXPIRE
      EXPIRE -->|"expiresAt vencido"| EXPIRED
      EXPIRE -->|"vigente o sin TTL"| PQUEUE

      WORKER -->|"markAsProcessing()\nbatch antes de encolar"| PQUEUE
      PQUEUE --> SN_CALL

      SN_CALL -->|"200 OK"| DELIVERED
      SN_CALL -->|"error"| ERR
      ERR -->|"5xx / 408 / 429\nServiceNowTemporalError"| RETRY_LOGIC
      ERR -->|"4xx / 401 / 403\nFatalError / AuthError"| FAILED

      RETRY_LOGIC -->|"retryCount < maxRetries\n→ QUEUED + nextRetryAt"| DB
      RETRY_LOGIC -->|"agotó reintentos\n→ FAILED"| FAILED

      FAILED -->|"retry manual\nvía endpoint DLQ"| DB

      DELIVERED -->|"monolith consulta sysId\npara closeIncident / updateTicket"| RECONCILER
      RECONCILER -->|"GET :correlationId"| STD_CTRL

```