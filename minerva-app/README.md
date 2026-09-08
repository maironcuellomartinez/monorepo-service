# Minerva Device Inventory - REST API mock

Servicio de inventario de dispositivos asignados a usuarios, expuesto vía REST.

**Mock sin base de datos** — los dispositivos viven en memoria (array en
`src/devices/devices.repository.ts`, sembrado con datos ilustrativos) y se
reinician junto con el proceso. Es intencional: este servicio solo simula el
sistema Minerva real para pruebas locales del flujo de sincronización de
dispositivos, no necesita persistencia propia.

## Inicio rápido

### 1. Instalar dependencias

```bash
cd minerva-app
npm install
```

### 2. Configurar variables de entorno

Copiar `.env.example` a `.env` y ajustar:

```bash
cp .env.example .env
```

### 3. Iniciar el servicio

```bash
npm run start:dev
```

El servicio estará disponible en `http://localhost:3015`

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/api/health` | Health check |
| `POST` | `/api/devices` (o `/api/v1/devices`) | Crear un dispositivo |
| `GET`  | `/api/devices/:serialNumber` | Consultar un dispositivo por número de serie |
| `GET`  | `/api/users/:userId` | Listar los dispositivos asignados a un usuario |

Consumido por `integration-service` (`MinervaConnector`), que a su vez expone
`/api/v1/minerva/*` hacia el api-gateway.

## Campos del dispositivo (POST /api/devices)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `nombre` | string | Sí | Nombre del dispositivo |
| `serialNumber` | string | Sí | Número de serie (único) |
| `descripcion` | string | No | Descripción opcional |
| `tipo` | string | Sí | Tipo de dispositivo (laptop, celular, etc.) |
| `marca` | string | Sí | Marca/fabricante |
| `modelo` | string | Sí | Modelo |
| `usuarioId` | string | No | ID del usuario propietario |
| `usuarioNombre` | string | No | Nombre del usuario propietario |

## Ejemplo de request/response

```bash
curl -X POST http://localhost:3015/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Laptop Test",
    "serialNumber": "SNTEST001",
    "tipo": "LAPTOP",
    "marca": "DELL",
    "modelo": "Latitude 5520",
    "usuarioId": "user-123"
  }'
```

```json
{
  "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "serialNumber": "SNTEST001",
  "status": "SUCCESS",
  "message": "Dispositivo creado exitosamente"
}
```

```bash
curl http://localhost:3015/api/devices/SNTEST001
```

```json
{
  "serial_number": "SNTEST001",
  "model": "Latitude 5520",
  "brand": "DELL",
  "device_type": "LAPTOP",
  "assigned_user": { "userId": "user-123", "nombre": "user-123" }
}
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 3015 | Puerto del servicio |

## Comandos disponibles

```bash
npm install              # Instalar dependencias
npm run start:dev        # Desarrollo con watch
npm run start:prod       # Producción
npm run build            # Compilar TypeScript
npm test                 # Ejecutar tests
npm run test:cov         # Tests con coverage
```
