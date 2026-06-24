import { IssueTypeId, IssueTypeTreeId } from '../value-objects/ids';
import { IssueCategory } from '../enums/issue-category.enum';
import { DeviceType } from '../value-objects/device-type.value';
import { Position } from '../value-objects/position.value';
import { ServiceNowCategory } from '../value-objects/servicenow-category.value';
import { WorkMinutes } from '../value-objects/work-minutes.value';
import { SpareMinutes } from '../value-objects/spare-minutes.value';
import { CloseMinutes } from '../value-objects/close-minutes.value';
import { Result } from '@app/result';

/**
 * Propiedades de un tipo de incidencia
 * @description Define las propiedades de un tipo de incidencia
 */
export interface IssueTypeProps {
    id: IssueTypeId;
    treeId: IssueTypeTreeId;
    name: string;
    category: IssueCategory;
    deviceType: DeviceType | null;
    servicenowCategory: ServiceNowCategory | null;
    servicenowCloseCategory: ServiceNowCategory | null;
    workMinutes: WorkMinutes;
    spareMinutes: SpareMinutes;
    closeMinutes: CloseMinutes;
    notUserVisible: boolean;
    position: Position;
    npsDisabled: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Tipo de incidencia
 * @description Entidad que representa un tipo de incidencia
 */
export class IssueType {
    private constructor(private props: IssueTypeProps) { }

    /**
     * ID del tipo de incidencia
     * @returns ID del tipo de incidencia
     */
    get id(): IssueTypeId { return this.props.id; }
    /**
     * ID del perfil
     * @returns ID del perfil
     */
    get treeId(): IssueTypeTreeId { return this.props.treeId; }
    /**
     * Nombre del tipo de incidencia
     * @returns Nombre del tipo de incidencia
     */
    get name(): string { return this.props.name; }
    /**
     * Categoría del tipo de incidencia
     * @returns Categoría del tipo de incidencia
     */
    get category(): IssueCategory { return this.props.category; }
    /**
     * Tipo de dispositivo
     * @returns Tipo de dispositivo
     */
    get deviceType(): DeviceType | null { return this.props.deviceType; }
    /**
     * Categoría de ServiceNow
     * @returns Categoría de ServiceNow
     */
    get servicenowCategory(): ServiceNowCategory | null { return this.props.servicenowCategory; }
    /**
     * Categoría de cierre de ServiceNow
     * @returns Categoría de cierre de ServiceNow
     */
    get servicenowCloseCategory(): ServiceNowCategory | null { return this.props.servicenowCloseCategory; }
    /**
     * Minutos de trabajo
     * @returns Minutos de trabajo
     */
    get workMinutes(): WorkMinutes { return this.props.workMinutes; }
    /**
     * Minutos de repuesto
     * @returns Minutos de repuesto
     */
    get spareMinutes(): SpareMinutes { return this.props.spareMinutes; }
    /**
     * Minutos de cierre
     * @returns Minutos de cierre
     */
    get closeMinutes(): CloseMinutes { return this.props.closeMinutes; }
    /**
     * Indica si el tipo no es visible para el usuario
     * @returns true si el tipo no es visible para el usuario, false en caso contrario
     */
    get notUserVisible(): boolean { return this.props.notUserVisible; }
    /**
     * Posición del tipo de incidencia
     * @returns Posición del tipo de incidencia
     */
    get position(): Position { return this.props.position; }
    /**
     * Indica si el NPS está deshabilitado
     * @returns true si el NPS está deshabilitado, false en caso contrario
     */
    get npsDisabled(): boolean { return this.props.npsDisabled; }
    /**
     * Indica si el tipo de incidencia está activo
     * @returns true si el tipo de incidencia está activo, false en caso contrario
     */
    get isActive(): boolean { return this.props.isActive; }

    /**
     * Indica si este tipo requiere atención física en un corner
     * @returns true si el tipo requiere atención física, false en caso contrario
     * @description Indica si este tipo requiere atención física en un corner
     */
    requiresPhysicalAttention(): boolean {
        return this.props.category === IssueCategory.ISSUE;
    }

    /**
     * Indica si es una solicitud administrativa
     * @returns true si es una solicitud administrativa, false en caso contrario
     * @description Indica si es una solicitud administrativa
     */
    isRequest(): boolean {
        return this.props.category.startsWith('REQUEST');
    }

    /**
     * Obtiene la duración total
     * @returns Duración total en minutos
     * @description Obtiene la duración total en minutos
     */
    getTotalDurationMinutes(): number {
        return this.props.workMinutes.value + this.props.spareMinutes.value;
    }

    /**
     * Verifica si el tipo es visible para usuarios normales
     * @returns true si el tipo es visible para usuarios normales, false en caso contrario
     * @description Verifica si el tipo es visible para usuarios normales
     */
    isVisibleToUser(): boolean {
        return !this.props.notUserVisible;
    }

    /**
     * Actualiza los campos del tipo
     * @example
     * issueType.update(
     *     'New Name',
     *     IssueCategory.ISSUE,
     *     DeviceType.LAPTOP,
     *     ServiceNowCategory.HARDWARE,
     *     ServiceNowCategory.HARDWARE,
     *     30,
     *     15,
     *     10,
     *     false,
     *     Position.create(1),
     *     false
     * );
     * @param name Nombre del tipo de incidencia
     * @param category Categoría del tipo de incidencia
     * @param deviceType Tipo de dispositivo
     * @param servicenowCategory Categoría de ServiceNow
     * @param servicenowCloseCategory Categoría de cierre de ServiceNow
     * @param workMinutes Minutos de trabajo
     * @param spareMinutes Minutos de repuesto
     * @param closeMinutes Minutos de cierre
     * @param notUserVisible Indica si el tipo no es visible para el usuario
     * @param position Posición del tipo de incidencia
     * @param npsDisabled Indica si el NPS está deshabilitado
     * @description Actualiza los campos del tipo de incidencia
     */
    update(
        name: string,
        category: IssueCategory,
        deviceType: DeviceType | null,
        servicenowCategory: ServiceNowCategory | null,
        servicenowCloseCategory: ServiceNowCategory | null,
        workMinutes: WorkMinutes,
        spareMinutes: SpareMinutes,
        closeMinutes: CloseMinutes,
        notUserVisible: boolean,
        position: Position,
        npsDisabled: boolean
    ): void {
        this.props.name = name;
        this.props.category = category;
        this.props.deviceType = deviceType;
        this.props.servicenowCategory = servicenowCategory;
        this.props.servicenowCloseCategory = servicenowCloseCategory;
        this.props.workMinutes = workMinutes;
        this.props.spareMinutes = spareMinutes;
        this.props.closeMinutes = closeMinutes;
        this.props.notUserVisible = notUserVisible;
        this.props.position = position;
        this.props.npsDisabled = npsDisabled;
        this.props.updatedAt = new Date();
    }

    /**
     * Desactiva el tipo (soft delete)
     * @example
     * issueType.deactivate();
     * @description Desactiva el tipo de incidencia
     */
    deactivate(): void {
        this.props.isActive = false;
        this.props.updatedAt = new Date();
    }

    /**
     * Fecha de creación del tipo de incidencia
     * @returns Fecha de creación del tipo de incidencia
     */
    get createdAt(): Date { return this.props.createdAt; }
    /**
     * Fecha de última actualización del tipo de incidencia
     * @returns Fecha de última actualización del tipo de incidencia
     */
    get updatedAt(): Date { return this.props.updatedAt; }
    toJSON() { return { ...this.props }; }

    /**
     * Reconstituye un tipo de incidencia desde el repositorio
     * @example
     * const issueType = IssueType.reconstitute(
     *     IssueTypeId.create(),
     *     ServiceNowProfileId.create(),
     *     'Issue Type Name',
     *     IssueCategory.ISSUE,
     *     DeviceType.LAPTOP,
     *     ServiceNowCategory.HARDWARE,
     *     ServiceNowCategory.HARDWARE,
     *     30,
     *     15,
     *     10,
     *     false,
     *     Position.create(1),
     *     false,
     *     true,
     *     new Date(),
     *     new Date()
     * );
     * @param id ID del tipo de incidencia
     * @param profileId ID del perfil
     * @param name Nombre del tipo de incidencia
     * @param category Categoría del tipo de incidencia
     * @param deviceType Tipo de dispositivo
     * @param servicenowCategory Categoría de ServiceNow
     * @param servicenowCloseCategory Categoría de cierre de ServiceNow
     * @param workMinutes Minutos de trabajo
     * @param spareMinutes Minutos de repuesto
     * @param closeMinutes Minutos de cierre
     * @param notUserVisible Indica si el tipo no es visible para el usuario
     * @param position Posición del tipo de incidencia
     * @param npsDisabled Indica si el NPS está deshabilitado
     * @param isActive Indica si el tipo de incidencia está activo
     * @param createdAt Fecha de creación
     * @param updatedAt Fecha de última actualización
     * @returns Resultado de la operación
     * @description Reconstituye un tipo de incidencia desde el repositorio
     */
    static reconstitute(
        id: IssueTypeId,
        treeId: IssueTypeTreeId,
        name: string,
        category: IssueCategory,
        deviceType: DeviceType | null,
        servicenowCategory: ServiceNowCategory | null,
        servicenowCloseCategory: ServiceNowCategory | null,
        workMinutes: WorkMinutes,
        spareMinutes: SpareMinutes,
        closeMinutes: CloseMinutes,
        notUserVisible: boolean,
        position: Position,
        npsDisabled: boolean,
        isActive: boolean,
        createdAt: Date,
        updatedAt: Date,
    ): IssueType {
        return new IssueType({
            id,
            treeId,
            name,
            category,
            deviceType,
            servicenowCategory,
            servicenowCloseCategory,
            workMinutes,
            spareMinutes,
            closeMinutes,
            notUserVisible,
            position,
            npsDisabled,
            isActive,
            createdAt,
            updatedAt,
        });
    }

    /**
     * Crea un nuevo tipo de incidencia
     * @example
     * const issueType = IssueType.create(
     *     IssueTypeId.create(),
     *     ServiceNowProfileId.create(),
     *     'Issue Type Name',
     *     IssueCategory.ISSUE,
     *     DeviceType.LAPTOP,
     *     30,
     *     15,
     *     10,
     *     false,
     *     Position.create(1),
     *     false,
     *     ServiceNowCategory.HARDWARE,
     *     ServiceNowCategory.HARDWARE
     * );
     * @param id ID del tipo de incidencia
     * @param profileId ID del perfil
     * @param name Nombre del tipo de incidencia
     * @param category Categoría del tipo de incidencia
     * @param deviceType Tipo de dispositivo
     * @param workMinutes Minutos de trabajo
     * @param spareMinutes Minutos de repuesto
     * @param closeMinutes Minutos de cierre
     * @param notUserVisible Indica si el tipo no es visible para el usuario
     * @param position Posición del tipo de incidencia
     * @param npsDisabled Indica si el NPS está deshabilitado
     * @param servicenowCategory Categoría de ServiceNow
     * @param servicenowCloseCategory Categoría de cierre de ServiceNow
     * @returns Resultado de la operación
     * @description Crea un nuevo tipo de incidencia
     */
    static create(
        id: IssueTypeId,
        treeId: IssueTypeTreeId,
        name: string,
        category: IssueCategory,
        deviceType: DeviceType | null,
        workMinutes: WorkMinutes,
        spareMinutes: SpareMinutes,
        closeMinutes: CloseMinutes,
        notUserVisible: boolean,
        position: Position,
        npsDisabled: boolean,
        servicenowCategory?: ServiceNowCategory,
        servicenowCloseCategory?: ServiceNowCategory
    ): Result<IssueType> {
        const now = new Date();
        const issueType = new IssueType({
            id,
            treeId,
            name,
            category,
            deviceType,
            servicenowCategory: servicenowCategory || null,
            servicenowCloseCategory: servicenowCloseCategory || null,
            workMinutes,
            spareMinutes,
            closeMinutes,
            notUserVisible,
            position,
            npsDisabled,
            isActive: true,
            createdAt: now,
            updatedAt: now
        });

        return Result.ok(issueType);
    }
}
