// policy-permission.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Policy } from './policy.entity';
import { Permission } from './permission.entity';

@Entity('policy_permissions')
@Unique(['policyId', 'permissionId'])
@Index(['policyId', 'isActive'])
@Index(['permissionId', 'isActive'])
export class PolicyPermission extends BaseEntity {
    @Column({ type: 'uuid' })
    policyId!: string;

    @Column({ type: 'uuid' })
    permissionId!: string;

    @ManyToOne(() => Policy, (policy) => policy.permissions, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'policyId' })
    policy!: Policy;

    @ManyToOne(() => Permission, (permission) => permission.policies, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'permissionId' })
    permission!: Permission;
}