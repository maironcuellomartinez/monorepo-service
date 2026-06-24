import { Result } from '@app/result';
import { TECHNICIAN_REPOSITORY } from './tokens';
import { Technician } from '@app/core/domain/entities/technician.entity';
import { CornerId, TechnicianId } from '@app/shared/types/branded-ids';

export interface ITechnicianRepository {
    save(technician: Technician): Promise<Result<void>>;
    findAll(): Promise<Result<Technician[]>>;
    findById(id: TechnicianId): Promise<Result<Technician | null>>;
    findByCorner(cornerId: CornerId): Promise<Result<Technician[]>>;
    findByEmail(email: string): Promise<Result<Technician | null>>;
    findByUserId(userId: string): Promise<Result<Technician | null>>;
    findAvailableByCorner(cornerId: CornerId): Promise<Result<Technician[]>>;
    update(technician: Technician): Promise<Result<void>>;
    delete(id: TechnicianId): Promise<Result<void>>;
    findByIds(ids: string[]): Promise<Result<Technician[]>>;
}

export { TECHNICIAN_REPOSITORY };