// user-role.entity.ts (Nueva entidad para relación directa usuario-rol)
import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Role } from './role.entity';
import { Application } from './application.entity';

@Entity('user_roles')
@Unique(['userId', 'roleId', 'applicationId'])
@Index(['userId', 'isActive'])
@Index(['roleId', 'isActive'])
export class UserRole extends BaseEntity {
    @Column({ type: 'uuid' })
    userId!: string;

    @Column({ type: 'uuid' })
    roleId!: string;

    @Column({ type: 'uuid' })
    applicationId!: string;

    @ManyToOne(() => User, (user) => user.roles, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'userId' })
    user!: User;

    @ManyToOne(() => Role, (role) => role.userRoles, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'roleId' })
    role!: Role;

    @ManyToOne(() => Application, (app) => app.userRoles, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'applicationId' })
    application!: Application;
}