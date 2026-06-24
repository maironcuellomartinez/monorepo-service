# Ejemplos de pruebas — Simulators

Todas las pruebas se ejecutan desde la **raíz del workspace** con `npm run sim:*`
o directamente con `node simulators/<script>.js`.

Requisito previo: todos los servicios levantados en el orden estándar.

---

## Índice

1. [snow-request-simulator — tickets directos a api-snowq-service](#1-snow-request-simulator)
2. [thruk-simulator — alertas Nagios/Thruk](#2-thruk-simulator)
3. [combined-simulator — flujos mixtos](#3-combined-simulator)
4. [gateway-simulator — flujo completo via api-gateway](#4-gateway-simulator)
5. [Flujos de prueba completos](#5-flujos-de-prueba-completos)

---

## 1. snow-request-simulator

Simula las llamadas que hace el monolith hacia `api-snowq-service`.
**URL:** `SNOWQ_URL` (default `http://localhost:3090`)

### 1.1 Encolar tickets (async — 202 Accepted)

```bash
# Incident
node simulators/snow-request-simulator.js queue --type incident
node simulators/snow-request-simulator.js queue --type incident --severity critical
node simulators/snow-request-simulator.js queue --type incident --severity critical --priority 1 --impact 1 --urgency 1
node simulators/snow-request-simulator.js queue --type incident --severity critical --group group003hardwaresupport000000001 --company 4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b --category hardware

# Change Request
node simulators/snow-request-simulator.js queue --type change-request
node simulators/snow-request-simulator.js queue --type change-request --severity high --priority 2

# Problem
node simulators/snow-request-simulator.js queue --type problem
node simulators/snow-request-simulator.js queue --type problem --severity medium --source app-monitoring

# Service Catalog
node simulators/snow-request-simulator.js queue --type service-catalog

# Knowledge Article
node simulators/snow-request-simulator.js queue --type knowledge-article

# Release Task
node simulators/snow-request-simulator.js queue --type release-task

# Configuration Item (CMDB)
node simulators/snow-request-simulator.js queue --type configuration-item
```

### 1.2 Envío inmediato (sync — devuelve sys_id y snowNumber)

```bash
# Incident crítico (más común)
node simulators/snow-request-simulator.js immediate --type incident --severity critical

# Todos los tipos en inmediato
node simulators/snow-request-simulator.js immediate --type incident
node simulators/snow-request-simulator.js immediate --type change-request
node simulators/snow-request-simulator.js immediate --type problem
node simulators/snow-request-simulator.js immediate --type service-catalog
node simulators/snow-request-simulator.js immediate --type knowledge-article
node simulators/snow-request-simulator.js immediate --type release-task
node simulators/snow-request-simulator.js immediate --type configuration-item
```

### 1.2.1 Enrutamiento explícito — grupo resolutor, compañía y categoría

Aplica a los tipos que admiten `assignment_group` y `company` en ServiceNow: `incident`, `change-request`, `problem`.

```bash
# Incident con grupo resolutor, compañía y categoría específicos
node simulators/snow-request-simulator.js immediate --type incident \
  --severity critical \
  --group group003hardwaresupport000000001 \
  --company 4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b \
  --category hardware

# Incident con solo el grupo (compañía y categoría quedan en default)
node simulators/snow-request-simulator.js immediate --type incident \
  --severity high \
  --group group001networkoperations00000001

# Change Request con grupo y compañía
node simulators/snow-request-simulator.js queue --type change-request \
  --severity medium \
  --group group002softwaresupport000000001 \
  --company 4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b

# Problem con grupo resolutor específico
node simulators/snow-request-simulator.js queue --type problem \
  --severity high \
  --group group001networkoperations00000001

# Los sys_id de grupo disponibles en servicenow-clone-backend:
#   group001networkoperations00000001  — Network Operations
#   group002softwaresupport000000001   — Software Support
#   group003hardwaresupport000000001   — Hardware Support
#   group004itgeneral000000000000001   — IT General (default)
#   group005securityoperations0000001  — Security Operations
```

### 1.3 Batch

```bash
# 5 incidents secuenciales
node simulators/snow-request-simulator.js batch --type incident --count 5

# 3 incidents en paralelo
node simulators/snow-request-simulator.js batch --type incident --count 3 --parallel

# Múltiples tipos, 3 de cada uno
node simulators/snow-request-simulator.js batch --type incident,problem --count 3

# Todos los tipos, modo inmediato
node simulators/snow-request-simulator.js batch --type all --mode immediate

# Ráfaga de 10 incidents críticos en paralelo (stress test)
node simulators/snow-request-simulator.js batch --type incident --count 10 --parallel --severity critical
```

### 1.4 Consultar estado y DLQ

```bash
# Ver estado de una request por correlationId
node simulators/snow-request-simulator.js status --id <correlationId>

# Ver toda la DLQ (registros en estado FAILED)
node simulators/snow-request-simulator.js failed

# Reintentar una request fallida
node simulators/snow-request-simulator.js retry --id <correlationId>

# Reintentar toda la DLQ
node simulators/snow-request-simulator.js retry-all
```

### 1.5 Escenarios predefinidos

```bash
# Un ticket encolado de cada tipo (7 tickets)
node simulators/snow-request-simulator.js scenario --name all-queued

# Un ticket inmediato de cada tipo (7 tickets, respuesta con sys_id)
node simulators/snow-request-simulator.js scenario --name all-immediate

# 5 incidents en ráfaga paralela — prueba bulkhead y circuit breaker
node simulators/snow-request-simulator.js scenario --name incident-burst

# Change Request encolado + consulta automática de estado
node simulators/snow-request-simulator.js scenario --name change-workflow

# Incident crítico inmediato + Problem encolado bajo — prueba prioridades
node simulators/snow-request-simulator.js scenario --name mixed-priority
```

---

## 2. thruk-simulator

Simula notificaciones de Nagios/Thruk al endpoint `/monitoring/alerts`.
**URL:** `SNOWQ_URL` (default `http://localhost:3090`)

### 2.1 Eventos individuales

```bash
# PROBLEM — crea ticket en SN (solo HARD state genera ticket)
node simulators/thruk-simulator.js problem --host web01 --service HTTP
node simulators/thruk-simulator.js problem --host web01 --service HTTP --state CRITICAL
node simulators/thruk-simulator.js problem --host db01                  # sin servicio = host down
node simulators/thruk-simulator.js problem --host db01 --state DOWN
node simulators/thruk-simulator.js problem --host app01 --service API --state WARNING
node simulators/thruk-simulator.js problem --host lb01 --service LB --state WARNING --ttl 60

# PROBLEM SOFT — se ignora (aún no confirmado)
node simulators/thruk-simulator.js problem --host web02 --service HTTPS --soft

# RECOVERY — cancela ticket si QUEUED / cierra en SN si DELIVERED
node simulators/thruk-simulator.js recovery --host web01 --service HTTP
node simulators/thruk-simulator.js recovery --host db01

# Eventos ignorados por el sistema
node simulators/thruk-simulator.js ack      --host web01 --service HTTP   # ACKNOWLEDGEMENT
node simulators/thruk-simulator.js flap     --host web01 --service HTTP   # FLAPPINGSTART
node simulators/thruk-simulator.js downtime --host web01 --service HTTP   # DOWNTIMESTART

# Cancelar por fingerprint (SHA-256 de host+service)
node simulators/thruk-simulator.js cancel --fingerprint <sha256hex>

# Consultar estado de una alerta
node simulators/thruk-simulator.js status --id <correlationId>
```

### 2.2 Escenarios predefinidos

```bash
# storm — 3 hosts caen simultáneamente (web01/HTTP, db01/HOST, cache01/Redis)
node simulators/thruk-simulator.js scenario --name storm

# dedup — misma alerta enviada 3 veces, solo debe crear 1 ticket
node simulators/thruk-simulator.js scenario --name dedup

# recovery — PROBLEM + RECOVERY inmediato, ticket debe cancelarse
node simulators/thruk-simulator.js scenario --name recovery

# flap-ignored — SOFT (se ignora) + FLAPPINGSTART (se ignora) + HARD (genera ticket)
node simulators/thruk-simulator.js scenario --name flap-ignored

# ttl-expire — alerta con TTL de 30s, expira antes de procesarse
node simulators/thruk-simulator.js scenario --name ttl-expire

# ignored — ACK + DOWNTIMESTART + DOWNTIMEEND (todos ignorados)
node simulators/thruk-simulator.js scenario --name ignored
```

---

## 3. combined-simulator

Flujos que combinan alertas Nagios/Thruk con peticiones del monolith en simultáneo.
**URL:** `SNOWQ_URL` (default `http://localhost:3090`)

```bash
# Ver todos los escenarios disponibles
node simulators/combined-simulator.js list
```

### 3.1 Escenarios predefinidos

```bash
# infra-outage
# Nagios detecta HOST DOWN → monolith encola incidents de las apps afectadas
node simulators/combined-simulator.js scenario --name infra-outage

# deploy-incident
# Monolith encola change-request (deploy) → Nagios detecta WARNING durante deploy → RECOVERY
node simulators/combined-simulator.js scenario --name deploy-incident

# cascade-failure
# Redis cae: Nagios lanza 2 alertas + monolith encola 3 incidents de apps afectadas
node simulators/combined-simulator.js scenario --name cascade-failure

# full-lifecycle  ← escenario más completo
# Ciclo completo: PROBLEM (Nagios) → ticket encolado → RECOVERY → ticket cerrado en SN
node simulators/combined-simulator.js scenario --name full-lifecycle

# parallel-storm  ← prueba de carga
# Nagios × 4 + monolith × 4 simultáneos — verifica concurrencia y bulkhead
node simulators/combined-simulator.js scenario --name parallel-storm

# dedup-cross
# Mismo evento detectado por Nagios (fingerprint) y por monolith (payload.id)
# Cada sistema deduplica de forma independiente
node simulators/combined-simulator.js scenario --name dedup-cross

# dlq-recovery
# Monolith genera requests que caen a DLQ → retry-all → Nagios envía recovery
node simulators/combined-simulator.js scenario --name dlq-recovery
```

---

## 4. gateway-simulator

Flujo completo con autenticación JWT real: login → descubrimiento → disponibilidad → creación.
Requiere seeds ejecutados (`npm run abac:seed` + `npm run monolith:seed`).
**URL:** `GATEWAY_URL` (default `http://localhost:3000`)

```bash
# Creación básica (auto-descubre corner e issue type)
node simulators/gateway-simulator.js incidents \
  --email empleado1@eventcorner.com \
  --password <password-del-seed> \
  --customer-id <customer_id-del-seed>

# Múltiples incidencias secuenciales
node simulators/gateway-simulator.js incidents \
  --email empleado1@eventcorner.com \
  --password <password-del-seed> \
  --customer-id <customer_id-del-seed> \
  --count 3

# Múltiples incidencias en paralelo
node simulators/gateway-simulator.js incidents \
  --email empleado1@eventcorner.com \
  --password <password-del-seed> \
  --customer-id <customer_id-del-seed> \
  --count 5 \
  --parallel

# Corner e issue type específicos
node simulators/gateway-simulator.js incidents \
  --email empleado1@eventcorner.com \
  --password <password-del-seed> \
  --customer-id <customer_id-del-seed> \
  --corner-id <uuid-corner> \
  --issue-type-id <uuid-issue-type>

# Fecha específica
node simulators/gateway-simulator.js incidents \
  --email empleado1@eventcorner.com \
  --password <password-del-seed> \
  --customer-id <customer_id-del-seed> \
  --date 2026-03-20 \
  --duration 30
```

---

## 5. Flujos de prueba completos

Combinaciones recomendadas para validar escenarios end-to-end.

### 5.1 Validar que api-snowq-service está funcionando

```bash
# 1. Enviar un incident inmediato y verificar sys_id en respuesta
node simulators/snow-request-simulator.js immediate --type incident --severity critical

# 2. Encolar un incident y verificar estado
node simulators/snow-request-simulator.js queue --type incident
# → copiar correlationId de la respuesta
node simulators/snow-request-simulator.js status --id <correlationId>
```

### 5.2 Validar resiliencia y DLQ

```bash
# 1. Apagar servicenow-clone-backend para forzar errores
# 2. Encolar varios incidents
node simulators/snow-request-simulator.js batch --type incident --count 3
# 3. Verificar que están en DLQ
node simulators/snow-request-simulator.js failed
# 4. Reiniciar servicenow-clone-backend
# 5. Reintentar toda la DLQ
node simulators/snow-request-simulator.js retry-all
# 6. Verificar que procesaron
node simulators/snow-request-simulator.js failed
```

### 5.3 Validar deduplicación Nagios

```bash
# Enviar la misma alerta 3 veces — solo debe crear 1 ticket
node simulators/thruk-simulator.js scenario --name dedup
# Luego verificar en el simulador que hay 1 solo ticket INC para web01/HTTP:
curl http://localhost:3010/api/now/v2/incident
```

### 5.4 Validar ciclo PROBLEM → RECOVERY

```bash
# 1. Enviar problema
node simulators/thruk-simulator.js problem --host db01 --state DOWN
# → copiar correlationId de la respuesta
# 2. Verificar que está QUEUED o DELIVERED
node simulators/thruk-simulator.js status --id <correlationId>
# 3. Enviar recovery
node simulators/thruk-simulator.js recovery --host db01
# 4. Verificar que el ticket quedó CANCELLED o cerrado en SN
node simulators/thruk-simulator.js status --id <correlationId>
```

### 5.5 Validar prioridades y concurrencia (bulkhead)

```bash
# Enviar 5 incidents críticos en paralelo
node simulators/snow-request-simulator.js scenario --name incident-burst
# Los 5 deben procesarse — verificar en el simulador:
curl http://localhost:3010/api/now/v2/incident
```

### 5.6 Flujo completo end-to-end (con gateway)

```bash
# Requiere: seeds ejecutados, todos los servicios levantados

# 1. Crear incidencia real via gateway (JWT real, slot real)
node simulators/gateway-simulator.js incidents \
  --email empleado1@eventcorner.com \
  --password <pwd> \
  --customer-id <uuid>

# 2. Verificar ticket creado en simulador SN
curl http://localhost:3010/api/now/v2/incident

# 3. Ver DLQ por si algo falló
node simulators/snow-request-simulator.js failed
```

### 5.7 Stress test general

```bash
# Nagios x4 + monolith x4 en paralelo
node simulators/combined-simulator.js scenario --name parallel-storm
```

---

## Notas

- Los `<correlationId>` se obtienen de la respuesta de cada comando `queue`
- Los `<password-del-seed>` están en `monolito-event-corner_v3/apps/abac-microservice/initial-credentials.json` tras ejecutar `npm run abac:seed`
- Para apuntar a otro entorno: `SNOWQ_URL=http://staging:3090 node simulators/...`
- El simulador SN responde en `http://localhost:3010/api/now/v2/<table>` — útil para verificar tickets creados
