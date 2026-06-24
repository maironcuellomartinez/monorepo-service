import { Result } from '@app/result';
import { LOCKER_REPOSITORY } from './tokens';
import { LockerStatus } from '@app/shared/types/incident-types';
import { Locker } from '@app/core/domain/entities/locker.entity';
import { CornerId, LockerId } from '@app/shared/types/branded-ids';

export interface ILockerRepository {
    save(locker: Locker): Promise<Result<void>>;
    findById(id: LockerId): Promise<Result<Locker | null>>;
    findByCorner(cornerId: CornerId): Promise<Result<Locker[]>>;
    findByCode(lockerCode: string): Promise<Result<Locker | null>>;
    findAvailableByCorner(cornerId: CornerId): Promise<Result<Locker[]>>;
    findByStatus(cornerId: CornerId, status: LockerStatus): Promise<Result<Locker[]>>;
    update(locker: Locker): Promise<Result<void>>;
    delete(id: LockerId | string): Promise<Result<void>>;
}

export { LOCKER_REPOSITORY };