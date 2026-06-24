<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest


---

## 📊 Flujo General del Microservicio

**Origen:** Nagios/Thruk
**Destino:** ServiceNow vía ServiceNow REST API
**Intermediario:** Este microservicio en NestJS con TypeORM + Opossum

---

## 📌 Pasos del flujo

### 1️⃣ 📥 **Thruk/Nagios envía una petición HTTP POST**

A un endpoint tipo:

```
POST /api/incidences
Content-Type: application/json

{
  "description": "Servicio de base de datos caído",
  "severity": "critical",
  "impact": 2,
  "urgency": 2,
  "type": "incident"
}
```

Este payload se valida contra un **DTO** llamado `CreateIncidenceDto` que podría verse así:

```ts
export class CreateIncidenceDto {
  description: string;
  severity: string;
  impact: number;
  urgency: number;
  type?: RequestType;
}
```

---

### 2️⃣ 📑 **El microservicio recibe, determina prioridad y encola**

✔️ Se determina la prioridad usando `RequestPriorityUtils.determineFromPayload()`.
✔️ Se ubica en la `Map<RequestPriority, Incidence[]>` según su prioridad.

Ejemplo:

* `CRITICAL` se va a la cola de prioridad 4
* `HIGH` a la 3
* `MEDIUM` a la 2
* `LOW` a la 1

---

### 3️⃣ 🔄 **Despachador automático**

Cada 5 segundos el `dispatcher` revisa las colas:

➡️ Procesa primero las de mayor prioridad (CRITICAL → LOW)
➡️ Por cada incidencia:

* Lee el `batchSize` configurado para su `RequestType` (ej: INCIDENT = 10)
* Toma ese batch
* Lo envía a ServiceNow usando `ServiceNowService.sendRequest()`.

---

### 4️⃣ 🌐 **Envío a ServiceNow vía REST API**

El `ServiceNowService` usa **axios** para enviar a la URL correcta según `RequestTypeUtils.getEndpoint()`.
Este método está protegido por un **circuit breaker (opossum)**:

* Si el endpoint tarda más de 10s → cuenta como fallo
* Si más del 50% de las peticiones fallan → se abre el breaker
* Si está abierto, no se intentan envíos por 30s y se usa un fallback (simula sys\_id)

---

### 5️⃣ 📈 **Manejo de errores y reintentos**

Si falla un envío:

* Calcula un **retryDelay** según prioridad con `RequestPriorityUtils.getRetryDelay()`
* Reencola la incidencia en su cola correspondiente
* Intentará de nuevo después del delay

---

## 📤 Respuesta hacia Thruk/Nagios

Cuando se recibe la petición de Thruk, puedes retornar:

* HTTP 202 Accepted (si se encola correctamente)
* O directamente el sys\_id si quieres enviar el incidente inmediatamente (opcional, no implementado aún, pero posible)

---

## 📌 Endpoints expuestos

Puedes tener algo como:

```ts
POST /api/incidences
Body: CreateIncidenceDto
Response: 202 Accepted
```

---

## 📚 Librerías usadas

| Librería              | Propósito                                     |
| :-------------------- | :-------------------------------------------- |
| **nestjs**            | Framework principal                           |
| **typeorm**           | ORM para la persistencia (MySQL)              |
| **axios**             | Cliente HTTP para peticiones a ServiceNow     |
| **opossum**           | Circuit breaker para proteger peticiones HTTP |
| **class-validator**   | Validación DTOs de entrada                    |
| **class-transformer** | Transformación de objetos a DTO               |

---

## ✅ Cómo levantarlo

1. Configurar `.env` con tus datos de MySQL y ServiceNow API
2. Ejecutar:

```bash
npm run start:dev
```

---

## 📊 Extras opcionales que te puedo dejar

✅ Métricas y estado en tiempo real del circuit breaker (con un GET /metrics)
✅ WebSocket para avisos de incidencias procesadas
✅ Dashboard React para visualizar estado de colas y breaker

---

Si quieres te hago ese dashboard o las métricas ahora mismo ⚡ ¿te gustaría?
