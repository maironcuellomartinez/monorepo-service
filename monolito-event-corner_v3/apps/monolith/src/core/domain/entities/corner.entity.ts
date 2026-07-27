import { CornerId } from '../value-objects/ids';
import { DayOfWeek } from '../enums/day-of-week.enum';
import { Result } from '@app/result';
import { toZonedTime } from 'date-fns-tz';

/**
 * Bloque de horario del corner
 */
export interface ScheduleBlock {
    dayOfWeek: DayOfWeek;
    startTime: string; // HH:MM format
    endTime: string;   // HH:MM format
}

/**
 * Propiedades de la entidad Corner
 */
export interface CornerProps {
    id: CornerId;
    name: string;
    /** Identificador técnico estable (slug), inmutable salvo corrección explícita. Usado como referencia externa (p.ej. ServiceNow). */
    code: string;
    clientName: string | null;
    description: string | null;
    servicenowLocation: string | null;
    snowAssignmentGroup: string | null;
    latitude: number | null;
    longitude: number | null;
    onlyTechnicians: boolean;
    isActive: boolean;
    schedules: ScheduleBlock[];
    /** IANA timezone identifier, e.g. 'America/Buenos_Aires', 'Europe/Madrid' */
    timezone: string;
    /** ISO 3166-1 alpha-2 country code, e.g. 'AR', 'ES', 'MX' */
    country: string;
    city: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** Formato de `code`: slug técnico en minúsculas (snake_case), p.ej. 'local_abelias'. */
const CODE_REGEX = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * Entidad Corner
 */
export class Corner {
    private constructor(private props: CornerProps) { }

    // Getters
    /**
     * ID del corner
     * @returns ID del corner
     */
    get id(): CornerId { return this.props.id; }

    /**
     * Nombre del corner
     * @returns Nombre del corner
     */
    get name(): string { return this.props.name; }

    /**
     * Código técnico estable del corner (slug). Referencia externa inmutable.
     * @returns Código del corner
     */
    get code(): string { return this.props.code; }

    /**
     * Nombre del cliente
     * @returns Nombre del cliente
     */
    get clientName(): string | null { return this.props.clientName; }

    /**
     * Descripción del corner
     * @returns Descripción del corner
     */
    get description(): string | null { return this.props.description; }

    /**
     * Ubicación en ServiceNow
     * @returns Ubicación en ServiceNow
     */
    get servicenowLocation(): string | null { return this.props.servicenowLocation; }

    /**
     * Grupo de asignación de ServiceNow para este corner
     * @returns Grupo de asignación o null si no está configurado
     */
    get snowAssignmentGroup(): string | null { return this.props.snowAssignmentGroup; }

    /**
     * Latitud del corner
     * @returns Latitud del corner
     */
    get latitude(): number | null { return this.props.latitude; }

    /**
     * Longitud del corner
     * @returns Longitud del corner
     */
    get longitude(): number | null { return this.props.longitude; }

    /**
     * Indica si el corner es solo para técnicos
     * @returns true si el corner es solo para técnicos, false en caso contrario
     */
    get onlyTechnicians(): boolean { return this.props.onlyTechnicians; }

    /**
     * Indica si el corner está activo
     * @returns true si el corner está activo, false en caso contrario
     */
    get isActive(): boolean { return this.props.isActive; }

    /**
     * Franjas horarias del corner
     * @returns Franjas horarias del corner
     */
    get schedules(): ScheduleBlock[] { return [...this.props.schedules]; }
    get timezone(): string { return this.props.timezone; }
    get country(): string { return this.props.country; }
    get city(): string | null { return this.props.city; }

    /**
     * Fecha de creación del corner
     * @returns Fecha de creación del corner
     */
    get createdAt(): Date { return this.props.createdAt; }

    /**
     * Fecha de última actualización del corner
     * @returns Fecha de última actualización del corner
     */
    get updatedAt(): Date { return this.props.updatedAt; }

    // Métodos de negocio

    /**
     * Verifica si el corner permite que usuarios normales creen incidencias
     * @returns true si el corner permite que usuarios normales creen incidencias, false en caso contrario
     */
    canUserCreateIncident(): boolean {
        return !this.props.onlyTechnicians;
    }

    /**
     * Añade una nueva franja horaria al corner
     * @param schedule Franja horaria a añadir
     * @returns Resultado de la operación
     */
    addSchedule(schedule: ScheduleBlock): Result<void> {
        // Validar formato de hora
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(schedule.startTime) || !timeRegex.test(schedule.endTime)) {
            return Result.err(new Error('Invalid time format. Use HH:MM (24h format)'));
        }

        // Validar que endTime > startTime
        const [startH, startM] = schedule.startTime.split(':').map(Number);
        const [endH, endM] = schedule.endTime.split(':').map(Number);

        if (startH > endH || (startH === endH && startM >= endM)) {
            return Result.err(new Error('End time must be after start time'));
        }

        // Verificar que no exista ya una franja para el mismo día y hora de inicio
        const exists = this.props.schedules.some(
            s => s.dayOfWeek === schedule.dayOfWeek &&
                s.startTime === schedule.startTime
        );

        if (exists) {
            return Result.err(new Error('Schedule already exists for this day and time'));
        }

        this.props.schedules.push(schedule);
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Elimina una franja horaria
     * @example
     * const result = corner.removeSchedule(DayOfWeek.MONDAY, '09:00');
     * if (result.isErr()) {
     *     console.error(result.error);
     * }
     * @param dayOfWeek Día de la semana
     * @param startTime Hora de inicio
     * @returns Resultado de la operación
     * @description Elimina una franja horaria del corner
     */
    removeSchedule(dayOfWeek: DayOfWeek, startTime: string): Result<void> {
        const initialLength = this.props.schedules.length;
        this.props.schedules = this.props.schedules.filter(
            s => !(s.dayOfWeek === dayOfWeek && s.startTime === startTime)
        );

        if (this.props.schedules.length === initialLength) {
            return Result.err(new Error('Schedule not found'));
        }

        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Verifica si el corner está abierto en una fecha y hora específicas
     * @example
     * const isOpen = corner.isOpenAt(new Date());
     * @param date Fecha y hora
     * @returns true si el corner está abierto, false en caso contrario
     * @description Verifica si el corner está abierto en una fecha y hora específicas
     */
    isOpenAt(date: Date): boolean {
        const zonedDate = toZonedTime(date, this.props.timezone);
        const day = this.getDayOfWeekFromDate(zonedDate);
        const time = this.formatTime(zonedDate);

        return this.props.schedules.some(schedule =>
            schedule.dayOfWeek === day &&
            schedule.startTime <= time &&
            schedule.endTime > time
        );
    }

    /**
     * Obtiene las franjas activas para un día específico
     * @example
     * const schedules = corner.getSchedulesForDay(DayOfWeek.MONDAY);
     * @param dayOfWeek Día de la semana
     * @returns Franjas horarias activas
     * @description Obtiene las franjas horarias activas para un día específico
     */
    getSchedulesForDay(dayOfWeek: DayOfWeek): ScheduleBlock[] {
        return this.props.schedules.filter(s => s.dayOfWeek === dayOfWeek);
    }

    /**
     * Actualiza la información básica del corner
     * @example
     * corner.updateInfo(
     *     'New Name',
     *     'New Client Name',
     *     'New Description',
     *     'New ServiceNow Location',
     *     123,
     *     456
     * );
     * @param name Nombre del corner
     * @param clientName Nombre del cliente
     * @param description Descripción del corner
     * @param servicenowLocation Ubicación en ServiceNow
     * @param latitude Latitud del corner
     * @param longitude Longitud del corner
     * @description Actualiza la información básica del corner
     */
    updateInfo(
        name?: string,
        clientName?: string | null,
        description?: string | null,
        servicenowLocation?: string | null,
        latitude?: number | null,
        longitude?: number | null,
        snowAssignmentGroup?: string | null,
        timezone?: string | null,
        country?: string | null,
        city?: string | null,
    ): void {
        if (name !== undefined) this.props.name = name;
        if (clientName !== undefined) this.props.clientName = clientName;
        if (description !== undefined) this.props.description = description;
        if (servicenowLocation !== undefined) this.props.servicenowLocation = servicenowLocation;
        if (latitude !== undefined) this.props.latitude = latitude;
        if (longitude !== undefined) this.props.longitude = longitude;
        if (snowAssignmentGroup !== undefined) this.props.snowAssignmentGroup = snowAssignmentGroup;
        if (timezone !== undefined && timezone !== null) this.props.timezone = timezone;
        if (country !== undefined && country !== null) this.props.country = country;
        if (city !== undefined) this.props.city = city;

        this.props.updatedAt = new Date();
    }

    /**
     * Corrige el código técnico del corner. Operación explícita y deliberada
     * (separada de updateInfo) porque el code es una referencia externa
     * inmutable por convención: solo debe cambiarse para corregir un backfill
     * incorrecto, no como parte de una edición regular.
     * @param code Nuevo código (slug, snake_case)
     * @returns Resultado de la operación
     */
    updateCode(code: string): Result<void> {
        if (!CODE_REGEX.test(code)) {
            return Result.err(new Error('Invalid corner code format. Use lowercase snake_case (e.g. local_abelias)'));
        }
        this.props.code = code;
        this.props.updatedAt = new Date();
        return Result.ok(undefined);
    }

    /**
     * Actualiza la configuración operativa
     * @example
     * corner.updateOperationalConfig(true);
     * @param onlyTechnicians Indica si el corner es solo para técnicos
     * @description Actualiza la configuración operativa del corner
     */
    updateOperationalConfig(onlyTechnicians?: boolean): void {
        if (onlyTechnicians !== undefined) {
            this.props.onlyTechnicians = onlyTechnicians;
        }
        this.props.updatedAt = new Date();
    }

    /**
     * Activa el corner
     * @example
     * corner.activate();
     * @description Activa el corner
     */
    activate(): void {
        this.props.isActive = true;
        this.props.updatedAt = new Date();
    }

    /**
     * Desactiva el corner (soft delete)
     * @example
     * corner.deactivate();
     * @description Desactiva el corner
     */
    deactivate(): void {
        this.props.isActive = false;
        this.props.updatedAt = new Date();
    }

    /**
     * Limpia todas las franjas horarias
     * @example
     * corner.clearSchedules();
     * @description Limpia todas las franjas horarias del corner
     */
    clearSchedules(): void {
        this.props.schedules = [];
        this.props.updatedAt = new Date();
    }

    // Utilidades privadas
    /**
     * Obtiene el día de la semana a partir de una fecha
     * @param date Fecha
     * @returns Día de la semana
     * @description Obtiene el día de la semana a partir de una fecha
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
     * Formatea una fecha a formato HH:MM
     * @param date Fecha
     * @returns Fecha en formato HH:MM
     * @description Formatea una fecha a formato HH:MM
     */
    private formatTime(date: Date): string {
        return date.toTimeString().substring(0, 5);
    }

    toJSON() { return { ...this.props }; }

    // Factory method
    /**
     * Crea un nuevo corner
     * @example
     * const corner = Corner.create(
     *     CornerId.create(),
     *     'Corner Name',
     *     false
     * );
     * @param id ID del corner
     * @param name Nombre del corner
     * @param onlyTechnicians Indica si el corner es solo para técnicos
     * @returns Resultado de la operación
     * @description Crea un nuevo corner
     */
    static create(
        id: CornerId,
        name: string,
        code: string,
        onlyTechnicians: boolean = false,
        timezone: string = 'UTC',
        country: string = 'AR',
    ): Result<Corner> {
        if (!name || name.trim().length === 0) {
            return Result.err(new Error('Corner name is required'));
        }
        if (!code || !CODE_REGEX.test(code)) {
            return Result.err(new Error('Invalid corner code format. Use lowercase snake_case (e.g. local_abelias)'));
        }

        const now = new Date();
        const corner = new Corner({
            id,
            name,
            code,
            clientName: null,
            description: null,
            servicenowLocation: null,
            snowAssignmentGroup: null,
            latitude: null,
            longitude: null,
            onlyTechnicians,
            isActive: true,
            schedules: [],
            timezone,
            country,
            city: null,
            createdAt: now,
            updatedAt: now
        });

        return Result.ok(corner);
    }

    /**
     * Reconstruye un corner desde persistencia
     * @example
     * const corner = Corner.reconstitute(
     *     CornerId.create(),
     *     'Corner Name',
     *     false,
     *     true,
     *     'Client Name',
     *     'Description',
     *     'ServiceNow Location',
     *     123,
     *     456,
     *     [],
     *     new Date(),
     *     new Date()
     * );
     * @param id ID del corner
     * @param name Nombre del corner
     * @param onlyTechnicians Indica si el corner es solo para técnicos
     * @param isActive Indica si el corner está activo
     * @param clientName Nombre del cliente
     * @param description Descripción del corner
     * @param servicenowLocation Ubicación en ServiceNow
     * @param latitude Latitud del corner
     * @param longitude Longitud del corner
     * @param schedules Franjas horarias del corner
     * @param createdAt Fecha de creación del corner
     * @param updatedAt Fecha de última actualización del corner
     * @returns Corner reconstruido
     * @description Reconstruye un corner desde persistencia
     */
    static reconstitute(
        id: CornerId,
        name: string,
        code: string,
        onlyTechnicians: boolean,
        isActive: boolean,
        clientName: string | null,
        description: string | null,
        servicenowLocation: string | null,
        snowAssignmentGroup: string | null,
        latitude: number | null,
        longitude: number | null,
        schedules: ScheduleBlock[],
        timezone: string,
        country: string,
        city: string | null,
        createdAt: Date,
        updatedAt: Date,
    ): Corner {
        return new Corner({
            id,
            name,
            code,
            clientName,
            description,
            servicenowLocation,
            snowAssignmentGroup,
            latitude,
            longitude,
            onlyTechnicians,
            isActive,
            schedules: [...schedules],
            timezone,
            country,
            city,
            createdAt,
            updatedAt,
        });
    }
}