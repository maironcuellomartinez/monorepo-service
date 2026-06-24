import { CornerId, CustomerId, IncidentId, IssueTypeId, SlotId, TechnicianId } from '@app/shared/types/branded-ids';
import { Incident } from '../../../domain/entities/incident.entity';
import { IncidentStatus } from '../../../domain/enums/incident-status.enum';
import { INCIDENT_REPOSITORY } from './tokens';
import { Result } from '@app/result';

export interface IncidentFilters {
    cornerId?: CornerId;
    customerId?: CustomerId;
    technicianId?: TechnicianId;
    /** Si es true, solo devuelve incidencias sin técnico asignado (current_technician_id IS NULL) */
    availableOnly?: boolean;
    status?: IncidentStatus[];
    fromDate?: Date;
    toDate?: Date;
    issueTypeId?: IssueTypeId;
    customerEmail?: string;
    servicenowNumber?: string;
    deviceSerial?: string;
    page?: number;
    limit?: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}

export interface IIncidentRepository {
    save(incident: Incident): Promise<Result<void>>;
    findById(id: IncidentId): Promise<Result<Incident | null>>;
    findAvailable(cornerId: CornerId): Promise<Result<Incident[]>>;
    findByStatus(cornerId: CornerId, statuses: IncidentStatus[]): Promise<Result<Incident[]>>;
    findByTechnician(technicianId: TechnicianId): Promise<Result<Incident[]>>;
    findByCustomer(customerId: CustomerId): Promise<Result<Incident[]>>;
    findByDateRange(cornerId: CornerId, start: Date, end: Date): Promise<Result<Incident[]>>;
    findWithFilters(filters: IncidentFilters): Promise<Result<PaginatedResult<Incident>>>;
    findBySlotId(slotId: SlotId): Promise<Result<Incident | null>>;
    findByServiceNowNumber(number: string): Promise<Result<Incident | null>>;
    update(incident: Incident): Promise<Result<void>>;
    saveEvents(incidentId: IncidentId, events: any[]): Promise<Result<void>>;
    /** Devuelve incidentes con snowq_correlation_id pendiente de reconciliar */
    findPendingSnowqReconciliation(): Promise<Result<Incident[]>>;
    /** Devuelve incidentes activos (no terminales) que tienen servicenow_id registrado */
    findActiveWithServiceNowId(): Promise<Result<Incident[]>>;
    /**
     * Devuelve incidentes no terminales sin servicenow_id ni snowq_correlation_id
     * creados hace más de `minAgeMinutes` minutos — candidatos a re-registro en SN.
     */
    findOrphanedSnowIncidents(minAgeMinutes: number): Promise<Result<Incident[]>>;
    /** Devuelve IDs únicos de clientes con al menos una incidencia activa */
    findActiveCustomerIds(): Promise<Result<{ customerId: string; externalId: string | null }[]>>;
    /** Devuelve la línea de tiempo de una incidencia ordenada por fecha */
    getTimeline(incidentId: IncidentId): Promise<Result<IncidentTimelineEntry[]>>;
    /** Agrega una nota manual a la línea de tiempo sin cambiar el estado */
    addNote(incidentId: IncidentId, technicianId: TechnicianId | null, comment: string): Promise<Result<void>>;
}

export interface IncidentTimelineEntry {
    activityId: string;
    incidentId: string;
    technicianId: string | null;
    technicianName: string | null;
    actionType: string;
    fromStatus: string | null;
    toStatus: string | null;
    comment: string | null;
    createdAt: Date;
}

export { INCIDENT_REPOSITORY };