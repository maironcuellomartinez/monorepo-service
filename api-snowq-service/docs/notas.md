
● BulkheadModule es @Global() así que BulkheadRegistry estará disponible automáticamente para inyección en cualquier provider, sin
  necesidad de importar el módulo en cada lugar. Listo.

  ---
  Resumen de la integración:

  HTTP Request → snow-requests/*
        │
        ▼
  BulkheadMiddleware          ← gate rápido por path
    snow-requests:async        maxConcurrent=30, queue=200
    snow-requests:immediate    maxConcurrent=10, queue=20
        │
        ▼
  BulkheadInterceptor         ← envuelve el handler por client+endpoint
    getForClient(clientId, handlerName)  maxConcurrent=5, queue=20
        │
        ▼
  SnowRequestProcessingService.enqueue / processImmediate
        │
        ▼
  SnowRequestQueueService.processRequest / sendToServiceNow
        │
        ▼
  BulkheadRegistry.getForServiceNow()  ← protege el servicio externo
    servicenow:api   maxConcurrent=8, queue=40, timeout=15s
        │
        ▼
  ServiceNow HTTP API

  Tres capas de protección con responsabilidades distintas:
  - Middleware — gate global por tipo de endpoint (antes del handler)
  - Interceptor — aislamiento por cliente individual (evita que un cliente sature a otros)
  - Registry en service — límite sobre ServiceNow independiente del tráfico entrante

  ---

  
● La lógica completa queda así:

  ---
  Flujo de clasificación de errores

  SN responde HTTP error
          │
          ▼
  ServiceNowErrorFactory.create(statusCode)
          │
          ├─ 4xx (400/404/405/409/413/415/422) → ServiceNowFatalError
          ├─ 401/403                           → ServiceNowAuthError
          └─ 5xx/408/429                       → ServiceNowTemporalError

          │
          ▼
  processRequest() catch(error)
          │
          ├─ instanceof ServiceNowTemporalError → markAsRetry()
          │   └─ QUEUED + nextRetryAt (backoff) hasta maxRetries=3, luego FAILED
          │
          └─ cualquier otro (Fatal, Auth, inesperado) → markAsFailed()
              └─ FAILED inmediato, lastError guardado, disponible en DLQ endpoint

  Antes: un 400 (payload inválido que SN rechaza) se reintentaba 3 veces desperdiciando tiempo. Ahora va a FAILED en el primer
  intento.

  Nota: OpenCircuitError ya estaba manejado arriba en sendToServiceNow lanzando ServiceUnavailableException, que tampoco es
  ServiceNowTemporalError, por lo que también cae en markAsFailed. Eso es correcto — el circuit breaker tiene su propia lógica de
  recuperación.

  ---

  
● Exactamente. Es la decisión correcta y tiene nombre: Backend for Frontend (BFF) o más precisamente Consumer-Specific API.

  ---
  Por qué funciona

  El monolito solo conoce /snow-requests/incidents. Nunca toca el nuevo controller. Los correlationId que el ReconcilerJob sigue
  nunca van a tener estado CANCELLED ni EXPIRED porque esos estados solo los genera el flujo de monitoreo.

  monolito-event-corner_v3
      │
      └─► POST /snow-requests/incidents       ← sin cambios, contrato estable
              │
              ▼
          SnowRequestProcessingService.enqueue()
              │  sin fingerprint, sin TTL
              ▼
          STATUS: QUEUED → IN_PROGRESS → DELIVERED | FAILED
          (ReconcilerJob solo ve estos 4 estados — igual que hoy)


  nagios-thruk
      │
      └─► POST /monitoring/incidents          ← nuevo controller, semántica distinta
              │
              ▼
          SnowRequestProcessingService.enqueueMonitoring()
              │  con fingerprint + expiresAt
              ▼
          STATUS: QUEUED → DELIVERED | FAILED | CANCELLED | EXPIRED

  ---
  Estructura propuesta

  queue/
    snow-request-queue.controller.ts       ← existente, sin tocar
    snow-request-immediate.controller.ts   ← existente, sin tocar

  monitoring/
    monitoring.controller.ts               ← nuevo
    monitoring.module.ts                   ← nuevo

  Endpoints del nuevo controller

  ┌────────┬────────────────────────────┬───────────────────────────────────┐
  │ Método │            Ruta            │            Descripción            │
  ├────────┼────────────────────────────┼───────────────────────────────────┤
  │ POST   │ /monitoring/incidents      │ Crea alerta con fingerprint + TTL │
  ├────────┼────────────────────────────┼───────────────────────────────────┤
  │ POST   │ /monitoring/cancel         │ Recovery: cancela por fingerprint │
  ├────────┼────────────────────────────┼───────────────────────────────────┤
  │ GET    │ /monitoring/:correlationId │ Estado de la alerta               │
  └────────┴────────────────────────────┴───────────────────────────────────┘

  El controller de /snow-requests no se toca.

  ---
  Lo que comparten vs. lo que es exclusivo

  Compartido (SnowRequestProcessingService, SnowRequestService, entidades):
    - Tabla snow_requests (columnas fingerprint y expiresAt opcionales)
    - Worker (ya maneja expiresAt en el poll)
    - PQueue y dispatch a SN

  Exclusivo del MonitoringController:
    - Lógica de deduplicación por fingerprint
    - Cálculo de expiresAt desde ttlSeconds
    - Endpoint de cancelación por fingerprint
    - Bulkhead con límites distintos (Thruk puede saturar más)

  ---
  Beneficio concreto para el monolito

  El ReconcilerJob no necesita ningún cambio. Los correlationId que genera nunca van a pasar por el path de monitoreo, y nunca van a
  aparecer en estado CANCELLED o EXPIRED.


---



  ---
  Flujo de decisión en MonitoringService

  Thruk → POST /monitoring/alerts { notificationType, host, service, state, stateType, ... }
                  │
                  ▼
          ¿Es ignorable?
          ├─ ACKNOWLEDGEMENT          → IGNORED (alguien lo atiende manualmente)
          ├─ FLAPPINGSTART/STOP       → IGNORED (servicio inestable, no es real)
          ├─ DOWNTIME*                → IGNORED (mantenimiento programado)
          └─ PROBLEM + stateType=SOFT → IGNORED (falla no confirmada aún)
                  │
                  ▼ (solo PROBLEM HARD y RECOVERY pasan)
          ¿Es RECOVERY?
          ├─ SÍ → cancelByFingerprint()
          │        ├─ QUEUED       → CANCELLED ✓
          │        ├─ IN_PROGRESS  → TOO_LATE (ya se está enviando a SN)
          │        └─ no encontrado → IGNORED (ya procesado o nunca creó ticket)
          │
          └─ NO (PROBLEM HARD)
                   │
                   ▼
          ¿Existe QUEUED/IN_PROGRESS con mismo fingerprint?
          ├─ SÍ → DEDUPLICATED (devuelve correlationId existente)
          └─ NO → crear con fingerprint + expiresAt → QUEUED

  Aislamiento total del monolito

  /snow-requests/incidents no fue modificado. El ReconcilerJob del monolito solo ve los 4 estados originales (QUEUED, IN_PROGRESS,
  DELIVERED, FAILED). Los estados CANCELLED y EXPIRED solo aparecen en correlationIds generados por /monitoring.


  ---

  
❯ una pregunta, en thruk con script generan la solicitude de incidencia, podrian tambien usar el otro endponit

● Sí pueden, técnicamente nada lo impide. Pero perderían todo lo que acabamos de construir:

  ┌──────────────────────────────────────────────┬──────────────────────────┬────────────────────┐
  │                                              │ /snow-requests/incidents │ /monitoring/alerts │
  ├──────────────────────────────────────────────┼──────────────────────────┼────────────────────┤
  │ Filtro SOFT states                           │ ✗ — entra todo           │ ✓                  │
  ├──────────────────────────────────────────────┼──────────────────────────┼────────────────────┤
  │ Filtro ACKNOWLEDGEMENT / DOWNTIME / FLAPPING │ ✗                        │ ✓                  │
  ├──────────────────────────────────────────────┼──────────────────────────┼────────────────────┤
  │ Deduplicación por fingerprint                │ ✗ — duplicados en SN     │ ✓                  │
  ├──────────────────────────────────────────────┼──────────────────────────┼────────────────────┤
  │ TTL / falsos positivos                       │ ✗ — siempre llega a SN   │ ✓                  │
  ├──────────────────────────────────────────────┼──────────────────────────┼────────────────────┤
  │ Recovery cancela ticket pendiente            │ ✗ — no hay mecanismo     │ ✓                  │
  ├──────────────────────────────────────────────┼──────────────────────────┼────────────────────┤
  │ Mapeo automático de prioridad desde state    │ ✗ — Thruk lo calcula     │ ✓                  │
  └──────────────────────────────────────────────┴──────────────────────────┴────────────────────┘

  Si usan el endpoint estándar, ante una tormenta de alertas de Nagios, 40 notificaciones del mismo host generan 40 tickets en SN —
  exactamente el problema original.

  ---
  El cambio en el script de Thruk es mínimo

  Antes (endpoint estándar):
  curl -X POST http://api-snowq-service/snow-requests/incidents \
    -d '{ "priority": 4, "payload": {...}, "source": "nagios-thruk" }'

  Después (endpoint de monitoreo):
  curl -X POST http://api-snowq-service/monitoring/alerts \
    -d '{
      "notificationType": "PROBLEM",
      "host": "$HOSTNAME$",
      "service": "$SERVICEDESC$",
      "state": "$SERVICESTATE$",
      "stateType": "$SERVICESTATETYPE$",
      "checkAttempt": $SERVICEATTEMPT$,
      "maxCheckAttempts": $MAXSERVICECHECKATTEMPTS$,
      "output": "$SERVICEOUTPUT$",
      "ttlSeconds": 300
    }'

  Y el script de recovery:
  curl -X POST http://api-snowq-service/monitoring/alerts \
    -d '{
      "notificationType": "RECOVERY",
      "host": "$HOSTNAME$",
      "service": "$SERVICEDESC$",
      "state": "$SERVICESTATE$",
      "stateType": "HARD",
      "checkAttempt": 1,
      "maxCheckAttempts": $MAXSERVICECHECKATTEMPTS$,
      "output": "$SERVICEOUTPUT$"
    }'

  Son exactamente los macros que Nagios ya tiene disponibles en cualquier notification command de Thruk.

  La recomendación es usar /monitoring/alerts — el esfuerzo de migración del script es bajo y la diferencia de comportamiento ante
  una falla masiva es enorme.

  ---

  
❯ Dame una conclusion, recomendacion para darsela al cliente. sobre loas dos formas

● Conclusión y Recomendación — Integración Nagios/Thruk con api-snowq-service

  ---
  Contexto

  api-snowq-service fue diseñado como una cola inteligente entre las aplicaciones del ecosistema y ServiceNow. Atiende múltiples
  fuentes simultáneas: sistemas de negocio (como monolito-event-corner_v3), sistemas operacionales y sistemas de monitoreo
  (Nagios/Thruk). Cada tipo de fuente tiene un patrón de comportamiento diferente y requiere un tratamiento distinto.

  ---
  Las dos opciones

  Opción A — Usar el endpoint estándar /snow-requests/incidents

  Thruk envía las alertas de Nagios por el mismo canal que el resto de las aplicaciones.

  Funciona, pero tiene riesgos conocidos frente al comportamiento real de Nagios:

  - Una falla de infraestructura que afecte 40 hosts genera 40 tickets independientes en ServiceNow por la misma causa raíz.
  - Los falsos positivos (alerta dispara y el servicio se recupera en segundos) igualmente crean un ticket que alguien tiene que
  cerrar manualmente.
  - Las notificaciones de tipo ACKNOWLEDGEMENT, DOWNTIME o FLAPPING llegan como si fueran incidentes reales.
  - No hay mecanismo de recuperación: cuando Nagios envía el recovery, api-snowq-service no puede correlacionarlo con el ticket
  pendiente.

  En volumen bajo estas situaciones son manejables. En volumen alto o ante una falla masiva de infraestructura, la bandeja de
  ServiceNow se satura con ruido y el equipo de operaciones pierde visibilidad de lo que realmente importa.

  ---
  Opción B — Usar el endpoint dedicado /monitoring/alerts (recomendada)

  Thruk usa un endpoint diseñado específicamente para el comportamiento de Nagios.

  Antes de encolar cualquier alerta, el sistema aplica una capa de decisión:

  - Filtra notificaciones que no deben generar ticket: ACKNOWLEDGEMENT (alguien ya lo atiende), DOWNTIME (mantenimiento programado),
  FLAPPING (servicio inestable sin incidente real), estados SOFT (falla no confirmada, todavía en período de re-chequeo).
  - Deduplica por fingerprint (host + servicio): si 40 hosts caen por el mismo switch, solo se crea un ticket. Las otras 39
  notificaciones reconocen el ticket existente y no generan duplicados.
  - TTL configurable: si Nagios dispara una alerta y el servicio se recupera antes de que el ticket llegue a ServiceNow, el registro
  expira y se descarta automáticamente. ServiceNow nunca lo ve.
  - Recovery inteligente: cuando Nagios envía la notificación de recuperación, api-snowq-service cancela el ticket pendiente si
  todavía no fue enviado a ServiceNow.

  El cambio en los scripts de Thruk es menor — solo se agrega el contexto que Nagios ya tiene disponible como macros ($HOSTNAME$,
  $SERVICESTATE$, etc.).

  ---
  Recomendación

  Usar la Opción B para la integración de Nagios/Thruk, y mantener la Opción A para el resto de las aplicaciones (monolito, sistemas
  de negocio).

  Esta separación garantiza:

  1. Calidad de los tickets en ServiceNow — solo llegan incidentes reales, confirmados y únicos.
  2. Estabilidad ante tormentas de alertas — una falla masiva de infraestructura no satura ni ServiceNow ni la cola de procesamiento.
  3. Cero impacto en otras integraciones — el monolito y otras aplicaciones usan el endpoint estándar sin modificaciones.
  4. Trazabilidad completa — cada alerta queda registrada con su estado final: DELIVERED (llegó a SN), CANCELLED (recovery canceló el
   ticket), EXPIRED (falso positivo descartado), DEDUPLICATED (absorbida por un ticket activo).

  El costo de migración de Thruk a la Opción B es bajo — ajustar el script de notification command para apuntar al nuevo endpoint y
  agregar los macros de Nagios al body del request. El beneficio operacional, especialmente en escenarios de falla masiva, es
  significativo.

  ---

  
● Con la implementación actual, siempre se encola — modo asíncrono. La respuesta a Thruk es inmediata (HTTP 200 con el
  correlationId), pero el ticket en ServiceNow se crea después, cuando el worker la procesa.

  Thruk → POST /monitoring/alerts
              │
              ▼
          MonitoringService.handleAlert()
              │  decisión + dedup + fingerprint
              ▼
          snow_requests INSERT (status=QUEUED)  ← respuesta inmediata a Thruk
              │
              │  ... tiempo después ...
              ▼
          SnowRequestWorkerService (poll cada 500ms)
              │
              ▼
          ServiceNow ← aquí se crea el ticket real

  ---
  Por qué el modo inmediato no conviene para monitoreo

  El valor de haberlo encolado es exactamente que hay una ventana de tiempo entre que Thruk avisa y que el ticket llega a SN. Esa
  ventana es la que permite:

  - TTL/expiración — si el servicio se recupera en 2 minutos, el ticket expira en la cola y nunca llega a SN. Si fuera inmediato, el
  ticket ya estaría creado antes de que llegue el recovery.
  - Cancelación por recovery — funciona porque el ticket todavía está en QUEUED cuando llega la notificación de recuperación.
  - Backpressure ante tormenta — durante una falla masiva, la cola absorbe el pico y despacha hacia SN a ritmo controlado (PQueue,
  concurrency=5).

  Si fuera inmediato, perderías los tres mecanismos.

  ---
  ¿Cuándo sí tendría sentido modo inmediato para monitoreo?

  Solo si Thruk necesita el sysId de ServiceNow en la misma respuesta HTTP, por ejemplo para guardarlo en Nagios y usarlo después
  para actualizar o cerrar el ticket directamente. Pero en ese caso el recovery tampoco pasaría por api-snowq-service, lo haría Thruk
   directamente contra SN — que es exactamente lo que queremos evitar.

  Conclusión: modo encolado es el correcto para este flujo. Thruk no necesita esperar a SN — solo necesita saber que la alerta fue
  recibida y tiene un correlationId para rastrearla si hace falta.

---



❯ una pregunta haciendo un hash de una peticion no podriamos saber si esta duplicada.

● Sí, y es una idea muy buena. Un hash es esencialmente un fingerprint calculado automáticamente — el cliente no necesita saber que
  existe.

  ---
  Hash vs Fingerprint explícito

  ┌──────────────────────────────────┬────────────────────────────────┬──────────────────────────────────┐
  │                                  │ Fingerprint explícito (actual) │         Hash automático          │
  ├──────────────────────────────────┼────────────────────────────────┼──────────────────────────────────┤
  │ Quién lo calcula                 │ Thruk (el cliente)             │ api-snowq-service                │
  ├──────────────────────────────────┼────────────────────────────────┼──────────────────────────────────┤
  │ El cliente necesita conocerlo    │ Sí                             │ No                               │
  ├──────────────────────────────────┼────────────────────────────────┼──────────────────────────────────┤
  │ Aplica solo a /monitoring        │ Sí                             │ Puede aplicar a cualquier fuente │
  ├──────────────────────────────────┼────────────────────────────────┼──────────────────────────────────┤
  │ Monolito se beneficia            │ No                             │ Sí — detecta envíos duplicados   │
  ├──────────────────────────────────┼────────────────────────────────┼──────────────────────────────────┤
  │ Control sobre qué es "duplicado" │ Total (el cliente decide)      │ Depende de qué campos se hashean │
  └──────────────────────────────────┴────────────────────────────────┴──────────────────────────────────┘

  ---
  El detalle crítico: ¿qué campos entran al hash?

  Esto define qué se considera duplicado. No es el hash del payload completo — necesita ser selectivo.

  Para Thruk/Nagios:
  // mismo host + mismo servicio = mismo incidente
  // no importa si el output del plugin cambió ("450ms" vs "520ms")
  hash({ host: "web01", service: "HTTP" })

  Para el monolito:
  // si el payload tiene un ID de negocio, úsalo
  hash({ type: "incident", incidentId: payload.incidentId })

  // si no, hash del payload completo — detecta reenvíos exactos
  hash(payload)

  Si hasheas el payload completo para Nagios, un pequeño cambio en el output del plugin ("Response time: 450ms" vs "Response time:
  521ms") produce un hash diferente y se crean dos tickets — justo lo que queremos evitar.

  ---
  Implementación combinada

  El enfoque más robusto: hash automático server-side como fallback, fingerprint explícito como override.

  private computeFingerprint(source: string, payload: Record<string, unknown>, explicitFingerprint?: string): string {
      // Si el cliente envía uno → respetarlo
      if (explicitFingerprint) return explicitFingerprint;

      // Monitoreo: hashear host + service
      if (source === 'nagios-thruk') {
          return this.hash({ host: payload.host, service: payload.service ?? 'HOST' });
      }

      // Otras fuentes: hashear campos de identidad de negocio si existen
      const identity = payload.incidentId ?? payload.requestId ?? payload.externalId;
      if (identity) {
          return this.hash({ source, id: identity });
      }

      // Sin identidad conocida → sin deduplicación (null)
      return null;
  }

  private hash(fields: Record<string, unknown>): string {
      return createHash('sha256')
          .update(JSON.stringify(fields))
          .digest('hex')
          .substring(0, 64);
  }

  ---
  Lo que ganas con esto

  Si el monolito tiene un bug y envía el mismo incident dos veces, la segunda solicitud devuelve el correlationId existente en lugar
  de crear un ticket duplicado en SN — sin que el monolito ni Thruk tengan que cambiar nada.

  La deduplicación deja de ser una feature exclusiva de monitoreo y se convierte en una garantía de idempotencia para toda la
  plataforma.

  ---


  
● Listo. Así queda la lógica completa de deduplicación por hash:

  ---
  Cómo funciona el hash en cada camino

  Camino estándar — SnowRequestProcessingService.enqueue()

  POST /snow-requests/incidents
  { source: "monolith", payload: { incidentId: "INC-001", ... } }
                  │
                  ▼
  computeFingerprint()
    → busca: incidentId | requestId | externalId | entityId | id
    → encontró "INC-001"
    → SHA-256({ type: "incident", source: "monolith", id: "INC-001" })
    → "a3f9c2d1e4b5..."
                  │
                  ▼
  findActiveByFingerprint("a3f9c2d1e4b5...")
    → existe QUEUED? → SÍ → return { correlationId, deduplicated: true }
                           → NO → INSERT + return { correlationId, deduplicated: false }

  Si el payload no tiene ningún campo de identidad → fingerprint = null → sin deduplicación → se crea siempre.

  Camino monitoreo — MonitoringService.handleProblem()

  POST /monitoring/alerts
  { host: "web01", service: "HTTP", state: "CRITICAL", ... }
                  │
                  ▼
  buildFingerprint()
    → SHA-256({ host: "web01", service: "HTTP" })
    → "7e2a1b4f9c3d..."   ← mismo hash sin importar el state o el output
                  │
                  ▼
  findActiveByFingerprint("7e2a1b4f9c3d...")
    → 40 alertas del mismo host → solo la primera crea registro

  Por qué no se incluye state en el hash de monitoreo

  web01/HTTP → WARNING   → hash("web01","HTTP") → "7e2a1b..."  ← mismo ticket
  web01/HTTP → CRITICAL  → hash("web01","HTTP") → "7e2a1b..."  ← deduplicado ✓
  web01/HTTP → WARNING   → hash("web01","HTTP") → "7e2a1b..."  ← deduplicado ✓

  Si se incluyera el state, WARNING y CRITICAL generarían dos tickets distintos para el mismo host.

✻ Cogitated for 2m 45s

---


● Todo limpio. La estructura final:

  src/
  ├── app.module.ts
  ├── main.ts
  │
  ├── common/               ← utilidades compartidas, sin cambios
  ├── database/             ← sin cambios
  │
  ├── resilience/           ← era: bulkhead/ + circuitbreaker/
  │   ├── bulkhead/         ← archivos renombrados a kebab-case
  │   └── circuit-breaker/  ← typo "circuitbreiner" corregido
  │
  ├── servicenow/           ← era: service-now/ + Facfory-stretegy/
  │   ├── client/           ← client, error factory, breaker factory
  │   ├── processors/       ← factory + interface
  │   │   └── strategies/   ← 7 processors (typos corregidos)
  │   ├── servicenow.module.ts  ← fusiona 2 módulos
  │   └── servicenow.service.ts
  │
  ├── snow-requests/        ← era: snow-request/ + queue/ + incidence-processing/
  │   ├── entities/
  │   ├── controllers/
  │   ├── services/         ← 4 servicios consolidados
  │   └── snow-requests.module.ts  ← fusiona 3 módulos
  │
  ├── monitoring/           ← sin cambios
  │
  └── legacy/
      └── broker-client/    ← era: some-rabbit-mq-client/ (código huérfano)

  Lo que se corrigió además de mover:
  - Facfory-stretegy → servicenow/processors ✓
  - circuitbreiner.module.ts → circuit-breaker.module.ts ✓
  - incident.stategy.ts → incident.strategy.ts ✓
  - knowledge_article / release_task → kebab-case ✓
  - reponse-service-now.type.ts → response-servicenow.type.ts ✓
  - 3 módulos separados → 1 SnowRequestsModule ✓
  - 2 módulos separados → 1 ServiceNowModule ✓
  - Cero referencias a paths viejos ✓
