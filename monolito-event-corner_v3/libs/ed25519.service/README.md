# @app/ed25519 — JwtEd25519Service

Librería interna de **firma y verificación de JWT con curva Ed25519** (algoritmo `EdDSA`), construida sobre [`tweetnacl`](https://github.com/dchest/tweetnacl-js). Diseñada como módulo dinámico de NestJS, con soporte para async factories, rotación de claves (`kid`), y verificación de claims (`aud`, `iss`).

> Ed25519 es un algoritmo de firma de clave pública basado en curvas elípticas. Es más rápido y seguro que RSA, y produce firmas más pequeñas. Es la alternativa moderna a HS256/RS256 en sistemas que manejan claves asimétricas.

---

## Tabla de contenidos

1. [Instalación y registro](#instalación-y-registro)
2. [Arquitectura](#arquitectura)
3. [Interfaces y tipos](#interfaces-y-tipos)
4. [Métodos de instancia](#métodos-de-instancia)
5. [Métodos estáticos](#métodos-estáticos)
6. [Alias de importación](#alias-de-importación)
7. [Casos de uso completos](#casos-de-uso-completos)
8. [Generación de claves](#generación-de-claves)
9. [Seguridad y buenas prácticas](#seguridad-y-buenas-prácticas)

---

## Instalación y registro

### Dependencia

```bash
npm install tweetnacl
```

`tweetnacl` ya está declarado en el `package.json` raíz del monorepo. No requiere instalación adicional.

### `forRoot` — Configuración estática

```typescript
import { JwtEd25519Module } from '@app/ed25519';

@Module({
  imports: [
    JwtEd25519Module.forRoot({
      privateKey:       process.env.JWT_PRIVATE_KEY,   // Base64, 64 bytes
      publicKey:        process.env.JWT_PUBLIC_KEY,    // Base64, 32 bytes (opcional)
      kid:              'v1',                          // Identificador de clave
      defaultExpiresIn: 3600,                          // 1 hora en segundos
      verifyExpiration: true,
      verifyClaims: {
        iss: 'micorner-event-corner',
        aud: 'api-gateway',
      },
      debug: false,
    }),
  ],
})
export class AuthModule {}
```

### `forRootAsync` — Configuración desde ConfigService

```typescript
import { JwtEd25519Module } from '@app/ed25519';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    JwtEd25519Module.forRootAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        privateKey:       config.get<string>('JWT_PRIVATE_KEY'),
        publicKey:        config.get<string>('JWT_PUBLIC_KEY'),
        kid:              config.get<string>('JWT_KID', 'v1'),
        defaultExpiresIn: config.get<number>('JWT_EXPIRES_IN', 3600),
        verifyExpiration: true,
        verifyClaims: {
          iss: config.get('APP_NAME'),
          aud: config.get('JWT_AUDIENCE'),
        },
      }),
    }),
  ],
})
export class AuthModule {}
```

---

## Arquitectura

```
libs/ed25519.service/
├── tsconfig.lib.json                # Configuración TypeScript de compilación
└── src/
    ├── index.ts                     # Barrel de exports públicos
    ├── jwt-ed25519.constants.ts     # JWT_ED25519_OPTIONS, JWT_ED25519_DEFAULT_ALG
    ├── jwt-ed25519.interfaces.ts    # JwtEd25519ModuleOptions, SignOptions, VerifyResult
    ├── jwt-ed25519.module.ts        # Módulo dinámico NestJS (forRoot / forRootAsync)
    └── jwt-ed25519.service.ts       # Servicio principal (instancia + estáticos)
```

**Flujo de datos:**

```
ConfigService / .env
        │
        ▼
JwtEd25519Module.forRootAsync()
        │  inyecta JWT_ED25519_OPTIONS
        ▼
JwtEd25519Service (constructor)
    ├── Valida claves (64 bytes privada / 32 bytes pública)
    ├── Deriva publicKey desde privateKey si no se provee
    └── Genera par efímero si no hay claves (solo DEV)
        │
        ├── sign(options)    → JWT string
        ├── verify(token)    → JwtEd25519VerifyResult
        └── decode(token)    → payload sin verificar
```

---

## Interfaces y tipos

### `JwtEd25519ModuleOptions`

```typescript
interface JwtEd25519ModuleOptions {
  /**
   * Clave privada en Base64 (64 bytes = secretKey completa de nacl.sign.keyPair).
   * Si no se provee, se genera un par efímero en memoria (solo desarrollo).
   */
  privateKey?: string;

  /**
   * Clave pública en Base64 (32 bytes).
   * Si no se provee, se deriva automáticamente de la clave privada.
   */
  publicKey?: string;

  /**
   * Identificador de clave (kid). Se incluye en el header del JWT.
   * Útil para rotación de claves: el verificador puede elegir la clave correcta
   * según el kid del header.
   */
  kid?: string;

  /**
   * Tiempo de expiración por defecto en segundos.
   * Se puede sobrescribir en cada llamada a sign().
   */
  defaultExpiresIn?: number;

  /**
   * Si se debe verificar la expiración (claim exp) al llamar a verify().
   * Por defecto: true.
   */
  verifyExpiration?: boolean;

  /**
   * Claims adicionales a verificar en cada verify().
   */
  verifyClaims?: {
    aud?: string | string[];  // Audiencia esperada
    iss?: string;             // Emisor esperado
  };

  /**
   * Activa logs detallados de inicialización y errores de verificación.
   * Por defecto: false.
   */
  debug?: boolean;
}
```

### `JwtEd25519SignOptions`

```typescript
interface JwtEd25519SignOptions {
  /** Payload a incluir en el JWT. */
  payload: Record<string, any>;

  /** Tiempo de expiración en segundos (sobrescribe defaultExpiresIn). */
  expiresIn?: number;

  /** Kid para este token en particular (sobrescribe el del módulo). */
  kid?: string;
}
```

### `JwtEd25519VerifyResult`

```typescript
interface JwtEd25519VerifyResult {
  /** true si la firma y todos los claims son válidos. */
  valid: boolean;

  /** Payload decodificado si valid === true. */
  payload?: Record<string, any>;

  /** Mensaje de error si valid === false. */
  error?: string;
}
```

---

## Métodos de instancia

### `sign(options: JwtEd25519SignOptions): string`

Firma un payload y devuelve un JWT completo (`header.payload.signature`).

- Añade automáticamente los claims `exp` e `iat` si se especifica `expiresIn` o `defaultExpiresIn`.
- Lanza `Error` si no hay clave privada configurada.

```typescript
const token = jwtService.sign({
  payload: {
    sub:   'user-123',
    roles: ['admin'],
    iss:   'micorner-event-corner',
    aud:   'api-gateway',
  },
  expiresIn: 900,  // 15 minutos
  kid: 'v1',
});
// eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6InYxIn0.eyJzdWIiOiJ1c2VyLTEyMyIsLi4ufQ.abc123...
```

---

### `verify(token: string): JwtEd25519VerifyResult`

Verifica criptográficamente la firma del token y valida los claims configurados (`exp`, `aud`, `iss`).

**Nunca lanza excepción:** siempre retorna `{ valid: false, error: '...' }` en caso de fallo.

```typescript
const result = jwtService.verify(token);

if (result.valid) {
  const { sub, roles } = result.payload!;
  // continuar flujo
} else {
  console.error('Token inválido:', result.error);
  // 'Firma inválida.' | 'Token expirado.' | 'Audiencia inválida: "otro-servicio".'
}
```

**Posibles errores en `result.error`:**

| Mensaje | Causa |
|---------|-------|
| `Token malformado: se esperan 3 segmentos...` | El string no tiene 3 partes separadas por `.` |
| `Algoritmo no soportado: "HS256"` | El header usa un algoritmo diferente a `EdDSA` |
| `Firma inválida.` | Los bytes de la firma no coinciden con el mensaje |
| `Token expirado.` | El claim `exp` es anterior al timestamp actual |
| `Audiencia inválida: "otro-servicio".` | El claim `aud` no coincide con el configurado |
| `Emisor inválido: "otro-app".` | El claim `iss` no coincide con el configurado |

---

### `decode(token: string): Record<string, any> | null`

Decodifica el payload **sin verificar** la firma ni los claims. Útil para logging, middlewares de auditoría o extracción del `sub` antes de verificar.

> **Advertencia:** Nunca uses el resultado de `decode()` para tomar decisiones de autorización.

```typescript
const payload = jwtService.decode(expiredToken);
// { sub: 'user-123', exp: 1712000000, iat: 1711996400, roles: ['admin'] }

// Si el token está malformado:
jwtService.decode('no.es.un.jwt'); // null
```

---

### `getPublicKeyBase64(): string`

Devuelve la clave pública del servicio en formato Base64. Útil para exponerla en un endpoint JWKS o para pasársela a otro servicio que necesite verificar tokens.

```typescript
const pubKey = jwtService.getPublicKeyBase64();
// "MCowBQYDK2VwAyEA..." (32 bytes en Base64)
```

---

## Métodos estáticos

Los métodos estáticos no requieren instancia y son útiles para scripts de utilidad, CLIs, o situaciones donde no se usa inyección de dependencias.

### `JwtEd25519Service.generateKeyPair()`

Genera un nuevo par de claves Ed25519. Los valores devueltos se guardan como variables de entorno.

```typescript
import { JwtEd25519Service } from '@app/ed25519';

const { publicKey, privateKey } = JwtEd25519Service.generateKeyPair();

console.log('JWT_PRIVATE_KEY=' + privateKey); // Base64, 64 bytes
console.log('JWT_PUBLIC_KEY='  + publicKey);  // Base64, 32 bytes
```

> Ejecuta esto una sola vez y guarda los valores en tu gestor de secretos (Vault, AWS Secrets Manager, etc.).

---

### `JwtEd25519Service.signWithKey(privateKeyBase64, options, globalOptions?)`

Firma un payload con una clave privada arbitraria, sin necesidad de instancia NestJS.

```typescript
const token = JwtEd25519Service.signWithKey(
  process.env.JWT_PRIVATE_KEY!,
  {
    payload:   { sub: 'service-account', scope: 'internal' },
    expiresIn: 300,
    kid:       'svc-v1',
  },
  { defaultExpiresIn: 600, kid: 'v1' },
);
```

---

### `JwtEd25519Service.verifyWithKey(publicKeyBase64, token, options?)`

Verifica un JWT con una clave pública arbitraria, sin necesidad de instancia NestJS.

```typescript
const result = JwtEd25519Service.verifyWithKey(
  process.env.JWT_PUBLIC_KEY!,
  incomingToken,
  {
    verifyExpiration: true,
    verifyClaims: { iss: 'micorner-event-corner' },
    debug: true,
  },
);

if (!result.valid) {
  throw new UnauthorizedException(result.error);
}
```

---

## Alias de importación

La librería está registrada en el monorepo con el alias `@app/ed25519`:

```typescript
// Desde cualquier app o lib del monorepo:
import {
  JwtEd25519Module,
  JwtEd25519Service,
  JwtEd25519ModuleOptions,
  JwtEd25519SignOptions,
  JwtEd25519VerifyResult,
  JWT_ED25519_OPTIONS,
  JWT_ED25519_DEFAULT_ALG,
} from '@app/ed25519';
```

| Alias           | Resuelve a                            |
|-----------------|---------------------------------------|
| `@app/ed25519`  | `libs/ed25519.service/src/index.ts`   |
| `@app/ed25519/*`| `libs/ed25519.service/src/*`          |

---

## Casos de uso completos

### Caso 1: Autenticación REST básica

```typescript
// auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtEd25519Module } from '@app/ed25519';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtEd25519Module.forRootAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        privateKey:       config.getOrThrow('JWT_PRIVATE_KEY'),
        publicKey:        config.getOrThrow('JWT_PUBLIC_KEY'),
        kid:              'v1',
        defaultExpiresIn: 3600,
        verifyExpiration: true,
        verifyClaims: { iss: 'event-corner', aud: 'web-client' },
      }),
    }),
  ],
  providers:   [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
```

```typescript
// auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtEd25519Service } from '@app/ed25519';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtEd25519Service) {}

  login(userId: string, roles: string[]): string {
    return this.jwtService.sign({
      payload: {
        sub:  userId,
        roles,
        iss:  'event-corner',
        aud:  'web-client',
      },
      expiresIn: 3600,
    });
  }

  validateToken(token: string) {
    const result = this.jwtService.verify(token);
    if (!result.valid) {
      throw new UnauthorizedException(result.error);
    }
    return result.payload!;
  }
}
```

---

### Caso 2: Comunicación entre microservicios

```typescript
// En el emisor (micorner):
const serviceToken = JwtEd25519Service.signWithKey(
  process.env.INTERNAL_PRIVATE_KEY!,
  {
    payload: {
      sub:     'micorner',
      scope:   ['read:events', 'write:corners'],
      iss:     'micorner',
      aud:     'corner-service',
    },
    expiresIn: 300,       // 5 minutos
    kid:       'internal-v1',
  },
);

// En el receptor (corner-service):
const result = JwtEd25519Service.verifyWithKey(
  process.env.INTERNAL_PUBLIC_KEY!,
  incomingToken,
  {
    verifyExpiration: true,
    verifyClaims: {
      iss: 'micorner',
      aud: 'corner-service',
    },
  },
);

if (!result.valid) {
  throw new UnauthorizedException(`Token de servicio inválido: ${result.error}`);
}
const { scope } = result.payload!;
```

---

### Caso 3: Rotación de claves con `kid`

```typescript
// Mapa de claves activas (podría venir de Redis, DB, etc.)
const keyStore: Record<string, string> = {
  'v1': process.env.JWT_PUBLIC_KEY_V1!,
  'v2': process.env.JWT_PUBLIC_KEY_V2!,
};

function verifyWithRotation(token: string): JwtEd25519VerifyResult {
  // Leer kid del header sin verificar firma
  const headerB64 = token.split('.')[0];
  const header    = JSON.parse(Buffer.from(headerB64 + '==', 'base64').toString());
  const kid       = header.kid as string;

  const publicKey = keyStore[kid];
  if (!publicKey) {
    return { valid: false, error: `Clave no encontrada para kid="${kid}"` };
  }

  return JwtEd25519Service.verifyWithKey(publicKey, token, {
    verifyExpiration: true,
    verifyClaims: { iss: 'event-corner' },
  });
}
```

---

### Caso 4: Guard NestJS con `JwtEd25519Service`

```typescript
// jwt-ed25519.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtEd25519Service } from '@app/ed25519';

@Injectable()
export class JwtEd25519Guard implements CanActivate {
  constructor(private readonly jwtService: JwtEd25519Service) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token no proporcionado.');
    }

    const token  = authHeader.slice(7);
    const result = this.jwtService.verify(token);

    if (!result.valid) {
      throw new UnauthorizedException(result.error);
    }

    // Exponer el payload decodificado en el request
    request.user = result.payload;
    return true;
  }
}
```

```typescript
// Uso en un controlador:
@UseGuards(JwtEd25519Guard)
@Get('profile')
getProfile(@Request() req) {
  return req.user; // { sub, roles, iss, aud, exp, iat }
}
```

---

## Generación de claves

Para generar el par de claves en producción, usa el método estático desde un script o una tarea npm:

```typescript
// scripts/generate-keys.ts
import { JwtEd25519Service } from '@app/ed25519';

const { publicKey, privateKey } = JwtEd25519Service.generateKeyPair();

console.log('============================================');
console.log('JWT_PRIVATE_KEY=' + privateKey);
console.log('JWT_PUBLIC_KEY='  + publicKey);
console.log('============================================');
console.log('Guarda estos valores en tu gestor de secretos.');
console.log('NUNCA expongas JWT_PRIVATE_KEY en logs o repositorios.');
```

```bash
npx ts-node -r tsconfig-paths/register scripts/generate-keys.ts
```

**Añadir al .env:**

```env
JWT_PRIVATE_KEY=<64 bytes en Base64>
JWT_PUBLIC_KEY=<32 bytes en Base64>
JWT_KID=v1
JWT_EXPIRES_IN=3600
```

---

## Seguridad y buenas prácticas

| Práctica | Descripción |
|----------|-------------|
| **Nunca regenerar en cada arranque** | El par de claves debe persistir entre reinicios. Sin `privateKey` en producción el servicio genera uno efímero que se pierde. |
| **Guardar en secrets manager** | Usa AWS Secrets Manager, HashiCorp Vault, o variables de entorno del CI/CD. Nunca en el repositorio. |
| **Rotar claves con `kid`** | Cada versión de clave debe tener un `kid` único. Mantén el mapa de claves públicas viejas para validar tokens en tránsito. |
| **`verifyExpiration: true`** | Siempre en producción. Desactívalo solo para pruebas. |
| **`verifyClaims` en microservicios** | Verifica siempre `iss` y `aud` en comunicación interna para evitar confusión de tokens entre servicios. |
| **No usar `decode()` para autorizar** | `decode()` no verifica la firma. Usa solo `verify()` para tomar decisiones de autorización. |
| **`debug: false` en producción** | El modo debug imprime errores de verificación en consola, lo que puede exponer información. |
| **Tamaño de clave fijo** | Ed25519 usa claves de tamaño fijo: 64 bytes (privada) y 32 bytes (pública). El servicio valida esto al iniciar. |
