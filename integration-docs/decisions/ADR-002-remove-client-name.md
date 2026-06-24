# ADR-002 — Eliminación de client_name en corners

**Fecha:** 2026-03-15
**Estado:** Aplicado

---

## Contexto

La tabla `corners` tenía una columna `client_name` con el nombre de una empresa.
Esto generaba confusión sobre la relación entre corners y empresas.

---

## Análisis

En el modelo de negocio real:
- Un **corner** es un punto físico de atención abierto (no pertenece a ninguna empresa)
- Una **empresa** determina a qué tipos de incidencia tiene acceso un usuario (via `IssueTypeTree`)
- El routing a ServiceNow se hace por corner+issueType (`CornerIssueConfig`), no por empresa del corner

`client_name` en corners era metadata legacy sin función de negocio activa.

---

## Decisión

Eliminar `client_name` de todas las capas.

---

## Archivos modificados

- `core/domain/entities/corner.entity.ts` — removido de `CornerProps`, getter, métodos
- `infrastructure/persistence/typeorm/entities/corner.entity.ts` — removida columna
- `infrastructure/persistence/typeorm/repositories/corner.repository.ts` — removido de toEntity/toDomain/update
- `core/services/corner/corner.service.ts` — removido de comandos
- `core/ports/incoming/corner/corner-service.port.ts` — removido de Commands
- `apps/api-gateway/.../dto/create-corner.dto.ts` — removido
- `apps/api-gateway/.../dto/update-corner.dto.ts` — removido
- `apps/monolith/src/scripts/seed-test-data.ts` — removido del INSERT

---

## Nota

TypeORM `synchronize: true` eliminó automáticamente la columna de la DB al deployar
el cambio en la entidad. No fue necesario correr una migración manual.
