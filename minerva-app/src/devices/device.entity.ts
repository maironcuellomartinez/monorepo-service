/**
 * minerva-app es un mock del sistema Minerva real — sin base de datos, los
 * datos viven en memoria (ver devices.repository.ts) y se pierden al
 * reiniciar el proceso. Esto es intencional: simula el inventario externo
 * sin necesitar MySQL propio para un servicio que solo existe para pruebas
 * locales del flujo de sincronización de dispositivos.
 */
export class Device {
  deviceId: string;
  nombre: string;
  serialNumber: string;
  descripcion: string | null;
  tipo: string;
  marca: string;
  modelo: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  createdAt: Date;
  updatedAt: Date;
}
