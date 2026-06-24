# 📊 Dashboard para api-snowq-service

## 🎯 Resumen

Se ha creado un dashboard completo para el **api-snowq-service** siguiendo los patrones del vault de Obsidian.

## 📁 Estructura Creada

```
api-snowq-dashboard/
├── src/
│   ├── components/
│   │   ├── ui/                    # Componentes base (Radix UI + Tailwind)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── table.tsx
│   │   │   ├── select.tsx
│   │   │   ├── progress.tsx
│   │   │   └── input.tsx
│   │   ├── sidebar.tsx            # Navegación lateral
│   │   ├── header.tsx             # Header con refresh
│   │   └── dashboard-layout.tsx   # Layout principal
│   ├── pages/
│   │   ├── dashboard-overview-page.tsx    # Dashboard principal
│   │   ├── queue-management-page.tsx      # Gestión de cola
│   │   ├── circuit-breaker-page.tsx       # Estado del circuit breaker
│   │   ├── monitoring-alerts-page.tsx     # Alertas Nagios/Thruk
│   │   ├── request-history-page.tsx       # Historial de requests
│   │   └── health-page.tsx                # Health checks
│   ├── lib/
│   │   ├── api-client.ts          # Cliente Axios
│   │   ├── api.ts                 # Endpoints
│   │   └── utils.ts               # Utilidades
│   ├── types/
│   │   └── index.ts               # Tipos TypeScript
│   ├── App.tsx
│   └── main.tsx
├── Dockerfile
├── nginx.conf
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## 🎨 Páginas Implementadas

### 1. **Dashboard Overview** (`/`)
- Métricas clave (total requests, success rate, avg duration, failed)
- Gráfico de volumen de requests (24h)
- Estado del circuit breaker
- Cola por prioridad (CRITICAL, HIGH, MEDIUM, LOW)
- Stats adicionales (queued, in progress, DLQ size)

### 2. **Queue Management** (`/queue`)
- Lista de requests encoladas con información detallada
- Filtros por status, prioridad y búsqueda
- Acciones: retry y cancel
- Estadísticas por prioridad
- Auto-refresh cada 10 segundos

### 3. **Circuit Breaker Status** (`/circuit-breaker`)
- Estado visual (closed/open/half-open)
- Métricas en tiempo real (failure rate, success/failure counts)
- Timeline de últimos eventos
- Configuración del Opossum
- Botón de reset manual

### 4. **Monitoring Alerts** (`/monitoring`)
- Alertas activas de Nagios/Thruk
- Formulario para enviar alertas de test
- Estadísticas de alertas
- Diagrama explicativo del flujo

### 5. **Request History** (`/history`)
- Historial completo paginado
- Filtros avanzados (status, priority, type, source)
- Búsqueda por correlation ID, internal number, sys ID
- Navegación con paginación

### 6. **Health Status** (`/health`)
- Estado general del sistema (healthy/degraded/unhealthy)
- Health checks por componente:
  - Database (MySQL)
  - ServiceNow API
  - Circuit Breaker
  - Queue
- Uptime y response times

## 🔌 Endpoints del api-snowq-service

El dashboard consume los siguientes endpoints:

```typescript
GET  /health                              # Health check
GET  /metrics/summary                     # Métricas resumen
GET  /snow-requests                       # Lista de requests
GET  /snow-requests/queued                # Requests encoladas
GET  /snow-requests/stats                 # Estadísticas de cola
GET  /resilience/circuit-breaker/status   # Estado del circuit breaker
POST /resilience/circuit-breaker/reset    # Reset circuit breaker
GET  /monitoring/alerts/active            # Alertas activas
POST /monitoring/alerts                   # Enviar alerta
```

## 🛠️ Tecnologías Utilizadas

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| React | 19.0.0 | Framework UI |
| Vite | 6.1.0 | Build tool |
| TypeScript | 5.7.2 | Tipado |
| Radix UI | ^1.2.x | Componentes |
| Tailwind CSS | 4.0.9 | Estilos |
| Recharts | 2.15.0 | Gráficos |
| React Router | 6.29.0 | Routing |

## 📚 Patrones del Vault Utilizados

- 📚 **01-react-radix-ui-tailwind.md** — Componentes UI
- 📚 **04-metrics-observability-flow.md** — Métricas y observabilidad
- 📚 **01-circuit-breaker-opossum.md** — Circuit breaker pattern

## 🚀 Comandos

```bash
# Desarrollo
npm run dev          # http://localhost:3091

# Build
npm run build        # Producción
npm run build:staging
npm run build:prod

# Docker
docker build -t api-snowq-dashboard:latest .
docker run -p 3091:80 api-snowq-dashboard:latest
```

## ✅ Build Status

```
✓ Build completed successfully
✓ 2351 modules transformed
✓ dist/index.html                   0.47 kB
✓ dist/assets/index.css            27.94 kB
✓ dist/assets/index.js            821.63 kB
```

## 🔐 Autenticación

El dashboard soporta autenticación M2M vía tokens JWT Ed25519. Los tokens se almacenan en `localStorage` y se envían en el header `Authorization: Bearer <token>`.

## 📊 Features Destacadas

1. **Auto-refresh** — Las páginas hacen polling automático cada 5-10 segundos
2. **Responsive** — Diseño adaptable a móviles y tablets
3. **Accesible** — Componentes Radix UI con ARIA labels
4. **Type-safe** — TypeScript en todos los componentes
5. **Performance** — Code splitting y lazy loading
6. **Docker-ready** — Multi-stage build con nginx

## 🆕 Sugerencias de Extracción al Vault

Los siguientes componentes son candidatos para extracción:

1. **Dashboard Layout Pattern** — Sidebar + Header + Content pattern
2. **Metrics Card Component** — Card con icono, valor, descripción y trend
3. **Status Badge Pattern** — Badges con colores por estado
4. **Health Check Page** — Template reutilizable para health pages

---

**Creado:** 2026-04-19  
**Estado:** ✅ Completado  
**Build:** ✅ Exitoso
