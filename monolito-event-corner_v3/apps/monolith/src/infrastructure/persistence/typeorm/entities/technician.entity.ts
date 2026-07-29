// infrastructure/persistence/typeorm/entities/technician.entity.ts
import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { CornerEntity } from './corner.entity';
import { ScheduleAssignmentEntity } from './schedule-assignment.entity';

/**
 * Entidad que representa un técnico en la tabla technicians.
 * Esta tabla se utiliza para almacenar técnicos que deben ser publicados a otros módulos.
 */
@Entity('technicians')
export class TechnicianEntity {
    /**
     * Identificador único del técnico.
     */
    @PrimaryColumn({ length: 50 })
    technician_id: string;

    /**
     * Nombre del técnico.
     */
    @Column({ length: 100 })
    name: string;

    /**
     * Apellido del técnico.
     */
    @Column({ type: 'varchar', length: 100, nullable: true })
    last_name: string | null;

    /**
     * Nombre completo del técnico.
     */
    @Column({ type: 'varchar', length: 200, nullable: true })
    full_name: string | null;

    /**
     * Correo electrónico del técnico.
     */
    @Column({ length: 150 })
    email: string;

    /**
     * FK al usuario del monolith. Null si el técnico no está vinculado a un User.
     */
    @Column({ type: 'varchar', length: 50, nullable: true })
    user_id: string | null;

    /**
     * Identificador de la esquina a la que pertenece el técnico. Null si aún no está asignado.
     */
    @Column({ type: 'varchar', length: 50, nullable: true })
    corner_id: string | null;

    /**
     * Estado del técnico.
     */
    @Column({ default: false })
    disabled: boolean;

    /**
     * Fecha de creación del técnico.
     */
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    /**
     * Fecha de actualización del técnico.
     */
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    /**
     * Relación Muchos technicians a una corner
     */
    @ManyToOne(() => CornerEntity, corner => corner.technicians, { nullable: true })
    @JoinColumn({ name: 'corner_id' })
    corner: CornerEntity | null;

    /**
     * Relación Muchos scheduleAssignments a un technician
     */
    @OneToMany(() => ScheduleAssignmentEntity, assignment => assignment.technician)
    scheduleAssignments: ScheduleAssignmentEntity[];
}