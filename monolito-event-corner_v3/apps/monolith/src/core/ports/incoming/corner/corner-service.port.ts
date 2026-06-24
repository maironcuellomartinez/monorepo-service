import { Result } from '@app/result';
import { Corner } from '../../../domain/entities/corner.entity';
import { DayOfWeek } from '../../../domain/enums/day-of-week.enum';

export interface CreateCornerCommand {
    name: string;
    onlyTechnicians?: boolean;
    servicenowLocation?: string;
    clientName?: string;
    description?: string;
}

export interface UpdateCornerCommand {
    name?: string;
    clientName?: string;
    description?: string;
    servicenowLocation?: string;
    latitude?: number;
    longitude?: number;
    onlyTechnicians?: boolean;
    isActive?: boolean;
    timezone?: string;
    country?: string;
    city?: string | null;
}

export interface AddScheduleCommand {
    cornerId: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
}

export interface ICornerService {
    createCorner(command: CreateCornerCommand): Promise<Result<Corner>>;
    updateCorner(id: string, command: UpdateCornerCommand): Promise<Result<Corner>>;
    getCorner(id: string): Promise<Result<Corner | null>>;
    getAllActiveCorners(): Promise<Result<Corner[]>>;
    addSchedule(command: AddScheduleCommand): Promise<Result<void>>;
    removeSchedule(scheduleId: string): Promise<Result<void>>;
}
