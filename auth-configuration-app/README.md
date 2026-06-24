# Auth Configuration App

Interfaz web de administración para el **ABAC Microservice** de la plataforma Event Corner. Permite gestionar usuarios, roles, permisos, aplicaciones (M2M/OAuth) y políticas de acceso.

- **Puerto:** `5173` (desarrollo)
- **Backend requerido:** `abac-microservice` en puerto `3005`

## Stack

| Capa | Tecnología |
|---|---|
| Framework | React 19 + TypeScript 5.7 |
| Build | Vite 6.1 con SWC |
| Estilos | Tailwind CSS 4 |
| Componentes UI | Radix UI (headless + accesibles) |
| Routing | React Router 6 |
| Formularios | React Hook Form 7 |
| HTTP | Axios 1.14 |
| Iconos | Lucide React |

## Inicio rápido

```bash
npm install
npm run dev       # http://localhost:5173
```

El usuario administrador se crea al ejecutar `npm run seed` en el `abac-microservice`. Las credenciales quedan en `abac-microservice/initial-credentials.json`.

## Scripts

```bash
npm run dev              # Servidor de desarrollo (Vite, puerto 5173)
npm run build            # TypeScript check + build de producción
npm run build:staging    # Build con .env.staging
npm run build:prod       # Build con .env.production
npm run preview          # Preview del build de producción
npm run preview:staging  # Preview del build de staging
npm run lint             # ESLint
```

## Variables de entorno

Archivos en la raíz del proyecto: `.env.development`, `.env.staging`, `.env.production`.

| Variable | Descripción | Default |
|---|---|---|
| `VITE_ABAC_API_URL` | URL base del ABAC Microservice | `http://localhost:3005` |

Las variables se acceden en código como `import.meta.env.VITE_ABAC_API_URL`.

## Estructura del proyecto

```
src/
├── App.tsx                      # Routing principal + ErrorBoundary
├── main.tsx                     # Entry point de Vite
├── index.css                    # Estilos base Tailwind
├── contexts/
│   └── auth-context.tsx         # Estado de autenticación + hook useAuth()
├── lib/
│   └── api.ts                   # Cliente Axios + todos los endpoints
└── components/
    ├── login-form.tsx           # Formulario de login
    ├── header.tsx               # Barra superior (usuario + logout)
    ├── sidebar.tsx              # Navegación lateral colapsable
    ├── theme-provider.tsx       # Modo oscuro/claro
    ├── dashboard-overview.tsx   # Dashboard con métricas y actividad
    ├── users-page.tsx           # Gestión de usuarios
    ├── roles-page.tsx           # Gestión de roles
    ├── permissions-page.tsx     # Catálogo de permisos
    ├── applications-page.tsx    # Aplicaciones M2M y OAuth
    ├── policies-page.tsx        # Políticas de acceso
    ├── condition-builder.tsx    # Constructor visual de condiciones
    └── ui/                      # ~40 componentes Radix UI con Tailwind
```

## Rutas

| Ruta | Componente | Descripción |
|---|---|---|
| `/` | — | Redirige a `/dashboard` |
| `/dashboard` | `DashboardOverview` | Métricas, actividad reciente, top usuarios |
| `/users` | `UsersPage` | CRUD de usuarios + asignación de roles y apps |
| `/roles` | `RolesPage` | CRUD de roles + asignación de permisos |
| `/permissions` | `PermissionsPage` | Catálogo de permisos `resource:action` |
| `/applications` | `ApplicationsPage` | Apps M2M, OAuth clients, rotación de credenciales |
| `/policies` | `PoliciesPage` | Políticas con reglas, condiciones y permisos |

Todas las rutas requieren autenticación. Los usuarios no autenticados son redirigidos al login.

## Autenticación

### Flujo

1. El usuario ingresa email y contraseña en `LoginForm`
2. Se hace `POST /auth/admin/login` al ABAC Microservice
3. La respuesta incluye `accessToken`, `user` y `permissions`
4. El contexto guarda todo en `sessionStorage` (`abac_token`, `abac_user`, `abac_permissions`)
5. El interceptor de Axios inyecta el token en cada request: `Authorization: Bearer <token>`
6. Si el servidor responde 401, se despacha el evento `abac:unauthorized`
7. `AuthProvider` escucha ese evento y limpia la sesión sin recargar la página

### Hook `useAuth()`

```tsx
const { user, token, permissions, isAuthenticated, isLoading, login, logout } = useAuth()
```

| Campo | Tipo | Descripción |
|---|---|---|
| `user` | `AuthUser \| null` | `{ id, email, firstName, lastName, roles }` |
| `token` | `string \| null` | JWT activo |
| `permissions` | `string[]` | Lista de `resource:action` del usuario |
| `isAuthenticated` | `boolean` | `true` si hay token válido |
| `isLoading` | `boolean` | `true` durante la carga inicial desde sessionStorage |
| `login(email, password)` | `Promise<void>` | Autentica y actualiza estado |
| `logout()` | `void` | Limpia sesión y redirige al login |

### Persistencia

La sesión se guarda en `sessionStorage` (se pierde al cerrar la pestaña). El tema (dark/light) y el estado colapsado del sidebar se guardan en `localStorage`.

## Cliente API (`src/lib/api.ts`)

Instancia de Axios preconfigurada con base URL e interceptores. Exporta un objeto por cada dominio:

```ts
import { authApi, usersApi, rolesApi, permissionsApi, applicationsApi, policiesApi, auditApi } from './lib/api'
```

### Métodos disponibles

**`authApi`**
- `login(email, password)`

**`usersApi`**
- `list(params?)` — búsqueda paginada
- `getById(id)`, `create(data)`, `update(id, data)`
- `deactivate(id)`, `reactivate(id)`, `hardDelete(id)`
- `getRoles(userId)`, `assignRole(userId, roleId, applicationId)`, `removeRole(userId, roleId)`
- `getApplications(userId)`, `assignApplication(userId, appId, membershipType)`, `removeApplication(userId, appId)`
- `getPolicies(userId)`

**`rolesApi`**
- `list(applicationId?)`, `getById(id)`, `create(data)`, `update(id, data)`
- `deactivate(id)`, `reactivate(id)`, `hardDelete(id)`
- `getPermissions(roleId)`, `assignPermission(roleId, permId)`, `removePermission(roleId, permId)`

**`permissionsApi`**
- `list(filters?)`, `getById(id)`, `create(data)`, `update(id, data)`
- `deactivate(id)`, `reactivate(id)`, `hardDelete(id)`

**`applicationsApi`**
- `list(filters?)`, `getById(id)`, `create(data)`, `update(id, data)`
- `deactivate(id)`, `rotateApiKey(id)`, `issueM2mToken(id, duration)`

**`policiesApi`**
- `list(filters?)`, `getById(id)`, `create(data)`, `update(id, data)`, `delete(id)`
- `addRule(policyId, rule)`, `deleteRule(policyId, ruleId, deletedBy?)`
- `addPermission(policyId, permId, createdBy?)`, `removePermission(policyId, permId)`
- `deactivate(id, deletedBy?)`, `reactivate(id, reactivatedBy?)`

**`auditApi`**
- `getStats(appId?)`, `getRecent(limit?, appId?)`

## Páginas principales

### Dashboard

Muestra en tiempo real (filtrable por aplicación):
- Contadores de entidades: usuarios, roles, permisos, aplicaciones
- KPIs del día: logins, logins fallidos, accesos denegados, operaciones CRUD
- Actividad reciente (últimas 10 entradas)
- Gráfico de actividad de los últimos 7 días
- Desglose de acciones y top usuarios

### Usuarios

- Tabla paginada con búsqueda por email/nombre
- Crear usuario (nombre, email, contraseña, tipo de cuenta)
- Ver y gestionar roles por aplicación
- Ver y gestionar membresías de aplicaciones
- Desactivar / reactivar / eliminar definitivamente

### Roles

- Tabla de roles con filtro por aplicación
- Crear rol con nombre, descripción y peso
- Asignar y remover permisos de un rol
- Actualizar metadatos del rol

### Permisos

- Catálogo completo de permisos `resource:action`
- Crear permiso con recurso, acción, categoría y descripción
- Desactivar y reactivar

### Aplicaciones

- Vista unificada de apps M2M, OAuth clients y apps Entra
- Crear app interna (M2M): genera `apiKey`/`apiSecret` automáticamente
- Crear OAuth client: define `clientId`/`clientSecret` y lista de scopes
- Ver credenciales enmascaradas / revelar
- Rotar credenciales con confirmación
- Emitir token temporal para testing

### Políticas

- Crear política con nombre, efecto (`allow`/`deny`) y tipo
- Agregar reglas con el constructor visual de condiciones
- Asociar permisos a la política
- Activar y desactivar políticas

### Constructor de condiciones (`ConditionBuilder`)

Interfaz visual para definir condiciones de reglas de política en formato compatible con `json-rules-engine`:
- Agregar múltiples condiciones
- Seleccionar campo, operador y valor
- Combinar con operadores `AND` / `OR` / `NOT`

## Componentes UI

La carpeta `src/components/ui/` contiene ~40 componentes que envuelven primitivos de Radix UI con estilos Tailwind. Todos soportan la prop `className` para personalización y cumplen con criterios de accesibilidad WCAG.

Categorías principales:

| Categoría | Componentes |
|---|---|
| Formularios | `Input`, `Label`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider` |
| Overlays | `Dialog`, `AlertDialog`, `Drawer`, `Popover`, `HoverCard`, `DropdownMenu` |
| Layout | `Card`, `Tabs`, `Accordion`, `Separator`, `ScrollArea` |
| Feedback | `Alert`, `Badge`, `Progress`, `Skeleton` |
| Navegación | `Breadcrumb`, `NavigationMenu`, `Menubar` |
| Datos | `Table`, `Command` |
| Visualización | `Chart` (Recharts wrapper), `Carousel`, `Avatar` |

## Manejo de errores

- **`ErrorBoundary`** en `App.tsx` captura errores de renderizado y muestra pantalla de error en lugar de pantalla en blanco
- **Interceptor 401** despacha evento `abac:unauthorized` para logout sin `window.location.href`
- Errores de API se muestran en alerts contextuales dentro de cada página/dialog
- Errores de formulario gestionados por React Hook Form con mensajes inline

## Temas

La aplicación soporta modo claro, oscuro y detección automática del sistema. El tema se persiste en `localStorage` bajo la clave `ui-theme`. El toggle está disponible en la barra superior.
