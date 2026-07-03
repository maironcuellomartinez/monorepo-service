import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, In, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
// import { AuditLog, AuditAction, EntityType } from '../entities/audit-log.entity';
import { LoggerService } from '../../observability';
import { AuditAction, AuditLog, EntityType } from 'src/entities';

export interface AuditFilter {
    entityType?: EntityType;
    entityId?: string;
    action?: AuditAction;
    userId?: string;
    applicationId?: string;
    startDate?: Date;
    endDate?: Date;
    isSuccess?: boolean;
    ipAddress?: string;
    correlationId?: string;
    searchTerm?: string;
}

export interface Pagination {
    page?: number;
    limit?: number;
}

export interface AuditStats {
    total: number;
    granted: number;
    denied: number;
    successRate: number;
    averageProcessingTime: number;
    topResources: Array<{ resource: string; action: string; count: number; granted: number }>;
    topUsers: Array<{ userId: string; userEmail: string; count: number }>;
    hourlyDistribution: Array<{ hour: number; count: number }>;
}

@Injectable()
export class AuditService {
    constructor(
        @InjectRepository(AuditLog)
        private auditLogRepository: Repository<AuditLog>,
        private logger: LoggerService,
    ) { }

    /**
     * Registra un evento de auditoría
     */
    async logEvent(
        action: AuditAction,
        params: {
            permition?: string;
            context?: Record<string, any>;
            result?: boolean;
            entityType?: EntityType;
            entityId?: string;
            adminId?: string;
            adminEmail?: string;
            assignedBy?: string;
            assignedAt?: Date;
            expiresAt?: Date;
            sessionId?: string;
            assignedRoles?: string[];
            userId?: string;
            userEmail?: string;
            applicationId?: string;
            applicationName?: string;
            details?: Record<string, any>;
            ipAddress?: string;
            userAgent?: string;
            endpoint?: string;
            httpMethod?: string;
            statusCode?: number;
            processingTime?: number;
            correlationId?: string;
            isSuccess?: boolean;
            description?: string;
            registrationMethod?: string;
            requiresVerification?: boolean;
            rolesAssigned?: string[];
            token?: string;
            tokenHash?: string;
            revokedAt?: Date;
            revokedBy?: string;
            revocationReason?: string;
            reason?: string;
            oldSessionId?: string;
            newSessionId?: string;
            suspiciousFlags?: string[];
            previousSession?: any;
            location?: any;
            deviceFingerprint?: string;
            metadata?: any;
            sessionsRevoked?: number;
            exceptCurrent?: boolean;
        }
    ): Promise<AuditLog> {
        try {
            const log = new AuditLog();
            log.action = action;
            const logUpdated = { ...log, ...params };
            const savedLog = await this.auditLogRepository.save(logUpdated);

            this.logger.debug('Evento de auditoría registrado', 'AUDIT', {
                logId: savedLog.id,
                action: savedLog.action,
                entityType: savedLog.entityType,
                entityId: savedLog.entityId,
            });

            return savedLog;
        } catch (error) {
            this.logger.error('Error al registrar evento de auditoría', 'AUDIT', (error as Error).stack, {
                error: (error as Error).message,
                action,
                params,
            });
            throw error;
        }
    }

    /**
     * Registra un evento de acceso (granted/denied)
     */
    async logAccessEvent(
        granted: boolean,
        params: {
            userId: string;
            userEmail: string;
            applicationId: string;
            applicationName: string;
            resource: string;
            action: string;
            context: Record<string, any>;
            ipAddress?: string;
            userAgent?: string;
            processingTime?: number;
            correlationId?: string;
        }
    ): Promise<AuditLog> {
        const action = granted ? AuditAction.ACCESS_GRANTED : AuditAction.ACCESS_DENIED;

        return this.logEvent(action, {
            entityType: EntityType.ACCESS_REQUEST,
            userId: params.userId,
            userEmail: params.userEmail,
            applicationId: params.applicationId,
            applicationName: params.applicationName,
            details: {
                resource: params.resource,
                action: params.action,
                context: params.context,
                granted,
            },
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            processingTime: params.processingTime,
            correlationId: params.correlationId,
            isSuccess: granted,
            description: `Access ${granted ? 'granted' : 'denied'} for ${params.resource}:${params.action}`,
        });
    }

    /**
     * Registra un evento CRUD
     */
    async logCrudEvent(
        action: AuditAction,
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
    ): Promise<AuditLog> {
        return this.logEvent(action, {
            entityType: params.entityType,
            entityId: params.entityId,
            userId: params.userId,
            userEmail: params.userEmail,
            applicationId: params.applicationId,
            applicationName: params.applicationName,
            details: { changes: params.changes },
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            correlationId: params.correlationId,
            isSuccess: true,
            description: `${action} operation on ${params.entityType} ${params.entityId}`,
        });
    }

    /**
     * Obtiene logs de auditoría con filtros
     */
    async getAuditLogs(filters: AuditFilter = {}, pagination: Pagination = {}): Promise<{ logs: AuditLog[]; total: number }> {
        const { page = 1, limit = 50 } = pagination;
        const skip = (page - 1) * limit;

        const query = this.auditLogRepository.createQueryBuilder('log');

        // Aplicar filtros
        if (filters.entityType) {
            query.andWhere('log.entityType = :entityType', { entityType: filters.entityType });
        }

        if (filters.entityId) {
            query.andWhere('log.entityId = :entityId', { entityId: filters.entityId });
        }

        if (filters.action) {
            query.andWhere('log.action = :action', { action: filters.action });
        }

        if (filters.userId) {
            query.andWhere('log.userId = :userId', { userId: filters.userId });
        }

        if (filters.applicationId) {
            query.andWhere('log.applicationId = :applicationId', { applicationId: filters.applicationId });
        }

        if (filters.isSuccess !== undefined) {
            query.andWhere('log.isSuccess = :isSuccess', { isSuccess: filters.isSuccess });
        }

        if (filters.ipAddress) {
            query.andWhere('log.ipAddress = :ipAddress', { ipAddress: filters.ipAddress });
        }

        if (filters.correlationId) {
            query.andWhere('log.correlationId = :correlationId', { correlationId: filters.correlationId });
        }

        if (filters.startDate && filters.endDate) {
            query.andWhere('log.createdAt BETWEEN :startDate AND :endDate', {
                startDate: filters.startDate,
                endDate: filters.endDate,
            });
        } else if (filters.startDate) {
            query.andWhere('log.createdAt >= :startDate', { startDate: filters.startDate });
        } else if (filters.endDate) {
            query.andWhere('log.createdAt <= :endDate', { endDate: filters.endDate });
        }

        if (filters.searchTerm) {
            query.andWhere(
                '(log.description LIKE :searchTerm OR log.userEmail LIKE :searchTerm OR log.details LIKE :searchTerm)',
                { searchTerm: `%${filters.searchTerm}%` }
            );
        }

        const [logs, total] = await query
            .orderBy('log.createdAt', 'DESC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return { logs, total };
    }

    /**
     * Obtiene estadísticas de auditoría
     */
    async getAuditStats(filters: Omit<AuditFilter, 'searchTerm'> = {}): Promise<AuditStats> {
        const query = this.auditLogRepository.createQueryBuilder('log');

        // Aplicar filtros (similar a getAuditLogs)
        if (filters.entityType) query.andWhere('log.entityType = :entityType', { entityType: filters.entityType });
        if (filters.entityId) query.andWhere('log.entityId = :entityId', { entityId: filters.entityId });
        if (filters.action) query.andWhere('log.action = :action', { action: filters.action });
        if (filters.userId) query.andWhere('log.userId = :userId', { userId: filters.userId });
        if (filters.applicationId) query.andWhere('log.applicationId = :applicationId', { applicationId: filters.applicationId });
        if (filters.isSuccess !== undefined) query.andWhere('log.isSuccess = :isSuccess', { isSuccess: filters.isSuccess });
        if (filters.startDate && filters.endDate) {
            query.andWhere('log.createdAt BETWEEN :startDate AND :endDate', {
                startDate: filters.startDate,
                endDate: filters.endDate,
            });
        }

        const total = await query.getCount();

        // Estadísticas de acceso
        const accessStats = await query
            .select([
                'log.action',
                'COUNT(log.id) as count',
                'AVG(log.processingTime) as avgProcessingTime'
            ])
            .where('log.action IN (:...actions)', {
                actions: [AuditAction.ACCESS_GRANTED, AuditAction.ACCESS_DENIED]
            })
            .groupBy('log.action')
            .getRawMany();

        const granted = accessStats.find(s => s.log_action === AuditAction.ACCESS_GRANTED)?.count || 0;
        const denied = accessStats.find(s => s.log_action === AuditAction.ACCESS_DENIED)?.count || 0;
        const successRate = (granted + denied) > 0 ? (granted / (granted + denied)) * 100 : 0;
        const averageProcessingTime = accessStats.length > 0
            ? accessStats.reduce((avg, stat) => avg + (parseFloat(stat.avgProcessingTime) || 0), 0) / accessStats.length
            : 0;

        // Top recursos
        const topResources = await this.auditLogRepository
            .createQueryBuilder('log')
            .select([
                'JSON_EXTRACT(log.details, "$.resource") as resource',
                'JSON_EXTRACT(log.details, "$.action") as action',
                'COUNT(log.id) as count',
                'SUM(CASE WHEN log.action = :grantedAction THEN 1 ELSE 0 END) as granted',
            ])
            .where('log.action IN (:...actions)', {
                actions: [AuditAction.ACCESS_GRANTED, AuditAction.ACCESS_DENIED]
            })
            .andWhere('log.details IS NOT NULL')
            .setParameter('grantedAction', AuditAction.ACCESS_GRANTED)
            .groupBy('resource, action')
            .orderBy('count', 'DESC')
            .limit(10)
            .getRawMany();

        // Top usuarios
        const topUsers = await this.auditLogRepository
            .createQueryBuilder('log')
            .select([
                'log.userId',
                'log.userEmail',
                'COUNT(log.id) as count'
            ])
            .where('log.userId IS NOT NULL')
            .groupBy('log.userId, log.userEmail')
            .orderBy('count', 'DESC')
            .limit(10)
            .getRawMany();

        // Distribución por hora
        const hourlyDistribution = await this.auditLogRepository
            .createQueryBuilder('log')
            .select([
                'HOUR(log.createdAt) as hour',
                'COUNT(log.id) as count'
            ])
            .groupBy('hour')
            .orderBy('hour', 'ASC')
            .getRawMany();

        return {
            total,
            granted: parseInt(granted) || 0,
            denied: parseInt(denied) || 0,
            successRate,
            averageProcessingTime,
            topResources: topResources.map(r => ({
                resource: r.resource,
                action: r.action,
                count: parseInt(r.count),
                granted: parseInt(r.granted)
            })),
            topUsers: topUsers.map(u => ({
                userId: u.log_userId,
                userEmail: u.log_userEmail,
                count: parseInt(u.count)
            })),
            hourlyDistribution: hourlyDistribution.map(h => ({
                hour: parseInt(h.hour),
                count: parseInt(h.count)
            }))
        };
    }

    /**
     * Limpia logs antiguos (más de 90 días)
     */
    async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await this.auditLogRepository
            .createQueryBuilder()
            .delete()
            .where('createdAt < :cutoffDate', { cutoffDate })
            .execute();

        this.logger.log(`Logs de auditoría limpiados: ${result.affected} registros eliminados`, 'AUDIT', {
            cutoffDate,
            affected: result.affected,
        });

        return result.affected || 0;
    }

    /**
     * Exporta logs a formato CSV
     */
    async exportToCsv(filters: AuditFilter = {}): Promise<string> {
        const { logs } = await this.getAuditLogs(filters, { limit: 10000 });

        const headers = [
            'Timestamp',
            'Action',
            'Entity Type',
            'Entity ID',
            'User ID',
            'User Email',
            'Application',
            'IP Address',
            'Success',
            'Processing Time (ms)',
            'Description'
        ].join(',');

        const rows = logs.map(log => [
            log.createdAt.toISOString(),
            log.action,
            log.entityType || '',
            log.entityId || '',
            log.userId || '',
            log.userEmail || '',
            log.applicationName || '',
            log.ipAddress || '',
            log.isSuccess ? 'Yes' : 'No',
            log.processingTime || '',
            `"${(log.description || '').replace(/"/g, '""')}"`
        ].join(','));

        return [headers, ...rows].join('\n');
    }
}

export { EntityType, AuditAction };
