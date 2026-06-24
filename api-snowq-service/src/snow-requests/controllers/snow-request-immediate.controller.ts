import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { BaseSnowRequestDto } from 'src/common';
import { M2mJwtGuard } from 'src/common/guards/m2m-jwt.guard';
import { RequestType } from 'src/common/enum/request-type.enum';
import { SnowRequestProcessingService } from '../services/snow-request-processing.service';
import { BulkheadInterceptor } from 'src/resilience/bulkhead/bulkhead.interceptor';

@UseGuards(M2mJwtGuard)
@Controller('snow-requests/immediate')
@UseInterceptors(BulkheadInterceptor)
export class SnowRequestImmediateController {
    constructor(private readonly processingService: SnowRequestProcessingService) {}

    // =============================================
    // INCIDENTS
    // =============================================

    @Post('incidents')
    createIncident(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.processImmediate(RequestType.INCIDENT, dto);
    }

    @Get('incidents/:sysId')
    async getIncidentState(@Param('sysId') sysId: string) {
        const result = await this.processingService.getIncidentState(sysId);
        if (result === null) throw new NotFoundException(`Incident ${sysId} not found in ServiceNow`);
        return result;
    }

    @Patch('incidents/:sysId/close')
    @HttpCode(HttpStatus.NO_CONTENT)
    async closeIncident(
        @Param('sysId') sysId: string,
        @Body() body: { close_code: string; close_notes?: string },
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
        return this.processingService.processImmediate(RequestType.CHANGE_REQUEST, dto);
    }

    // =============================================
    // PROBLEMS
    // =============================================

    @Post('problems')
    createProblem(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.processImmediate(RequestType.PROBLEM, dto);
    }

    // =============================================
    // SERVICE CATALOG
    // =============================================

    @Post('service-catalog')
    createServiceCatalog(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.processImmediate(RequestType.SERVICE_CATALOG, dto);
    }

    // =============================================
    // KNOWLEDGE ARTICLES
    // =============================================

    @Post('knowledge-articles')
    createKnowledgeArticle(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.processImmediate(RequestType.KNOWLEDGE_ARTICLE, dto);
    }

    // =============================================
    // RELEASE TASKS
    // =============================================

    @Post('release-tasks')
    createReleaseTask(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.processImmediate(RequestType.RELEASE_TASK, dto);
    }

    // =============================================
    // CONFIGURATION ITEMS
    // =============================================

    @Post('configuration-items')
    createConfigurationItem(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.processImmediate(RequestType.CONFIGURATION_ITEM, dto);
    }
}
