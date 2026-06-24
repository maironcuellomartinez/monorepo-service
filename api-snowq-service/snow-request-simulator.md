  Comandos

  # Encolar (202 ACCEPTED — asíncrono)
  node snow-request-simulator.js queue --type incident
  node snow-request-simulator.js queue --type change-request --severity high --priority 1

  # Inmediato (200 OK — sincrónico, devuelve sys_id)
  node snow-request-simulator.js immediate --type incident --severity critical
  node snow-request-simulator.js immediate --type problem --source app-payments

  # Consultar estado de un ticket
  node snow-request-simulator.js status --id <correlationId>

  # DLQ
  node snow-request-simulator.js failed              # lista todos los FAILED
  node snow-request-simulator.js retry --id <id>     # reencola uno
  node snow-request-simulator.js retry-all           # reencola toda la DLQ

  Escenarios

  node snow-request-simulator.js scenario --name all-queued       # 1 ticket de cada tipo
  node snow-request-simulator.js scenario --name all-immediate    # todos en modo sync
  node snow-request-simulator.js scenario --name incident-burst   # 5 incidentes en paralelo
  node snow-request-simulator.js scenario --name change-workflow  # change + consulta estado
  node snow-request-simulator.js scenario --name mixed-priority   # crítico sync + bajo encolado

  # 5 incidentes encolados, secuencial
  node snow-request-simulator.js batch --type incident --count 5

  # 3 de cada tipo (incident + problem), en paralelo
  node snow-request-simulator.js batch --type incident,problem --count 3 --parallel

  # Todos los tipos, modo immediate
  node snow-request-simulator.js batch --type all --mode immediate

  # 10 incidentes críticos en paralelo (prueba de carga)
  node snow-request-simulator.js batch --type incident --count 10 --parallel --severity critical

  Diferencia clave con scenario --name all-queued:

  ┌──────────────┬────────────────────────────┬───────────────────────────────────────┐
  │              │ scenario --name all-queued │                 batch                 │
  ├──────────────┼────────────────────────────┼───────────────────────────────────────┤
  │ Tipos        │ Siempre los 7              │ Configurable (--type o --type all)    │
  ├──────────────┼────────────────────────────┼───────────────────────────────────────┤
  │ Repeticiones │ 1 por tipo, fijo           │ --count N                             │
  ├──────────────┼────────────────────────────┼───────────────────────────────────────┤
  │ Paralelismo  │ Secuencial (150ms delay)   │ --parallel para Promise.all           │
  ├──────────────┼────────────────────────────┼───────────────────────────────────────┤
  │ Uso          │ Test rápido de routing     │ Carga, stress, simulación de monolito │
  └──────────────┴────────────────────────────┴───────────────────────────────────────┘