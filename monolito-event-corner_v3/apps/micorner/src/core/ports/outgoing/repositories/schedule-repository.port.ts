import { Result } from '@app/result';
import { CornerSchedule } from '../../../domain/entities/corner-schedule.entity';
import { ScheduleId, CornerId } from '../../../domain/value-objects/ids';
import { SCHEDULE_REPOSITORY } from './tokens';

export interface IScheduleRepository {
    save(schedule: CornerSchedule): Promise<Result<void>>;
    findById(id: ScheduleId | string): Promise<Result<CornerSchedule | null>>;
    findByCorner(cornerId: string | CornerId): Promise<Result<CornerSchedule[]>>;
    findActiveByCornerAndDate(cornerId: string, date: Date): Promise<Result<CornerSchedule[]>>;
    findByTechnicianAndDate(technicianId: string, date: Date): Promise<Result<CornerSchedule[]>>;
    update(schedule: CornerSchedule): Promise<Result<void>>;
    delete(id: ScheduleId | string): Promise<Result<void>>;
    assignTechnicians(scheduleId: string, technicianIds: string[]): Promise<Result<void>>;
    getTechnicianIds(scheduleId: string): Promise<Result<string[]>>;
}

export { SCHEDULE_REPOSITORY };