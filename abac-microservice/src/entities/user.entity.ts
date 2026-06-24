import { Entity, Column, Index, OneToMany, BeforeInsert, BeforeUpdate, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import * as bcrypt from 'bcryptjs';
import { UserApplication } from './user-application.entity';
import { UserRole } from './user-role.entity';


@Entity('users')
@Unique(['email'])
@Index(['isActive', 'createdAt'])
export class User extends BaseEntity {
    @Column({ type: 'varchar', length: 150 })
    email!: string;

    @Column({ type: 'varchar', length: 150 })
    firstName!: string;

    @Column({ type: 'varchar', length: 150 })
    lastName!: string;

    @Column({ type: 'varchar', length: 100, nullable: false })
    username!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    completeName?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    passwordHash!: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    status!: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    phone?: string;

    @Column({ type: 'json', nullable: true })
    profile!: Record<string, any>;

    @Column({ type: 'timestamp', nullable: true })
    lastLoginAt!: Date;

    @OneToMany(() => UserRole, (ur) => ur.user)
    roles!: UserRole[];

    @Column({ type: 'varchar', length: 100, nullable: true })
    tenantId!: string;

    @Column({ type: 'boolean', default: false })
    mfaEnabled!: boolean;

    @Column({ type: 'enum', enum: ['user', 'service'], default: 'user' })
    accountType!: 'user' | 'service';

    @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
    entraId?: string | null;  // Azure AD object ID (oid claim)

    @OneToMany(() => UserApplication, (ua) => ua.user)
    userApplications!: UserApplication[];

    @BeforeInsert()
    async hashPassword?(): Promise<void> {
        if (this.passwordHash && !this.passwordHash.startsWith('$2')) {
            this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
        }
    }

    @BeforeInsert()
    @BeforeUpdate()
    async setCompleteName(): Promise<void> {
        this.completeName = `${this.firstName} ${this.lastName}`;
    }

}