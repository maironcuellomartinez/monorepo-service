import { Result } from "@app/result";

export interface TechnicianAvailabilityDto {
    technicianId: string;
    name: string;
    available: boolean;
    occupiedUntil?: Date;
    currentIncidentId?: string;
}

export interface SlotAvailabilityDto {
    startTime: Date;
    endTime: Date;
    available: boolean;
    slotIds: string[];
    technicians: {
        total: number;
        available: number;
        availableNames: string[];
        occupied: Array<{
            id: string;
            name: string;
            occupiedUntil: Date | null;
        }>;
    };
    occupiedSlots?: string[];
    /** true si todos los slots de la ventana están HELD por el usuario solicitante (ya en su lote) */
    heldByCurrentUser?: boolean;
}

export interface AvailabilityQuery {
    cornerId: string;
    date: Date;
    duration: number; // minutos necesarios
    /** ID del técnico que consulta. Si se provee, los slots HELD por él se muestran como disponibles. */
    userId?: string;
}

export interface IAvailabilityService {
    getAvailability(query: AvailabilityQuery): Promise<Result<SlotAvailabilityDto[]>>;
    getTechniciansAvailability(cornerId: string, date: Date): Promise<Result<TechnicianAvailabilityDto[]>>;
    checkSlotAvailability(cornerId: string, startTime: Date, duration: number): Promise<Result<boolean>>;
}