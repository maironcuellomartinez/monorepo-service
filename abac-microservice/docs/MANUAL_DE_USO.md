# Manual de Uso - ABAC Microservice

> **Documentación detallada**
> - [api-reference.md](./api-reference.md) — Referencia completa de todos los endpoints con curls exactos
> - [flujos-de-uso.md](./flujos-de-uso.md) — Guías paso a paso por escenario

## Tabla de Contenidos

1. [Introducción](#introducción)
2. [Arquitectura](#arquitectura)
3. [Instalación y Configuración](#instalación-y-configuración)
4. [Autenticación](#autenticación)
5. [Endpoints Principales](#endpoints-principales)
6. [Ejemplos de Uso](#ejemplos-de-uso)
7. [Casos de Uso Avanzados](#casos-de-uso-avanzados)
8. [Mejores Prácticas](#mejores-prácticas)

---

## Introducción

El **ABAC Microservice** (Attribute-Based Access Control) es un sistema de control de acceso basado en atributos que permite gestionar permisos de forma granular y dinámica. Este microservicio permite:

- ✅ Evaluar permisos de usuarios en tiempo real
- ✅ Gestionar políticas dinámicas con reglas personalizadas
- ✅ Controlar acceso basado en contexto (tiempo, ubicación, etc.)
- ✅ Administrar aplicaciones, usuarios, roles y permisos
- ✅ Auditoría completa de decisiones de acceso

### Conceptos Clave

- **Application**: Aplicación que utiliza el sistema ABAC
- **User**: Usuario que requiere acceso a recursos
- **Role**: Conjunto de permisos asignados a usuarios
- **Permission**: Acción específica sobre un recurso (ej: `users:read`)
- **Policy**: Conjunto de reglas dinámicas que evalúan contexto
- **Rule**: Condición lógica que debe cumplirse para aplicar una política

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente / Aplicación                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway / Auth                        │
│              (JWT Auth / API Key Guard)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    ABAC Microservice                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   AbacService│  │PolicyService │  │  AppService  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Base de Datos (MySQL)                     │
│  Applications | Users | Roles | Permissions | Policies      │
└─────────────────────────────────────────────────────────────┘
```

---

## Instalación y Configuración

### Requisitos Previos

- Node.js >= 18.x
- MySQL >= 8.0 (o PostgreSQL)

### Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=abac_user
DB_PASSWORD=your_password
DB_DATABASE=abac_db

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_ACCESS_EXPIRY=1h
REFRESH_TOKEN_TTL_SECONDS=604800

# Application
PORT=3000
NODE_ENV=development
```

### Instalación

```bash
# Instalar dependencias
npm install

# Ejecutar migraciones
npm run migration:run

# Iniciar en desarrollo
npm run start:dev

# Iniciar en producción
npm run start:prod
```

### Creacion de usuarios basicos

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "app-123",
    "username": "admin",
    "department": "admin",
    "role": "admin",
    "attributes": {
        "userId": "user-uuid",
        "context": {
            "ipAddress": "192.168.1.100",
            "userAgent": "Mozilla/5.0...",
            "timestamp": "2025-11-26T16:00:00Z",
            "location": "office",
            "corner": "corner-123",
            "mfaVerified": true,
            "riskScore": 0.2
      }
    }
  }'
```


### 1. JWT Authentication (Para usuarios administradores)

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your_password"
  }'

# Respuesta
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Admin User"
  }
}
```

### 2. API Key Authentication (Para aplicaciones)

```bash
# Validar API Key
curl -X POST http://localhost:3000/applications/validate-api-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "apiKey": "app_key_123456",
    "apiSecret": "app_secret_abcdef"
  }'
```

---

## Endpoints Principales

### 🔐 ABAC - Control de Acceso

#### 1. Verificar Acceso (Can Access)

Evalúa si un usuario tiene permiso para realizar una acción sobre un recurso.

```bash
curl -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_api_key" \
  -d '{
    "userId": "user-uuid-123",
    "applicationId": "app-uuid-456",
    "resource": "users",
    "action": "read",
    "context": {
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0",
      "timestamp": "2025-11-26T16:00:00Z"
    }
  }'

# Respuesta
{
  "granted": true
}
```

#### 2. Evaluación por Lotes (Batch Evaluate)

Evalúa múltiples solicitudes de acceso en una sola llamada.
En un etorno de alta concurrencia, se puede utilizar para evaluar múltiples solicitudes de acceso en una sola llamada.

```bash
curl -X POST http://localhost:3000/abac/batch-evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_api_key" \
  -d '{
    "requests": [
      {
        "userId": "user-1",
        "applicationId": "app-1",
        "resource": "users",
        "action": "read",
        "context": {}
      },
      {
        "userId": "user-1",
        "applicationId": "app-1",
        "resource": "users",
        "action": "write",
        "context": {}
      }
    ]
  }'

# Respuesta
{
  "results": [
    {
      "userId": "user-1",
      "applicationId": "app-1",
      "resource": "users",
      "action": "read",
      "context": {},
      "granted": true
    },
    {
      "userId": "user-1",
      "applicationId": "app-1",
      "resource": "users",
      "action": "write",
      "context": {},
      "granted": false
    }
  ]
}
```

---

### 📱 Applications - Gestión de Aplicaciones

#### 1. Crear Aplicación

```bash
curl -X POST http://localhost:3000/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Mi Aplicación",
    "description": "Sistema de gestión de usuarios",
    "environment": "production",
    "settings": {
      "maxUsers": 1000,
      "features": ["auth", "rbac"]
    },
    "createdBy": "admin-user-id"
  }'

# Respuesta
{
  "id": "app-uuid-789",
  "name": "Mi Aplicación",
  "apiKey": "app_key_generated",
  "apiSecret": "app_secret_generated",
  "isActive": true,
  "createdAt": "2025-11-26T16:00:00Z"
}
```

#### 2. Listar Aplicaciones

```bash
curl -X GET "http://localhost:3000/applications?isActive=true&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Respuesta
{
  "data": [
    {
      "id": "app-uuid-789",
      "name": "Mi Aplicación",
      "environment": "production",
      "isActive": true
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10
}
```

#### 3. Regenerar API Key

```bash
curl -X POST http://localhost:3000/applications/app-uuid-789/regenerate-api-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "updatedBy": "admin-user-id"
  }'

# Respuesta
{
  "id": "app-uuid-789",
  "apiKey": "app_key_new_generated",
  "apiSecret": "app_secret_new_generated"
}
```

---

### 📋 Policies - Gestión de Políticas

#### 1. Crear Política

```bash
curl -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "applicationId": "app-uuid-789",
    "name": "Política de Horario Laboral",
    "description": "Permite acceso solo en horario laboral",
    "type": "system",
    "effect": "allow",
    "priority": 100,
    "createdBy": "admin-user-id"
  }'

# Respuesta
{
  "id": "policy-uuid-123",
  "name": "Política de Horario Laboral",
  "effect": "allow",
  "isActive": true
}
```

#### 2. Agregar Regla a Política

```bash
curl -X POST http://localhost:3000/policies/policy-uuid-123/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Verificar Horario",
    "description": "Solo permite acceso entre 8am y 6pm",
    "priority": 10,
    "condition": {
      "all": [
        {
          "fact": "context.timestamp",
          "operator": "greaterThanInclusive",
          "value": "08:00:00"
        },
        {
          "fact": "context.timestamp",
          "operator": "lessThanInclusive",
          "value": "18:00:00"
        }
      ]
    },
    "createdBy": "admin-user-id"
  }'
```

#### 3. Agregar Permiso a Política

```bash
curl -X POST http://localhost:3000/policies/policy-uuid-123/permissions/permission-uuid-456 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "createdBy": "admin-user-id",
    "conditions": {
      "department": "IT"
    }
  }'
```

#### 4. Validar Condición de Regla

```bash
curl -X POST http://localhost:3000/policies/validate-rule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "condition": {
      "all": [
        {
          "fact": "user.department",
          "operator": "equal",
          "value": "IT"
        }
      ]
    }
  }'

# Respuesta
{
  "isValid": true
}
```

---

## Ejemplos de Uso

### Ejemplo 1: Control de Acceso Básico

**Escenario**: Verificar si un usuario puede leer la lista de usuarios.

```bash
curl -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-Key: app_key_123" \
  -H "X-API-Secret: app_secret_456" \
  -d '{
    "userId": "john-doe-uuid",
    "applicationId": "my-app-uuid",
    "resource": "users",
    "action": "read",
    "context": {}
  }'
```

### Ejemplo 2: Control de Acceso con Contexto

**Escenario**: Verificar acceso considerando la ubicación del usuario.

```bash
curl -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-Key: app_key_123" \
  -H "X-API-Secret: app_secret_456" \
  -d '{
    "userId": "john-doe-uuid",
    "applicationId": "my-app-uuid",
    "resource": "financial-reports",
    "action": "read",
    "context": {
      "ipAddress": "192.168.1.100",
      "location": "office",
      "device": "desktop",
      "timestamp": "2025-11-26T14:30:00Z"
    }
  }'
```

### Ejemplo 3: Política con Múltiples Reglas

**Escenario**: Crear una política que permita acceso solo si:
- El usuario está en la oficina
- Es horario laboral (8am - 6pm)
- El usuario pertenece al departamento de IT

```bash
# 1. Crear la política
curl -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "applicationId": "my-app-uuid",
    "name": "Acceso Restringido IT",
    "description": "Solo IT en horario laboral desde oficina",
    "type": "system",
    "effect": "allow",
    "priority": 100,
    "createdBy": "admin-uuid"
  }'

# 2. Agregar regla de ubicación
curl -X POST http://localhost:3000/policies/POLICY_ID/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Verificar Ubicación",
    "priority": 10,
    "condition": {
      "all": [
        {
          "fact": "context.location",
          "operator": "equal",
          "value": "office"
        }
      ]
    },
    "createdBy": "admin-uuid"
  }'

# 3. Agregar regla de horario
curl -X POST http://localhost:3000/policies/POLICY_ID/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Verificar Horario",
    "priority": 20,
    "condition": {
      "all": [
        {
          "fact": "context.hour",
          "operator": "greaterThanInclusive",
          "value": 8
        },
        {
          "fact": "context.hour",
          "operator": "lessThanInclusive",
          "value": 18
        }
      ]
    },
    "createdBy": "admin-uuid"
  }'

# 4. Agregar regla de departamento
curl -X POST http://localhost:3000/policies/POLICY_ID/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Verificar Departamento",
    "priority": 30,
    "condition": {
      "all": [
        {
          "fact": "user.attributes.department",
          "operator": "equal",
          "value": "IT"
        }
      ]
    },
    "createdBy": "admin-uuid"
  }'
```

### Ejemplo 4: Evaluación por Lotes

**Escenario**: Verificar múltiples permisos de un usuario al cargar un dashboard.

```bash
curl -X POST http://localhost:3000/abac/batch-evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: app_key_123" \
  -H "X-API-Secret: app_secret_456" \
  -d '{
    "requests": [
      {
        "userId": "john-doe-uuid",
        "applicationId": "my-app-uuid",
        "resource": "dashboard",
        "action": "view",
        "context": {}
      },
      {
        "userId": "john-doe-uuid",
        "applicationId": "my-app-uuid",
        "resource": "users",
        "action": "read",
        "context": {}
      },
      {
        "userId": "john-doe-uuid",
        "applicationId": "my-app-uuid",
        "resource": "reports",
        "action": "generate",
        "context": {}
      },
      {
        "userId": "john-doe-uuid",
        "applicationId": "my-app-uuid",
        "resource": "settings",
        "action": "modify",
        "context": {}
      }
    ]
  }'
```

---

## Casos de Uso Avanzados

### Caso 1: Control de Acceso Temporal

**Objetivo**: Permitir acceso a un recurso solo durante un período específico.

```bash
# Crear política temporal
curl -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "applicationId": "my-app-uuid",
    "name": "Acceso Temporal - Campaña Black Friday",
    "effect": "allow",
    "priority": 200,
    "createdBy": "admin-uuid"
  }'

# Agregar regla de fecha
curl -X POST http://localhost:3000/policies/POLICY_ID/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Verificar Fecha Campaña",
    "priority": 10,
    "condition": {
      "all": [
        {
          "fact": "context.timestamp",
          "operator": "greaterThanInclusive",
          "value": "2025-11-25T00:00:00Z"
        },
        {
          "fact": "context.timestamp",
          "operator": "lessThanInclusive",
          "value": "2025-11-30T23:59:59Z"
        }
      ]
    },
    "createdBy": "admin-uuid"
  }'
```

### Caso 2: Control de Acceso por Geolocalización

**Objetivo**: Restringir acceso según la ubicación geográfica del usuario.

```bash
# Regla de geolocalización
curl -X POST http://localhost:3000/policies/POLICY_ID/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Verificar País Permitido",
    "priority": 10,
    "condition": {
      "any": [
        {
          "fact": "context.country",
          "operator": "equal",
          "value": "US"
        },
        {
          "fact": "context.country",
          "operator": "equal",
          "value": "CA"
        },
        {
          "fact": "context.country",
          "operator": "equal",
          "value": "MX"
        }
      ]
    },
    "createdBy": "admin-uuid"
  }'
```

### Caso 3: Control de Acceso Basado en Membresía

**Objetivo**: Permitir acceso solo a usuarios con membresía activa.

```bash
# Verificar con contexto de membresía
curl -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-Key: app_key_123" \
  -H "X-API-Secret: app_secret_456" \
  -d '{
    "userId": "premium-user-uuid",
    "applicationId": "my-app-uuid",
    "resource": "premium-content",
    "action": "view",
    "context": {
      "membership": {
        "type": "premium",
        "expiresAt": "2026-12-31T23:59:59Z",
        "isActive": true
      }
    }
  }'
```

---

## Mejores Prácticas

### 1. **Seguridad de API Keys**

```bash
# ❌ MAL: Nunca expongas las credenciales en el código
const apiKey = "app_key_123456";

# ✅ BIEN: Usa variables de entorno
const apiKey = process.env.ABAC_API_KEY;
```

### 2. **Caché de Decisiones**

Para mejorar el rendimiento, implementa caché en tu aplicación:

```javascript
// Ejemplo en Node.js
const cache = new Map();
const CACHE_TTL = 60000; // 1 minuto

async function checkAccess(userId, resource, action) {
  const cacheKey = `${userId}:${resource}:${action}`;
  
  // Verificar caché
  if (cache.has(cacheKey)) {
    const { result, timestamp } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      return result;
    }
  }
  
  // Llamar al servicio ABAC
  const result = await abacService.canAccess({
    userId,
    applicationId: APP_ID,
    resource,
    action,
    context: {}
  });
  
  // Guardar en caché
  cache.set(cacheKey, { result, timestamp: Date.now() });
  
  return result;
}
```

### 3. **Manejo de Errores**

```bash
# Siempre verifica el código de estado HTTP
curl -w "\nHTTP Status: %{http_code}\n" \
  -X POST http://localhost:3000/abac/can-access \
  -H "Content-Type: application/json" \
  -H "X-API-Key: app_key_123" \
  -H "X-API-Secret: app_secret_456" \
  -d '{...}'
```

### 4. **Contexto Rico**

Proporciona el máximo contexto posible para decisiones más precisas:

```json
{
  "userId": "user-uuid",
  "applicationId": "app-uuid",
  "resource": "sensitive-data",
  "action": "read",
  "context": {
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2025-11-26T16:00:00Z",
    "location": "office",
    "device": "desktop",
    "sessionId": "session-123",
    "mfaVerified": true,
    "riskScore": 0.2
  }
}
```

### 5. **Prioridad de Políticas**

- Usa prioridades altas (>100) para políticas restrictivas
- Usa prioridades medias (50-100) para políticas generales
- Usa prioridades bajas (<50) para políticas permisivas por defecto

### 6. **Monitoreo y Auditoría**

```bash
# Consultar estadísticas de evaluación (si está implementado)
curl -X GET "http://localhost:3000/abac/stats?applicationId=my-app-uuid" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Troubleshooting

### Error: "Invalid API Key"

```bash
# Verificar que las credenciales sean correctas
curl -X POST http://localhost:3000/applications/validate-api-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "apiKey": "your_api_key",
    "apiSecret": "your_api_secret"
  }'
```

### Error: "Access Denied"

1. Verificar que el usuario tenga los permisos asignados
2. Verificar que las políticas estén activas
3. Revisar las reglas de las políticas
4. Verificar el contexto proporcionado

### Error: "Invalid Rule Condition"

```bash
# Validar la condición antes de crear la regla
curl -X POST http://localhost:3000/policies/validate-rule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "condition": {
      "all": [...]
    }
  }'
```

---

## Recursos Adicionales

- **Documentación Swagger**: `http://localhost:3000/api-docs`
- **Health Check**: `http://localhost:3000/health`
- **Métricas Prometheus**: `http://localhost:3000/metrics`

---

## Soporte

Para reportar problemas o solicitar nuevas funcionalidades, contacta al equipo de desarrollo.

**Versión**: 1.0.0  
**Última actualización**: 2025-11-26

---


  ┌───────────────┬─────────────┬───────┬─────────┬────────────┬───────────────┐
  │    Acción     │ super-admin │ admin │ manager │ technician │   employee    │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ create        │ ✅          │ ❌    │ ✅      │ ✅         │ ✅            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ read          │ ✅          │ ✅    │ ✅      │ ✅         │ ✅            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ list          │ ✅          │ ✅    │ ✅      │ ✅         │ ✅            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ list-all      │ ✅          │ ✅    │ ✅      │ ✅         │ ❌            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ deliver       │ ✅          │ ✅    │ ✅      │ ✅         │ ❌            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ take          │ ✅          │ ❌    │ ✅      │ ✅         │ ❌            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ release       │ ✅          │ ❌    │ ✅      │ ✅         │ ❌            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ change-status │ ✅          │ ✅    │ ✅      │ ✅         │ ✅ ← cancelar │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ validate      │ ✅          │ ✅    │ ✅      │ ✅         │ ✅ ← cerrar   │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ reopen        │ ✅          │ ✅    │ ✅      │ ✅         │ ❌            │
  ├───────────────┼─────────────┼───────┼─────────┼────────────┼───────────────┤
  │ delete        │ ✅          │ ✅    │ ❌      │ ✅         │ ❌            │
  └───────────────┴─────────────┴───────┴─────────┴────────────┴───────────────┘