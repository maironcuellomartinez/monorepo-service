import { Injectable } from '@nestjs/common';
import { IScheduleService, CreateScheduleCommand, UpdateScheduleCommand } from '../../ports/incoming/schedule/schedule-service.port';
import { IScheduleRepository } from '../../ports/outgoing/repositories/schedule-repository.port';
import { ICornerRepository } from '../../ports/outgoing/repositories/corner-repository.port';
import { ITechnicianRepository } from '../../ports/outgoing/repositories/technician-repository.port';
import { ISlotRepository } from '../../ports/outgoing/repositories/slot-repository.port';
import { IEventBus } from '../../ports/outgoing/event-bus/event-bus.port';
import { isFail, Result } from '@app/result';
import { CornerSchedule } from '../../domain/entities/corner-schedule.entity';
import { Slot } from '../../domain/entities/slot.entity';
import { ScheduleId, CornerId, SlotId, TechnicianId } from '../../domain/value-objects/ids';
import { DateRange } from '../../domain/value-objects/date-range.value';
import { DayOfWeek } from '../../domain/enums/day-of-week.enum';
import { HolidayProvider } from '@app/date';
import { getDay } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { TracingService } from '@app/observability';

@Injectable()
export class ScheduleService implements IScheduleService {
    constructor(
        private readonly scheduleRepo: IScheduleRepository,
        private readonly cornerRepo: ICornerRepository,
        private readonly technicianRepo: ITechnicianRepository,
        private readonly slotRepo: ISlotRepository,
        private readonly eventBus: IEventBus,
        private readonly holidayProvider: HolidayProvider | null,
        private readonly tracing: TracingService,
    ) { }

    /**
     * Convierte una fecha ISO "yyyy-MM-dd" a mediodía UTC para evitar que el
     * timezone del servidor desplace la fecha al día anterior al almacenarla
     * en la columna DATE de MySQL (ej: UTC-5: 00:00 UTC = 19:00 local → guarda día -1).
     */
    private readonly parseDateSafe = (dateStr: string): Date =>
        new Date(`${dateStr}T12:00:00Z`);

    async createSchedule(command: CreateScheduleCommand): Promise<Result<CornerSchedule>> {
        return this.tracing.run(
            'monolith.createSchedule',
            { kind: 'server', attributes: { 'schedule.cornerId': command.cornerId } },
            () => this._createSchedule(command),
        );
    }

    private async _createSchedule(command: CreateScheduleCommand): Promise<Result<CornerSchedule>> {
        /** Validar corner */
        const cornerResult = await this.cornerRepo.findById(command.cornerId);
        if (isFail(cornerResult)) return Result.err(cornerResult.unwrapError());
        const corner = cornerResult.unwrap();
        if (!corner) {
            return Result.err(new Error(`Corner ${command.cornerId} not found`));
        }

        const scheduleId = crypto.randomUUID() as ScheduleId;
        const scheduleResult = CornerSchedule.create(
            scheduleId,
            command.cornerId,
            command.name,
            command.dayOfWeek ?? null,
            command.startTime,
            command.endTime,
            this.parseDateSafe(command.validFrom),
            this.parseDateSafe(command.validUntil),
            command.slotDurationMinutes,
        );
        if (scheduleResult.isFailure) return scheduleResult;

        const schedule = scheduleResult.unwrap();

        // Asignar técnicos si vienen
        if (command.technicianIds && command.technicianIds.length > 0) {
            for (const techId of command.technicianIds) {
                const techResult = await this.technicianRepo.findById(techId);

                if (isFail(techResult)) return Result.err(techResult.unwrapError());
                const tech = techResult.unwrap();

                if (!tech) {
                    return Result.err(new Error(`Technician ${techId} not found`));
                }
                schedule.assignTechnician(techId);
            }
        }

        const saveResult = await this.scheduleRepo.save(schedule);
        if (saveResult.isFailure) return Result.err(saveResult.unwrapError());

        // Generar slots en background para no bloquear el request HTTP
        this.generateSlotsForSchedule(schedule.id).then(result => {
            if (result.isFailure) {
                console.error(`[ScheduleService] Error generando slots para schedule ${schedule.id}:`, result.unwrapError().message);
            }
        });

        return Result.ok(schedule);
    }

    async updateSchedule(id: ScheduleId, command: UpdateScheduleCommand): Promise<Result<CornerSchedule>> {
        return this.tracing.run(
            'monolith.updateSchedule',
            { kind: 'server', attributes: { 'schedule.id': `${id}` } },
            () => this._updateSchedule(id, command),
        );
    }

    private async _updateSchedule(id: ScheduleId, command: UpdateScheduleCommand): Promise<Result<CornerSchedule>> {
        const scheduleResult = await this.scheduleRepo.findById(id);
        if (isFail(scheduleResult)) return Result.err(scheduleResult.unwrapError());
        const schedule = scheduleResult.unwrap();
        if (!schedule) {
            return Result.err(new Error(`Schedule ${id} not found`));
        }

        // Verificar si cambios afectan la generación de slots
        const affectsSlots = command.startTime !== undefined
            || command.endTime !== undefined
            || command.validFrom !== undefined
            || command.validUntil !== undefined
            || command.slotDurationMinutes !== undefined
            || command.dayOfWeek !== undefined;

        if (affectsSlots) {
            // Bloquear si hay slots con incidencias reservadas
            const hasBooked = await this.slotRepo.hasBookedSlotsBySchedule(id.toString());
            if (hasBooked.isFailure) return Result.err(hasBooked.unwrapError());
            if (hasBooked.unwrap()) {
                return Result.err(new Error('No se puede modificar el horario: tiene turnos ya reservados en incidencias activas'));
            }

            // Eliminar slots no usados para regenerarlos con los nuevos parámetros
            const deleteResult = await this.slotRepo.deleteUnusedBySchedule(id.toString());
            if (deleteResult.isFailure) return Result.err(deleteResult.unwrapError());
        }

        schedule.update({
            name: command.name,
            dayOfWeek: command.dayOfWeek as DayOfWeek | undefined,
            startTime: command.startTime,
            endTime: command.endTime,
            validFrom: command.validFrom ? this.parseDateSafe(command.validFrom) : undefined,
            validUntil: command.validUntil ? this.parseDateSafe(command.validUntil) : undefined,
        });
        if (command.isActive !== undefined) {
            if (command.isActive) schedule.activate(); else schedule.deactivate();
        }

        const updateResult = await this.scheduleRepo.update(schedule);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        // Regenerar slots en background si se modificaron parámetros que los afectan
        if (affectsSlots) {
            this.generateSlotsForSchedule(schedule.id).then(result => {
                if (result.isFailure) {
                    console.error(`[ScheduleService] Error regenerando slots para schedule ${schedule.id}:`, result.unwrapError().message);
                } else {
                    console.log(`[ScheduleService] Slots regenerados para schedule ${schedule.id}: ${result.unwrap()}`);
                }
            });
        }

        return Result.ok(schedule);
    }

    async assignTechnicians(scheduleId: ScheduleId, technicianIds: TechnicianId[]): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.assignTechnicians',
            { kind: 'server', attributes: { 'schedule.scheduleId': `${scheduleId}` } },
            () => this._assignTechnicians(scheduleId, technicianIds),
        );
    }

    private async _assignTechnicians(scheduleId: ScheduleId, technicianIds: TechnicianId[]): Promise<Result<void>> {
        const scheduleResult = await this.scheduleRepo.findById(scheduleId);
        if (isFail(scheduleResult)) return Result.err(scheduleResult.unwrapError());

        const schedule = scheduleResult.unwrap();
        if (!schedule) {
            return Result.err(new Error(`Schedule ${scheduleId} not found`));
        }

        for (const techId of technicianIds) {
            const techResult = await this.technicianRepo.findById(techId);

            if (isFail(techResult)) return Result.err(techResult.unwrapError());

            const tech = techResult.unwrap();
            if (!tech) {
                return Result.err(new Error(`Technician ${techId} not found`));
            }
            schedule.assignTechnician(techId);
        }

        const updateResult = await this.scheduleRepo.update(schedule);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(undefined);
    }

    async deleteSchedule(id: ScheduleId): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.deleteSchedule',
            { kind: 'server', attributes: { 'schedule.id': `${id}` } },
            () => this._deleteSchedule(id),
        );
    }

    private async _deleteSchedule(id: ScheduleId): Promise<Result<void>> {
        const scheduleResult = await this.scheduleRepo.findById(id);
        if (scheduleResult.isFailure) return Result.err(scheduleResult.unwrapError());
        const schedule = scheduleResult.unwrap();
        if (!schedule) return Result.err(new Error(`Schedule ${id} not found`));

        // Bloquear solo si hay slots ya usados en incidencias (BOOKED)
        const hasBooked = await this.slotRepo.hasBookedSlotsBySchedule(id.toString());
        if (hasBooked.isFailure) return Result.err(hasBooked.unwrapError());
        if (hasBooked.unwrap()) {
            return Result.err(new Error('No se puede eliminar un horario que tiene turnos reservados en incidencias activas'));
        }

        // Eliminar slots no usados antes de borrar el schedule
        const deleteSlots = await this.slotRepo.deleteUnusedBySchedule(id.toString());
        if (deleteSlots.isFailure) return Result.err(deleteSlots.unwrapError());

        return this.scheduleRepo.delete(id);
    }

    async removeTechnician(scheduleId: ScheduleId, technicianId: TechnicianId): Promise<Result<void>> {
        return this.tracing.run(
            'monolith.removeTechnician',
            { kind: 'server', attributes: { 'schedule.scheduleId': `${scheduleId}`, 'schedule.technicianId': `${technicianId}` } },
            () => this._removeTechnician(scheduleId, technicianId),
        );
    }

    private async _removeTechnician(scheduleId: ScheduleId, technicianId: TechnicianId): Promise<Result<void>> {
        const scheduleResult = await this.scheduleRepo.findById(scheduleId);
        if (scheduleResult.isFailure) return Result.err(scheduleResult.unwrapError());
        const schedule = scheduleResult.unwrap();
        if (!schedule) {
            return Result.err(new Error(`Schedule ${scheduleId} not found`));
        }

        schedule.removeTechnician(technicianId);

        const updateResult = await this.scheduleRepo.update(schedule);
        if (updateResult.isFailure) return Result.err(updateResult.unwrapError());

        return Result.ok(undefined);
    }

    async generateSlotsForSchedule(scheduleId: ScheduleId): Promise<Result<number>> {
        const scheduleResult = await this.scheduleRepo.findById(scheduleId);
        if (scheduleResult.isFailure) return Result.err(scheduleResult.unwrapError());
        const schedule = scheduleResult.unwrap();
        if (!schedule) return Result.err(new Error(`Schedule ${scheduleId} not found`));

        // Load corner to get timezone and country
        const cornerResult = await this.cornerRepo.findById(schedule.cornerId);
        if (cornerResult.isFailure) return Result.err(cornerResult.unwrapError());
        const corner = cornerResult.unwrap();
        if (!corner) return Result.err(new Error(`Corner ${schedule.cornerId} not found`));

        if (!corner.timezone) {
            console.warn(`[SlotGen] Corner ${corner.id} no tiene timezone configurado. Los slots se generarán en UTC y se mostrarán desfasados. Configurá el timezone del corner.`);
        }
        const timezone = corner.timezone || 'America/Argentina/Buenos_Aires';
        const country = corner.country || 'AR';

        console.log(`[SlotGen] Schedule ${scheduleId} | timezone=${timezone} | startTime=${schedule.startTime} | endTime=${schedule.endTime} | validFrom=${schedule.validFrom.toISOString()} | validUntil=${schedule.validUntil.toISOString()}`);

        const slots: Slot[] = [];

        // Extraer strings de fecha desde los campos DATE de MySQL.
        // TypeORM convierte DATE → new Date('yyyy-MM-dd') = UTC midnight.
        // Usar getUTC* evita el desfase de un día que ocurre en zonas UTC- al
        // convertir UTC midnight a hora local con toZonedTime().
        const toDateStr = (d: Date): string => {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        // MySQL TIME columns return "HH:MM:SS"; take only "HH:MM"
        const startHHMM = schedule.startTime.substring(0, 5);
        const endHHMM = schedule.endTime.substring(0, 5);

        let currentStr = toDateStr(new Date(schedule.validFrom));
        const endStr = toDateStr(new Date(schedule.validUntil));

        console.log(`[SlotGen] Iterando fechas: ${currentStr} → ${endStr}`);

        while (currentStr <= endStr) {
            // Usar mediodía local para calcular día de la semana sin riesgo de DST
            const localNoon = fromZonedTime(`${currentStr}T12:00:00`, timezone);
            const dayOfWeek = this.getDayOfWeek(toZonedTime(localNoon, timezone));

            if (schedule.dayOfWeek === null || dayOfWeek === schedule.dayOfWeek) {
                const isHoliday = this.holidayProvider
                    ? await this.holidayProvider.isPublicHoliday(localNoon, country)
                    : false;

                if (!isHoliday) {
                    const dayStart = fromZonedTime(`${currentStr}T${startHHMM}:00`, timezone);
                    const dayEnd = fromZonedTime(`${currentStr}T${endHHMM}:00`, timezone);
                    console.log(`[SlotGen] ${currentStr} | dayStart=${dayStart.toISOString()} | dayEnd=${dayEnd.toISOString()}`);

                    let slotStart = dayStart;
                    while (slotStart < dayEnd) {
                        const slotEnd = new Date(slotStart.getTime() + schedule.slotDurationMinutes * 60_000);
                        if (slotEnd > dayEnd) break;

                        const range = DateRange.reconstitute(slotStart, slotEnd);
                        const slotResult = Slot.create(
                            SlotId(crypto.randomUUID()),
                            CornerId(schedule.cornerId.toString()),
                            schedule.id,
                            range,
                        );
                        if (slotResult.isSuccess) slots.push(slotResult.unwrap());

                        slotStart = slotEnd;
                    }
                }
            }

            // Avanzar al siguiente día usando UTC para evitar problemas de DST
            const [y, mo, d] = currentStr.split('-').map(Number);
            currentStr = toDateStr(new Date(Date.UTC(y, mo - 1, d + 1)));
        }

        if (slots.length > 0) {
            const saveResult = await this.slotRepo.saveMany(slots);
            if (saveResult.isFailure) return Result.err(saveResult.unwrapError());
        }

        console.log(`[SlotGen] Total slots generados: ${slots.length}`);
        return Result.ok(slots.length);
    }

    async getSchedulesByCorner(cornerId: CornerId): Promise<Result<CornerSchedule[]>> {
        return this.scheduleRepo.findByCorner(cornerId);
    }

    private getDayOfWeek(date: Date): DayOfWeek {
        const days = [DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY];
        return days[getDay(date)];
    }
}
