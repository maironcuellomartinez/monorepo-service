# Datos de seed — Event Corner v3

Este archivo documenta los datos fijos que crean los scripts de seed y los valores
de referencia útiles durante el desarrollo.

---

## Flujo completo de seeds (primera vez)

```bash
# 1. Arrancar ABAC para que TypeORM cree el schema
npm run start:abac:dev    # Ctrl+C cuando veas "Application is running on port 3005"

# 2. Seed ABAC completo (usuarios + cuentas M2M)
npm run abac:seed:full

# 3. Seed monolith (datos de negocio)
npm run monolith:seed

# 4. Seed ServiceNow simulator (desde workspace root)
cd ../servicenow-clone-backend && npm run seed
```

---

## Seed ABAC (`npm run abac:seed`)

### Aplicación creada

| Campo | Valor |
|---|---|
| Nombre | `Event Corner` |
| `appId` | generado en cada ejecución — ver `initial-credentials.json` |
| `apiKey` | generado en cada ejecución — ver `initial-credentials.json` |

El `appId` y el `apiKey` de la aplicación principal deben copiarse a:
```env
# apps/api-gateway/.env.development
ABAC_APP_ID=<appId>
ABAC_API_KEY=<apiKey>
```

### Usuarios creados

> **Nota:** Estos son usuarios ABAC de administración/desarrollo. Los **usuarios finales** no se crean vía seed — se crean automáticamente en el primer login con Entra ID (lazy sync).

| Usuario | Email | Rol | Propósito |
|---|---|---|---|
| Super Admin | ver `initial-credentials.json` | `super-admin` | Administración del sistema |
| Admin | `admin@eventcorner.com` | `admin` | Gestión de la plataforma |
| Manager | `manager@eventcorner.com` | `manager` | Gestión de corners y técnicos |

> Las contraseñas del seed son solo para acceso de administración en desarrollo.
> Se generan aleatoriamente en cada ejecución — ver `apps/abac-microservice/initial-credentials.json` (gitignored).
> En producción, estos usuarios deberían autenticarse también vía Entra ID.

---

## Seed M2M (`npm run abac:seed:m2m`)

Crea 4 cuentas de servicio (`accountType = 'service'`). Las credenciales se imprimen
en consola al finalizar y **no se almacenan en claro** — si se pierden, rotar con:
```bash
npm run abac:seed:m2m
```

### Cuentas de servicio

| Servicio | Email | Rol |
|---|---|---|
| API Gateway | `svc-api-gateway@eventcorner.internal` | `service-account` |
| Monolith | `svc-monolith@eventcorner.internal` | `service-account` |
| Integration Service | `svc-integration@eventcorner.internal` | `service-account` |
| api-snowq-service | `svc-snowq@eventcorner.internal` | `service-account` |

### Variables de entorno a actualizar

Copiar las credenciales impresas en consola a cada servicio:

```env
# api-gateway/.env.development
ABAC_API_KEY=ak_...
ABAC_API_SECRET=...

# monolith/.env.development
ABAC_API_KEY=ak_...
ABAC_API_SECRET=...

# integration-service/.env.development
ABAC_API_KEY=ak_...
ABAC_API_SECRET=...

# api-snowq-service/.env
ABAC_API_KEY=ak_...
ABAC_API_SECRET=...
```

> Las credenciales `ABAC_API_KEY` / `ABAC_API_SECRET` se usan para generar el `ABAC_M2M_TOKEN` con `POST /auth/m2m-token`. El token generado es el que va en `ABAC_M2M_TOKEN` del `.env` de cada servicio.

---

## Seed Monolith (`npm run monolith:seed`)

### ServiceNow Profiles

| ID | `snow_company_sys_id` |
|---|---|
| `profile-santander-ar` | `4b6f1e2a3c5d7e8f9a0b1c2d3e4f5a6b` |
| `profile-santander-es` | `7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d` |

### Companies

| Company | `company_id` |
|---|---|
| Santander Argentina S.A. | `company-santander-ar-00000001` |
| Santander España S.A. | `company-santander-es-00000001` |
| Santander Corporate (Default) | `company-santander-default-001` |

> `SN_DEFAULT_COMPANY_ID=company-santander-default-001` en `apps/monolith/.env.development`

### Issue Types (tree_id = `tree-santander-0000000000000001`)

| Nombre | `sn_category` |
|---|---|
| Hardware — General | `hardware` |
| Hardware — Teclado / Mouse | `hardware` |
| Software — Sistema Operativo | `software` |
| Software — Aplicación | `software` |
| Red — Sin Conectividad | `network` |
| Acceso — Contraseña / Bloqueo | `access` |

### Corners

| Corner | `snow_assignment_group` |
|---|---|
| Corner Buenos Aires | `group005cornerba0000000000000001` |
| Corner Madrid | `group006cornermad000000000000001` |

### Users de negocio

| Nombre | `customer_id` | Empresa |
|---|---|---|
| Juan Empleado | `user-empleado1-monolith-000001` | Santander Argentina |
| María Empleado | `user-empleado2-monolith-000001` | Santander España |

Estos IDs se usan como `--customer-id` en el gateway simulator.

> **Nota:** El gateway simulator requiere un Bearer token de Entra ID (Azure AD) para autenticarse. No hay login por contraseña. En entorno de desarrollo, obtener el token de Azure vía MSAL o usar un token de prueba configurado en la tenant de dev.
>
> ```bash
> AZURE_TOKEN="eyJ..."   # token Entra ID del usuario de prueba
> npm run sim:gateway -- incidents \
>   --token "$AZURE_TOKEN" \
>   --customer-id user-empleado1-monolith-000001
> ```

### Variable de entorno ServiceNow

```env
# apps/monolith/.env.development
SN_DEFAULT_COMPANY_SYS_ID=c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8
```

---

## Re-seed (reset completo)

```bash
# Resetear ABAC y M2M (pregunta confirmación)
npm run abac:seed:full

# Luego actualizar .env en cada servicio con las nuevas credenciales
# Luego re-seed monolith si es necesario
npm run monolith:seed
```

> Al re-seedear ABAC se generan nuevos `appId`, `apiKey` y credenciales M2M.
> Deben actualizarse en todos los `.env.*` afectados antes de reiniciar los servicios.
