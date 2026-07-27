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
    /** ABAC externalId de quien crea la incidencia — si resuelve a un técnico, se usa como assigned_to en ServiceNow. */
    creatorExternalId?: string;
}

export interface DeliverIncidentCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
}

export interface TakeIncidentCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
    /** Requerido si la incidencia está CLOSED o CANCELED: al tomarla se reabre (→ REOPENED) y se reprograma a este horario. */
    slotIds?: SlotId[];
}

export interface ReleaseIncidentCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
    reason?: string;
}

export interface RescheduleIncidentCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
    /** IDs de los slots nuevos (ya consultados vía GET /internal/availability). */
    slotIds: SlotId[];
}

export interface SetEstimatedCloseCommand {
    incidentId: IncidentId;
    technicianId: TechnicianId;
    estimatedCloseAt: Date;
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
     * Reprograma la cita a un nuevo horario — libera el/los slot(s) actuales
     * (a AVAILABLE si son futuros, EXPIRED si ya pasaron) y reserva los nuevos.
     * Requiere ser el técnico actualmente asignado. Permitido desde cualquier
     * estado no terminal (paridad con legacy).
     * @param {incidentId, technicianId, slotIds} command
     */
    rescheduleIncident(command: RescheduleIncidentCommand): Promise<Result<Incident>>;
    /**
     * Corrige la fecha estimada de cierre. Dato informativo, no toca slots.
     * @param {incidentId, technicianId, estimatedCloseAt} command
     */
    setEstimatedClose(command: SetEstimatedCloseCommand): Promise<Result<Incident>>;
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