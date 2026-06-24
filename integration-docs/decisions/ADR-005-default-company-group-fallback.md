# ADR-005 — Fallback de grupos resolutores via compañía default

**Fecha:** 2026-03-17
**Estado:** Aplicado

---

## Contexto

Al crear un ticket en ServiceNow, el monolith resuelve el `assignment_group` consultando
`CompanyIssueConfig` por `(company.id, issue_type_id)`. Si una compañía no tiene
configuración propia para un tipo de incidencia, el sistema caía directamente al grupo
del corner (`snow_assignment_group`) o al string hardcoded `'SOPORTE_GENERAL'`, que no
existe como grupo válido en ningún entorno.

El mecanismo de compañía default ya existía para el campo `company` del ticket
(`SN_DEFAULT_COMPANY_SYS_ID`), pero no estaba conectado a la resolución del grupo resolutor.

---

## Decisión

Cuando una compañía no tiene `CompanyIssueConfig` para un issue type, antes de caer al
grupo del corner se consulta la `CompanyIssueConfig` de una **compañía default** configurable
via `SN_DEFAULT_COMPANY_ID` (ID interno del monolith).

Esta compañía default actúa como plantilla corporativa: tiene configurados grupos resolutores
para todos los issue types, sirviendo de fallback genérico.

---

## Cadena de resolución resultante

```
ServiceNowIntegrationService.resolveAssignmentGroup(companyId, issueTypeId, cornerGroup):

  1. CompanyIssueConfig(companyId, issueTypeId)            → config específica de la empresa
  2. CompanyIssueConfig(SN_DEFAULT_COMPANY_ID, issueTypeId) → config de la empresa default
  3. cornerGroup (Corner.snow_assignment_group)             → grupo del corner físico
  4. 'SOPORTE_GENERAL' + logger.warn()                     → sin ninguna configuración
```

El paso 2 se omite si `SN_DEFAULT_COMPANY_ID` no está configurado o es igual a `companyId`.

---

## Variables de entorno

| Variable | Propósito |
|---|---|
| `SN_DEFAULT_COMPANY_SYS_ID` | `sys_id` en ServiceNow para el campo `company` del ticket |
| `SN_DEFAULT_COMPANY_ID` | `company_id` interno del monolith para buscar `CompanyIssueConfig` de fallback |

Son conceptualmente distintas y deben configurarse de forma independiente.

---

## Datos de seed (desarrollo)

Nueva compañía default seeded:

| Campo | Valor |
|---|---|
| `company_id` | `company-santander-default-001` |
| `name` | `Santander Corporate (Default)` |
| `profile_id` | `profile-santander-corp-000000001` |
| `snow_company_sys_id` | `c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8` |

Con 6 `CompanyIssueConfig` apuntando a `group001itsupportgeneral00000001`
(Soporte IT General) para todos los issue types activos.

---

## Archivos modificados

- `apps/monolith/src/core/services/servicenow/servicenow-integration.service.ts`
  — nuevo método privado `resolveAssignmentGroup()`, eliminado dead code `getDefaultGroupForCorner()`
- `apps/monolith/.env.development` — agregado `SN_DEFAULT_COMPANY_ID`
- `apps/monolith/src/scripts/seed-test-data.ts`
  — nuevo perfil `corporate`, nueva compañía `default`, 6 nuevos `CompanyIssueConfig`

---

## Configuración en staging/producción

`SN_DEFAULT_COMPANY_ID` debe apuntar al `company_id` interno de la empresa que tenga
`CompanyIssueConfig` completo con los grupos resolutores reales de la instancia de SN.
No necesariamente coincide con el seed de desarrollo.
