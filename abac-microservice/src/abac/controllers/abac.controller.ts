import { Controller, Post, Body, UseGuards, HttpCode, Get, Param, Query } from '@nestjs/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { AbacService } from '../services/abac.service';
import { AuditAction, AuditService } from '../services/audit.service';
import { CanAccessDto, BatchEvaluateDto } from '../dtos/can-access.dto';
import { TrackPerformance, BusinessMetric } from '../../observability';

@Controller('abac')
@UseGuards(ApiKeyGuard)
export class AbacController {
  constructor(private abacService: AbacService, private auditService: AuditService) { }

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

    await this.auditService.logEvent(
      result ? AuditAction.ACCESS_GRANTED : AuditAction.ACCESS_DENIED,
      {
        permition: `${body.resource}:${body.action}`,
        userId: body.userId,
        applicationId: body.applicationId,
        isSuccess: result,
        description: `${body.resource}:${body.action} — ${result ? 'acceso permitido' : 'acceso denegado'}`,
      },
    );

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

    await Promise.all(
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
    );

    return { results: evaluated };
  }
}
