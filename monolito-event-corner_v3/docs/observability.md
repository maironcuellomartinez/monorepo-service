
● Entendido. Los puntos clave son:

  1. Una sola libreria para todos los servicios — logs, metrics, traces
  2. correlationId como eje — mismo UUID desde el request inicial hasta todos los servicios
  3. Rendimiento — no bloquear el request con envio de telemetry

  Arquitectura propuesta

  REQUEST ENTRANTE
    correlationId = x-correlation-id (header) ?? uuid()
         │
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  api-gateway                                                  │
  │  CorrelationInterceptor → OTel span + AsyncLocalStorage       │
  │       │
  │       │  HTTP call al monolith
  │       │  Headers: x-correlation-id: <mismo UUID>            │
  │       ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  monolith                                                     │
  │  CorrelationMiddleware → propaga contexto (mismo UUID)       │
  │       │
  │       │  HTTP call a api-snowq
  │       │  Headers: x-correlation-id: <mismo UUID>            │
  │       ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  api-snowq                                                    │
  │  CorrelationMiddleware → propaga contexto (mismo UUID)       │
  └─────────────────────────────────────────────────────────────┘

  Todos: mismo correlationId en:
    - Logs (Winston + HttpTransport → Collector → Loki)
    - Metrics (OTel Meter → Collector → Prometheus)
    - Traces (OTel Tracer → Collector → Jaeger/Tempo)

  Dato clave: el correlationId se genera una sola vez en api-gateway y se propaga via header en todas las llamadas HTTP
  subsiguientes. Los demas servicios solo lo reciben y lo usan.

  Rendimiento — no bloquear requests

  HTTP Transport (logs)
  ────────────────────────────────────────────
  Request → Winston log() → Buffer (array)
                           └─ async flush() cada 2s
                              └─ Promise.all([...]) fire-and-forget
                                 (no await en el request path)

  OTel Meter (metrics)
  ────────────────────────────────────────────
  Histogram.observe() → 0 allocaciones sync
  Counter.add()       → 0 allocaciones sync
  Metrics se envian cada 5s por PeriodicExportingMetricReader

  OTel Tracer (traces)
  ────────────────────────────────────────────
  Span.end()          → encola span
  Force flush SIGTERM → no afecta request latency

  ---
  Implementacion del HTTP Transport para logs

  Reemplazaria WinstonRabbitMQTransport_v2 con WinstonHttpTransport_v2 que:
  - Buffer en memoria (no bloquea request)
  - Flush cada N logs o cada X ms
  - Fire-and-forget HTTP POST al OTLP Collector o Loki
  - Retry con exponential backoff opcional
  - Caida del collector = logs en buffer, no en error

  Correlation ID en metrics

  No en todas las metricas — eso seria cardinalidad excesiva. Solo en metricas de request:

  http_request_duration_ms{path="/api/incidents", method="GET", status="200", correlationId="abc-123"}

  Pero path y method ya identifican. El correlationId sirve para joins entre logs/traces/metrics en dashboards, no como label en toda
   metricas.

   ---

   
  [Cliente externo]
      │ x-correlation-id: abc-123  (o ninguno → se genera)
      ▼
  api-gateway
    CorrelationMiddleware_v2  → ALS: { correlationId: 'abc-123' }  ✓
    CorrelationInterceptor    → ALS: { correlationId: 'abc-123' }  ✓ (sobreescribe, mismo valor)
      │
      ├─ AbacClient  (@backendkit-labs/http-client)
      │      pipeline step 'inject-correlation-id' → header x-correlation-id: abc-123  ✓
      │      ▼
      │   abac-microservice recibe x-correlation-id  ✓
      │
      └─ MonolithClient  (@backendkit-labs/http-client)
             pipeline step 'inject-correlation-id' → header x-correlation-id: abc-123  ✓
             ▼
          monolith
            CorrelationMiddleware_v2 → ALS: { correlationId: 'abc-123' }  ✓
            CorrelationInterceptor  → ALS: { correlationId: 'abc-123' }  ✓
              │
              ├─ ServiceNowProxyAdapter  (@nestjs/axios, sin propagación)
              │      headers: { Authorization: Bearer ... }  ← NO x-correlation-id  ✗
              │
              └─ InventoryHttpAdapter  (@nestjs/axios, sin propagación)
                     headers: { Authorization: Bearer ... }  ← NO x-correlation-id  ✗

---

## Resiliencia de los transportes (`@backendkit-labs/circuit-breaker`)

Los tres transportes HTTP de telemetría (`WinstonHttpTransport`, `MetricsProducerService`,
`TracingService`) usan `@backendkit-labs/circuit-breaker` para proteger la app de un backend
de observabilidad caído. Antes cada uno tenía un circuit breaker casero inline e idéntico
(`TransportCircuitBreaker` / `MetricsCircuitBreaker` / `TracingCircuitBreaker`); se eliminaron
en favor de la librería compartida del ecosistema.

Config por transporte (`obs-log-transport` / `obs-metrics-transport` / `obs-traces-transport`):

| Parámetro | Valor | Efecto |
|---|---|---|
| `failureThreshold` | `60` | abre al ≥60% de fallos en la ventana |
| `slidingWindowSize` | `5` | tamaño de la ventana deslizante |
| `minimumCalls` | `3` | mínimo de llamadas antes de evaluar |
| `openTimeoutMs` | `30000` | espera en OPEN antes de probar (HALF_OPEN) |
| `halfOpenMaxCalls` | `1` | una llamada de prueba antes de cerrar |

Diferencia vs. el CB casero previo: aquél abría tras **5 fallos consecutivos** y reseteaba a
ciegas a los 30s; el actual abre por **ventana deslizante** y se recupera con una llamada de
prueba en HALF_OPEN — más robusto ante fallos intermitentes. El envío se hace con
`cb.execute(() => http.post(...))`: cuando el circuito está abierto, `execute` lanza
`CircuitBreakerOpenError` y el batch se marca como no enviado sin tocar la red.

**El formato de red NO cambió**: se sigue posteando `{ metrics: [...] }`, `{ logs: [...] }` y
el envelope OTLP `resourceSpans` a `/ingest/*` del `observability-service`. El dashboard recibe
exactamente lo mismo.
