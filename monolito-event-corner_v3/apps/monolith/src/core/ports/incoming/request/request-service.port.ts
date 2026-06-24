import { Result } from '@app/result';
import { Request } from '../../../domain/entities/request.entity';
import { IssueTypeId, TechnicianId, UserId, CornerId, CompanyId, RequestId } from '@app/shared/types/branded-ids';

export interface CreateRequestCommand {
    issueTypeId: IssueTypeId;
    technicianId: TechnicianId;
    customerId: UserId;
    cornerId: CornerId;
    companyId: CompanyId;
    scheduledAt: Date | string;
    notes?: string;
    device: {
        serialNumber: string;
    };
}

export interface UpdateRequestStatusCommand {
    requestId: RequestId;
    technicianId: TechnicianId;
    newStatus: string;
    comment?: string;
}

export interface IRequestService {
    createRequest(command: CreateRequestCommand): Promise<Result<Request>>;
    updateRequestStatus(command: UpdateRequestStatusCommand): Promise<Result<Request>>;
    getRequest(id: RequestId): Promise<Result<Request | null>>;
    getRequestsByTechnician(technicianId: TechnicianId): Promise<Result<Request[]>>;
    getRequestsByCustomer(customerId: UserId): Promise<Result<Request[]>>;
}
