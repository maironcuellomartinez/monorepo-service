import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Entidad que representa un perfil de ServiceNow en la tabla servicenow_profiles.
 * Esta tabla se utiliza para almacenar perfiles de ServiceNow que deben ser publicados a otros módulos.
 */
@Entity('servicenow_profiles')
export class ServiceNowProfileEntity {
    /**
     * Identificador único del perfil.
     */
    @PrimaryColumn({ length: 50 })
    profile_id: string;

    /**
     * Nombre del perfil.
     */
    @Column({ length: 100, unique: true })
    name: string;

    /**
     * Identificador del sistema de ServiceNow.
     */
    @Column({ length: 100 })
    snow_company_sys_id: string;

    /**
     * Nombre de la empresa en ServiceNow.
     */
    @Column({ length: 100 })
    snow_company_name: string;

    /**
     * Estado del perfil.
     */
    @Column({ default: true })
    is_active: boolean;

    /**
     * Fecha en la que el perfil fue creado.
     */
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    /**
     * Fecha en la que el perfil fue actualizado.
     */
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

}