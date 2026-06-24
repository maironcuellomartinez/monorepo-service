import { Result } from '@app/result';
import { Technician } from '../../../domain/entities/technician.entity';
import { DomainError } from '../../../domain/errors/domain-error';
import { CornerId, TechnicianId } from '@app/shared/types/branded-ids';

export interface CreateTechnicianCommand {
    /** monolithUserId del User al que se vincula este técnico */
    userId: string;
    name: string;
    email: string;
    cornerId?: CornerId | string;
    lastName?: string;
    fullName?: string;
}

export interface UpdateTechnicianCommand {
    name?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    cornerId?: CornerId;
}

export interface ITechnicianService {
    createTechnician(command: CreateTechnicianCommand): Promise<Result<Technician>>;
    updateTechnician(id: TechnicianId, command: UpdateTechnicianCommand): Promise<Result<Technician>>;
    disableTechnician(id: TechnicianId): Promise<Result<void>>;
    enableTechnician(id: TechnicianId): Promise<Result<void>>;
    deleteTechnician(id: string): Promise<Result<void>>;
    getTechnician(id: TechnicianId): Promise<Result<Technician | null>>;
    getAllTechnicians(): Promise<Result<Technician[]>>;
    getTechniciansByCorner(cornerId: CornerId): Promise<Result<Technician[]>>;
    getTechnicianByUserId(userId: string): Promise<Result<Technician | null>>;
}
