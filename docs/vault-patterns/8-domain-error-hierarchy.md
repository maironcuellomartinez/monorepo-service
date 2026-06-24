---
title: "📚 Domain Error Hierarchy — Jerarquía de Errores de Dominio Tipados"
description: "DomainError abstracto + errores concretos con código + mapeo Result-to-HTTP"
aliases:
  - domain-error-hierarchy
  - domain-error-pattern
  - result-to-http
tags:
  - tipo/patrón
  - área/microservicios
  - stack/nestjs
  - patrón/ddd
  - fuente/monolito-event-corner
created: 2026-04-27
updated: 2026-04-27
related:
  - 04-Recursos/Backend/Microservicios/1-result-class-domain-shared.md
  - 04-Recursos/Backend/Microservicios/2-shared-library-domain.md
  - 04-Recursos/Backend/Microservicios/7-rich-domain-aggregate.md
sources:
  - apps/monolith/src/core/domain/errors/ (monolito-event-corner_v3)
  - libs/shared/src/errors/domain-error.ts
---

# 📚 Domain Error Hierarchy — Jerarquía de Errores de Dominio Tipados

> **Origen:** `monolito-event-corner_v3/libs/shared/src/errors/domain-error.ts` + `apps/monolith/src/core/domain/errors/`
> **Propósito:** Jerarquía uniforme de errores de dominio con código máquina-legible, timestamp, y mapeo automático a HTTP.

---

## 🔍 Problema

Sin una jerarquía de errores estándar:
- Cada servicio lanza excepciones distintas (HTTP, base de datos, validación)
- No hay forma de identificar el error por código en el cliente
- El mapeo a HTTP es ad-hoc e inconsistente
- Los errores no llevan trazabilidad (timestamp, metadata)

---

## ✅ Solución

Una clase base `DomainError` abstracta con código, y errores concretos que extienden de ella. Los códigos siguen convenciones que permiten mapeo automático a HTTP.

---

## 🧱 Jerarquía

```
Error (built-in)
 └── DomainError (abstracto)
      ├── InvalidIdError
      ├── IdRequiredError
      ├── IncidentNotAvailableError
      ├── IncidentAlreadyTakenError
      ├── TechnicianNotAuthorizedError
      ├── SlotNotAvailableError
      ├── InvalidDateRangeError
      ├── InsufficientSlotsError
      ├── InvalidIncidentStateError
      ├── IssueTypeNotFoundError
      ├── ServiceNowProfileNotFoundError
      ├── IssueTypeTreeNotFoundError
      ├── IssueTypeNotAllowedForCompanyError
      └── ... (más errores específicos del dominio)
```

---

## 📄 Clase Base

```typescript
// libs/shared/src/errors/domain-error.ts
export abstract class DomainError extends Error {
    abstract readonly code: string;
    abstract readonly message: string;
    readonly timestamp: Date;

    constructor(message?: string) {
        super(message);
        this.timestamp = new Date();
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
```

**Propiedades:**
| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `code` | string | Código máquina-legible (e.g. `'INCIDENT_NOT_FOUND'`) |
| `message` | string | Mensaje legible para humanos |
| `timestamp` | Date | Momento exacto del error |
| `stack` | string | Stack trace (heredado de Error) |

---

## 📝 Errores Concretos

### Errores de validación de IDs
```typescript
export class InvalidIdError extends DomainError {
    readonly code = 'INVALID_ID';
    readonly message: string;

    constructor(idType: string, value: string) {
        super(`Invalid ${idType}: ${value}`);
        this.message = `Invalid ${idType}: ${value}`;
    }
}

export class IdRequiredError extends DomainError {
    readonly code = 'ID_REQUIRED';
    readonly message: string;

    constructor(idType: string) {
        super(`${idType} is required`);
        this.message = `${idType} is required`;
    }
}
```

### Errores de negocio (Incidentes)
```typescript
export class IncidentNotAvailableError extends DomainError {
    readonly code = 'INCIDENT_NOT_AVAILABLE';
    readonly message = 'The incident is not available to be taken';
}

export class IncidentAlreadyTakenError extends DomainError {
    readonly code = 'INCIDENT_ALREADY_TAKEN';
    readonly message = 'The incident has already been taken by another technician';
}

export class TechnicianNotAuthorizedError extends DomainError {
    readonly code = 'TECHNICIAN_NOT_AUTHORIZED';
    readonly message = 'The technician is not authorized to perform this action';
}
```

### Errores con parámetros
```typescript
export class InvalidDateRangeError extends DomainError {
    readonly code = 'INVALID_DATE_RANGE';
    readonly message: string;

    constructor(start: Date, end: Date) {
        super(`Invalid date range: ${start} must be before ${end}`);
        this.message = `Invalid date range: ${start} must be before ${end}`;
    }
}

export class IssueTypeNotFoundError extends DomainError {
    readonly code = 'ISSUE_TYPE_NOT_FOUND';
    readonly message: string;

    constructor(id: string) {
        super(`Issue type ${id} not found`);
        this.message = `Issue type ${id} not found`;
    }
}

export class IssueTypeNotAllowedForCompanyError extends DomainError {
    readonly code = 'ISSUE_TYPE_NOT_ALLOWED_FOR_COMPANY';
    readonly message: string;

    constructor(issueTypeId: string, companyId: string) {
        super(`Issue type ${issueTypeId} is not available for company ${companyId}`);
        this.message = `Issue type ${issueTypeId} is not available for company ${companyId}`;
    }
}
```

---

## 🔄 Mapeo Result-to-HTTP

El `Result<T, DomainError>` se convierte en respuesta HTTP mediante un mapeo basado en el `code` del error.

```typescript
// libs/shared/src/utils/result-to-http.ts
function resultToHttp<T>(result: Result<T>): { status: number; body: any } {
    if (result.isSuccess) {
        return { status: 200, body: result.unwrap() };
    }

    const error = result.unwrapError();
    const code = error instanceof DomainError ? error.code : 'UNKNOWN_ERROR';

    let status: number;
    if (code.includes('NOT_FOUND')) status = 404;
    else if (code.includes('UNAUTHORIZED') || code.includes('NOT_AUTHORIZED')) status = 403;
    else if (code.includes('ALREADY') || code.includes('INVALID') || code.includes('NOT_AVAILABLE')) status = 409;
    else if (code.includes('REQUIRED')) status = 400;
    else status = 400;

    return {
        status,
        body: {
            error: code,
            message: error.message,
            timestamp: error.timestamp ?? new Date(),
        },
    };
}
```

### Tabla de mapeo

| Patrón en `code` | HTTP Status | Ejemplos |
|------------------|-------------|----------|
| `*NOT_FOUND*` | 404 Not Found | `INCIDENT_NOT_FOUND`, `ISSUE_TYPE_NOT_FOUND` |
| `*UNAUTHORIZED*` / `*NOT_AUTHORIZED*` | 403 Forbidden | `TECHNICIAN_NOT_AUTHORIZED`, `UNAUTHORIZED_ACCESS` |
| `*ALREADY*` / `*INVALID*` / `*NOT_AVAILABLE*` | 409 Conflict | `INCIDENT_ALREADY_TAKEN`, `INVALID_DATE_RANGE`, `SLOT_NOT_AVAILABLE` |
| `*REQUIRED*` | 400 Bad Request | `ID_REQUIRED` |
| Otros | 400 Bad Request | Default |

---

## 🧪 Estrategia de Testing

```typescript
describe('DomainError', () => {
    it('debe tener código, mensaje y timestamp', () => {
        const error = new IncidentNotAvailableError('inc_123');
        expect(error.code).toBe('INCIDENT_NOT_AVAILABLE');
        expect(error.message).toBe('The incident is not available to be taken');
        expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('resultToHttp debe mapear NOT_FOUND a 404', () => {
        const result = Result.err(new IssueTypeNotFoundError('type_1'));
        const { status } = resultToHttp(result);
        expect(status).toBe(404);
    });

    it('resultToHttp debe mapear INVALID a 409', () => {
        const result = Result.err(new InvalidDateRangeError(start, end));
        const { status } = resultToHttp(result);
        expect(status).toBe(409);
    });
});
```

---

## ✅ Reglas del Patrón

1. **Todo error de dominio extiende `DomainError`** — nunca lanzar `Error` genérico
2. **El `code` es constante por clase** — no depende de instancia
3. **Códigos siguen convención `SUSTANTIVO_VERBO`** en mayúsculas con underscore
4. **Mensajes pueden ser dinámicos** — el código nunca cambia
5. **El mapeo a HTTP es automático** — basado en patrón del `code`

---

## ⚠️ Anti-patrones a Evitar

| Anti-patrón | Por qué evitarlo |
|-------------|-----------------|
| Usar `Error` genérico para lógica de negocio | No tiene `code`, no se puede mapear |
| Códigos numéricos (1, 2, 3) | No son autodescriptivos |
| Códigos con guiones o espacios | Dificultan búsqueda por patrón |
| Un solo `DomainError` con `code` como string | TypeScript no puede hacer exhaustiveness checking |
| Lanzar errores HTTP desde el dominio | Acopla dominio a infraestructura web |

---

## 📚 Referencias

- [[04-Recursos/Backend/Microservicios/1-result-class-domain-shared|📦 Result Class — Manejo Funcional de Errores]]
- [[04-Recursos/Backend/Microservicios/2-shared-library-domain|📚 Shared Library — Domain Building Blocks]]
- [[04-Recursos/Backend/Microservicios/7-rich-domain-aggregate|🎯 Rich Domain Aggregate]]
