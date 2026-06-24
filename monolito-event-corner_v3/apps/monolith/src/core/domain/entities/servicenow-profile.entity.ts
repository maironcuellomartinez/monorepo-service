import { Result } from '@app/result';
import { ServiceNowId } from '../value-objects/servicenow-id.value';
import { ServiceNowProfileId } from '@app/shared/types/branded-ids';

export interface ServiceNowProfileProps {
    id: ServiceNowProfileId;
    name: string;
    snowCompanySysId: ServiceNowId;
    snowCompanyName: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Perfil de ServiceNow
 * @description Entidad que representa un perfil de ServiceNow
 */
export class ServiceNowProfile {
    private constructor(private props: ServiceNowProfileProps) { }

    /**
     * ID del perfil
     * @returns ID del perfil
     */
    get id(): ServiceNowProfileId { return this.props.id; }
    /**
     * Nombre del perfil
     * @returns Nombre del perfil
     */
    get name(): string { return this.props.name; }
    /**
     * ID de la empresa de ServiceNow
     * @returns ID de la empresa de ServiceNow
     */
    get snowCompanySysId(): ServiceNowId { return this.props.snowCompanySysId; }
    /**
     * Nombre de la empresa de ServiceNow
     * @returns Nombre de la empresa de ServiceNow
     */
    get snowCompanyName(): string { return this.props.snowCompanyName; }
    /**
     * Indica si el perfil está activo
     * @returns true si el perfil está activo, false en caso contrario
     */
    get isActive(): boolean { return this.props.isActive; }

    /**
     * Desactiva el perfil
     * @example
     * servicenowProfile.deactivate();
     * @description Desactiva el perfil
     */
    deactivate(): void {
        this.props.isActive = false;
        this.props.updatedAt = new Date();
    }

    /**
     * Activa el perfil
     * @example
     * servicenowProfile.activate();
     * @description Activa el perfil
     */
    activate(): void {
        this.props.isActive = true;
        this.props.updatedAt = new Date();
    }

    /**
     * Fecha de creación del perfil
     * @returns Fecha de creación del perfil
     */
    get createdAt(): Date { return this.props.createdAt; }
    /**
     * Fecha de última actualización del perfil
     * @returns Fecha de última actualización del perfil
     */
    get updatedAt(): Date { return this.props.updatedAt; }
    toJSON() { return { ...this.props }; }

    /**
     * Actualiza el perfil
     * @example
     * servicenowProfile.update(
     *     'New Name',
     *     ServiceNowId.create(),
     *     'New Company Name'
     * );
     * @param name Nombre del perfil
     * @param snowCompanySysId ID de la empresa de ServiceNow
     * @param snowCompanyName Nombre de la empresa de ServiceNow
     * @description Actualiza el perfil
     */
    update(name: string, snowCompanySysId: ServiceNowId, snowCompanyName: string): void {
        this.props.name = name;
        this.props.snowCompanySysId = snowCompanySysId;
        this.props.snowCompanyName = snowCompanyName;
        this.props.updatedAt = new Date();
    }

    /**
     * Reconstituye un perfil desde el repositorio
     * @example
     * const servicenowProfile = ServiceNowProfile.reconstitute(
     *     ServiceNowProfileId.create(),
     *     'Profile Name',
     *     ServiceNowId.create(),
     *     'Company Name',
     *     true,
     *     new Date(),
     *     new Date()
     * );
     * @param id ID del perfil
     * @param name Nombre del perfil
     * @param snowCompanySysId ID de la empresa de ServiceNow
     * @param snowCompanyName Nombre de la empresa de ServiceNow
     * @param isActive Indica si el perfil está activo
     * @param createdAt Fecha de creación
     * @param updatedAt Fecha de última actualización
     * @returns Resultado de la operación
     * @description Reconstituye un perfil desde el repositorio
     */
    static reconstitute(
        id: ServiceNowProfileId,
        name: string,
        snowCompanySysId: ServiceNowId,
        snowCompanyName: string,
        isActive: boolean,
        createdAt: Date,
        updatedAt: Date,
    ): ServiceNowProfile {
        return new ServiceNowProfile({
            id,
            name,
            snowCompanySysId,
            snowCompanyName,
            isActive,
            createdAt,
            updatedAt,
        });
    }

    /**
     * Crea un nuevo perfil
     * @example
     * const servicenowProfile = ServiceNowProfile.create(
     *     ServiceNowProfileId.create(),
     *     'Profile Name',
     *     ServiceNowId.create(),
     *     'Company Name'
     * );
     * @param id ID del perfil
     * @param name Nombre del perfil
     * @param snowCompanySysId ID de la empresa de ServiceNow
     * @param snowCompanyName Nombre de la empresa de ServiceNow
     * @returns Resultado de la operación
     * @description Crea un nuevo perfil
     */
    static create(
        id: ServiceNowProfileId,
        name: string,
        snowCompanySysId: ServiceNowId,
        snowCompanyName: string
    ): Result<ServiceNowProfile> {
        const now = new Date();
        const profile = new ServiceNowProfile({
            id,
            name,
            snowCompanySysId,
            snowCompanyName,
            isActive: true,
            createdAt: now,
            updatedAt: now
        });
        return Result.ok(profile);
    }
}