import { Controller, Post, Body, UseGuards, HttpCode, Get, Param, Query } from '@nestjs/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { AbacService } from '../services/abac.service';
import { AuditAction, AuditService } from '../services/audit.service';
import { CanAccessDto, BatchEvaluateDto } from '../dtos/can-access.dto';
import { TrackPerformance, BusinessMetric, LoggerService } from '../../observability';

@Controller('abac')
@UseGuards(ApiKeyGuard)
export class AbacController {
  constructor(
    private abacService: AbacService,
    private auditService: AuditService,
    private logger: LoggerService,
  ) { }

  @Post('can-access')
  @HttpCode(200)
  @TrackPerformance()
  @BusinessMetric('abac_can_access', { endpoint: 'can-access' })
  async canAccess(@Body() body: CanAccessDto) {
    const result = await this.abacService.canAccess(
      body.userId,
      body.applicationId,
      body.resource,
      body.action,
      body.context ?? {},
    );

    // Best-effort: un fallo al auditar no debe tumbar una decisión de acceso ya calculada
    this.auditService.logEvent(
      result ? AuditAction.ACCESS_GRANTED : AuditAction.ACCESS_DENIED,
      {
        permition: `${body.resource}:${body.action}`,
        userId: body.userId,
        applicationId: body.applicationId,
        isSuccess: result,
        description: `${body.resource}:${body.action} — ${result ? 'acceso permitido' : 'acceso denegado'}`,
      },
    ).catch((err: unknown) => {
      this.logger.warn(`Audit log failed en can-access: ${(err as Error).message}`, 'ABAC');
    });

    return { granted: result };
  }

  @Get('user-roles')
  @HttpCode(200)
  async getUserRoles(
    @Query('userId') userId: string,
    @Query('applicationId') applicationId: string,
  ) {
    const roles = await this.abacService.getUserRoles(userId, applicationId);
    return { roles: roles.map(r => r.name) };
  }

  @Post('batch-evaluate')
  @HttpCode(200)
  @TrackPerformance()
  @BusinessMetric('abac_batch_evaluate', { endpoint: 'batch-evaluate' })
  async batchEvaluate(@Body() body: BatchEvaluateDto) {
    const results = await Promise.all(
      body.requests.map((request) =>
        this.abacService.canAccess(
          request.userId,
          request.applicationId,
          request.resource,
          request.action,
          request.context ?? {},
        ),
      ),
    );

    const evaluated = body.requests.map((request, index) => ({
      ...request,
      granted: results[index],
    }));

    // Best-effort: un fallo al auditar no debe tumbar las decisiones ya calculadas
    Promise.all(
      evaluated.map((item) =>
        this.auditService.logEvent(
          item.granted ? AuditAction.ACCESS_GRANTED : AuditAction.ACCESS_DENIED,
          {
            permition: `${item.resource}:${item.action}`,
            userId: item.userId,
            applicationId: item.applicationId,
            isSuccess: item.granted,
            description: `${item.resource}:${item.action} — ${item.granted ? 'acceso permitido' : 'acceso denegado'}`,
          },
        ),
      ),
    ).catch((err: unknown) => {
      this.logger.warn(`Audit log failed en batch-evaluate: ${(err as Error).message}`, 'ABAC');
    });

    return { results: evaluated };
  }
}
