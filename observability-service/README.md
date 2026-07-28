# observability-service

Sink centralizado de observabilidad para el ecosistema **Event Corner**. Recibe logs, trazas y
métricas de todos los servicios vía HTTP, los persiste en MySQL y opcionalmente los reenvía a
Jaeger/Prometheus.

Puerto: **3099** | Swagger: `http://localhost:3099/docs` (dev/staging, no en producción)

> 📖 Documentación completa (esquema de tablas, ejemplos de payload por señal, flujo de
> correlationId end-to-end, troubleshooting): **[OBSERVABILITY_SERVICE.md](./OBSERVABILITY_SERVICE.md)**

---

## Qué hace

```
api-gateway / monolith / abac / api-snowq-service  ──►  POST /ingest/{logs,traces,metrics}  ──►  MySQL observability_db
                                                                                                      │
                                                                                    GET /query/{logs,traces,metrics}
                                                                                                      │
                                                                                    (opcional) Jaeger / Prometheus Pushgateway
```

- **Ingesta pública** (`@Public()`) — los servicios origen no necesitan token para enviar datos.
- **Consulta protegida** — requiere `Authorization: Bearer <JWT M2M Ed25519>` emitido por ABAC.
- **Reenvío fire-and-forget** a Jaeger/Prometheus si `JAEGER_OTLP_URL`/`PROMETHEUS_PUSHGATEWAY_URL`
  están configurados — un fallo ahí nunca afecta la ingesta ni al servicio que reportó el dato.
- **Retención automática** — job diario (02:00) que borra logs/trazas/métricas más viejos que
  `LOG_RETENTION_DAYS`/`TRACE_RETENTION_DAYS`/`METRIC_RETENTION_DAYS`.

## Arranque rápido

```bash
npm install
npm run start:dev        # :3099, requiere MySQL con la DB observability_db creada (ver doc completa, sección 3)
curl http://localhost:3099/health
```

## Endpoints principales

| Método | Ruta | Auth |
|---|---|---|
| `POST` | `/ingest/logs`, `/ingest/traces`, `/ingest/metrics` | pública |
| `GET` | `/query/logs`, `/query/traces`, `/query/metrics` | M2M Ed25519 |
| `GET` | `/health` | pública |

Detalle de payloads, query params, esquema SQL y ejemplos completos en
[OBSERVABILITY_SERVICE.md](./OBSERVABILITY_SERVICE.md).
