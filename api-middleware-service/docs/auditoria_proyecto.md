
---

# Diagnóstico Global: api-middleware-service

## 1. Resumen de Funciones Actuales

El proyecto es un **proxy OAuth2 middleware** que actúa como intermediario entre aplicaciones externas y un api-gateway interno (Event Corner). Sus funciones actuales son:

### Endpoints expuestos

| Ruta | Método | Auth | Función |
|---|---|---|---|
| `GET /health/status` | Público | No | Estado de resiliencia (bulkhead, circuit breaker) |
| `GET /v1/requests/:number` | Bearer token | Sí | Consulta de solicitud por número |
| `GET /v1/requests` | Bearer token | Sí | Listado de solicitudes con filtros |

### Mecanismos de resiliencia implementados

- **HTTP Bulkhead entrante** (`HttpBulkheadMiddleware`): Limita requests concurrentes entrantes (default 50 concurrencia, 100 cola). Excluye `/health/status`.
- **Bulkhead Registry**: Sistema genérico de bulkheads nombrados (por cliente, servicio, ABAC, DB, HTTP externo).
- **Circuit Breaker** (opossum): Envuelve llamadas al api-gateway. Se abre si >50% de 5xx en ventana de 5 llamadas. Reset a los 30s.
- **Colas de prioridad** (p-queue): `highPriority` (concurrencia 10) para consultas puntuales, `lowPriority` (concurrencia 5) para listados.
- **Validación de tokens vía OAuth Introspection** (RFC 7662): El `AccessTokenGuard` delega la validación a un servidor OAuth interno, con caché en memoria (TTL basado en `exp` del token, 60s default, 5s para tokens inválidos, cleanup cada 60s, max 10k entradas).

### Swagger
- Disponible en `/docs` en entornos no productivos.

---

## 2. Fallos / Problemas Detectados

### 🔴 CRÍTICO: Estado inconsistente entre `master` y `feature/MJCM-auth-configuration_26-marz-2026`

El diff muestra que la rama `feature` **eliminó** módulos enteros que en `master` existen:
- **Eliminó** `AuthController`, `AuthService`, `TokenRequestDto` → el endpoint `POST /oauth/token` **no existe** en la feature branch.
- **Eliminó** `ClientsModule`, `ClientsService`, `ClientsController`, `ExternalClientEntity` → el CRUD de clientes **no existe** en la feature branch.
- **Eliminó** `TypeOrmModule` del `AppModule` → la conexión a MySQL **no se configura** en la feature branch.
- **Eliminó** `JwtModule` del `AuthModule` → el guard de acceso ya no usa JWT local, sino introspección OAuth externa.

**Conclusión**: `master` y `feature` son dos arquitecturas diferentes. `master` usa JWT local + MySQL para clientes. La `feature` usa introspección OAuth externa + sin base de datos. **Nunca se mergeó la feature a master**. El código actual en disco (que revisé) es el de la **feature branch** (sin auth local, sin clients, sin DB).

### 🟡 MEDIO: `tsconfig.json` inseguro

```json
"strictNullChecks": false,
"noImplicitAny": false
```

Esto desactiva dos de las protecciones más importantes de TypeScript. Cualquier `null` no manejado o `any` implícito pasa sin error de compilación. Para un servicio que maneja autenticación y datos sensibles, es un riesgo.

### 🟡 MEDIO: Sin tests unitarios ejecutables

El `package.json` tiene configurado Jest, y hay archivos `.spec.ts` en la feature branch (`access-token.guard.spec.ts`, `client.spec.ts`, `records.controller.spec.ts`, `records.service.spec.ts`, `health.controller.spec.ts`), pero **no se ejecutaron** — no hay evidencia de que pasen. El `tsconfig.tsbuildinfo` está desactualizado (fecha de marzo).

### 🟡 MEDIO: `dist/` contiene código compilado de `master`, no de `feature`

Los archivos en `dist/` (ej: `app.module.js`) corresponden a la versión de `master` (con TypeORM, AuthController, etc.), no al código actual de `feature`. Si alguien ejecuta `npm run start:prod` hoy, arrancaría una versión desactualizada.

### 🟢 BAJO: `incremental: false` en tsconfig

Está deshabilitado el build incremental, lo que alarga los tiempos de compilación. No es un bug, pero es una optimización perdida.

### 🟢 BAJO: Sin `develop` branch

Solo existen `master` y `feature/MJCM-auth-configuration_26-marz-2026`. No hay flujo Git Flow establecido (sin `develop`, sin `release`).

---

## 3. Mejoras Potenciales

### Arquitectura y código

1. **Mergear feature a master y definir la arquitectura definitiva**: Hay que decidir si el servicio usará JWT local + MySQL (master) o introspección OAuth externa (feature). No pueden coexistir ambas.

2. **Activar `strictNullChecks` y `noImplicitAny`**: Refactorizar el código para que compile con strict mode. Esto previene bugs en producción.

3. **Unificar los dos `GatewayClient`**: Existe `src/gateway/gateway.client.ts` (en master) y `src/client/client.ts` (en feature). Son casi idénticos. El de feature tiene `getHeaders()` dinámico (mejor) y `fireBreaker()` con manejo de errores más limpio. El de master tiene `fallback()` en el breaker. Hay que fusionarlos.

4. **Eliminar `src/recilience/bulkhead/bulkhead.middleware.ts`**: Es un archivo huérfano que referencia rutas (`/snow-requests/immediate`) que no existen en el proyecto actual. Quedó de una versión anterior.

5. **Estandarizar el sistema de bulkhead**: Hay 3 mecanismos de bulkhead diferentes conviviendo:
   - `HttpBulkheadMiddleware` (PQueue, a nivel HTTP entrante)
   - `Bulkhead` propio (implementación casera con cola manual)
   - `PQueue` en `GatewayClient` (a nivel de llamadas salientes)

   El `Bulkhead` propio tiene bugs potenciales (race conditions en `processQueue`, `activeCalls` modificado fuera de contexto async). Considerar reemplazarlo por PQueue o similar.

### Operaciones

6. **Ejecutar tests y configurar CI**: Los tests existen pero no se ejecutan. Configurar `npm test` en el pipeline.

7. **Limpiar `dist/` y agregar a `.gitignore`**: `dist/` no debería estar en el repo (o al menos actualizarse con cada build).

8. **Configurar Git Flow**: Crear rama `develop`, usar `feature/*` y `release/*` correctamente.

9. **Agregar logging estructurado**: Actualmente usa `console.error` en `validateConfig()` y `Logger` de NestJS mezclados. Estandarizar todo con `Logger`.

### Seguridad

10. **Validar que `OAUTH_INTROSPECTION_URL` esté configurado en producción**: El `validateConfig()` en `main.ts` de la feature branch lo exige, pero en `development` saltea la validación. Asegurar que staging y production tengan valores reales.

11. **Rate-limiting adicional**: El bulkhead HTTP protege contra sobrecarga, pero no hay rate-limit por cliente/IP. Considerar agregar `@nestjs/throttler` o similar para prevenir abuso de endpoints individuales.

---

## Resumen de Estado Actual

| Aspecto | Estado |
|---|---|
| **Rama activa en disco** | `feature/MJCM-auth-configuration_26-marz-2026` |
| **Rama en producción** | `master` (sin mergear) |
| **Endpoints funcionales** | `GET /health/status`, `GET /v1/requests/:number`, `GET /v1/requests` |
| **Auth** | Introspección OAuth externa (feature) |
| **DB** | Sin conexión a DB (feature) |
| **Tests** | Existen specs pero no verificados |
| **TypeScript strict** | Desactivado |
| **Resiliencia** | Implementada (bulkhead + circuit breaker + colas) |

**Riesgo principal**: El código en disco (feature) y el código en `master` son arquitecturas diferentes. Si alguien deploya desde `master`, tendrá JWT local + MySQL. Si deploya desde `feature`, tendrá OAuth introspection + sin DB. Hay que resolver esta divergencia antes de seguir.

<recap>Analicé el proyecto completo: identifiqué que hay una divergencia crítica entre master (JWT local + MySQL) y la feature branch activa (OAuth introspection + sin DB), detecté 3 fallos de severidad media (tsconfig inseguro, tests no verificados, dist/ desactualizado) y propuse 11 mejoras. El siguiente paso sugerido es decidir qué arquitectura se queda y mergear la feature a master.</recap>