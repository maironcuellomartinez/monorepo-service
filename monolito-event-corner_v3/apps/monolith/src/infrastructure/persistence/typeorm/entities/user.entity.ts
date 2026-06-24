import { Entity, Column, PrimaryColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { IncidentEntity } from './incident.entity';

/**
 * Entidad que representa un usuario en la tabla users.
 * Esta tabla se utiliza para almacenar usuarios que deben ser publicados a otros módulos.
 */
@Entity('users')
export class UserEntity {
    /**
     * Identificador único del usuario.
     */
    @PrimaryColumn({ length: 50 })
    customer_id: string;

    /**
     * Identificador externo del usuario.
     */
    @Column({ length: 100, unique: true })
    external_id: string;

    /**
     * Nombre del usuario.
     */
    @Column({ type: 'varchar', length: 100, nullable: true })
    name: string | null;

    /**
     * Apellido del usuario.
     */
    @Column({ type: 'varchar', length: 100, nullable: true })
    last_name: string | null;

    /**
     * Nombre completo del usuario.
     */
    @Column({ type: 'varchar', length: 200, nullable: true })
    full_name: string | null;

    /**
     * Correo electrónico del usuario.
     */
    @Column({ type: 'varchar', length: 150, nullable: true })
    email: string | null;

    /**
     * Identificador de la empresa a la que pertenece el usuario.
     */
    @Column({ type: 'varchar', length: 50, nullable: true })
    company_id: string | null;

    /**
     * Dominio del usuario.
     */
    @Column({ type: 'varchar', length: 100, nullable: true })
    domain: string | null;

    /**
     * Nombre principal del usuario.
     */
    @Column({ type: 'varchar', length: 200, nullable: true })
    principal_name: string | null;

    /**
     * Tokens de dispositivo del usuario.
     */
    @Column({ type: 'text', nullable: true })
    device_tokens: string | null;

    /**
     * Estado del usuario.
     */
    @Column({ default: true })
    is_active: boolean;

    /**
     * Fecha de creación del usuario.
     */
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    /**
     * Fecha de actualización del usuario.
     */
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    /**
     * Relación muchos users a una company
     */
    @ManyToOne(() => CompanyEntity, company => company.users)
    @JoinColumn({ name: 'company_id' })
    company: CompanyEntity;

    /**
     * Relación muchos users a muchos incidents
     */
    @OneToMany(() => IncidentEntity, incident => incident.customer)
    incidents: IncidentEntity[];
}