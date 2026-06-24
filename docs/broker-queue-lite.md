# broker-queue-lite — Broker de mensajería

Puerto HTTP: **5000** | Puerto TCP: **8000**
Swagger: `http://localhost:5000/api/docs`

Broker de mensajería interno con semántica similar a RabbitMQ. Persiste mensajes en MySQL. Soporta exchanges, queues, bindings, DLQ, y consumidores push/pull.

El `api-snowq-service` se conecta via **TCP** en el puerto `8000` usando el transport de NestJS microservices.

---

## Topología usada por api-snowq-service

```
Exchange: snow.exchange
  │
  ├── snow.incident.critical    → cola: snow.incident.critical
  ├── snow.incident.high        → cola: snow.incident.high
  ├── snow.incident.medium      → cola: snow.incident.medium
  ├── snow.incident.low         → cola: snow.incident.low
  │
  ├── snow.change_request.*     → colas: snow.change_request.{priority}
  ├── snow.sc_req_item.*        → colas: snow.sc_req_item.{priority}
  ├── snow.problem.*            → colas: snow.problem.{priority}
  ├── snow.kb_article.*         → colas: snow.kb_article.{priority}
  ├── snow.release_task.*       → colas: snow.release_task.{priority}
  └── snow.cmdb_ci.*            → colas: snow.cmdb_ci.{priority}
```

Routing key pattern: `snow.{requestType}.{priority}`
Ejemplo: `snow.incident.4` (incident con prioridad CRITICAL)

---

## API HTTP (administración)

### Health check

```bash
curl -s http://localhost:5000/api/v1/health | jq
```

**Respuesta:**
```json
{
  "status": "ready",
  "uptime": 3600
}
```

### Liveness

```bash
curl -s http://localhost:5000/api/v1/live | jq
```

### Métricas (Prometheus format)

```bash
curl -s http://localhost:5000/api/v1/metrics
```

---

## Operaciones TCP (usadas internamente por api-snowq-service)

Estas operaciones son invocadas por el `BrokerClientService` via TCP. Se documentan aquí como referencia.

### Declarar exchange

**Pattern:** `broker.exchange.declare`

```json
{
  "name": "snow.exchange",
  "type": "topic",
  "durable": true
}
```

### Declarar cola

**Pattern:** `broker.queue.declare`

```json
{
  "name": "snow.incident.critical",
  "durable": true,
  "maxRetries": 3,
  "ttl": 86400000
}
```

### Vincular cola a exchange

**Pattern:** `broker.queue.bind`

```json
{
  "exchange": "snow.exchange",
  "queue": "snow.incident.critical",
  "routingKey": "snow.incident.4"
}
```

### Publicar mensaje

**Pattern:** `broker.message.publish`

```json
{
  "messageId": "uuid-v4",
  "exchange": "snow.exchange",
  "routingKey": "snow.incident.4",
  "data": {
    "correlationId": "uuid-del-registro",
    "payload": {}
  }
}
```

### Consumir mensajes (pull)

**Pattern:** `broker.message.consume`

```json
{
  "clientId": "consumer-incident-4",
  "queueName": "snow.incident.critical",
  "limit": 10,
  "autoAck": false
}
```

### Acknowledger mensaje

**Pattern:** `broker.message.ack`

```json
{
  "clientId": "consumer-incident-4",
  "queueName": "snow.incident.critical",
  "messageId": "uuid-del-mensaje"
}
```

### Rechazar mensaje (nack)

**Pattern:** `broker.message.nack`

```json
{
  "clientId": "consumer-incident-4",
  "queueName": "snow.incident.critical",
  "messageId": "uuid-del-mensaje",
  "options": {
    "requeue": false,
    "reason": "Error al procesar"
  }
}
```

### Consultar stats de una cola

**Pattern:** `broker.queue.stats`

Payload: `"snow.incident.critical"`

### Listar todas las colas

**Pattern:** `broker.get.queues`

---

## Notas

- Los mensajes que superan el máximo de reintentos pasan automáticamente a la **DLQ** (Dead Letter Queue)
- El broker persiste los mensajes en MySQL — sobrevive reinicios
- `api-snowq-service` registra consumidores al arrancar y reconecta automáticamente si el broker no está disponible
- El circuit breaker del cliente TCP se abre tras 50% de errores en una ventana de 10 segundos y se resetea a los 10 segundos
