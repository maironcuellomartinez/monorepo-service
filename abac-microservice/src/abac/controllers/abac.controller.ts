import { Controller, Post, Body, UseGuards, HttpCode, Get, Param, Query, Req, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
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

  /**
   * El caller (identificado por su x-api-key vía ApiKeyGuard) solo puede
   * evaluar/consultar accesos sobre su propia aplicación — sin este check,
   * cualquier servicio con una API key válida podía consultar y enumerar
   * autorizaciones del ecosistema de otro (ver M-07 en la auditoría de
   * 2026-08-31). Los callers legítimos de este ecosistema siempre piden por
   * su propio ABAC_APP_ID (ver AbacClient del gateway/micorner/snowq), así
   * que esto no restringe ningún uso real.
   */
  private assertOwnApplication(request: Request, applicationId: string): void {
    const callerAppId = (request as any).application?.id;
    if (callerAppId && applicationId !== callerAppId) {
      throw new ForbiddenException(
        'La API key no está autorizada para consultar esta aplicación',
      );
    }
  }

  @Post('can-access')
  @HttpCode(200)
  @TrackPerformance()
  @BusinessMetric('abac_can_access', { endpoint: 'can-access' })
  async canAccess(@Body() body: CanAccessDto, @Req() req: Request) {
    this.assertOwnApplication(req, body.applicationId);

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
    @Req() req: Request,
  ) {
    this.assertOwnApplication(req, applicationId);
    const roles = await this.abacService.getUserRoles(userId, applicationId);
    return { roles: roles.map(r => r.name) };
  }

  @Post('batch-evaluate')
  @HttpCode(200)
  @TrackPerformance()
  @BusinessMetric('abac_batch_evaluate', { endpoint: 'batch-evaluate' })
  async batchEvaluate(@Body() body: BatchEvaluateDto, @Req() req: Request) {
    for (const item of body.requests) {
      this.assertOwnApplication(req, item.applicationId);
    }

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
