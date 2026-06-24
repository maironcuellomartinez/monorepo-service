import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
    constructor(
        @InjectRepository(AuditLog) private auditRepository: Repository<AuditLog>,
    ) { }

    @Get('stats')
    @Roles('admin')
    @ApiOperation({ summary: 'KPIs de auditoría — últimas 24h y 7 días. Con ?applicationId= filtra por app.' })
    @ApiQuery({ name: 'applicationId', required: false })
    async getStats(@Query('applicationId') applicationId?: string) {
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const appFilter = applicationId ? 'AND a.applicationId = :appId' : '';
        const appParam = applicationId ? { appId: applicationId } : {};

        const base24h = (action: string) =>
            this.auditRepository.createQueryBuilder('a')
                .where(`a.action = :action AND a.createdAt >= :since ${appFilter}`, { action, since: last24h, ...appParam });

        const [
            loginsToday,
            failedLoginsToday,
            accessDeniedToday,
            crudToday,
            totalUsers7d,
            dailyActivity,
            topUsers,
            actionBreakdown,
        ] = await Promise.all([
            // Logins exitosos hoy
            base24h('LOGIN').getCount(),

            // Logins fallidos hoy
            base24h('LOGIN_FAILED').getCount(),

            // Accesos denegados hoy
            base24h('ACCESS_DENIED').getCount(),

            // Operaciones CRUD hoy
            this.auditRepository.createQueryBuilder('a')
                .where(`a.action IN (:...actions) AND a.createdAt >= :since ${appFilter}`,
                    { actions: ['CREATE', 'UPDATE', 'DELETE', 'DEACTIVATE', 'REACTIVATE'], since: last24h, ...appParam })
                .getCount(),

            // Usuarios únicos activos en 7 días
            this.auditRepository.createQueryBuilder('a')
                .select('COUNT(DISTINCT a.userId)', 'count')
                .where(`a.userId IS NOT NULL AND a.createdAt >= :since ${appFilter}`, { since: last7d, ...appParam })
                .getRawOne(),

            // Actividad diaria últimos 7 días
            this.auditRepository.createQueryBuilder('a')
                .select("DATE_FORMAT(a.createdAt, '%Y-%m-%d')", 'date')
                .addSelect('COUNT(*)', 'total')
                .addSelect("SUM(CASE WHEN a.action = 'LOGIN' THEN 1 ELSE 0 END)", 'logins')
                .addSelect("SUM(CASE WHEN a.action = 'ACCESS_DENIED' THEN 1 ELSE 0 END)", 'denied')
                .where(`a.createdAt >= :since ${appFilter}`, { since: last7d, ...appParam })
                .groupBy("DATE_FORMAT(a.createdAt, '%Y-%m-%d')")
                .orderBy("DATE_FORMAT(a.createdAt, '%Y-%m-%d')", 'ASC')
                .getRawMany(),

            // Top 5 usuarios más activos en 7 días
            this.auditRepository.createQueryBuilder('a')
                .select('a.userEmail', 'email')
                .addSelect('COUNT(*)', 'count')
                .where(`a.userEmail IS NOT NULL AND a.createdAt >= :since ${appFilter}`, { since: last7d, ...appParam })
                .groupBy('a.userEmail')
                .orderBy('count', 'DESC')
                .limit(5)
                .getRawMany(),

            // Desglose de acciones en 7 días
            this.auditRepository.createQueryBuilder('a')
                .select('a.userEmail', 'email')
                .addSelect('COUNT(*)', 'count')
                .where(`a.createdAt >= :since ${appFilter}`, { since: last7d, ...appParam })
                .groupBy('a.action')
                .orderBy('count', 'DESC')
                .getRawMany(),
        ]);

        return {
            today: {
                logins: loginsToday,
                failedLogins: failedLoginsToday,
                accessDenied: accessDeniedToday,
                crudOps: crudToday,
            },
            last7days: {
                activeUsers: parseInt(totalUsers7d?.count || '0'),
                dailyActivity,
                topUsers,
                actionBreakdown,
            },
        };
    }

    @Get('recent')
    @Roles('admin')
    @ApiOperation({ summary: 'Actividad reciente del sistema' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'applicationId', required: false })
    async getRecent(
        @Query('limit') limit = 20,
        @Query('applicationId') applicationId?: string,
    ) {
        const query = this.auditRepository.createQueryBuilder('e')
            .orderBy('e.createdAt', 'DESC')
            .take(Math.min(Number(limit), 100));

        if (applicationId) {
            query.where('e.applicationId = :appId', { appId: applicationId });
        }

        const entries = await query.getMany();

        return entries.map(e => ({
            id: e.id,
            action: e.action,
            entityType: e.entityType,
            userId: e.userId,
            userEmail: e.userEmail,
            description: e.description,
            isSuccess: e.isSuccess,
            createdAt: e.createdAt,
        }));
    }
}
