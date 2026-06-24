// Tablas de unión optimizadas con índices compuestos
// role-permission.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Entity('role_permissions')
@Unique(['roleId', 'permissionId'])
@Index(['roleId', 'isActive'])
@Index(['permissionId', 'isActive'])
export class RolePermission extends BaseEntity {
    @Column({ type: 'uuid' })
    roleId!: string;

    @Column({ type: 'uuid' })
    permissionId!: string;

    @Column({ type: 'varchar', length: 10, default: 'allow' })
    effect!: 'allow' | 'deny';

    @ManyToOne(() => Role, (role) => role.permissions, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'roleId' })
    role!: Role;

    @ManyToOne(() => Permission, (permission) => permission.roles, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'permissionId' })
    permission!: Permission;
}