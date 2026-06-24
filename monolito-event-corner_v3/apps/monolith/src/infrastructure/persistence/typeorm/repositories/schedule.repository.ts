import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, LessThanOrEqual, MoreThanOrEqual, IsNull, Or } from 'typeorm';
import { IScheduleRepository } from '../../../../core/ports/outgoing/repositories/schedule-repository.port';
import { CornerScheduleEntity } from '../entities/corner-schedule.entity';
import { ScheduleAssignmentEntity } from '../entities/schedule-assignment.entity';
import { CornerSchedule } from '../../../../core/domain/entities/corner-schedule.entity';
import { ScheduleId, CornerId, TechnicianId } from '../../../../core/domain/value-objects/ids';
import { DayOfWeek, getDayOfWeekFromDate } from '../../../../core/domain/enums/day-of-week.enum';
import { Result } from '@app/result';

@Injectable()
export class TypeOrmScheduleRepository implements IScheduleRepository {
    constructor(
        @InjectRepository(CornerScheduleEntity) private readonly cornerScheduleRepository: Repository<CornerScheduleEntity>,
        @InjectRepository(ScheduleAssignmentEntity) private readonly scheduleAssignmentRepository: Repository<ScheduleAssignmentEntity>,
    ) { }

    async save(schedule: CornerSchedule): Promise<Result<void>> {
        try {
            const entity = this.toEntity(schedule);
            await this.cornerScheduleRepository.save(entity);

            // Guardar asignaciones de técnicos
            await this.scheduleAssignmentRepository.delete({ schedule_id: schedule.id.toString() });

            const assignments = schedule.technicianIds.map(techId => {
                const assignment = new ScheduleAssignmentEntity();
                assignment.schedule_id = schedule.id.toString();
                assignment.technician_id = techId.toString();
                assignment.created_at = new Date();
                return assignment;
            });

            if (assignments.length > 0) {
                await this.scheduleAssignmentRepository.save(assignments);
            }

            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findById(id: ScheduleId): Promise<Result<CornerSchedule | null>> {
        try {
            const entity = await this.cornerScheduleRepository.findOne({
                where: { schedule_id: id.toString() },
                relations: ['assignments', 'assignments.technician'],
            });
            if (!entity) return Result.ok(null);

            // Obtener IDs de técnicos
            const technicianIds = entity.assignments?.map(a => a.technician_id) || [];

            const domain = this.toDomain(entity, technicianIds);
            return Result.ok(domain);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByCorner(cornerId: CornerId): Promise<Result<CornerSchedule[]>> {
        try {
            const entities = await this.cornerScheduleRepository.find({
                where: { corner_id: cornerId.toString(), is_active: true },
                relations: ['assignments', 'assignments.technician'],
                order: { day_of_week: 'ASC', start_time: 'ASC' },
            });

            const domains = entities.map(entity => {
                const technicianIds = entity.assignments?.map(a => a.technician_id) || [];
                return this.toDomain(entity, technicianIds);
            });

            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findActiveByCornerAndDate(cornerId: CornerId, date: Date): Promise<Result<CornerSchedule[]>> {
        try {
            const dayOfWeek = getDayOfWeekFromDate(date);
            const baseWhere = {
                corner_id: cornerId,
                is_active: true,
                valid_from: LessThanOrEqual(date),
                valid_until: MoreThanOrEqual(date),
            };

            // Incluye horarios sin día (aplican a todos los días) y los del día específico
            const entities = await this.cornerScheduleRepository.find({
                where: [
                    { ...baseWhere, day_of_week: IsNull() },
                    { ...baseWhere, day_of_week: dayOfWeek },
                ],
                relations: ['assignments', 'assignments.technician'],
            });

            const domains = entities.map(entity => {
                const technicianIds = entity.assignments?.map(a => a.technician_id) || [];
                return this.toDomain(entity, technicianIds);
            });

            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async findByTechnicianAndDate(technicianId: TechnicianId, date: Date): Promise<Result<CornerSchedule[]>> {
        try {
            const dayOfWeek = getDayOfWeekFromDate(date);

            const assignments = await this.scheduleAssignmentRepository.find({
                where: { technician_id: technicianId },
                relations: ['schedule'],
            });

            const scheduleIds = assignments.map(a => a.schedule_id);

            if (scheduleIds.length === 0) return Result.ok([]);

            const baseWhere = {
                schedule_id: In(scheduleIds),
                is_active: true,
                valid_from: LessThanOrEqual(date),
                valid_until: MoreThanOrEqual(date),
            };

            const entities = await this.cornerScheduleRepository.find({
                where: [
                    { ...baseWhere, day_of_week: IsNull() },
                    { ...baseWhere, day_of_week: dayOfWeek },
                ],
                relations: ['assignments', 'assignments.technician'],
            });

            const domains = entities.map(entity => {
                const techIds = entity.assignments?.map(a => a.technician_id) || [];
                return this.toDomain(entity, techIds);
            });

            return Result.ok(domains);
        } catch (error) {
            return Result.err(error);
        }
    }

    async update(schedule: CornerSchedule): Promise<Result<void>> {
        return this.save(schedule);
    }

    async delete(id: ScheduleId | string): Promise<Result<void>> {
        try {
            await this.cornerScheduleRepository.delete({ schedule_id: id.toString() });
            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async assignTechnicians(scheduleId: ScheduleId, technicianIds: TechnicianId[]): Promise<Result<void>> {
        try {
            // Eliminar asignaciones existentes
            await this.scheduleAssignmentRepository.delete({ schedule_id: scheduleId });

            // Crear nuevas asignaciones
            const assignments = technicianIds.map(techId => {
                const assignment = new ScheduleAssignmentEntity();
                assignment.schedule_id = scheduleId;
                assignment.technician_id = techId;
                assignment.created_at = new Date();
                return assignment;
            });

            if (assignments.length > 0) {
                await this.scheduleAssignmentRepository.save(assignments);
            }

            return Result.ok(undefined);
        } catch (error) {
            return Result.err(error);
        }
    }

    async getTechnicianIds(scheduleId: ScheduleId): Promise<Result<TechnicianId[]>> {
        try {
            const assignments = await this.scheduleAssignmentRepository.find({
                where: { schedule_id: scheduleId },
            });

            const ids = assignments.map(a => a.technician_id);
            return Result.ok(ids.map(id => TechnicianId(id)));
        } catch (error) {
            return Result.err(error);
        }
    }

    private toEntity(domain: CornerSchedule): CornerScheduleEntity {
        const entity = new CornerScheduleEntity();
        entity.schedule_id = domain.id.toString();
        entity.corner_id = domain.cornerId.toString();
        entity.name = domain.name;
        entity.day_of_week = domain.dayOfWeek ?? null;
        entity.start_time = domain.startTime;
        entity.end_time = domain.endTime;
        entity.valid_from = domain.validFrom;
        entity.valid_until = domain.validUntil;
        entity.slot_duration_minutes = domain.slotDurationMinutes;
        entity.is_active = domain.isActive;
        entity.created_at = domain.createdAt;
        entity.updated_at = domain.updatedAt;
        return entity;
    }

    private toDomain(entity: CornerScheduleEntity, technicianIds: string[]): CornerSchedule {
        return CornerSchedule.reconstitute(
            ScheduleId(entity.schedule_id as any),
            CornerId(entity.corner_id as any),
            entity.name,
            (entity.day_of_week as DayOfWeek) ?? null,
            entity.start_time,
            entity.end_time,
            entity.valid_from,
            entity.valid_until,
            entity.slot_duration_minutes,
            entity.is_active,
            technicianIds.map(id => TechnicianId(id as any)),
            entity.created_at,
            entity.updated_at,
        );
    }

}


