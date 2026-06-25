# Integration Docs — Workspace

Contexto global de integración entre todos los servicios del ecosistema.
Este directorio es la fuente de verdad sobre decisiones, flujos, y estado de integración.

---

## Servicios en el ecosistema

| Servicio | Puerto | Rol |
|----------|--------|-----|
| `monolito-event-corner_v3` (monolith) | 3001 | Dominio de negocio: corners, incidentes, usuarios, dispositivos |
| `monolito-event-corner_v3` (api-gateway) | 3000 | Punto de entrada HTTP, proxy interno, egress hacia SN |
| `api-snowq-service` | 3090 | Cola controlada hacia ServiceNow + receptor Nagios/Thruk |
| `cache-service` | — | Caché compartida |
| `broker-queue-lite` | — | Broker de mensajes ligero |
| `servicenow-clone-backend` | — | Simulador/mock de ServiceNow |

---

## Documentos

- [Arquitectura general](./architecture.md)
- [Servicios](./services/)
  - [Monolith](./services/monolith.md)
  - [API Gateway](./services/api-gateway.md)
  - [api-snowq-service](./services/api-snowq-service.md)
- [Flujos de integración](./flows/)
  - [Creación de incidente](./flows/incident-creation.md)
- [Decisiones técnicas](./decisions/)
  - [ADR-001 — Roles de servicios y routing ServiceNow](./decisions/ADR-001-servicenow-routing.md)
  - [ADR-002 — Eliminación de client_name en corners](./decisions/ADR-002-remove-client-name.md)
  - [ADR-003 — CompanyIssueConfig persistencia](./decisions/ADR-003-corner-issue-config.md)
  - [ADR-004 — OAuth2 en gateway → snowq corregido](./decisions/ADR-004-gateway-snowq-auth.md)
  - [ADR-005 — Fallback de grupos resolutores via compañía default](./decisions/ADR-005-default-company-group-fallback.md)
- [Estado de integración](./status.md)
