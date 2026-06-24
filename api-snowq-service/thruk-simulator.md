● Listo. Uso rápido:

  # Comando individual
  node thruk-simulator.js problem --host web01 --service HTTP
  node thruk-simulator.js problem --host db01 --state DOWN
  node thruk-simulator.js problem --host app01 --service API --state WARNING --soft
  node thruk-simulator.js recovery --host web01 --service HTTP
  node thruk-simulator.js ack --host web01 --service HTTP
  node thruk-simulator.js status --id <correlationId>

  # Con TTL (expira en cola si no se procesa antes)
  node thruk-simulator.js problem --host app01 --service API --ttl 30

  # Escenarios completos
  node thruk-simulator.js scenario --name storm         # 3 hosts caen simultáneamente
  node thruk-simulator.js scenario --name dedup         # misma alerta x3 → solo 1 ticket
  node thruk-simulator.js scenario --name recovery      # problema + recovery inmediato
  node thruk-simulator.js scenario --name flap-ignored  # SOFT + FLAPPING ignorados
  node thruk-simulator.js scenario --name ttl-expire    # alerta que expira en cola
  node thruk-simulator.js scenario --name ignored       # ACK + DOWNTIME ignorados

  # URL diferente (ej: staging)
  SNOWQ_URL=http://staging:3090 node thruk-simulator.js scenario --name storm

  El script usa solo http nativo de Node — sin dependencias externas. Cada respuesta muestra action, reason, correlationId e
  internalNumber con colores por tipo de resultado (verde=QUEUED, amarillo=DEDUPLICATED, magenta=CANCELLED, rojo=TOO_LATE,
  dim=IGNORED).


  ----

  
● Arranca el servidor primero, luego en otra terminal:

  # 1. Arrancar el servicio
  npm run start:dev

  # 2. En otra terminal, desde la raíz del proyecto
  node thruk-simulator.js help

  ---
  Flujo básico — simular un host caído y su recovery:

  # Host web01 con servicio HTTP cae (genera ticket QUEUED)
  node thruk-simulator.js problem --host web01 --service HTTP

  # El mismo servicio se recupera (cancela el ticket si sigue QUEUED)
  node thruk-simulator.js recovery --host web01 --service HTTP

  Ver estado de un ticket:
  node thruk-simulator.js status --id <correlationId-del-output-anterior>

  ---
  Escenarios de un solo comando (los más útiles para probar):

  # Probar deduplicación — misma alerta 3 veces, debe crear solo 1 ticket
  node thruk-simulator.js scenario --name dedup

  # Probar que SOFT y FLAPPING se ignoran
  node thruk-simulator.js scenario --name flap-ignored

  # Probar recovery completo
  node thruk-simulator.js scenario --name recovery

  # Probar tormenta de alertas (3 hosts distintos)
  node thruk-simulator.js scenario --name storm

  ---
  Salida esperada de problem:
  thruk-simulator → http://localhost:3090
  ────────────────────────────────────────────────────────────
    PROBLEM — web01/HTTP
  ────────────────────────────────────────────────────────────

  → PROBLEM web01
    Payload: {"notificationType":"PROBLEM","host":"web01",...}
    ← HTTP 200 | action=QUEUED | reason="Alerta encolada [web01/HTTP]"
      correlationId=a1b2c3d4-...
      internalNumber=MON-A1B2C3D4

  ---
  Otros estados que vas a ver:

  ┌────────────────┬──────────┬─────────────────────────────────────────────────────────┐
  │     action     │  Color   │                         Cuándo                          │
  ├────────────────┼──────────┼─────────────────────────────────────────────────────────┤
  │ QUEUED         │ verde    │ ticket nuevo creado                                     │
  ├────────────────┼──────────┼─────────────────────────────────────────────────────────┤
  │ DEDUPLICATED   │ amarillo │ ya existe ticket activo para ese host/servicio          │
  ├────────────────┼──────────┼─────────────────────────────────────────────────────────┤
  │ CANCELLED      │ magenta  │ recovery canceló un ticket QUEUED                       │
  ├────────────────┼──────────┼─────────────────────────────────────────────────────────┤
  │ TOO_LATE       │ rojo     │ recovery llegó pero el ticket ya estaba enviándose a SN │
  ├────────────────┼──────────┼─────────────────────────────────────────────────────────┤
  │ RESOLVED_IN_SN │ cyan     │ recovery cerró un ticket que ya estaba en SN            │
  ├────────────────┼──────────┼─────────────────────────────────────────────────────────┤
  │ IGNORED        │ gris     │ SOFT / ACK / FLAPPING / DOWNTIME                        │
  └────────────────┴──────────┴─────────────────────────────────────────────────────────┘