# api-snowq-dashboard

Dashboard de monitoreo y gestión para el **api-snowq-service** — un microservicio que gestiona la cola y circuit breaker hacia ServiceNow.

## 🚀 Características

- **Dashboard Overview** — Métricas en tiempo real, volumen de requests, estado del circuit breaker
- **Queue Management** — Visualización y gestión de la cola de requests por prioridad
- **Circuit Breaker Status** — Estado del circuit breaker Opossum con métricas detalladas
- **Monitoring Alerts** — Integración con Nagios/Thruk para alertas de monitoreo
- **Request History** — Historial completo de requests con búsqueda y filtros
- **Health Status** — Checks de salud de todos los componentes del sistema

## 🛠️ Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **React** | 19.0.0 | Framework UI |
| **Vite** | 6.1.0 | Build tool |
| **TypeScript** | 5.7.2 | Tipado estático |
| **Radix UI** | ^1.2.x | Componentes headless |
| **Tailwind CSS** | 4.0.9 | Estilos |
| **Recharts** | 2.15.0 | Gráficos |
| **React Router** | 6.29.0 | Routing |
| **Axios** | 1.14.0 | HTTP client |

## 📦 Instalación

### Desarrollo local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Abrir en navegador
# http://localhost:3091
```

### Build de producción

```bash
# Build para producción
npm run build

# Preview del build
npm run preview
```

### Docker

```bash
# Build de la imagen
docker build -t api-snowq-dashboard:latest .

# Ejecutar contenedor
docker run -p 3091:80 api-snowq-dashboard:latest

# O con docker-compose (desde el root del workspace)
docker-compose --profile dashboard up -d
```

## 🏗️ Arquitectura

```
api-snowq-dashboard/
├── src/
│   ├── components/
│   │   ├── ui/              # Componentes base (Button, Card, Table...)
│   │   ├── sidebar.tsx      # Navegación lateral
│   │   ├── header.tsx       # Header con refresh
│   │   └── dashboard-layout.tsx
│   ├── pages/
│   │   ├── dashboard-overview-page.tsx
│   │   ├── queue-management-page.tsx
│   │   ├── circuit-breaker-page.tsx
│   │   ├── monitoring-alerts-page.tsx
│   │   ├── request-history-page.tsx
│   │   └── health-page.tsx
│   ├── lib/
│   │   ├── api-client.ts    # Cliente Axios configurado
│   │   ├── api.ts           # Endpoints del api-snowq-service
│   │   └── utils.ts         # Utilidades (cn helper)
│   ├── types/
│   │   └── index.ts         # Tipos TypeScript
│   ├── App.tsx              # Routing principal
│   └── main.tsx             # Entry point
├── Dockerfile
├── nginx.conf
└── package.json
```

## 📊 Páginas

### 1. Dashboard Overview

- **Métricas clave**: Total requests, success rate, avg duration, failed
- **Gráfico de volumen**: Requests procesadas en las últimas 24h
- **Estado del circuit breaker**: Estado actual y métricas
- **Cola por prioridad**: Breakdown de requests encoladas por prioridad
- **Stats adicionales**: Queued, in progress, DLQ size

### 2. Queue Management

- **Lista de requests encoladas**: Con información detallada
- **Filtros**: Por status, prioridad, búsqueda por correlation ID
- **Acciones**: Retry y cancel de requests
- **Estadísticas**: Count por prioridad
- **Auto-refresh**: Cada 10 segundos

### 3. Circuit Breaker Status

- **Estado visual**: Indicator grande del estado (closed/open/half-open)
- **Métricas en tiempo real**: Failure rate, total requests, success/failure counts
- **Timeline**: Últimos timestamps de éxito/fallo
- **Configuración**: Parámetros del Opossum circuit breaker
- **Acción de reset**: Botón para resetear manualmente el circuit breaker

### 4. Monitoring Alerts

- **Alertas activas**: Lista de alertas de Nagios/Thruk encoladas
- **Formulario de test**: Envío de alertas simuladas para testing
- **Estadísticas**: Count de alertas por estado
- **Diagrama de flujo**: Explicación del proceso de alertas

### 5. Request History

- **Tabla paginada**: Historial completo de requests
- **Filtros avanzados**: Status, priority, type, source, búsqueda
- **Información detallada**: Internal number, correlation ID, snow number
- **Navegación**: Paginación con controls

### 6. Health Status

- **Estado general**: System-wide health (healthy/degraded/unhealthy)
- **Checks de componentes**: Database, ServiceNow, Circuit Breaker, Queue
- **Métricas de respuesta**: Response times por componente
- **Uptime**: Tiempo de actividad del servicio

## 🔌 Integración con api-snowq-service

El dashboard se conecta al `api-snowq-service` a través de los siguientes endpoints:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Health check del servicio |
| `/metrics/summary` | GET | Métricas resumen |
| `/snow-requests` | GET | Lista de requests con filtros |
| `/snow-requests/queued` | GET | Requests encoladas |
| `/snow-requests/stats` | GET | Estadísticas de la cola |
| `/resilience/circuit-breaker/status` | GET | Estado del circuit breaker |
| `/resilience/circuit-breaker/reset` | POST | Reset del circuit breaker |
| `/monitoring/alerts` | POST | Enviar alerta de monitoreo |
| `/monitoring/alerts/active` | GET | Alertas activas |

## 🔐 Autenticación

> **Nota**: La autenticación M2M se maneja vía tokens JWT Ed25519. El dashboard está diseñado para operar en entornos internos seguros.

Para producción, configurar:

```bash
# .env.production
VITE_API_BASE_URL=https://api-snowq.example.com/api
```

## 📝 Patrones Utilizados

Este dashboard sigue los patrones del vault de Obsidian:

- 📚 **01-react-radix-ui-tailwind** — Componentes UI con Radix + Tailwind
- 📚 **04-metrics-observability-flow** — Métricas y observabilidad
- 📚 **01-circuit-breaker-opossum** — Circuit breaker pattern

## 🚀 Deploy en Kubernetes

```yaml
# k8s/api-snowq-dashboard-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-snowq-dashboard
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-snowq-dashboard
  template:
    metadata:
      labels:
        app: api-snowq-dashboard
    spec:
      containers:
      - name: dashboard
        image: api-snowq-dashboard:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "100m"
          limits:
            memory: "128Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: api-snowq-dashboard
spec:
  selector:
    app: api-snowq-dashboard
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
```

## 🧪 Testing

```bash
# Run tests (cuando se implementen)
npm test

# Test con coverage
npm run test:cov
```

## 📄 Licencia

UNLICENSED — Propietario de Event Corner

---

**Desarrollado con** ⚡ **por el equipo de Event Corner**
