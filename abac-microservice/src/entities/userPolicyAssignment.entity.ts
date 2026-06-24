import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { BaseEntity, Policy } from './index';

/**
 * @description Entidad que representa la asignación de políticas a usuarios
 * Permite asignar políticas específicas a usuarios individuales
 */
@Entity('user_policy_assignments')
@Index(['userId', 'policyId'], { unique: true })
export class UserPolicyAssignment extends BaseEntity {
    @Column({ type: 'varchar', length: 36 })
    userId!: string;

    @Column({ type: 'varchar', length: 36 })
    policyId!: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user!: User;

    @ManyToOne(() => Policy, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'policyId' })
    policy!: Policy;

}
