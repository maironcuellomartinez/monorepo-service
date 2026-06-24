import { Result } from '@app/result';
import { Request } from '../../../domain/entities/request.entity';
import { RequestId, TechnicianId, CustomerId, CompanyId } from '../../../domain/value-objects/ids';
import { REQUEST_REPOSITORY } from './tokens';
import { PaginatedResult } from './incident-repository.port';

export interface RequestFilters {
    technicianId?: string;
    customerId?: string;
    companyId?: string;
    cornerId?: string;
    status?: string[];
    fromDate?: Date;
    toDate?: Date;
    issueTypeId?: string;
    page?: number;
    limit?: number;
}

export interface IRequestRepository {
    save(request: Request): Promise<Result<void>>;
    findById(id: RequestId | string): Promise<Result<Request | null>>;
    findByTechnician(technicianId: string | TechnicianId): Promise<Result<Request[]>>;
    findByCustomer(customerId: string | CustomerId): Promise<Result<Request[]>>;
    findByCompany(companyId: string | CompanyId): Promise<Result<Request[]>>;
    findByCorner(cornerId: string): Promise<Result<Request[]>>;
    findByDateRange(start: Date, end: Date): Promise<Result<Request[]>>;
    findWithFilters(filters: RequestFilters): Promise<Result<PaginatedResult<Request>>>;
    findByServiceNowNumber(number: string): Promise<Result<Request | null>>;
    update(request: Request): Promise<Result<void>>;
    delete(id: RequestId | string): Promise<Result<void>>;
    saveEvents(requestId: string, events: any[]): Promise<Result<void>>;
    /** Devuelve requests con snowq_correlation_id pendiente de reconciliar */
    findPendingSnowqReconciliation(): Promise<Result<Request[]>>;
}

export { REQUEST_REPOSITORY };
export { PaginatedResult };