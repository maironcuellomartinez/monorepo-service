import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity';

export enum AuditAction {
    // Acciones de autenticación
    LOGIN = 'LOGIN',
    LOGOUT = 'LOGOUT',
    LOGOUT_ALL = 'LOGOUT_ALL',
    LOGIN_FAILED = 'LOGIN_FAILED',
    API_KEY_VALIDATION = 'API_KEY_VALIDATION',
    API_KEY_REGENERATED = 'API_KEY_REGENERATED',
    TOKEN_REFRESHED = 'TOKEN_REFRESHED',

    // Acciones de acceso
    ACCESS_GRANTED = 'ACCESS_GRANTED',
    ACCESS_DENIED = 'ACCESS_DENIED',
    EMAIL_VERIFIED = 'EMAIL_VERIFIED',
    EMAIL_VERIFICATION_FAILED = 'EMAIL_VERIFICATION_FAILED',
    EMAIL_VERIFICATION_SUCCESS = 'EMAIL_VERIFICATION_SUCCESS',
    PASSWORD_RESET = 'PASSWORD_RESET',
    PASSWORD_RESET_FAILED = 'PASSWORD_RESET_FAILED',
    PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
    PASSWORD_CHANGED = 'PASSWORD_CHANGED',
    PASSWORD_CHANGED_FAILED = 'PASSWORD_CHANGED_FAILED',
    PASSWORD_CHANGED_SUCCESS = 'PASSWORD_CHANGED_SUCCESS',

    // Acciones CRUD
    CREATE = 'CREATE',
    READ = 'READ',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    DEACTIVATE = 'DEACTIVATE',
    REACTIVATE = 'REACTIVATE',

    // Acciones específicas
    USER_REGISTERED_BY_ADMIN = 'USER_REGISTERED_BY_ADMIN',
    USER_REGISTRATION = 'USER_REGISTRATION',
    ROLE_ASSIGNMENT = 'ROLE_ASSIGNMENT',
    PERMISSION_GRANT = 'PERMISSION_GRANT',
    PERMISSION_REVOKE = 'PERMISSION_REVOKE',
    POLICY_APPLICATION = 'POLICY_APPLICATION',

    // Acciones del sistema
    CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
    BATCH_OPERATION = 'BATCH_OPERATION',
    CACHE_INVALIDATION = 'CACHE_INVALIDATION',
    SESSION_REVOKED = 'SESSION_REVOKED',
    SESSION_EXPIRED = 'SESSION_EXPIRED',
    SESSION_TERMINATED = 'SESSION_TERMINATED',
    SESSION_CREATED = 'SESSION_CREATED',
    SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

export enum EntityType {
    USER = 'USER',
    APPLICATION = 'APPLICATION',
    ROLE = 'ROLE',
    PERMISSION = 'PERMISSION',
    POLICY = 'POLICY',
    POLICY_RULE = 'POLICY_RULE',
    USER_APPLICATION = 'USER_APPLICATION',
    USER_ROLE = 'USER_ROLE',
    ROLE_PERMISSION = 'ROLE_PERMISSION',
    POLICY_PERMISSION = 'POLICY_PERMISSION',
    ACCESS_REQUEST = 'ACCESS_REQUEST'
}

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
@Index(['userId', 'action'])
@Index(['applicationId', 'createdAt'])
@Index(['action', 'createdAt'])
export class AuditLog extends BaseEntity {
    @Column({ type: 'enum', enum: EntityType, nullable: true })
    entityType!: EntityType;

    @Column({ type: 'varchar', length: 36, nullable: true })
    entityId!: string;

    @Column({ type: 'enum', enum: AuditAction, nullable: false })
    action!: AuditAction;

    @Column({ type: 'varchar', length: 255, nullable: true })
    permition!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description!: string;

    @Column({ type: 'varchar', length: 36, nullable: true })
    userId!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    userEmail!: string;

    @Column({ type: 'varchar', length: 36, nullable: true })
    applicationId!: string;

    @Column({ type: 'varchar', length: 120, nullable: true })
    applicationName!: string;

    @Column({ type: 'json', nullable: true })
    details!: Record<string, any>;

    @Column({ type: 'varchar', length: 45, nullable: true })
    ipAddress!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    userAgent!: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    endpoint!: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    httpMethod!: string;

    @Column({ type: 'int', nullable: true })
    statusCode!: number;

    @Column({ type: 'int', nullable: true })
    processingTime!: number; // en milisegundos

    @Column({ type: 'boolean', default: false })
    isSuccess!: boolean;

    @Column({ type: 'varchar', length: 50, nullable: true })
    correlationId!: string;

    // Métodos utilitarios
    static createAccessLog(
        action: AuditAction.ACCESS_GRANTED | AuditAction.ACCESS_DENIED,
        params: {
            userId: string;
            userEmail: string;
            applicationId: string;
            applicationName: string;
            resource: string;
            action: string;
            context: Record<string, any>;
            granted: boolean;
            ipAddress?: string;
            userAgent?: string;
            processingTime?: number;
            correlationId?: string;
        }
    ): AuditLog {
        const log = new AuditLog();
        log.entityType = EntityType.ACCESS_REQUEST;
        log.action = action;
        log.userId = params.userId;
        log.userEmail = params.userEmail;
        log.applicationId = params.applicationId;
        log.applicationName = params.applicationName;
        log.details = {
            resource: params.resource,
            action: params.action,
            context: params.context,
            granted: params.granted
        };
        // log.ipAddress = params.ipAddress;
        // log.userAgent = params.userAgent;
        // log.processingTime = params.processingTime;
        // log.correlationId = params.correlationId;
        log.isSuccess = params.granted;
        log.description = `Access ${params.granted ? 'granted' : 'denied'} for ${params.resource}:${params.action}`;

        return log;
    }

    static createCrudLog(
        action: AuditAction.CREATE | AuditAction.READ | AuditAction.UPDATE | AuditAction.DELETE,
        params: {
            entityType: EntityType;
            entityId: string;
            userId: string;
            userEmail: string;
            applicationId?: string;
            applicationName?: string;
            changes?: Record<string, any>;
            ipAddress?: string;
            userAgent?: string;
            correlationId?: string;
        }
    ): AuditLog {
        const log = new AuditLog();
        log.entityType = params.entityType;
        log.entityId = params.entityId;
        log.action = action;
        log.userId = params.userId;
        log.userEmail = params.userEmail;
        // log.applicationId = params.applicationId;
        // log.applicationName = params.applicationName;
        log.details = { changes: params.changes };
        // log.ipAddress = params.ipAddress;
        // log.userAgent = params.userAgent;
        // log.correlationId = params.correlationId;
        log.isSuccess = true;
        log.description = `${action} operation on ${params.entityType} ${params.entityId}`;

        return log;
    }
}