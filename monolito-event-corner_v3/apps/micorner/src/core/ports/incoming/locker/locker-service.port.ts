import { Result } from '@app/result';
import { Locker } from '../../../domain/entities/locker.entity';
import { LockerStatus } from '../../../domain/enums/locker-status.enum';
import { CornerId, IncidentId, LockerId } from '@app/shared/types/branded-ids';

export interface CreateLockerCommand {
    lockerId?: LockerId;
    cornerId: CornerId;
    lockerCode: string;
    description?: string;
}

export interface ILockerService {
    createLocker(command: CreateLockerCommand): Promise<Result<Locker>>;
    updateLockerStatus(id: LockerId, status: LockerStatus): Promise<Result<void>>;
    assignLockerToIncident(lockerId: LockerId, incidentId: IncidentId): Promise<Result<void>>;
    releaseLocker(lockerId: LockerId, incidentId: IncidentId): Promise<Result<void>>;
    getAvailableLockers(cornerId: CornerId): Promise<Result<Locker[]>>;
}
