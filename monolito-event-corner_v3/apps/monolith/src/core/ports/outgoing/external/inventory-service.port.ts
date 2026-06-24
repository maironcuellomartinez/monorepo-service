// core/ports/outgoing/external/inventory-service.port.ts

export const EXTERNAL_INVENTORY_SERVICE = Symbol('EXTERNAL_INVENTORY_SERVICE');

export interface InventoryAssignedUser {
    userId: string;
    nombre: string;
}

export interface InventoryDeviceData {
    serialNumber: string;
    model: string | null;
    brand: string | null;
    deviceType: string | null;
    /** Usuario que tiene asignado el dispositivo en el inventario externo */
    assignedUser: InventoryAssignedUser | null;
}

export interface IExternalInventoryService {
    /** Obtiene datos de un dispositivo por número de serie.
     *  Retorna null si no existe en el inventario. */
    getBySerial(serialNumber: string): Promise<InventoryDeviceData | null>;

    /** Obtiene todos los dispositivos asignados a un usuario */
    getDevicesByUser(userId: string): Promise<InventoryDeviceData[]>;
}
