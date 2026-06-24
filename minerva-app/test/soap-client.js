/**
 * Cliente de prueba para Minerva SOAP API
 *
 * Uso: node test/soap-client.js
 *
 * Asegúrate de que el servicio esté corriendo en http://localhost:3015
 */

const soap = require('soap');

const WSDL_URL = 'http://localhost:3015/devices?wsdl';

async function runTests() {
  console.log('=== Minerva SOAP API - Test Client ===\n');

  let client;
  try {
    client = await soap.createClientAsync(WSDL_URL);
    console.log('✓ Conectado al servicio SOAP\n');
  } catch (error) {
    console.error('✗ Error conectando al servicio:', error.message);
    console.error('  Asegúrate de que el servicio esté corriendo: npm run start:dev');
    process.exit(1);
  }

  // Test 1: Crear dispositivo
  console.log('--- Test 1: Crear dispositivo ---');
  const createPayload = {
    nombre: 'Laptop Test',
    serialNumber: `SN-TEST-${Date.now()}`,
    descripcion: 'Dispositivo de prueba creado desde Node.js',
    tipo: 'Laptop',
    marca: 'Dell',
    modelo: 'Latitude 5520',
    usuarioId: 'user-123'
  };

  try {
    const [createResult] = await client.createDeviceAsync(createPayload);
    console.log('Respuesta:', JSON.stringify(createResult, null, 2));

    if (createResult.status === 'SUCCESS') {
      const deviceId = createResult.deviceId;
      console.log(`✓ Dispositivo creado: ${deviceId}\n`);

      // Test 2: Consultar dispositivo por ID
      console.log('--- Test 2: Consultar por ID ---');
      const [getResult] = await client.getDeviceAsync({ deviceId });
      console.log('Respuesta:', JSON.stringify(getResult, null, 2));

      if (getResult.status === 'SUCCESS') {
        console.log(`✓ Dispositivo encontrado: ${getResult.device.nombre}\n`);
      } else {
        console.log(`✗ Error: ${getResult.message}\n`);
      }

      // Test 3: Consultar dispositivos por usuario
      console.log('--- Test 3: Consultar por usuario ---');
      const [getByUserResult] = await client.getDevicesByUserAsync({
        usuarioId: 'user-123'
      });
      console.log('Respuesta:', JSON.stringify(getByUserResult, null, 2));

      if (getByUserResult.status === 'SUCCESS') {
        console.log(`✓ Se encontraron ${getByUserResult.devices?.device?.length || 0} dispositivos\n`);
      }

      // Test 4: Obtener todos los dispositivos
      console.log('--- Test 4: Obtener todos los dispositivos ---');
      const [getAllResult] = await client.getAllDevicesAsync();
      console.log('Respuesta:', JSON.stringify(getAllResult, null, 2));

      if (getAllResult.status === 'SUCCESS') {
        const devices = getAllResult.devices?.device || [];
        console.log(`✓ Total de dispositivos: ${Array.isArray(devices) ? devices.length : 1}\n`);
      }

      // Test 5: Actualizar dispositivo
      console.log('--- Test 5: Actualizar dispositivo ---');
      const [updateResult] = await client.updateDeviceAsync({
        deviceId,
        descripcion: 'Descripción actualizada desde test',
        modelo: 'Latitude 5530'
      });
      console.log('Respuesta:', JSON.stringify(updateResult, null, 2));

      if (updateResult.status === 'SUCCESS') {
        console.log(`✓ Dispositivo actualizado: ${deviceId}\n`);
      }

      // Test 6: Eliminar dispositivo
      console.log('--- Test 6: Eliminar dispositivo ---');
      const [deleteResult] = await client.deleteDeviceAsync({ deviceId });
      console.log('Respuesta:', JSON.stringify(deleteResult, null, 2));

      if (deleteResult.status === 'SUCCESS') {
        console.log(`✓ Dispositivo eliminado: ${deviceId}\n`);
      }

    } else {
      console.log(`✗ Error: ${createResult.message}\n`);
    }

  } catch (error) {
    console.error('✗ Error en test:', error.message);
  }

  console.log('=== Tests completados ===');
}

runTests().catch(console.error);
