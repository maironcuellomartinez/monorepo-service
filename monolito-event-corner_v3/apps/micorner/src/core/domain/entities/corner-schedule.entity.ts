import { ScheduleId, CornerId, TechnicianId } from '../value-objects/ids';
import { DayOfWeek } from '../enums/day-of-week.enum';
import { DateRange } from '../value-objects/date-range.value';
import { Result } from '@app/result';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

export class CornerSchedule {
    private constructor(
        private readonly _id: ScheduleId,
        private readonly _cornerId: CornerId,
        private _name: string,
        private _dayOfWeek: DayOfWeek | null,
        private _startTime: string, // formato "HH:MM"
        private _endTime: string,   // formato "HH:MM"
        private _validFrom: Date,
        private _validUntil: Date,
        private _slotDurationMinutes: number,
        private _isActive: boolean,
        private _technicianIds: TechnicianId[],
        private readonly _createdAt: Date,
        private _updatedAt: Date
    ) { }

    // Getters
    /**
     * ID del horario
     * @returns ID del horario
     */
    get id(): ScheduleId { return this._id; }
    /**
     * ID del corner
     * @returns ID del corner
     */
    get cornerId(): CornerId { return this._cornerId; }
    /**
     * Nombre del horario
     * @returns Nombre del horario
     */
    get name(): string { return this._name; }
    /**
     * Día de la semana
     * @returns Día de la semana
     */
    get dayOfWeek(): DayOfWeek | null { return this._dayOfWeek; }
    /**
     * Hora de inicio
     * @returns Hora de inicio
     */
    get startTime(): string { return this._startTime; }
    /**
     * Hora de fin
     * @returns Hora de fin
     */
    get endTime(): string { return this._endTime; }
    /**
     * Fecha de inicio
     * @returns Fecha de inicio
     */
    get validFrom(): Date { return new Date(this._validFrom); }
    /**
     * Fecha de fin
     * @returns Fecha de fin
     */
    get validUntil(): Date { return new Date(this._validUntil); }
    /**
     * Duración del slot en minutos
     * @returns Duración del slot en minutos
     */
    get slotDurationMinutes(): number { return this._slotDurationMinutes; }
    /**
     * Indica si el horario está activo
     * @returns true si el horario está activo, false en caso contrario
     */
    get isActive(): boolean { return this._isActive; }
    /**
     * IDs de los técnicos asignados
     * @returns IDs de los técnicos asignados
     */
    get technicianIds(): TechnicianId[] { return [...this._technicianIds]; }
    /**
 * Fecha de creación del horario
 * @returns Fecha de creación del horario
 */
    get createdAt(): Date { return new Date(this._createdAt); }
    /**
     * Fecha de última actualización del horario
     * @returns Fecha de última actualización del horario
     */
    get updatedAt(): Date { return new Date(this._updatedAt); }
    toJSON() {
        return {
            id: this._id,
            cornerId: this._cornerId,
            name: this._name,
            dayOfWeek: this._dayOfWeek,
            startTime: this._startTime,
            endTime: this._endTime,
            validFrom: this._validFrom,
            validUntil: this._validUntil,
            slotDurationMinutes: this._slotDurationMinutes,
            isActive: this._isActive,
            technicianIds: this._technicianIds,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
        };
    }

    // Métodos de negocio
    /**
     * Verifica si el horario está activo en una fecha específica
     * @example
     * const isActive = cornerSchedule.isActiveOnDate(new Date());
     * @param date Fecha
     * @returns true si el horario está activo, false en caso contrario
     * @description Verifica si el horario está activo en una fecha específica
     */
    isActiveOnDate(date: Date, timezone: string = 'UTC'): boolean {
        if (!this._isActive) return false;

        const zonedDate = toZonedTime(date, timezone);
        const zonedFrom = toZonedTime(this._validFrom, timezone);
        const zonedUntil = toZonedTime(this._validUntil, timezone);

        const dateStr = format(zonedDate, 'yyyy-MM-dd');
        const fromStr = format(zonedFrom, 'yyyy-MM-dd');
        const untilStr = format(zonedUntil, 'yyyy-MM-dd');

        const inRange = dateStr >= fromStr && dateStr <= untilStr;
        if (!inRange) return false;
        // null = aplica a todos los días del rango
        if (this._dayOfWeek === null) return true;
        return this.getDayOfWeekFromDate(zonedDate) === this._dayOfWeek;
    }

    /**
     * Obtiene el rango de fechas del horario
     * @example
     * const dateRange = cornerSchedule.getTimeRangeForDate(new Date());
     * @param date Fecha
     * @returns Rango de fechas
     * @description Obtiene el rango de fechas del horario
     */
    getTimeRangeForDate(date: Date, timezone: string = 'UTC'): Result<DateRange> {
        if (!this.isActiveOnDate(date, timezone)) {
            return Result.err(new Error('Schedule is not active on this date'));
        }

        const dateStr = format(toZonedTime(date, timezone), 'yyyy-MM-dd');
        const startDateTime = fromZonedTime(`${dateStr}T${this._startTime}:00`, timezone);
        const endDateTime = fromZonedTime(`${dateStr}T${this._endTime}:00`, timezone);

        return DateRange.create(startDateTime, endDateTime);
    }

    /**
     * Asigna un técnico al horario
     * @example
     * const result = cornerSchedule.assignTechnician(TechnicianId.create());
     * @param technicianId ID del técnico
     * @returns Resultado de la operación
     * @description Asigna un técnico al horario
     */
    assignTechnician(technicianId: TechnicianId): Result<void> {
        if (this._technicianIds.some(id => id === technicianId)) {
            return Result.err(new Error('Technician already assigned to this schedule'));
        }

        this._technicianIds.push(technicianId);
        this._updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Elimina un técnico del horario
     * @example
     * const result = cornerSchedule.removeTechnician(TechnicianId.create());
     * @param technicianId ID del técnico
     * @returns Resultado de la operación
     * @description Elimina un técnico del horario
     */
    removeTechnician(technicianId: TechnicianId): Result<void> {
        const initialLength = this._technicianIds.length;
        this._technicianIds = this._technicianIds.filter(id => id !== technicianId);

        if (this._technicianIds.length === initialLength) {
            return Result.err(new Error('Technician not found in this schedule'));
        }

        this._updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Verifica si el horario tiene un técnico asignado
     * @example
     * const hasTechnician = cornerSchedule.hasTechnician(TechnicianId.create());
     * @param technicianId ID del técnico
     * @returns true si el horario tiene un técnico asignado, false en caso contrario
     * @description Verifica si el horario tiene un técnico asignado
     */
    hasTechnician(technicianId: TechnicianId): boolean {
        return this._technicianIds.some(id => id === technicianId);
    }

    /**
     * Activa el horario
     * @example
     * cornerSchedule.activate();
     * @description Activa el horario
     */
    update(fields: {
        name?: string;
        dayOfWeek?: DayOfWeek;
        startTime?: string;
        endTime?: string;
        validFrom?: Date;
        validUntil?: Date;
    }): void {
        if (fields.name !== undefined) this._name = fields.name;
        if (fields.dayOfWeek !== undefined) this._dayOfWeek = fields.dayOfWeek;
        if (fields.startTime !== undefined) this._startTime = fields.startTime;
        if (fields.endTime !== undefined) this._endTime = fields.endTime;
        if (fields.validFrom !== undefined) this._validFrom = fields.validFrom;
        if (fields.validUntil !== undefined) this._validUntil = fields.validUntil;
        this._updatedAt = new Date();
    }

    activate(): void {
        this._isActive = true;
        this._updatedAt = new Date();
    }

    /**
     * Desactiva el horario
     * @example
     * cornerSchedule.deactivate();
     * @description Desactiva el horario
     */
    deactivate(): void {
        this._isActive = false;
        this._updatedAt = new Date();
    }

    /**
     * Obtiene el día de la semana de una fecha
     * @example
     * const dayOfWeek = cornerSchedule.getDayOfWeekFromDate(new Date());
     * @param date Fecha
     * @returns Día de la semana
     * @description Obtiene el día de la semana de una fecha
     */
    private getDayOfWeekFromDate(date: Date): DayOfWeek {
        const days = [
            DayOfWeek.SUNDAY,
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY,
            DayOfWeek.SATURDAY
        ];
        return days[date.getDay()];
    }

    /**
     * Crea un nuevo horario
     * @example
     * const cornerSchedule = CornerSchedule.create(
     *     ScheduleId.create(),
     *     CornerId.create(),
     *     'Schedule Name',
     *     DayOfWeek.MONDAY,
     *     '09:00',
     *     '17:00',
     *     new Date(),
     *     new Date(),
     *     30
     * );
     * @param id ID del horario
     * @param cornerId ID del corner
     * @param name Nombre del horario
     * @param dayOfWeek Día de la semana
     * @param startTime Hora de inicio
     * @param endTime Hora de fin
     * @param validFrom Fecha de inicio
     * @param validUntil Fecha de fin
     * @param slotDurationMinutes Duración del slot en minutos
     * @returns Resultado de la operación
     * @description Crea un nuevo horario
     */
    static create(
        id: ScheduleId,
        cornerId: CornerId,
        name: string,
        dayOfWeek: DayOfWeek | null,
        startTime: string,
        endTime: string,
        validFrom: Date,
        validUntil: Date,
        slotDurationMinutes: number,
    ): Result<CornerSchedule> {
        // Validar formato de hora
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return Result.err(new Error('Invalid time format. Use HH:MM (24h format)'));
        }

        // Validar que endTime > startTime
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);

        if (startH > endH || (startH === endH && startM >= endM)) {
            return Result.err(new Error('End time must be after start time'));
        }

        // Validar fechas
        if (validFrom >= validUntil) {
            return Result.err(new Error('validFrom must be before validUntil'));
        }

        if (slotDurationMinutes < 5 || slotDurationMinutes > 240) {
            return Result.err(new Error('Slot duration must be between 5 and 240 minutes'));
        }

        const now = new Date();
        return Result.ok(new CornerSchedule(
            id, cornerId, name, dayOfWeek,
            startTime, endTime, validFrom, validUntil,
            slotDurationMinutes, true, [], now, now
        ));
    }

    /**
     * Reconstituye un horario desde el repositorio
     * @example
     * const cornerSchedule = CornerSchedule.reconstitute(
     *     ScheduleId.create(),
     *     CornerId.create(),
     *     'Schedule Name',
     *     DayOfWeek.MONDAY,
     *     '09:00',
     *     '17:00',
     *     new Date(),
     *     new Date(),
     *     30,
     *     true,
     *     [],
     *     new Date(),
     *     new Date()
     * );
     * @param id ID del horario
     * @param cornerId ID del corner
     * @param name Nombre del horario
     * @param dayOfWeek Día de la semana
     * @param startTime Hora de inicio
     * @param endTime Hora de fin
     * @param validFrom Fecha de inicio
     * @param validUntil Fecha de fin
     * @param slotDurationMinutes Duración del slot en minutos
     * @param isActive Indica si el horario está activo
     * @param technicianIds IDs de los técnicos asignados
     * @param createdAt Fecha de creación
     * @param updatedAt Fecha de última actualización
     * @returns Resultado de la operación
     * @description Reconstituye un horario desde el repositorio
     */
    static reconstitute(
        id: ScheduleId,
        cornerId: CornerId,
        name: string,
        dayOfWeek: DayOfWeek | null,
        startTime: string,
        endTime: string,
        validFrom: Date,
        validUntil: Date,
        slotDurationMinutes: number,
        isActive: boolean,
        technicianIds: TechnicianId[],
        createdAt: Date,
        updatedAt: Date,
    ): CornerSchedule {
        return new CornerSchedule(
            id, cornerId, name, dayOfWeek,
            startTime, endTime, validFrom, validUntil,
            slotDurationMinutes, isActive, technicianIds, createdAt, updatedAt
        );
    }
}