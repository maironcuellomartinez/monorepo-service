---
title: "🛡️ NestJS Authorization Decorators — @Public / @Internal / @Roles / @Permission"
description: "Sistema de 4 decoradores + guards para control de acceso en API Gateway con soporte ABAC, JWT, M2M interno"
aliases:
  - nestjs-auth-decorators
  - authorization-decorators
  - jwt-guard-abac
  - m2m-internal-decorator
tags:
  - tipo/patrón
  - área/microservicios
  - stack/nestjs
  - patrón/seguridad
  - fuente/api-gateway
created: 2026-04-27
updated: 2026-04-27
related:
  - 04-Recursos/Backend/Seguridad/01-abac-json-rules-engine.md
  - 04-Recursos/Backend/Seguridad/02-m2m-eddsa-ed25519.md
  - 04-Recursos/Backend/Seguridad/03-entra-id-azure-ad.md
  - 04-Recursos/Backend/Seguridad/04-oauth2-client-credentials.md
  - 04-Recursos/Backend/Microservicios/5-ed25519-jwt-service.md
sources:
  - apps/api-gateway/src/auth/ (monolito-event-corner_v3)
  - apps/abac-microservice/src/auth/ y src/abac/
---

# 🛡️ NestJS Authorization Decorators — @Public / @Internal / @Roles / @Permission

> **Origen:** `monolito-event-corner_v3/apps/api-gateway/src/auth/` + `abac-microservice/src/abac/`
> **Propósito:** Sistema unificado de 4 decoradores que controlan todo el acceso: público, M2M interno, roles y permisos ABAC.

---

## 🔍 Problema

En un API Gateway que debe:
- Exponer endpoints públicos (login, health)
- Exponer endpoints M2M para servicios internos (sin cliente humano)
- Restringir endpoints por rol y/o permiso ABAC
- Soporta 3 métodos de autenticación (Entra ID, M2M EdDSA, OAuth2)

Sin un sistema de decoradores, cada endpoint tendría lógica de autenticación duplicada, mezclada con la lógica de negocio.

---

## ✅ Solución

4 decoradores de metadata + 3 guards en pipeline secuencial:

```
Request
  │
  ├── @Public()         → bypass total (no JWT, no ABAC)
  │
  ├── @InternalOnly()   → M2M EdDSA/Ed25519 (solo servicios internos)
  │
  └── (sin decorador)   → Cliente externo
        │
        ├── JwtGuard      → valida token (Entra ID / M2M)
        ├── AbacGuard     → verifica @Permission() contra ABAC
        └── RolesGuard    → verifica @Roles() contra ABAC
```

---

## 📝 Decoradores

### 1. `@Public()`
```typescript
// api-gateway/src/auth/decorators/public.decorator.ts
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
```
**Uso:** `@Public()` sobre un handler para omitir autenticación completa.  
**Ejemplos:** `POST /auth/login`, `GET /health`, `GET /metrics`

### 2. `@InternalOnly()`
```typescript
// api-gateway/src/auth/decorators/internal.decorator.ts
export const IS_INTERNAL = 'isInternal';
export const InternalOnly = () => SetMetadata(IS_INTERNAL, true);
```
**Uso:** `@InternalOnly()` para endpoints accesibles solo por otros microservicios (monolith, integration-service, api-snowq).  
**Validación:** Token M2M firmado con Ed25519, verificado localmente con `ED25519_PUBLIC_KEY`.

### 3. `@Permission(resource, action)`
```typescript
// api-gateway/src/auth/decorators/permission.decorator.ts
export const PERMISSION_KEY = 'permission';
export const Permission = (resource: string, action: string) =>
    SetMetadata(PERMISSION_KEY, { resource, action });
```
**Uso:** `@Permission('incident', 'create')` para requerir permiso ABAC específico.  
**Formato:** `resource:action` → mapea a scope/permiso en ABAC.

### 4. `@Roles(...roles)`
```typescript
// api-gateway/src/auth/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```
**Uso:** `@Roles('super-admin', 'admin')` para restringir por rol. **OR** lógico (basta con uno).  
**Caché:** Los roles se cachean 60s localmente en el guard.

---

## 🛡️ Guards

### Pipeline en API Gateway

```typescript
// api-gateway/src/auth/guards/jwt.guard.ts
@Injectable()
export class JwtGuard implements CanActivate {
    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const handlers = [ctx.getHandler(), ctx.getClass()];

        // 1. @Public() → bypass total
        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, handlers)) return true;

        // 2. @InternalOnly() → M2M EdDSA
        if (this.reflector.getAllAndOverride<boolean>(IS_INTERNAL, handlers)) {
            return this.validateInternalToken(ctx);
        }

        // 3. Cliente externo → delegar a ABAC
        const token = this.extractToken(request);
        return this.validateWithAbac(request, token);
    }
}
```

### Flujo interno: validateInternalToken()
```
1. Extraer Bearer token
2. Verificar firma Ed25519 con ED25519_PUBLIC_KEY
3. Validar claims: iss, type='service', exp
4. Verificar ownerApplicationId (ecosystem scoping)
5. Inyectar request.serviceApp = { applicationId, applicationName, ownerApplicationId }
```

### Flujo externo: validateWithAbac()
```
1. Llamar POST /auth/validate-token al ABAC
2. ABAC valida contra Azure AD (JWKS) o BD local (OAuth2)
3. ABAC retorna userId, email, roles, permissions
4. Inyectar request.user = { sub, email, username, permissions, ... }
```

```typescript
// api-gateway/src/auth/guards/abac.guard.ts
@Injectable()
export class AbacGuard implements CanActivate {
    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        // @Public() → bypass
        // Sin @Permission() → permite (solo autenticado)
        const permission = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, handlers);
        if (!permission) return true;

        const granted = await this.abac.canAccess(user.sub, permission.resource, permission.action, context);
        if (!granted) throw new ForbiddenException(`Permiso denegado: ${permission.resource}:${permission.action}`);
        return true;
    }
}
```

```typescript
// api-gateway/src/auth/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        // @Public() o @InternalOnly() → bypass
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, handlers);
        if (!requiredRoles?.length) return true;

        const userRoles = await this.getRoles(user.sub); // cache 60s
        if (!requiredRoles.some(r => userRoles.includes(r))) {
            throw new ForbiddenException(`Se requiere: ${requiredRoles.join(', ')}`);
        }
        return true;
    }
}
```

---

## 🚦 Orden de evaluación

```
@Public()           → JwtGuard: true (bypass)
@InternalOnly()     → JwtGuard: valida M2M local
                      AbacGuard: true (bypass)
                      RolesGuard: true (bypass)
@Roles('admin')     → JwtGuard: valida token → ABAC
                      AbacGuard: true (sin @Permission)
                      RolesGuard: valida roles → ABAC
@Permission('inc','c') → JwtGuard: valida token → ABAC
                      AbacGuard: valida permiso → ABAC
                      RolesGuard: true (sin @Roles)
@Roles('a')+@Permission('x','y') → Todos los guards evalúan
```

---

## 🔧 Decoradores en ABAC Microservice (Server-side)

ABAC tiene sus propios decoradores para endpoints de administración:

| Decorador | Archivo | Función |
|-----------|---------|---------|
| `@PublicApi()` | `abac/decorators/public-api.decorator.ts` | Bypass de ApiKeyGuard |
| `@Permissions(...)` | `abac/decorators/permission.decorator.ts` | Permisos ABAC requeridos |
| `@Roles(...)` | `abac/decorators/roles.decorator.ts` | Roles requeridos |
| `@Application()` | `abac/decorators/application.decorator.ts` | Parámetro decorador: extrae app del request |

```typescript
// ABAC tiene 2 guards en pipeline:
// 1. ApiKeyGuard → valida x-api-key contra BD (con rate limiting + cache)
// 2. RolesGuard → valida @Permissions() y @Roles() contra ABAC service
```

---

## ⚙️ Configuración Requerida

### Para M2M interno (`@InternalOnly()`)
```env
ED25519_PUBLIC_KEY=...   # Clave pública Ed25519 para verificar tokens M2M
JWT_ISSUER=abac-service  # Issuer esperado en tokens M2M
ABAC_APP_ID=...          # ID de la aplicación para ecosystem scoping
```

### Para clientes externos
```env
# No se necesita configuración adicional: ABAC maneja la validación
# ABAC_BASE_URL apunta al ABAC microservice
```

---

## 🧪 Testing

```typescript
describe('JwtGuard', () => {
    it('@Public() debe permitir acceso sin token', async () => {
        const guard = module.get(JwtGuard);
        const ctx = createMockExecutionContext({
            handler: { [IS_PUBLIC]: true },
        });
        expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('@InternalOnly() con token M2M válido debe pasar', async () => {
        // Mockear JwtEd25519Service.verifyWithKey → { valid: true, payload: { type: 'service' } }
    });

    it('@InternalOnly() sin token debe lanzar UnauthorizedException', async () => {
        const ctx = createMockExecutionContext({
            handler: { [IS_INTERNAL]: true },
            headers: {},
        });
        await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
});
```

---

## 📚 Referencias

- [[04-Recursos/Backend/Seguridad/01-abac-json-rules-engine|📚 ABAC con json-rules-engine]]
- [[04-Recursos/Backend/Seguridad/02-m2m-eddsa-ed25519|🔐 M2M EdDSA/Ed25519]]
- [[04-Recursos/Backend/Seguridad/03-entra-id-azure-ad|🪪 Entra ID / Azure AD JWKS]]
- [[04-Recursos/Backend/Seguridad/04-oauth2-client-credentials|🔑 OAuth2 Client Credentials]]
- [[04-Recursos/Backend/Microservicios/5-ed25519-jwt-service|📚 JwtEd25519Service]]
