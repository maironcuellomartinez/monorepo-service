# Estado de Integración

Última actualización: 2026-03-28 (admin app ABAC completa; tests ABAC 50 tests; CRUD roles backend+frontend; UX mejoras; Fase 5 M2M replace pendiente)

---

## Monolith ↔ ServiceNow (via API Gateway → api-snowq-service)

| Item | Estado | Notas |
|------|--------|-------|
| `ServiceNowProxyAdapter` (monolith → gateway) | ✅ | Llama a `API_GATEWAY_URL/outbound/servicenow` |
| `ServiceNowOutboundController` (gateway) | ✅ | Proxy con `@InternalOnly`. Único egress hacia SN: llama directo a `api-snowq-service` vía `SNOWQ_URL` — `integration-service` ya no interviene en este flujo (refactor 2026-07-09) |
| `ServiceNowIntegrationService.createIncidentTicket()` | ✅ | Resuelve grupo+category+caller_id |
| `IncidentService` llama SN al crear incidente | ✅ | No-blocking si falla |
| Resolución de `assignment_group` via `CompanyIssueConfig` | ✅ | Cadena: config específica → default company (`SN_DEFAULT_COMPANY_ID`) → corner group. ADR-005 |
| Campo SN `correlation_id` = serial del dispositivo | ✅ | Campo nativo SN para vincular ticket al activo físico (≠ header HTTP x-correlation-id) |
| `caller_id` = UPN del usuario | ✅ | `user.principalName` |
| Guardar `servicenowId` + `servicenowNumber` en Incident | ✅ | Se guarda solo si SN éxito |
| Cierre de ticket SN al cerrar incidente | ✅ | `IncidentStatusChangedHandler` — escucha `INCIDENT_STATUS_CHANGED`; si `newStatus=CLOSED` llama `closeIncidentTicket()`. También maneja `INCIDENT_REOPENED` → state '2' en SN |
| Reconciliación SN → monolith (polling) | ✅ | `SnowSyncJob` — cada 5 min consulta `queryIncidentState()` para incidentes activos con `servicenow_id`; si SN state=6/7 (Resolved/Closed) cierra en monolith |
| `servicenow_groups` (catálogo de grupos) | ✅ | Tabla `servicenow_groups` + `TypeOrmServiceNowGroupRepository` + `ServiceNowGroupService`. CRUD en `GET/POST/PUT/DELETE /internal/servicenow-groups`. Seed incluido. Reemplaza la variable `servicenow_group_requests` del legacy |
| `queryIncidentState` en cadena de proxy | ✅ | `IServiceNowClient.queryIncidentState()` → `ServiceNowProxyAdapter` → `GET /outbound/servicenow/incidents/:sysId/state` → `ServiceNowOutboundController` → `GET /snow-requests/immediate/incidents/:sysId` en api-snowq-service |

---

## Monolith — Dominio

| Item | Estado | Notas |
|------|--------|-------|
| `CompanyIssueConfig` persistencia (tabla `company_issue_configs`) | ✅ | ADR-003 |
| Eliminación de `client_name` en corners | ✅ | ADR-002 |
| `AvailabilityService` filtra ventanas pasadas | ✅ | `windowStart <= new Date()` se omite |
| `deviceId` en incidentes (resolución desde Minerva) | ✅ | `DeviceService.resolveDevice()` |
| `GET /internal/devices/user/:customerId` | ✅ | Dispositivos cacheados por usuario |
| CRUD de `CompanyIssueConfig` (endpoints admin) | ✅ | `CompanyIssueConfigEntity` + `TypeOrmCompanyIssueConfigRepository` + `CompanyIssueConfigService`. CRUD en `GET/POST/PUT/DELETE /internal/company-issue-configs` |
| `ServiceNowIntegrationService` usa `CompanyIssueConfig` | ✅ | `resolveAssignmentGroup()`: config específica → default company → corner group → warn |
| Seed de `company_issue_configs` con datos reales | ✅ | 18 registros en seed (6 issue types × 3 companies: Argentina + España + Default/Corporate). Seed de `servicenow_groups` incluido (6 grupos) |
| Compañía default para fallback de grupos resolutores | ✅ | `company-santander-default-001` + `SN_DEFAULT_COMPANY_ID` env var. ADR-005 |
| Fix estados de cierre en `SN_CLOSED_STATES` | ✅ | Agregados `'0'` (change_request resolved) y `'4'` (problem/sc_req_item closed) en `api-snowq-service` |

---

## Librería @app/observability

| Item | Estado | Notas |
|------|--------|-------|
| `libs/observability` creada en el monorepo | ✅ | Migrada desde `abac-microservice/src/observability/` |
| Registrada en `nest-cli.json` + alias en `tsconfig.json` | ✅ | `@app/observability` disponible en todas las apps |
| `CorrelationIdService` (AsyncLocalStorage + OTel) | ✅ | |
| `MetricsProducerService` (OTel Meter) | ✅ | |
| `LoggerService` (Winston + correlationId) | ✅ | |
| `MonitoringService`, `HealthMetricsService`, `TracingService` | ✅ | |
| `CorrelationMiddleware` | ✅ | Lee `x-correlation-id` o genera UUID |
| `AllExceptionsFilter` (Axios status code propagado) | ✅ | |
| `CorrelationInterceptor` + `PerformanceInterceptor` | ✅ | |
| `ObservabilityModule.forRoot({ serviceName })` | ✅ | @Global, registra APP_FILTER + APP_INTERCEPTOR |

---

## api-gateway — Observabilidad

| Item | Estado | Notas |
|------|--------|-------|
| `ObservabilityModule.forRoot({ serviceName: 'api-gateway' })` | ✅ | |
| `CorrelationMiddleware` en todas las rutas | ✅ | `ApiGatewayModule.configure()` |
| `app.useLogger(LoggerService)` en main.ts | ✅ | |

---

## monolith — Observabilidad

| Item | Estado | Notas |
|------|--------|-------|
| `ObservabilityModule.forRoot({ serviceName: 'monolith' })` | ✅ | |
| `CorrelationMiddleware` en todas las rutas | ✅ | `MonolithModule.configure()` |
| `app.useLogger(LoggerService)` en main.ts | ✅ | |

---

## abac-microservice — Observabilidad

| Item | Estado | Notas |
|------|--------|-------|
| `ObservabilityModule.forRoot({ serviceName: 'abac-microservice' })` | ✅ | Delegado a `@app/observability` |
| `observability/index.ts` re-exporta desde `@app/observability` | ✅ | Alias `_v2` mantenidos para compatibilidad interna |
| OTel SDK propio (`otel.sdk.ts`, Prometheus) | ✅ | Conservados — son específicos del abac |

---

## ABAC — Auth y Autorización

### abac-microservice — Endpoints auth

| Endpoint | Estado | Notas |
|---|---|---|
| `POST /auth/admin/login` | ✅ | email+password → JWT 8h con roles+permisos. Auto-resolve appId desde user_applications si no hay ABAC_APP_ID |
| `POST /auth/m2m-token` | ✅ | apiKey+apiSecret → JWT 1h para service accounts |
| `POST /auth/oauth/token` | ✅ | OAuth 2.0 Client Credentials → JWT 1h con scopes filtrados |
| `POST /auth/validate-entra-token` | ✅ | Valida token Entra ID via JWKS, lazy sync usuario |
| `POST /auth/introspect` | ✅ | RFC 7662 introspection para api-middleware-service |

### abac-microservice — Guards

| Guard | Estado | Notas |
|---|---|---|
| `JwtAuthGuard` | ✅ | Extrae `_application` del user y lo pone en `request.application` |
| `ApiKeyGuard` | ✅ | Valida API key con cache Redis |
| `RolesGuard` | ✅ | Chequea `@Roles` + `@Permissions`. super-admin bypass completo |
| `JwtStrategy` | ✅ | Carga roles con relación `role`, auto-resolve appId, retorna `_application` |

### abac-microservice — Admin API (requiere rol admin/super-admin)

| Resource | Endpoints | Estado |
|---|---|---|
| Users | GET/POST/PATCH/DELETE /users, GET/POST/DELETE /users/:id/roles, GET/POST/DELETE /users/:id/applications | ✅ |
| Roles | GET/POST/PATCH/DELETE /roles, GET/POST/DELETE /roles/:id/permissions | ✅ |
| Permissions | GET/POST /permissions | ✅ |
| Applications | GET/POST /applications, POST /applications/oauth, POST /applications/:id/rotate-secret | ✅ |
| Policies | GET/POST/PUT/DELETE /policies, GET/POST /policies/:id/rules, DELETE /policies/rules/:id, GET/POST/DELETE /policies/:id/permissions | ✅ |
| ABAC check | POST /abac/check | ✅ |

### auth-configuration-app (React admin UI)

| Feature | Estado | Ubicación |
|---|---|---|
| Login admin (email+password) | ✅ | `auth-configuration-app/src/components/login-form.tsx` |
| Dashboard con stats | ✅ | `dashboard-overview.tsx` |
| Gestión de usuarios (tabla+búsqueda+paginación) | ✅ | `users-page.tsx` |
| Crear usuario desde UI | ✅ | Dialog en `users-page.tsx` → POST /users |
| Filtrar usuarios Entra ID (sin config posible) | ✅ | Botón toggle en `users-page.tsx` |
| Asignar/remover roles y aplicaciones a usuarios | ✅ | Dialogs en `users-page.tsx` |
| CRUD roles + gestión permisos por rol | ✅ | `roles-page.tsx` |
| Catálogo de permisos | ✅ | `permissions-page.tsx` |
| Gestión apps internas + OAuth clients | ✅ | `applications-page.tsx` |
| CRUD políticas + reglas JSON + permisos | ✅ | `policies-page.tsx` |

### abac-microservice — Tests

| Suite | Tests | Estado |
|---|---|---|
| `auth.service.spec.ts` | 31 | ✅ pasando |
| `abac.service.spec.ts` | 19 | ✅ pasando |
| **Total** | **50** | ✅ |

Configuración jest requerida en `package.json` (monorepo):
```json
"moduleNameMapper": {
  "^@app/observability(|/.*)$": "<rootDir>/libs/observability/src/$1",
  "^src/(.*)$": "<rootDir>/apps/abac-microservice/src/$1"
},
"transform": { "^.+\\.(t|j)s$": ["ts-jest", { "diagnostics": false }] }
```

### Fase 5 — Reemplazar x-internal-token por JWT M2M ⏳

**Estado:** Pendiente
**Plan:** Ver `project_fase5_m2m_replace.md` en `.claude/memory/`

Servicios a modificar:
1. **api-gateway** — `M2MTokenService` (OnModuleInit, cachea JWT 1h, rota a -5min). Reemplazar header `x-internal-token` en proxy a monolith y outbound controllers. Env: `ABAC_M2M_API_KEY`, `ABAC_M2M_API_SECRET`
2. **monolith** — mismo `M2MTokenService`. Reemplazar en `servicenow-proxy.adapter.ts`. Env: `ABAC_API_KEY`, `ABAC_API_SECRET`
3. **integration-service** — migrar `InternalTokenGuard`: de comparar string estático a verificar JWT Bearer (`type: 'service'`)

---

## api-snowq-service

| Item | Estado | Notas |
|------|--------|-------|
| Recibe incidentes del monolith (via gateway) | ✅ | `/snow-requests/immediate/incidents` |
| Cola asíncrona con PQueue (concurrency=5) | ✅ | |
| Circuit breaker + retry | ✅ | opossum |
| DLQ (FAILED + /failed endpoints) | ✅ | |
| Receptor Nagios/Thruk | ✅ | `/monitoring/alerts` |
| OAuth2 Client Credentials hacia ServiceNow | ✅ | Gestionado internamente por snowq, no por el gateway |

---

## Librería @app/observability — Uso en otras apps

Para integrar en **monolith** o **abac-microservice**:

```typescript
// app.module.ts
import { ObservabilityModule } from '@app/observability';

@Module({ imports: [ObservabilityModule, ...] })
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(CorrelationMiddleware).forRoutes('*');
    }
}
```

```typescript
// main.ts
import { LoggerService } from '@app/observability';
const logger = app.get(LoggerService);
app.useLogger(logger);
```

El `OBSERVABILITY_SERVICE_NAME` token es opcional — por defecto usa `'app'`. Para personalizarlo:
```typescript
{ provide: OBSERVABILITY_SERVICE_NAME, useValue: 'monolith' }
```

---

## Pendientes globales

- [ ] **Fase 5: Reemplazar `x-internal-token` por JWT M2M** — ver sección ABAC más abajo
- [ ] Eliminar carpeta huérfana `apps/api-gateway/src/observability/` (movida a `libs/observability`)
- [ ] Eliminar archivo huérfano `apps/api-gateway/src/outbound/servicenow/auth/servicenow-token.service.ts`
- [ ] Variables de entorno documentadas y configuradas en todos los servicios
- [x] Cierre de incidentes en SN al cerrar en monolith ✅
- [x] Reconciliación SN → monolith (`SnowSyncJob`) ✅
- [x] `servicenow_groups` — catálogo de grupos SN ✅
- [x] Admin CRUD de `CompanyIssueConfig` ✅
- [x] Seed de `company_issue_configs` + `servicenow_groups` ✅
- [x] Fallback de grupos resolutores via compañía default (`SN_DEFAULT_COMPANY_ID`) ✅
- [x] Fix `SN_CLOSED_STATES` en api-snowq-service (estados `'0'` y `'4'`) ✅
- [x] Rename `STATUS.PROCESSED` → `STATUS.DELIVERED` en api-snowq-service ✅
- [x] Simulators centralizados en `simulators/` con `npm run sim:*` en root `package.json` ✅
- [x] Integrar `@app/observability` en monolith y abac-microservice ✅
