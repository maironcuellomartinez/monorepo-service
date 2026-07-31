# Resumen — Módulo de Citas (estado actual)

> Cómo funciona hoy el sistema de citas de Event Corner. Para el historial de cambios que llevó a este estado, ver `RESUMEN-remodelado.md`.

## Qué es una Cita

Una **Cita** (`Appointment`) es el único tipo de agregado para todo lo que un usuario o técnico puede reservar en un corner: desde una avería de hardware hasta un trámite administrativo (alta/baja de equipo). No hay clases separadas por tipo — un solo modelo cubre los dos casos.

```
IssueType.category → decide el kind de la cita
  ISSUE / CREATE-DELIVERY / CREATE-COLLECTION  →  kind=ISSUE     →  genera un incident en ServiceNow
  REQUEST-ONBOARDING / REQUEST-DECOMISSION     →  kind=REQUEST   →  genera un sc_req_item/sc_task
```

En ambos casos la cita ocupa un corner y uno o más slots — no hay un camino "sin agenda" para los trámites administrativos.

## Ciclo de vida

```
CREATED → DELIVERED → IN_PROGRESS → (PAUSED / PENDING_*) → CLOSED → VALIDATED
                                                                   ↳ REOPENED → IN_PROGRESS
CREATED → CANCELED (el cliente cancela antes de que arranque)
```

- El técnico toma la cita, la entrega, la pausa/retoma, y la cierra con una categoría de cierre.
- El cliente valida la resolución o la reabre si no está conforme.
- `VALIDATED` y `CANCELED` son terminales; no hay vuelta atrás.

## Integración con ServiceNow

Cada cita tiene uno o más vínculos de ticket (`ServiceNowTicketLink`) — normalmente uno solo (`role=primary`), salvo trámites administrativos que además generan una tarea de cumplimiento (`role=fulfillment`).

- **Creación:** asíncrona, vía outbox — la cita se confirma al usuario sin esperar al ticket. Si ServiceNow responde al instante, el link queda con `sys_id`/`number` de una; si no, queda en modo diferido y se completa solo (cada 30s) cuando ServiceNow procesa la cola.
- **Cierre:** siempre lo dispara el monolito hacia ServiceNow cuando la cita pasa a `CLOSED`. El sistema no consulta periódicamente el estado en ServiceNow — el cierre es un evento saliente, nunca entrante.
- **Recuperación:** si una cita queda sin ticket resuelto por más de 10 minutos (SN caído en el momento de crearla), un job la detecta y la vuelve a encolar automáticamente.
- **Grupo de asignación en ServiceNow:** se resuelve primero por configuración de la empresa+tipo de cita, después por una empresa "default", después por el corner, y como último recurso cae en un grupo general (quedando un aviso en el log).

## Identidad de usuario

El identificador de un usuario en toda la app es su **UPN** (User Principal Name, ej. `x249401@empresa.com`) — es único en la base y es lo que se usa para vincular el `caller_id` del ticket en ServiceNow. El email queda como un dato de contacto aparte, pensado para notificaciones a futuro, no como identificador.

## Permisos

Todas las acciones sobre citas están gateadas por permisos ABAC del recurso `appointment` (`appointment:create`, `:read`, `:list`, `:list-all`, `:deliver`, `:take`, `:release`, `:change-status`, `:validate`, `:reopen`, `:delete`). Un empleado puede crear y ver sus propias citas; solo técnicos/managers/admins pueden ver el listado completo, tomar y entregar.

## Búsqueda y filtros (`/citas` en event-corner-app)

- Hay que elegir un corner para poder listar — es obligatorio.
- Por defecto se muestran solo citas activas (se excluyen cerradas/validadas/canceladas); un checkbox "Todas las citas" saca esa restricción.
- Autocomplete en vivo mientras se escribe para buscar por UPN de usuario, serial de dispositivo o número de ticket ServiceNow.
- Paginado (20 por página).

## Creación en lote

Un técnico puede armar un lote de varias citas antes de confirmarlas juntas — cada una retiene sus slots (HELD, 15 minutos) mientras se arma el lote, y al confirmar se procesan una por una, cada una con su propia cita y ticket SN.

## Panel de administración de usuarios (ABAC)

Además de asignar roles/permisos/políticas, un admin puede editar directamente nombre, apellido, usuario y teléfono de un usuario — útil para completar datos que no llegaron bien desde Entra ID en el primer login.
