import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BaseSnowRequestDto, CorrelationIdService } from 'src/common';
import { M2mJwtGuard } from 'src/common/guards/m2m-jwt.guard';
import { RequestType } from 'src/common/enum/request-type.enum';
import { SnowRequestProcessingService } from '../services/snow-request-processing.service';
import { BulkheadInterceptor } from 'src/resilience/bulkhead/bulkhead.interceptor';
import { TracingClient } from '../../common/tracing.client';

@UseGuards(M2mJwtGuard)
@Controller('snow-requests/immediate')
@UseInterceptors(BulkheadInterceptor)
export class SnowRequestImmediateController {
  constructor(
    private readonly processingService: SnowRequestProcessingService,
    private readonly correlationIdService: CorrelationIdService,
  ) {}

  // =============================================
  // INCIDENTS
  // =============================================

  @Post('incidents')
  createIncident(@Body() dto: BaseSnowRequestDto) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.createIncident',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this._createIncident(dto),
    );
  }

  private _createIncident(dto: BaseSnowRequestDto) {
    return this.processingService.processImmediate(RequestType.INCIDENT, dto);
  }

  @Get('incidents/:sysId')
  async getIncidentState(@Param('sysId') sysId: string) {
    const result = await this.processingService.getIncidentState(sysId);
    if (result === null)
      throw new NotFoundException(`Incident ${sysId} not found in ServiceNow`);
    return result;
  }

  @Patch('incidents/:sysId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeIncident(
    @Param('sysId') sysId: string,
    @Body() body: { close_code: string; close_notes?: string },
  ) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.closeIncident',
      {
        kind: 'server',
        attributes: { 'sn.sysId': sysId },
        correlationId: this.correlationIdService.getCorrelationId(),
      },
      () => this._closeIncident(sysId, body),
    );
  }

  private async _closeIncident(
    sysId: string,
    body: { close_code: string; close_notes?: string },
  ) {
    await this.processingService.closeIncident(
      sysId,
      body.close_code,
      body.close_notes ?? 'Cerrado desde Event Corner',
    );
  }

  // =============================================
  // CHANGE REQUESTS
  // =============================================

  @Post('change-requests')
  createChangeRequest(@Body() dto: BaseSnowRequestDto) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.createChangeRequest',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this._createChangeRequest(dto),
    );
  }

  private _createChangeRequest(dto: BaseSnowRequestDto) {
    return this.processingService.processImmediate(
      RequestType.CHANGE_REQUEST,
      dto,
    );
  }

  // =============================================
  // PROBLEMS
  // =============================================

  @Post('problems')
  createProblem(@Body() dto: BaseSnowRequestDto) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.createProblem',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this._createProblem(dto),
    );
  }

  private _createProblem(dto: BaseSnowRequestDto) {
    return this.processingService.processImmediate(RequestType.PROBLEM, dto);
  }

  // =============================================
  // SERVICE CATALOG
  // =============================================

  @Post('service-catalog')
  createServiceCatalog(@Body() dto: BaseSnowRequestDto) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.createServiceCatalog',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this._createServiceCatalog(dto),
    );
  }

  private _createServiceCatalog(dto: BaseSnowRequestDto) {
    return this.processingService.processImmediate(
      RequestType.SERVICE_CATALOG,
      dto,
    );
  }

  // =============================================
  // KNOWLEDGE ARTICLES
  // =============================================

  @Post('knowledge-articles')
  createKnowledgeArticle(@Body() dto: BaseSnowRequestDto) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.createKnowledgeArticle',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this._createKnowledgeArticle(dto),
    );
  }

  private _createKnowledgeArticle(dto: BaseSnowRequestDto) {
    return this.processingService.processImmediate(
      RequestType.KNOWLEDGE_ARTICLE,
      dto,
    );
  }

  // =============================================
  // RELEASE TASKS
  // =============================================

  @Post('release-tasks')
  createReleaseTask(@Body() dto: BaseSnowRequestDto) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.createReleaseTask',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this._createReleaseTask(dto),
    );
  }

  private _createReleaseTask(dto: BaseSnowRequestDto) {
    return this.processingService.processImmediate(
      RequestType.RELEASE_TASK,
      dto,
    );
  }

  // =============================================
  // CONFIGURATION ITEMS
  // =============================================

  @Post('configuration-items')
  createConfigurationItem(@Body() dto: BaseSnowRequestDto) {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.createConfigurationItem',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this._createConfigurationItem(dto),
    );
  }

  private _createConfigurationItem(dto: BaseSnowRequestDto) {
    return this.processingService.processImmediate(
      RequestType.CONFIGURATION_ITEM,
      dto,
    );
  }

  // =============================================
  // COMPANIES CATALOG
  // =============================================

  @Get('companies')
  getCompanies() {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.getCompanies',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this.processingService.getCompanies(),
    );
  }

  @Get('companies/:sysId')
  async getCompanyBySysId(@Param('sysId') sysId: string) {
    const result = await this.processingService.getCompanyBySysId(sysId);
    if (result === null)
      throw new NotFoundException(`Company ${sysId} not found in ServiceNow`);
    return result;
  }

  // =============================================
  // LOCATIONS CATALOG
  // =============================================

  @Get('locations')
  getLocations() {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.getLocations',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this.processingService.getLocations(),
    );
  }

  // =============================================
  // GROUPS CATALOG
  // =============================================

  @Get('groups')
  getGroups() {
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.getGroups',
      { kind: 'server', correlationId: this.correlationIdService.getCorrelationId() },
      () => this.processingService.getGroups(),
    );
  }

  @Get('groups/:sysId')
  async getGroupBySysId(@Param('sysId') sysId: string) {
    const result = await this.processingService.getGroupBySysId(sysId);
    if (result === null)
      throw new NotFoundException(`Group ${sysId} not found in ServiceNow`);
    return result;
  }

  // =============================================
  // GENERIC UPDATE (any table, arbitrary fields)
  // =============================================

  @Patch(':table/:sysId')
  updateTicket(
    @Param('table') table: string,
    @Param('sysId') sysId: string,
    @Body() fields: Record<string, any>,
  ) {
    const requestType = Object.values(RequestType).find(
      (t) => (t as string) === table,
    );
    if (!requestType) {
      throw new BadRequestException(
        `Invalid table "${table}". Must be one of: ${Object.values(RequestType).join(', ')}`,
      );
    }
    return TracingClient.getInstance().run(
      'snowq.controller.immediate.updateTicket',
      {
        kind: 'server',
        attributes: { 'sn.table': table, 'sn.sysId': sysId },
        correlationId: this.correlationIdService.getCorrelationId(),
      },
      () => this.processingService.updateTicket(requestType, sysId, fields),
    );
  }
}
