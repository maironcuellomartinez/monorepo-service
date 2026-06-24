 Listo. Uso:

  # Ver todos los escenarios
  node combined-simulator.js list

  # Ejecutar cualquier escenario
  node combined-simulator.js scenario --name infra-outage
  node combined-simulator.js scenario --name full-lifecycle
  node combined-simulator.js scenario --name parallel-storm

  ---
  Los 7 escenarios combinados

  ┌─────────────────┬──────────────────────┬───────────────────────────────┬───────────────────────────────────────────┐
  │    Escenario    │        Nagios        │           Monolito            │                Qué prueba                 │
  ├─────────────────┼──────────────────────┼───────────────────────────────┼───────────────────────────────────────────┤
  │ infra-outage    │ HOST DOWN            │ 2 incidentes (apps afectadas) │ Flujos independientes para la misma caída │
  ├─────────────────┼──────────────────────┼───────────────────────────────┼───────────────────────────────────────────┤
  │ deploy-incident │ WARNING + RECOVERY   │ Change request (deploy)       │ Degradación transitoria durante deploy    │
  ├─────────────────┼──────────────────────┼───────────────────────────────┼───────────────────────────────────────────┤
  │ cascade-failure │ 2 alerts (Redis × 2) │ 3 incidentes (apps)           │ Fallo en cascada, cola de prioridad       │
  ├─────────────────┼──────────────────────┼───────────────────────────────┼───────────────────────────────────────────┤
  │ full-lifecycle  │ PROBLEM + RECOVERY   │ Incidente encolado            │ Ciclo completo con poll de estado         │
  ├─────────────────┼──────────────────────┼───────────────────────────────┼───────────────────────────────────────────┤
  │ parallel-storm  │ 4 alerts (paralelo)  │ 4 incidentes (paralelo)       │ Bulkhead, circuit breaker, concurrencia   │
  ├─────────────────┼──────────────────────┼───────────────────────────────┼───────────────────────────────────────────┤
  │ dedup-cross     │ 3 re-notificaciones  │ 2 sin id + 2 con id           │ Dedup por fingerprint vs por payload.id   │
  ├─────────────────┼──────────────────────┼───────────────────────────────┼───────────────────────────────────────────┤
  │ dlq-recovery    │ PROBLEM + RECOVERY   │ Incidente + retry-all         │ DLQ reencola antes del recovery           │
  └─────────────────┴──────────────────────┴───────────────────────────────┴───────────────────────────────────────────┘