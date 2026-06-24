import { Result } from '@app/result';
import { RequestId, TechnicianId, CustomerId, CornerId, CompanyId, IssueTypeId, DeviceId } from '../value-objects/ids';
import { ServiceNowId } from '../value-objects/servicenow-id.value';
import { ServiceNowNumber } from '../value-objects/servicenow-number.value';
import { DomainEvent } from '@app/shared/domain-event';

export interface RequestProps {
    id: RequestId;
    issueTypeId: IssueTypeId;
    technicianId: TechnicianId;
    customerId: CustomerId;
    cornerId: CornerId;
    companyId: CompanyId;
    deviceId: DeviceId | null;
    status: string;
    scheduledAt: Date;
    servicenowId: ServiceNowId | null;
    servicenowNumber: ServiceNowNumber | null;
    snowqCorrelationId: string | null;
    notes: string | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export class Request {
    private _events: DomainEvent[] = [];

    private constructor(private props: RequestProps) { }

    // Getters
    get id(): RequestId { return this.props.id; }
    get issueTypeId(): IssueTypeId { return this.props.issueTypeId; }
    get technicianId(): TechnicianId { return this.props.technicianId; }
    get customerId(): CustomerId { return this.props.customerId; }
    get cornerId(): CornerId { return this.props.cornerId; }
    get companyId(): CompanyId { return this.props.companyId; }
    get servicenowId(): ServiceNowId | null { return this.props.servicenowId; }
    get servicenowNumber(): ServiceNowNumber | null { return this.props.servicenowNumber; }
    get snowqCorrelationId(): string | null { return this.props.snowqCorrelationId; }
    get notes(): string | null { return this.props.notes; }

    /** Persiste el correlationId de api-snowq-service cuando el ticket fue encolado; null para limpiar. */
    setSnowqCorrelationId(correlationId: string | null): void {
        this.props.snowqCorrelationId = correlationId;
        this.props.updatedAt = new Date();
    }
    get deviceId(): DeviceId | null { return this.props.deviceId; }

    attachDevice(deviceId: string): void {
        this.props.deviceId = DeviceId(deviceId as any);
        this.props.updatedAt = new Date();
    }

    get status(): string { return this.props.status; }
    get scheduledAt(): Date { return this.props.scheduledAt; }
    get closedAt(): Date | null { return this.props.closedAt; }

    // Métodos de ServiceNow
    updateServiceNowInfo(
        servicenowId: ServiceNowId,
        servicenowNumber: ServiceNowNumber
    ): Result<void> {
        this.props.servicenowId = servicenowId;
        this.props.servicenowNumber = servicenowNumber;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    getServiceNowTicketInfo(): Record<string, any> {
        return {
            company_sys_id: null, // Se llena desde Company (por companyId)
            category: null,       // Se llena desde IssueType
            assignment_group: null, // Se llena desde CompanyIssueConfig
            location: null,       // Se llena desde Corner
            short_description: `${this.props.id} - Request`,
            description: this.props.notes || 'Request created by technician',
            caller_id: this.props.technicianId,
            requested_for: this.props.customerId
        };
    }

    // Event sourcing
    private addEvent(event: DomainEvent): void {
        this._events.push(event);
    }

    pullEvents(): DomainEvent[] {
        const events = [...this._events];
        this._events = [];
        return events;
    }

    changeStatus(status: string, technicianId: TechnicianId, comment?: string): Result<void> {
        this.props.status = status;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    static reconstitute(
        id: RequestId,
        issueTypeId: IssueTypeId,
        technicianId: TechnicianId,
        customerId: CustomerId,
        cornerId: CornerId,
        companyId: CompanyId,
        deviceId: DeviceId | null,
        status: string,
        scheduledAt: Date,
        servicenowId: ServiceNowId | null,
        servicenowNumber: ServiceNowNumber | null,
        notes: string | null,
        closedAt: Date | null,
        createdAt: Date,
        updatedAt: Date,
        snowqCorrelationId: string | null = null,
    ): Request {
        return new Request({
            id,
            issueTypeId,
            technicianId,
            customerId,
            cornerId,
            companyId,
            deviceId,
            status,
            scheduledAt,
            servicenowId,
            servicenowNumber,
            snowqCorrelationId,
            notes,
            closedAt,
            createdAt,
            updatedAt,
        });
    }

    toJSON() { return { ...this.props }; }

    // Factory method
    static create(
        id: RequestId,
        issueTypeId: IssueTypeId,
        technicianId: TechnicianId,
        customerId: CustomerId,
        cornerId: CornerId,
        companyId: CompanyId,
        scheduledAt: Date,
        notes?: string
    ): Result<Request> {
        const now = new Date();
        const request = new Request({
            id,
            issueTypeId,
            technicianId,
            customerId,
            cornerId,
            companyId,
            deviceId: null,
            status: 'CREATED',
            scheduledAt,
            servicenowId: null,
            servicenowNumber: null,
            snowqCorrelationId: null,
            notes: notes || null,
            closedAt: null,
            createdAt: now,
            updatedAt: now
        });

        return Result.ok(request);
    }
}