import { Result } from '@app/result';
import { Incident } from '../../../domain/entities/incident.entity';
import { IncidentStatus } from '../../../domain/enums/incident-status.enum';
import { CornerId, CustomerId, IncidentId, IssueTypeId, SlotId, TechnicianId, UserId } from '@app/shared/types/branded-ids';

export interface CreateIncidentCommand {
    issueTypeId: IssueTypeId; // Tipos de incidencias
    customerId: UserId; // ID del cliente
    cornerId: CornerId; // ID de la esquina
    slotIds: SlotId[]; // IDs de los slots que ocupará
    origin: string; // Origen de la incidencia
    device: {
        serialNumber: string;
    };
    lockerId?: string;
    metadata?: Record<string, any>;
    /** ID del técnico que generó holds sobre los slots (lote). Si presente, convierte HELD → BOOKED en lugar de AVAILABLE → BOOKED. */
    heldByUserId?: string;
}

export interface DeliverIncidentCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
}

export interface TakeIncidentCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
}

export interface ReleaseIncidentCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
    reason?: string;
}

export interface ChangeIncidentStatusCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
    newStatus: IncidentStatus;
    comment?: string;
    closeCategory?: string;
}

export interface BatchStatusChangeItem {
    incidentId: string;
    targetStatus: IncidentStatus;
    technicianId: string;
    comment?: string;
    closeCategory?: string;
    reason?: string;
}

export interface BatchChangeResult {
    processed: number;
    skipped: number;
    failed: number;
    errors: Array<{ incidentId: string; reason: string }>;
}

export interface ValidateIncidentCommand {
    incidentId: IncidentId;
    customerId: CustomerId;
}

export interface ReopenIncidentCommand {
    incidentId: IncidentId;
    customerId: CustomerId;
    reason?: string;
}

export interface CancelIncidentCommand {
    incidentId: IncidentId;
    customerId: CustomerId;
    reason?: string;
}

export interface CloseFromExternalSyncCommand {
    incidentId: IncidentId;
    comment?: string;
}

/**
 * Interfaz del servicio de incidencias
 */
export interface IIncidentService {
    /**
     * Crea una incidencia
     * @param {issueTypeId, customerId, cornerId, slotIds, origin, device, lockerId, metadata} command 
     */
    createIncident(command: CreateIncidentCommand): Promise<Result<Incident>>;
    /**
     * Técnico registra que el cliente entregó el dispositivo → DELIVERED
     * @param {incidentId, technicianId} command 
     */
    deliverIncident(command: DeliverIncidentCommand): Promise<Result<Incident>>;
    /**
     * Técnico toma la incidencia
     * @param {incidentId, technicianId} command 
     */
    takeIncident(command: TakeIncidentCommand): Promise<Result<Incident>>;
    /**
     * Libera la incidencia
     * @param {incidentId, technicianId, reason} command 
     */
    releaseIncident(command: ReleaseIncidentCommand): Promise<Result<Incident>>;
    /**
     * Cambia el estado de la incidencia
     * @param {incidentId, technicianId, newStatus, comment} command 
     */
    changeStatus(command: ChangeIncidentStatusCommand): Promise<Result<Incident>>;
    /**
     * Usuario valida la solución → VALIDATED (terminal)
     * @param {incidentId, customerId} command 
     */
    validateIncident(command: ValidateIncidentCommand): Promise<Result<Incident>>;
    /**
     * Usuario rechaza la solución → REOPENED (vuelve al pool)
     * @param {incidentId, customerId, reason} command 
     */
    reopenIncident(command: ReopenIncidentCommand): Promise<Result<Incident>>;
    /**
     * Cliente cancela su incidencia → CANCELED (solo desde CREATED)
     * @param {incidentId, customerId, reason} command
     */
    cancelIncident(command: CancelIncidentCommand): Promise<Result<Incident>>;
    /**
     * Cierra la incidencia por señal externa autoritativa (SnowSyncJob: SN ya la cerró).
     * A diferencia de changeStatus(), acepta cualquier estado activo como origen — no
     * solo PENDING_PICKUP/PENDING_REPLACEMENT_DELIVERY.
     */
    closeFromExternalSync(command: CloseFromExternalSyncCommand): Promise<Result<Incident>>;
    /**
     * Obtiene una incidencia por su ID
     * @param {incidentId} id 
     */
    getIncident(id: IncidentId): Promise<Result<Incident | null>>;
    /**
     * Obtiene las incidencias disponibles para un técnico
     * @param {cornerId} cornerId 
     */
    getAvailableIncidents(cornerId: CornerId): Promise<Result<Incident[]>>;
    /**
     * Obtiene las incidencias de un técnico
     * @param {technicianId} technicianId 
     */
    getTechnicianIncidents(technicianId: TechnicianId): Promise<Result<Incident[]>>;
    /**
     * Obtiene las incidencias de una fecha
     * @param {cornerId} cornerId
     * @param {date} date
     */
    getIncidentsByDate(cornerId: CornerId, date: Date): Promise<Result<Incident[]>>;
    /**
     * Cambia el estado de N incidencias en lote.
     * Soporta transiciones heterogéneas (CLOSED, REOPENED, IN_PROGRESS, etc.).
     * Responde de forma síncrona con un resumen; la notificación a ServiceNow es asíncrona vía Outbox.
     */
    batchChangeStatus(items: BatchStatusChangeItem[]): Promise<Result<BatchChangeResult>>;
}