# ADR-003 — Persistencia de CornerIssueConfig

**Fecha:** 2026-03-15
**Estado:** Aplicado

---

## Contexto

`CornerIssueConfig` existía como entidad de dominio pero sin capa de persistencia.
Equivale a `placesissuetypes` del legacy — configura el grupo resolutor y tiempo de trabajo
por combinación de corner + tipo de incidencia.

---

## Lo que ganamos

1. **Routing granular a ServiceNow:** Cada corner+issueType puede tener su propio grupo resolutor.
   Sin esto, todos los incidentes de un corner van al mismo grupo (snow_assignment_group).

2. **Override de duración de slots:** `work_minutes_override` permite que el mismo tipo de
   incidencia tome tiempos distintos según el corner.

---

## Decisión

Implementar la capa de persistencia completa para `CornerIssueConfig`.

---

## Archivos creados

- `infrastructure/persistence/typeorm/entities/corner-issue-config.entity.ts`
  - Tabla: `corner_issue_configs`
  - FK hacia `corners` y `issue_types`

- `infrastructure/persistence/typeorm/repositories/corner-issue-config.repository.ts`
  - Implementa `ICornerIssueConfigRepository`
  - Método clave: `getServiceNowGroup(cornerId, issueTypeId)` para consulta rápida

## Archivos modificados

- `core/ports/outgoing/repositories/tokens.ts` — agrega `CORNER_ISSUE_CONFIG_REPOSITORY`
- `infrastructure/persistence/typeorm/typeorm-persistence.module.ts` — registra entidad + provider + export
- `core/services/servicenow/servicenow-integration.service.ts` — inyecta el repo, lo usa en `resolveAssignmentGroup()`
- `core/services/core-services.module.ts` — agrega `CORNER_ISSUE_CONFIG_REPOSITORY` al factory de `SERVICENOW_INTEGRATION_SERVICE`

---

## Lógica de resolución de assignment_group

> Actualizado en ADR-005. La entidad pasó de `CornerIssueConfig` (corner+issueType)
> a `CompanyIssueConfig` (company+issueType), y se incorporó fallback a compañía default.

```
1. CompanyIssueConfig(company.id, issueTypeId)           ← config específica
2. CompanyIssueConfig(SN_DEFAULT_COMPANY_ID, issueTypeId) ← fallback default company
3. Corner.snow_assignment_group                           ← fallback corner
4. 'SOPORTE_GENERAL' + warn                              ← sin configuración
```

---

## Completado

- ✅ Endpoints CRUD `GET/POST/PUT/DELETE /internal/company-issue-configs`
- ✅ Seed: 18 registros (6 issue types × 3 companies: Argentina, España, Default/Corporate)
- ✅ `servicenow_groups` — catálogo de grupos SN con 6 grupos seeded
- ✅ Fallback via compañía default (`SN_DEFAULT_COMPANY_ID`) — ver ADR-005
