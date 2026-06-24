# Minerva Device Inventory - SOAP API

Servicio de inventario de dispositivos asignados a usuarios mediante API SOAP.

## Inicio rápido

### 1. Instalar dependencias

```bash
cd minerva-app
npm install
```

### 2. Configurar MySQL

**Opción A: Con Docker (recomendado)**

```bash
docker-compose up -d
```

**Opción B: MySQL local**

Crear la base de datos manualmente:

```sql
CREATE DATABASE IF NOT EXISTS minerva_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

O ejecutar el script: `mysql -u root -p < database/init.sql`

### 3. Configurar variables de entorno

Copiar `.env.example` a `.env` y ajustar:

```bash
cp .env.example .env
```

### 4. Iniciar el servicio

```bash
npm run start:dev
```

El servicio estará disponible en `http://localhost:3015`

## WSDL

El WSDL está disponible en:
```
http://localhost:3015/devices?wsdl
```

## Operaciones SOAP

| Operación | Descripción |
|-----------|-------------|
| `createDevice` | Crear un nuevo dispositivo |
| `getDevice` | Consultar un dispositivo por ID |
| `getDevicesByUser` | Consultar todos los dispositivos de un usuario |
| `getAllDevices` | Consultar todos los dispositivos |
| `updateDevice` | Actualizar un dispositivo |
| `deleteDevice` | Eliminar un dispositivo |

## Campos del dispositivo

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `nombre` | string | Sí | Nombre del dispositivo |
| `serialNumber` | string | Sí | Número de serie (único) |
| `descripcion` | string | No | Descripción opcional |
| `tipo` | string | Sí | Tipo de dispositivo (laptop, monitor, etc.) |
| `marca` | string | Sí | Marca/fabricante |
| `modelo` | Sí | Sí | Modelo |
| `usuarioId` | string | Sí | ID del usuario propietario |

## Ejemplo de request SOAP (createDevice)

```xml
POST /devices HTTP/1.1
Host: localhost:3015
Content-Type: text/xml; charset=utf-8
SOAPAction: createDevice

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <createDevice xmlns="http://minerva.eventcorner.com/devices">
      <nombre>Laptop Corporativa</nombre>
      <serialNumber>SN-123456789</serialNumber>
      <descripcion>Laptop Dell para desarrollo</descripcion>
      <tipo>Laptop</tipo>
      <marca>Dell</marca>
      <modelo>Latitude 5520</modelo>
      <usuarioId>user-123</usuarioId>
    </createDevice>
  </soap:Body>
</soap:Envelope>
```

## Ejemplo de response

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <createDeviceResponse xmlns="http://minerva.eventcorner.com/devices">
      <deviceId>a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11</deviceId>
      <serialNumber>SN-123456789</serialNumber>
      <status>SUCCESS</status>
      <message>Dispositivo creado exitosamente</message>
    </createDeviceResponse>
  </soap:Body>
</soap:Envelope>
```

## Cliente de prueba con Node.js

```javascript
const soap = require('soap');
const url = 'http://localhost:3015/devices?wsdl';

async function test() {
  const client = await soap.createClientAsync(url);

  // Crear dispositivo
  const createResult = await client.createDeviceAsync({
    nombre: 'Laptop Test',
    serialNumber: 'SN-TEST-001',
    descripcion: 'Dispositivo de prueba',
    tipo: 'Laptop',
    marca: 'Dell',
    modelo: 'Latitude 5520',
    usuarioId: 'user-123'
  });
  console.log('Creado:', createResult);

  // Consultar por ID
  const getResult = await client.getDeviceAsync({
    deviceId: createResult.deviceId
  });
  console.log('Consultado:', getResult);

  // Consultar por usuario
  const getByUserResult = await client.getDevicesByUserAsync({
    usuarioId: 'user-123'
  });
  console.log('Por usuario:', getByUserResult);
}

test().catch(console.error);
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 3015 | Puerto del servicio |
| `DB_HOST` | localhost | Host de MySQL |
| `DB_PORT` | 3306 | Puerto de MySQL |
| `DB_USER` | root | Usuario de MySQL |
| `DB_PASSWORD` | root | Contraseña de MySQL |
| `DB_NAME` | minerva_db | Nombre de la base de datos |
| `SYNCHRONIZE_DATABASE` | true | Auto-crear tablas (solo dev) |
| `DB_LOGGING` | false | Log SQL queries |

## Comandos disponibles

```bash
npm install              # Instalar dependencias
npm run start:dev        # Desarrollo con watch
npm run start:prod       # Producción
npm run build            # Compilar TypeScript
npm test                 # Ejecutar tests
npm run test:cov         # Tests con coverage
```
