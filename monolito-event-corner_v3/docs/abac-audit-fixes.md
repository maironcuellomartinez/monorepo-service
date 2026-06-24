# Auditoría ABAC Microservice — Plan de Mejoras

**Fecha:** 2026-03-27

---

## Resumen

Auditoría completa del código de `abac-microservice` en busca de inconsistencias, errores de lógica y bugs.
Se identificaron 16 hallazgos clasificados por severidad.

---

## CRITICO — Código muerto (eliminar)

| # | Archivo | Línea | Descripción | Acción |
|---|---|---|---|---|
| 1 | `auth.service.ts` | 425-502 | **`registerUserByAdmin()` es código muerto** — no se llama desde ningún controller ni servicio. Contenía: contraseña sin hashear (línea 459, mitigado por `@BeforeInsert` hook) y búsqueda de rol usando userId como roleId (línea 440). | Eliminar método |
| 2 | `auth.service.ts` | 393-420 | **`register()` es código muerto** — no se llama desde ningún controller. Método vacío (solo commit de transacción sin crear nada). | Eliminar método |
| 3 | `auth.service.ts` | 9 | **`import { RegisterDto }`** — solo usado por los métodos eliminados. | Eliminar import |
| 4 | `dtos/RegisterDto.ts` | completo | **`RegisterDto` es código muerto** — solo referenciada por métodos eliminados. | Eliminar archivo |
| 5 | `dtos/ProfileDto.ts` | completo | **`ProfileDto`** — solo importada por `RegisterDto`. | Eliminar archivo |
| 6 | `dtos/register-response.dto.ts` | completo | **`RegisterResponseDto`** — asociada al flujo de registro eliminado. | Verificar uso y eliminar |
| 7 | `dtos/policy.dto.ts` | 19-35 | **`CreatePolicyDto` duplicado** — existe en `create-policy.dto.ts` (la que se usa) y en `policy.dto.ts` (no importada). Son incompatibles. | Eliminar la de `policy.dto.ts` o el archivo completo si no se usa |

---

## CRITICO — Bugs activos (corregir)

| # | Archivo | Línea | Descripción | Fix |
|---|---|---|---|---|
| 8 | `api-key.guard.ts` | 59-63 | **Cache bypass salta verificación `isActive`** — Si la app está en cache, retorna `true` sin verificar `isActive`. Una app desactivada sigue funcionando hasta que expire el cache (1h). | Mover check de `isActive` ANTES del return del cache, o verificar `cachedApp.isActive` en el bloque del cache |

---

## ALTO — Lógica de negocio incorrecta

| # | Archivo | Línea | Descripción | Fix |
|---|---|---|---|---|
| 9 | `auth.service.ts` | 724-726 | **Race condition en `usageCount`** — `application.usageCount = (x ?? 0) + 1` + `save()` no es atómico. Dos requests concurrentes leen el mismo valor → uno se pierde. | Usar `this.applicationRepository.increment({ id: application.id }, 'usageCount', 1)` |
| 10 | `auth.service.ts` | 673-729 | **No verifica `usageLimit` en `validateApplicationCredentials()`** — Incrementa `usageCount` pero nunca verifica si `usageLimit` fue alcanzado. Solo `validateApiKey()` (línea 863) lo verifica. Apps M2M/OAuth pueden exceder su límite. | Agregar check `if (application.usageLimit && application.usageCount >= application.usageLimit) return Result.err(...)` antes del incremento |
| 11 | `auth.service.ts` | 788-791 | **M2M no valida `type`** — `generateOAuthToken()` verifica `type === 'oauth_client'`, pero `generateM2MToken()` no verifica tipo. Una app `oauth_client` puede obtener un token M2M sin restricción de scopes. | Agregar check `if (application.type === 'oauth_client') return Result.err(...)` en `generateM2MToken()` |
| 12 | `audit.service.ts` | 7 | **Import incorrecto** — `import { Session } from 'inspector'` importa la clase del debugger V8, no la entidad de la app. No se usa en el archivo — es dead import. | Eliminar la línea |
| 13 | `abac.service.ts` | 91-92 | **Default-allow sin políticas** — Cuando `policies.length === 0` y el permiso tiene `effect: 'allow'`, se concede acceso. Esto es técnicamente correcto (el permiso ya fue verificado en paso 2), pero si alguien borra todas las políticas por error, todo acceso con permiso `allow` se otorga sin condiciones. | Agregar log warn cuando no hay políticas. El comportamiento es intencional pero debe ser monitoreado. |

---

## MEDIO — Robustez

| # | Archivo | Línea | Descripción | Fix |
|---|---|---|---|---|
| 14 | `auth.service.ts` | 574-596 | **`validateEntraToken` no captura excepciones** — Si `entraIdService.validate()` lanza (token inválido, JWKS caído), la excepción sube sin control. El controller `validate-entra` no tiene try/catch. | Envolver en try/catch, retornar error controlado con `UnauthorizedException` |
| 15 | `auth.service.ts` | 619 | **`syncEntraUser` asocia por email sin verificar `entraId` existente** — Si existe un user con mismo email pero diferente `entraId` (ya asociado a otro oid), le sobreescribe el `entraId`. Podría permitir account confusion si dos personas comparten email en distintos tenants. | Agregar check: si `user.entraId` ya existe y es diferente de `oid`, lanzar error en vez de sobreescribir |
| 16 | `abac.service.ts` | 262 | **`.sort()` muta el array original** — `policy.rules.sort()` modifica la entidad en memoria. | Usar `[...policy.rules].sort(...)` para no mutar el original |

---

## BAJO — Calidad de código

| # | Archivo | Línea | Descripción | Fix |
|---|---|---|---|---|
| 17 | `auth.service.ts` | 632 | **`passwordHash: null as any`** — Hack de tipos. La columna ya es `nullable: true` en la entidad. | Cambiar tipo en entidad a `string \| null` y usar `passwordHash: null` sin cast |
| 18 | `auth.service.ts` | 794 | **Scopes fallback inconsistente** — `application.scopes ?? permissions` no distingue entre `null` (sin config → usar todos) y `[]` (config vacía → sin scopes). `[]` es truthy → no activa fallback. | Cambiar a `application.scopes?.length ? application.scopes : permissions` o documentar que `[]` significa "sin acceso" |
| 19 | `api-key.guard.ts` | 97 | **API key en Bearer header** — El guard acepta API key en `Authorization: Bearer <apiKey>`, colisionando con el uso estándar de Bearer para JWT. | Eliminar Bearer como fuente de API key (solo `x-api-key` header) |
| 20 | `api-key.guard.ts` | 19 | **Rate limit en memoria (Map)** — No se comparte entre instancias. Con múltiples replicas el rate limit no funciona. | Aceptable para v1. Documentar como limitación conocida. Migrar a Redis en el futuro si se escala. |
| 21 | `auth.service.ts` | 868 | **`usageCount += 1` en `validateApiKey()`** — Misma race condition que #9, pero en método diferente. | Mismo fix: usar `increment()` atómico |

---

## Orden de implementación

### Paso 1: Eliminar código muerto (#1-7)
- Eliminar `registerUserByAdmin()` y `register()` de `auth.service.ts`
- Eliminar import de `RegisterDto`
- Eliminar archivos: `RegisterDto.ts`, `ProfileDto.ts`, `register-response.dto.ts`
- Eliminar `CreatePolicyDto` duplicado en `policy.dto.ts`
- Eliminar `import { Session } from 'inspector'` en `audit.service.ts`

### Paso 2: Corregir bugs activos (#8-12)
- Fix cache bypass en `api-key.guard.ts`
- Fix race condition `usageCount` con `increment()` atómico
- Agregar check `usageLimit` en `validateApplicationCredentials()`
- Agregar check `type` en `generateM2MToken()`

### Paso 3: Mejorar robustez (#14-16)
- Try/catch en `validateEntraToken()`
- Check `entraId` existente en `syncEntraUser()`
- No mutar array en `evaluatePolicies()`

### Paso 4: Calidad (#17-21)
- Fix tipo `passwordHash` en entidad User
- Fix scopes fallback
- Eliminar Bearer como fuente de API key
- Fix `usageCount` en `validateApiKey()`

---

## Estado

| Paso | Estado |
|---|---|
| Paso 1: Código muerto | ✅ Completado |
| Paso 2: Bugs activos | ✅ Completado |
| Paso 3: Robustez | ✅ Completado |
| Paso 4: Calidad | ✅ Completado |

---

## Cambios realizados (2026-03-27)

### Archivos eliminados
- `abac/dtos/RegisterDto.ts` — DTO de registro legacy (código muerto)
- `abac/dtos/ProfileDto.ts` — DTO de perfil (solo usado por RegisterDto)
- `abac/dtos/register-response.dto.ts` — DTO de respuesta registro (código muerto)
- `abac/dtos/policy.dto.ts` — CreatePolicyDto/UpdatePolicyDto duplicados (no importados)

### Archivos modificados

**`auth.service.ts`**
- Eliminado `register()` y `registerUserByAdmin()` (código muerto)
- Eliminado imports de `RegisterDto` y `Session` entity (dead imports)
- `validateApplicationCredentials()`: agregado check de `usageLimit` + incremento atómico con `increment()`
- `generateM2MToken()`: agregado check que rechaza apps `oauth_client`
- `validateEntraToken()`: envuelto en try/catch con error controlado
- `syncEntraUser()`: check de conflicto si email ya tiene `entraId` diferente; `passwordHash: null` sin `as any`
- `generateOAuthToken()`: fix scopes fallback (`?.length` en vez de `??`)
- `validateApiKey()`: incremento atómico con `increment()`
- `login()`: `bcrypt.compare` con fallback `|| ''` para `passwordHash` nullable

**`audit.service.ts`**
- Eliminado `import { Session } from 'inspector'` (import incorrecto del debugger V8)

**`api-key.guard.ts`**
- Movido check `isActive` ANTES del return del cache (fix cache bypass)
- Limpieza de cache al desactivar app
- Eliminado `Authorization: Bearer` como fuente de API key (evita colisión con JWT)

**`abac.service.ts`**
- `evaluatePolicies()`: `[...policy.rules].sort()` en vez de `.sort()` (no mutar entidad)

**`user.entity.ts`**
- `passwordHash` tipo cambiado a `string | null`
- `validatePassword()`: retorna `false` si `passwordHash` es null

**`user.service.ts`**
- `changePassword()`: `bcrypt.compare` con fallback `|| ''` para nullable
