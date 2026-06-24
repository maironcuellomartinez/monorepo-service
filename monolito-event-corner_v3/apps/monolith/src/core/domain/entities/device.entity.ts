import { Result } from '@app/result';
import { DeviceId } from '@app/shared/types/branded-ids';
import { SerialNumber } from '../value-objects/serial-number.value';
import { DeviceStatus } from '../enums/device-status.enum';

const TTL_MINUTES = 15;

export interface DeviceProps {
    id: DeviceId;                   // ID del dispositivo
    serialNumber: SerialNumber;     // Número de serie del dispositivo
    model: string | null;           // Modelo del dispositivo
    brand: string | null;           // Marca del dispositivo
    deviceType: string | null;      // Tipo de dispositivo
    assignedUserId: string | null;  // ID del usuario asignado según el inventario externo
    assignedUserName: string | null; // Nombre del usuario asignado según el inventario externo
    status: DeviceStatus;           // Estado actual del dispositivo
    isVirtual: boolean;             // true = dispositivo virtual (onboarding/entrega), nunca sincroniza con Minerva
    lastSyncAt: Date;               // Fecha de última sincronización del dispositivo
    createdAt: Date;                // Fecha de creación del dispositivo
}

export class Device {
    private constructor(private props: DeviceProps) { }

    // ── Getters ───────────────────────────────────────────────────────────────

    /**
     * ID del dispositivo
     * @returns ID del dispositivo
     */
    get id(): DeviceId { return this.props.id; }

    /**
     * Número de serie del dispositivo
     * @returns Número de serie del dispositivo
     */
    get serialNumber(): SerialNumber { return this.props.serialNumber; }

    /**
     * Modelo del dispositivo
     * @returns Modelo del dispositivo
     */
    get model(): string | null { return this.props.model; }

    /**
     * Marca del dispositivo
     * @returns Marca del dispositivo
     */
    get brand(): string | null { return this.props.brand; }

    /**
     * Tipo de dispositivo
     * @returns Tipo de dispositivo
     */
    get deviceType(): string | null { return this.props.deviceType; }

    /**
     * ID del usuario asignado según el inventario externo
     * @returns ID del usuario asignado según el inventario externo
     */
    get assignedUserId(): string | null { return this.props.assignedUserId; }

    /**
     * Nombre del usuario asignado según el inventario externo
     * @returns Nombre del usuario asignado según el inventario externo
     */
    get assignedUserName(): string | null { return this.props.assignedUserName; }

    /**
     * Estado actual del dispositivo
     * @returns Estado actual del dispositivo
     */
    get status(): DeviceStatus { return this.props.status; }

    /**
     * Verifica si el dispositivo es virtual.
     * @returns true si el dispositivo es virtual, false en caso contrario
     */
    get isVirtual(): boolean { return this.props.isVirtual; }

    /**
     * Verifica si el dispositivo está asignado.
     * @returns true si el dispositivo está asignado, false en caso contrario
     */
    get isAssigned(): boolean { return this.props.assignedUserId !== null; }

    /**
     * Fecha de última sincronización del dispositivo
     * @returns Fecha de última sincronización del dispositivo
     */
    get lastSyncAt(): Date { return this.props.lastSyncAt; }

    /**
     * Fecha de creación del dispositivo
     * @returns Fecha de creación del dispositivo
     */
    get createdAt(): Date { return this.props.createdAt; }
    toJSON() { return { ...this.props }; }

    // ── Business logic ────────────────────────────────────────────────────────

    /**
     * Verifica si el dispositivo está obsoleto.
     * Los dispositivos virtuales nunca son stale — no sincronizan con Minerva
     * @returns true si el dispositivo está obsoleto, false en caso contrario
     */
    get isStale(): boolean {
        if (this.props.isVirtual) return false;
        const ageMs = Date.now() - this.props.lastSyncAt.getTime();
        return ageMs > TTL_MINUTES * 60_000;
    }

    /**
     * @param model Modelo del dispositivo
     * @param brand Marca del dispositivo
     * @param deviceType Tipo de dispositivo
     * @param assignedUserId ID del usuario asignado
     * @param assignedUserName Nombre del usuario asignado
     * @description
     * Este método es utilizado por el repositorio para actualizar un dispositivo.
     * No realiza validaciones, simplemente actualiza las propiedades del dispositivo.
     * No aplica a dispositivos virtuales.
     */
    syncFromSource(
        model: string | null,
        brand: string | null,
        deviceType: string | null,
        assignedUserId: string | null,
        assignedUserName: string | null,
    ): void {
        if (this.props.isVirtual) return;
        this.props.model = model;
        this.props.brand = brand;
        this.props.deviceType = deviceType;
        this.props.assignedUserId = assignedUserId;
        this.props.assignedUserName = assignedUserName;
        this.props.status = DeviceStatus.SYNCED;
        this.props.lastSyncAt = new Date();
    }

    /**
     * Marca el dispositivo como error de sincronización.
     * Solo aplica a dispositivos físicos.
     */
    markSyncError(): void {
        if (this.props.isVirtual) return;
        this.props.status = DeviceStatus.SYNC_ERROR;
        this.props.lastSyncAt = new Date();
    }

    /**
     * Marca el dispositivo como no encontrado.
     * Solo aplica a dispositivos físicos.
     */
    markNotFound(): void {
        if (this.props.isVirtual) return;
        this.props.status = DeviceStatus.NOT_FOUND;
        this.props.lastSyncAt = new Date();
    }

    /**
     * Vincula el dispositivo a un cliente del monolito.
     * Se llama cuando el cliente reporta una incidencia con este serial.
     * Funciona tanto para dispositivos reales como virtuales.
     */
    assignToUser(customerId: string): void {
        this.props.assignedUserId = customerId;
    }

    /** Actualiza los datos editables de un dispositivo virtual. */
    updateVirtualDetails(data: {
        serialNumber?: SerialNumber;
        deviceType?: string;
        model?: string | null;
        brand?: string | null;
    }): Result<void> {
        if (!this.props.isVirtual) return Result.err(new Error('Only virtual devices can be edited this way'));
        if (data.serialNumber !== undefined) this.props.serialNumber = data.serialNumber;
        if (data.deviceType !== undefined) this.props.deviceType = data.deviceType;
        if (data.model !== undefined) this.props.model = data.model;
        if (data.brand !== undefined) this.props.brand = data.brand;
        return Result.ok(undefined);
    }

    /** Deshabilita el dispositivo (virtual o real). */
    disable(): void {
        this.props.status = DeviceStatus.DISABLED;
    }

    /** Habilita un dispositivo deshabilitado, restaurando su estado previo. */
    enable(): Result<void> {
        if (this.props.status !== DeviceStatus.DISABLED) {
            return Result.err(new Error('Device is not disabled'));
        }
        this.props.status = this.props.isVirtual ? DeviceStatus.VIRTUAL : DeviceStatus.STALE;
        return Result.ok(undefined);
    }

    /**
     * Desvincula el dispositivo virtual del usuario al completar el onboarding.
     * Solo aplica a dispositivos virtuales.
     */
    unlink(): Result<void> {
        if (!this.props.isVirtual) {
            return Result.err(new Error('Cannot unlink a non-virtual device'));
        }
        this.props.assignedUserId = null;
        this.props.assignedUserName = null;
        return Result.ok(undefined);
    }

    /**
     * Verifica si el dispositivo tiene un modelo asignado.
     * @returns true si el dispositivo tiene un modelo asignado, false en caso contrario
     */
    hasModel(): boolean {
        return this.props.model !== null && this.props.model.trim().length > 0;
    }

    /**
     * Verifica si el dispositivo tiene un tipo de dispositivo asignado.
     * @returns true si el dispositivo tiene un tipo de dispositivo asignado, false en caso contrario
     */
    hasDeviceType(): boolean {
        return this.props.deviceType !== null && this.props.deviceType.trim().length > 0;
    }

    /**
     * Verifica si el número de serie del dispositivo coincide con el número de serie proporcionado.
     * @param serialNumber Número de serie a comparar
     * @returns true si el número de serie del dispositivo coincide con el número de serie proporcionado, false en caso contrario
     */
    matchesSerialNumber(serialNumber: string): boolean {
        return this.props.serialNumber.value === serialNumber;
    }

    // ── Factories ─────────────────────────────────────────────────────────────

    /**
     * @param id ID del dispositivo
     * @param serialNumber Número de serie del dispositivo
     * @returns Dispositivo creado
     * 
     * @example
     * const device = Device.create(
     *   '123e4567-e89b-12d3-a456-426614174000',
     *   '1234567890',
     * );
     * @description
     * Este método es utilizado por el repositorio para crear un dispositivo.
     * No realiza validaciones, simplemente crea una instancia de Device con las propiedades proporcionadas.
     */
    static create(id: DeviceId, serialNumber: SerialNumber): Result<Device> {
        const device = new Device({
            id,
            serialNumber,
            model: null,
            brand: null,
            deviceType: null,
            assignedUserId: null,
            assignedUserName: null,
            status: DeviceStatus.STALE, // siempre requiere sync inmediato
            isVirtual: false,
            lastSyncAt: new Date(0),    // epoch → isStale = true de entrada
            createdAt: new Date(),
        });
        return Result.ok(device);
    }

    /**
      * @param id ID del dispositivo
      * @param customerId ID del cliente
      * @param deviceType Tipo de dispositivo
      * @param model Modelo del dispositivo
      * @returns Dispositivo virtual creado
      * 
      * @example
      * const device = Device.createVirtual(
      *   '123e4567-e89b-12d3-a456-426614174000',
      *   '123e4567-e89b-12d3-a456-426614174000',
      *   'Smartphone',
      *   'iPhone 12',
      * );
      * @description
      * Este método es utilizado por el repositorio para crear un dispositivo virtual.
      * No realiza validaciones, simplemente crea una instancia de Device con las propiedades proporcionadas.
      * No tiene serial real — se genera un identificador interno.
      * No sincroniza con Minerva.
      */
    static createVirtual(
        id: DeviceId,
        customerId: string,
        deviceType: string,
        model: string | null = null,
        serialNumber?: SerialNumber,
    ): Device {
        if (!serialNumber) {
            const hex = crypto.randomUUID().replace(/-/g, '').toUpperCase();
            serialNumber = SerialNumber.reconstitute(`VIRT${hex}`);
        }

        return new Device({
            id,
            serialNumber,
            model,
            brand: null,
            deviceType,
            assignedUserId: customerId,
            assignedUserName: null,
            status: DeviceStatus.VIRTUAL,
            isVirtual: true,
            lastSyncAt: new Date(0),
            createdAt: new Date(),
        });
    }

    /**
     * Reconstituye un dispositivo a partir de sus propiedades.
     * @param id ID del dispositivo
     * @param serialNumber Número de serie del dispositivo
     * @param model Modelo del dispositivo
     * @param brand Marca del dispositivo
     * @param deviceType Tipo de dispositivo
     * @param assignedUserId ID del usuario asignado
     * @param assignedUserName Nombre del usuario asignado
     * @param status Estado del dispositivo
     * @param isVirtual Indica si el dispositivo es virtual
     * @param lastSyncAt Fecha de la última sincronización
     * @param createdAt Fecha de creación
     * @returns Dispositivo reconstituido
     * 
     * @example
     * const device = Device.reconstitute(
     *   '123e4567-e89b-12d3-a456-426614174000',
     *   '1234567890',
     *   'iPhone 12',
     *   'Apple',
     *   'Smartphone',
     *   '123e4567-e89b-12d3-a456-426614174000',
     *   'John Doe',
     *   DeviceStatus.SYNCED,
     *   false,
     *   new Date(),
     *   new Date(),
     * );
     * @description
     * Este método es utilizado por el repositorio para reconstituir un dispositivo a partir de sus propiedades.
     * No realiza validaciones, simplemente crea una instancia de Device con las propiedades proporcionadas.
     */
    static reconstitute(
        id: DeviceId,
        serialNumber: SerialNumber,
        model: string | null,
        brand: string | null,
        deviceType: string | null,
        assignedUserId: string | null,
        assignedUserName: string | null,
        status: DeviceStatus,
        isVirtual: boolean,
        lastSyncAt: Date,
        createdAt: Date,
    ): Device {
        return new Device({
            id, serialNumber, model, brand, deviceType,
            assignedUserId, assignedUserName,
            status, isVirtual, lastSyncAt, createdAt,
        });
    }
}
