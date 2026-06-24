  4 nuevas páginas implementadas

  /health — Service Health Scorecards

  - Cards por servicio con semáforo 🟢 OK / 🟡 WARN / 🔴 CRÍTICO
  - Métricas: error rate, throughput req/min, p50 y p95 de latencia (calculado desde traces), errores y warnings de la última hora
  - Último mensaje de error como preview
  - Ordena automáticamente: críticos primero

  /topn — Top-N Analysis

  4 tabs sobre el período seleccionado (1h/6h/24h/72h):
  - Endpoints lentos: top 10 spans por durationMs, resaltado en rojo si > 1s
  - Errores frecuentes: agrupa por prefix de mensaje, muestra conteo
  - CorrelationIDs: los que concentran más errores — directo al /correlation para drill-down
  - Servicios: barras horizontales por volumen de errores + error rate %

  /timeline — Incident Timeline

  - Selector de rango (1h/3h/6h/12h/24h) + umbral de span lento configurable
  - ComposedChart: barras de errores + barras de warnings + línea de spans lentos sobre el mismo eje temporal
  - Lista de eventos cronológica (error/warn/slow) con servicio y mensaje
  - Pills de resumen: total errores, warnings, spans lentos

  /slo — SLO Dashboard

  - Configuración: ventana, target SLO (99.9%/99%/95%), umbral de latencia
  - Gauge radial global con availability promedio de todos los servicios
  - Cards por servicio con:
    - Availability % vs target
    - Error budget usado (barra de progreso roja cuando se acerca al límite)
    - Latency budget (% de spans bajo el umbral)

  ---
  Pendientes guardados en memoria

  Live Tail (SSE), Trace Call Chain, Anomaly Detection, Export CSV, Comparación entre períodos, Log Pattern Grouping.