// core/domain/entities/locker.entity.ts
import { Result } from '@app/result';
import { LockerStatus } from '../enums/locker-status.enum';
import { LockerId, CornerId, IncidentId } from '../value-objects/ids';

export interface LockerProps {
    id: LockerId;
    cornerId: CornerId;
    lockerCode: string;
    incidentId: IncidentId | null;
    status: LockerStatus;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export class Locker {
    private constructor(private props: LockerProps) { }

    // Getters
    get id(): LockerId { return this.props.id; }
    get cornerId(): CornerId { return this.props.cornerId; }
    get lockerCode(): string { return this.props.lockerCode; }
    get status(): LockerStatus { return this.props.status; }
    get description(): string | null { return this.props.description; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    // Métodos de negocio

    /**
     * Verifica si el locker está disponible para usar
     */
    isAvailable(): boolean {
        return this.props.status === LockerStatus.AVAILABLE;
    }

    /**
     * Verifica si el locker está ocupado
     */
    isOccupied(): boolean {
        return this.props.status === LockerStatus.OCCUPIED;
    }

    /**
     * Verifica si el locker está fuera de servicio
     */
    isOutOfService(): boolean {
        return this.props.status === LockerStatus.OUT_OF_SERVICE;
    }

    /**
     * Marca el locker como ocupado (asignado a una incidencia)
     */
    occupy(): Result<void> {
        if (this.props.status !== LockerStatus.AVAILABLE) {
            return Result.err(new Error(`Cannot occupy locker in status: ${this.props.status}`));
        }

        this.props.status = LockerStatus.OCCUPIED;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Libera el locker (desocupa)
     */
    release(): Result<void> {
        if (this.props.status !== LockerStatus.OCCUPIED) {
            return Result.err(new Error(`Cannot release locker in status: ${this.props.status}`));
        }

        this.props.status = LockerStatus.AVAILABLE;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Marca el locker como fuera de servicio (mantenimiento, dañado, etc.)
     */
    markAsOutOfService(reason?: string): void {
        this.props.status = LockerStatus.OUT_OF_SERVICE;
        if (reason) {
            this.props.description = reason;
        }
        this.props.updatedAt = new Date();
    }

    /**
     * Pone el locker nuevamente en servicio
     */
    putBackInService(): Result<void> {
        if (this.props.status !== LockerStatus.OUT_OF_SERVICE) {
            return Result.err(new Error(`Locker is not out of service: ${this.props.status}`));
        }

        this.props.status = LockerStatus.AVAILABLE;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Actualiza la descripción del locker
     */
    updateDescription(description: string | null): void {
        this.props.description = description;
        this.props.updatedAt = new Date();
    }

    /**
     * Verifica si el locker pertenece a un corner específico
     */
    belongsToCorner(cornerId: CornerId): boolean {
        return this.props.cornerId === cornerId;
    }

    /**
     * Transfiere el locker a otro corner
     */
    transferToCorner(newCornerId: CornerId): void {
        this.props.cornerId = newCornerId;
        this.props.updatedAt = new Date();
    }

    assignToIncident(incidentId: IncidentId): void {
        this.props.incidentId = incidentId;
        this.props.updatedAt = new Date();
    }

    changeStatus(status: LockerStatus): void {
        this.props.status = status;
        this.props.updatedAt = new Date();
    }

    toJSON() { return { ...this.props }; }

    // Factory method
    static create(
        id: LockerId,
        cornerId: CornerId,
        lockerCode: string,
        description?: string | null
    ): Result<Locker> {
        if (!lockerCode || lockerCode.trim().length === 0) {
            return Result.err(new Error('Locker code is required'));
        }

        // Validar formato del código (ej: "LK-001", "A12", etc.)
        if (lockerCode.length < 2 || lockerCode.length > 20) {
            return Result.err(new Error('Locker code must be between 2 and 20 characters'));
        }

        const now = new Date();
        const locker = new Locker({
            id,
            cornerId,
            lockerCode: lockerCode.trim().toUpperCase(),
            incidentId: null,
            status: LockerStatus.AVAILABLE,
            description: description || null,
            createdAt: now,
            updatedAt: now,
        });

        return Result.ok(locker);
    }

    /**
     * Reconstruye un locker desde persistencia
     */
    static reconstitute(
        id: LockerId,
        cornerId: CornerId,
        lockerCode: string,
        status: LockerStatus,
        description: string | null,
        createdAt: Date,
        updatedAt: Date
    ): Locker {
        const locker = new Locker({
            id,
            cornerId,
            lockerCode,
            status,
            incidentId: null,
            description,
            createdAt,
            updatedAt,
        });
        return locker;
    }
}