# AGENT.md — api-middleware-service

> Instrucciones para DeepSeek Code en este proyecto.
> Leído al arrancar: su contenido se inyecta en el system prompt del agente.
> Editá los valores que no correspondan a la realidad del proyecto.

---

## Stack y tecnologías

- **Runtime:** Node.js 20 LTS
- **Stack:** TypeScript, NestJS
- **Build:** npm + @nestjs/cli
- **Testing:** Jest + ts-jest

## Estructura del proyecto

```
src/
  app.module.ts
  main.ts
  modules/
    users/
      users.controller.ts
      users.service.ts
      users.module.ts
      dto/
      entities/
test/
  e2e/
```

## Agentes y pesos iniciales de routing

> Formato: `## @<agent-id> — score: <N.N>`
> Rango válido: [0.1, 3.0]. Se aplica solo si no hay historial previo para ese agente.
> Score bajo (< 0.5) = agente irrelevante para este proyecto.

## @backend-agent — score: 1.8
Especializado en backends Node/TypeScript

## @typescript-agent — score: 1.5
Aplica para tipado y arquitectura TS

## @frontend-agent — score: 0.3
No aplica — proyecto backend

## Convenciones de código

- Lógica de negocio en Services — Controllers solo reciben, delegan y responden
- DTOs con `class-validator` para validación de entrada — nunca acceder a `body` sin validar
- Un módulo por dominio de negocio — no módulos técnicos (ej: "database.module")
- Inyección de dependencias por constructor — nunca instanciar servicios con `new`
- Excepciones HTTP con `HttpException` o sus subclases — no `throw new Error()` en controllers

## Anti-patrones conocidos

- NO lógica en Controllers — solo `this.service.método(dto)` y retorno
- NO `any` explícito — usar tipos o generics
- NO importar el módulo `AppModule` desde otros módulos
- NO queries directas a base de datos en Controllers o Services (usar repositorios)

## Policy Overrides (opcional)

> Reglas de política específicas del proyecto en formato YAML.
> Se mergean con el manifest global (~/.deepseek-code/manifest.yaml).
> Validación: `rewardFactor` debe estar en [0.5, 2.0].

```yaml
# Ejemplo — descomentar y adaptar al proyecto:
# - id: no-hardcoded-secrets
#   domain: audit
#   condition: "content.includes('password') || content.includes('api_key')"
#   action: block
#   rewardFactor: 0.5
```

---

<!-- Las secciones "## Lessons Learned" son generadas automáticamente
     por el ReflectionEngine al detectar patrones de fallo recurrentes.
     No editar manualmente — se actualizan con escritura atómica. -->
