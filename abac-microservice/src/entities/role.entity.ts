// role.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Index, Unique, OneToMany } from 'typeorm';
import { AuditEntity, BaseEntity } from './base.entity';
import { Application } from './application.entity';
import { UserRole } from './user-role.entity';
import { RolePermission } from './role-permission.entity';

@Entity('roles')
@Unique(['name', 'applicationId'])
@Index(['applicationId', 'isActive'])
@Index(['type', 'weight'])
export class Role extends BaseEntity {
    @Column({ type: 'varchar', length: 100 })
    name!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description!: string;

    @Column({ type: 'uuid' })
    applicationId!: string;

    @OneToMany(() => UserRole, (ur) => ur.role)
    userRoles!: UserRole[];

    @Column({ type: 'varchar', length: 20, default: 'custom' })
    type!: 'system' | 'custom';

    @Column({ type: 'int', default: 0 })
    weight!: number; // Para jerarquía de roles

    @OneToMany(() => RolePermission, (permission) => permission.role, {
        cascade: true,
        persistence: false
    })
    permissions!: RolePermission[];


    @ManyToOne(() => Application, (app) => app.roles, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'applicationId' })
    application!: Application;
}