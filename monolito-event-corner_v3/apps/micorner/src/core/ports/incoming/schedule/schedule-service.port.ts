import { Result } from '@app/result';
import { CornerSchedule } from '../../../domain/entities/corner-schedule.entity';
import { DayOfWeek } from '../../../domain/enums/day-of-week.enum';
import { CornerId, ScheduleId, TechnicianId } from '@app/shared/types/branded-ids';

export interface CreateScheduleCommand {
    cornerId: CornerId;
    name: string;
    dayOfWeek?: DayOfWeek | null;
    startTime: string;
    endTime: string;
    validFrom: string;
    validUntil: string;
    slotDurationMinutes: number;
    technicianIds?: TechnicianId[];
}

export interface UpdateScheduleCommand {
    name?: string;
    dayOfWeek?: DayOfWeek;
    startTime?: string;
    endTime?: string;
    validFrom?: string;
    validUntil?: string;
    slotDurationMinutes?: number;
    isActive?: boolean;
}

export interface IScheduleService {
    createSchedule(command: CreateScheduleCommand): Promise<Result<CornerSchedule>>;
    updateSchedule(id: ScheduleId, command: UpdateScheduleCommand): Promise<Result<CornerSchedule>>;
    deleteSchedule(id: ScheduleId): Promise<Result<void>>;
    assignTechnicians(scheduleId: ScheduleId, technicianIds: TechnicianId[]): Promise<Result<void>>;
    removeTechnician(scheduleId: ScheduleId, technicianId: TechnicianId): Promise<Result<void>>;
    generateSlotsForSchedule(scheduleId: ScheduleId): Promise<Result<number>>;
    getSchedulesByCorner(cornerId: CornerId): Promise<Result<CornerSchedule[]>>;
}
