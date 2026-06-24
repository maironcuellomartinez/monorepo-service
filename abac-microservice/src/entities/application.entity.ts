import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { UserApplication } from './user-application.entity';
import { Role } from './role.entity';
import { Policy } from './policy.entity';
import { UserRole } from './user-role.entity';
import { User } from './user.entity';


@Entity('applications')
@Unique(['name'])
@Unique(['apiKey'])
@Index(['isActive', 'createdAt'])
export class Application extends BaseEntity {
    @Column({ type: 'varchar', length: 120 })
    name!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description!: string;

    // apiKey/apiSecret — exclusivos para apps type='internal' y ApiKeyGuard (header x-api-key)
    @Column({ type: 'varchar', length: 512, nullable: true })
    apiKey!: string | null;

    @Column({ type: 'varchar', length: 512, nullable: true })
    apiSecret!: string | null;

    @Column({ type: 'varchar', length: 20, default: 'production' })
    environment!: string;

    @Column({ type: 'json', nullable: true })
    settings!: any;

    @Column({ type: 'timestamp', nullable: true })
    expiresAt!: Date;

    @Column({ type: 'int', nullable: true })
    usageCount!: number;

    @Column({ type: 'int', nullable: true })
    usageLimit!: number;

    @Column({ type: 'varchar', length: 20, default: 'active' })
    status!: string;

    @OneToMany(() => UserRole, (ur) => ur.application)
    userRoles!: UserRole[];

    @OneToMany(() => UserApplication, (ua) => ua.application)
    userApplications!: UserApplication[];

    @OneToMany(() => Role, (role) => role.application)
    roles!: Role[];

    @OneToMany(() => Policy, (policy) => policy.application)
    policies!: Policy[];

    @Column({ type: 'varchar', length: 36, nullable: true, name: 'ownerId' })
    ownerId!: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'ownerId' })
    owner!: User | null;

    @Column({ type: 'varchar', length: 36, nullable: true, name: 'ownerApplicationId' })
    ownerApplicationId!: string | null; // App Nativa a la que pertenece este M2M serivce u OAuth client

    @Column({ type: 'int', default: 180 })
    tokenDurationDays!: number; // Duración del token M2M en días (configurable por aplicación)

    // ── Discriminador de tipo de identidad ────────────────────────────────────
    @Column({ type: 'varchar', length: 20, default: 'internal' })
    type!: 'internal' | 'oauth_client' | 'entra_app' | 'm2m_service';

    // ── OAuth 2.0 Client Credentials ──────────────────────────────────────────
    // Columnas propias para OAuth — distintas de apiKey/apiSecret (que son para M2M interno)
    @Column({ type: 'varchar', length: 512, nullable: true, unique: true })
    clientId!: string | null; // Identificador público del OAuth client (prefijo: 'cid_')

    @Column({ type: 'varchar', length: 512, nullable: true })
    clientSecret!: string | null; // Hash bcrypt del client_secret (prefijo: 'csec_')

    @Column({ type: 'json', nullable: true })
    scopes!: string[] | null; // Allow-list de permisos: ['incidents:read', 'requests:write']

    // ── Entra ID (Azure AD) ───────────────────────────────────────────────────
    @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
    entraObjectId!: string | null; // oid del app registration en Azure AD

    @Column({ type: 'varchar', length: 100, nullable: true })
    entraTenantId!: string | null; // Tenant ID de Azure

    getMaskedApiKey(): string {
        return this.apiKey ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}` : '';
    }
}