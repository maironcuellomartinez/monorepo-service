// core/ports/incoming/device/device-service.port.ts
import { Result } from '@app/result';
import { Device } from '../../../domain/entities/device.entity';
import { DeviceId } from '@app/shared/types/branded-ids';

export interface IDeviceService {
    /**
     * Implementa el flowchart completo de cache-as-DB:
     *  B{¿En DB?}
     *    No  → E[Consultar API] → F[Guardar en DB] → G[Devolver]
     *    Sí, ≥15 min (stale) → E → F[Actualizar DB] → G
     *    Sí, <15 min (fresco) → D[Devolver desde DB]
     *
     * Retorna null si la API externa tampoco lo conoce.
     */
    resolveDevice(serialNumber: string): Promise<Result<Device | null>>;

    /** Sincroniza forzadamente con el inventario externo */
    syncDevice(serialNumber: string): Promise<Result<Device>>;

    /** Job: refresca todos los entries cuyo TTL expiró (excluye virtuales) */
    refreshStaleDevices(): Promise<Result<{ refreshed: number; errors: number }>>;

    /**
     * Crea un dispositivo virtual para onboarding/entrega.
     * Si no se provee serial, se genera internamente (VIRT + hex).
     */
    createVirtualDevice(customerId: string, deviceType: string, model?: string, serialNumber?: string): Promise<Result<Device>>;

    /** Actualiza los campos editables de un dispositivo virtual. */
    updateVirtualDevice(deviceId: DeviceId, data: { serialNumber?: string; deviceType?: string; model?: string | null; brand?: string | null }): Promise<Result<Device>>;

    /** Deshabilita un dispositivo (virtual o real). */
    disableDevice(deviceId: DeviceId): Promise<Result<void>>;

    /** Habilita un dispositivo previamente deshabilitado. */
    enableDevice(deviceId: DeviceId): Promise<Result<void>>;

    /**
     * Desvincula el dispositivo virtual del usuario y lo elimina.
     * Se llama al finalizar el proceso de onboarding.
     */
    completeVirtualDevice(deviceId: DeviceId): Promise<Result<void>>;

    /** Obtiene todos los dispositivos (reales y virtuales) asignados a un usuario */
    getDevicesByUser(customerId: string): Promise<Result<Device[]>>;
    /** @deprecated usar getDevicesByUser */
    getVirtualDevicesByUser(customerId: string): Promise<Result<Device[]>>;

    /**
     * Resuelve el dispositivo por serial (Minerva → DB) y lo vincula al cliente.
     * Si el serial no existe en Minerva, crea un registro mínimo en DB para
     * que aparezca en los próximos listados de dispositivos del cliente.
     */
    resolveAndLinkDevice(serialNumber: string, customerId: string): Promise<Result<Device>>;

    /**
     * Sincroniza los dispositivos de un usuario específico desde Minerva.
     * Usado on-demand en el login y como fallback en creación de incidencias.
     */
    syncUserDevices(userId: string): Promise<Result<{ synced: number; errors: number }>>;

    /**
     * Job principal: consulta Minerva por cada usuario con incidencias activas y
     * sincroniza sus dispositivos en la tabla local (upsert + vinculación).
     */
    syncAllUsersDevices(): Promise<Result<{ usersProcessed: number; synced: number; errors: number }>>;
}
