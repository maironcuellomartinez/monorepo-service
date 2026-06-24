// permission.entity.ts
import { Entity, Column, Index, Unique, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { PolicyPermission } from './policy-permission.entity';
import { RolePermission } from './role-permission.entity';

@Entity('permissions')
@Unique(['resource', 'action'])
@Index(['resource', 'isActive'])
export class Permission extends BaseEntity {
    @Column({ type: 'varchar', length: 100 })
    resource!: string;

    @Column({ type: 'varchar', length: 50 })
    action!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description!: string;

    @Column({ type: 'varchar', length: 50, default: 'system' })
    category!: string;

    @Column({ type: 'int', default: 0 })
    weight!: number; // Para ordenamiento y prioridad

    @OneToMany(() => RolePermission, (rolePermission) => rolePermission.permission, {
        cascade: true,
        persistence: false
    })
    roles!: RolePermission[];

    @OneToMany(() => PolicyPermission, (permission) => permission.permission, {
        cascade: true,
        persistence: false
    })
    policies!: PolicyPermission[];

    // Método helper
    getPermissionString(): string {
        return `${this.resource}:${this.action}`;
    }
}