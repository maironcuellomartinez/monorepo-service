# servicenow-clone-backend

Simulador local de la ServiceNow Table API para desarrollo del ecosistema Event Corner v3.

Puerto: **3010** | Base de datos: `servicenow_clone` (MySQL)

---

## Arranque rápido

```bash
npm install
npm run start:dev
```

## Seed (primera vez)

```bash
npm run seed
```

Crea los registros de referencia de empresas (`core_company`) y grupos resolutores
(`sys_user_group`) con `sys_id` fijos que deben coincidir con la configuración del monolith.

---

## Documentación completa

Ver [`docs/servicenow-clone.md`](./docs/servicenow-clone.md):

- API endpoints (`/api/now/v2` y `/api/now/table`)
- Mapeo de estados semánticos → códigos numéricos SN por tabla
- Tablas soportadas y prefijos de numeración
- Estructura de la entidad `sn_tickets`
- `sys_id` de referencia del seed
- Cómo apuntan los demás servicios a este simulador

---

## Scripts

```bash
npm run start:dev   # watch mode
npm run build       # compilar
npm run test        # unit tests
npm run test:e2e    # e2e tests
npm run seed        # seed de datos de referencia
```
