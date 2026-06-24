// policy.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Index, OneToMany, Unique } from 'typeorm';
import { AuditEntity } from './base.entity';
import { Application } from './application.entity';
import { PolicyRule } from './policy-rule.entity';
import { PolicyPermission } from './policy-permission.entity';
// import { PolicyRule } from './policy-rule.entity';

@Entity('policies')
@Unique(['name', 'applicationId'])
@Index(['applicationId', 'isActive'])
@Index(['type', 'priority'])
export class Policy extends AuditEntity {
    @Column({ type: 'varchar', length: 100 })
    name!: string;

    @Column({ type: 'text' })
    description!: string;

    @Column({ type: 'uuid' })
    applicationId!: string;

    @Column({ type: 'varchar', length: 20, default: 'custom' })
    type!: 'system' | 'role' | 'user' | 'custom';

    @Column({ type: 'int', default: 0 })
    priority!: number;

    @Column({ type: 'varchar', length: 10, default: 'allow' })
    effect!: 'allow' | 'deny';

    @Column({ type: 'json', nullable: true })
    conditions!: Record<string, any>; // Condiciones globales

    @OneToMany(() => PolicyPermission, (permission) => permission.policy, {
        cascade: true,
        persistence: false
    })
    permissions!: PolicyPermission[];

    @ManyToOne(() => Application, (app) => app.policies, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'applicationId' })
    application!: Application;

    @OneToMany(() => PolicyRule, (rule) => rule.policy, {
        cascade: true,
        persistence: false
    })
    rules!: PolicyRule[];
}