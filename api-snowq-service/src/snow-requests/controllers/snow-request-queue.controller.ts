import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { BaseSnowRequestDto } from 'src/common';
import { M2mJwtGuard } from 'src/common/guards/m2m-jwt.guard';
import { RequestType } from 'src/common/enum/request-type.enum';
import { SnowRequestProcessingService } from '../services/snow-request-processing.service';
import { SnowRequestService } from '../services/snow-request.service';
import { BulkheadInterceptor } from 'src/resilience/bulkhead/bulkhead.interceptor';
import { DlqFilterDto } from '../dto/dlq-filter.dto';

const PRIORITY_LABEL: Record<number, string> = { 4: 'CRITICAL', 3: 'HIGH', 2: 'MEDIUM', 1: 'LOW' };
const toLabel = (p: number) => PRIORITY_LABEL[p] ?? 'MEDIUM';

@UseGuards(M2mJwtGuard)
@Controller('snow-requests')
@UseInterceptors(BulkheadInterceptor)
export class SnowRequestQueueController {
    constructor(
        private readonly processingService: SnowRequestProcessingService,
        private readonly snowRequestService: SnowRequestService,
    ) { }

    // =============================================
    // INCIDENTS
    // =============================================

    @Post('incidents')
    @HttpCode(HttpStatus.ACCEPTED)
    createIncident(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.enqueue(RequestType.INCIDENT, dto);
    }

    // =============================================
    // CHANGE REQUESTS
    // =============================================

    @Post('change-requests')
    @HttpCode(HttpStatus.ACCEPTED)
    createChangeRequest(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.enqueue(RequestType.CHANGE_REQUEST, dto);
    }

    // =============================================
    // PROBLEMS
    // =============================================

    @Post('problems')
    @HttpCode(HttpStatus.ACCEPTED)
    createProblem(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.enqueue(RequestType.PROBLEM, dto);
    }

    // =============================================
    // SERVICE CATALOG
    // =============================================

    @Post('service-catalog')
    @HttpCode(HttpStatus.ACCEPTED)
    createServiceCatalog(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.enqueue(RequestType.SERVICE_CATALOG, dto);
    }

    // =============================================
    // KNOWLEDGE ARTICLES
    // =============================================

    @Post('knowledge-articles')
    @HttpCode(HttpStatus.ACCEPTED)
    createKnowledgeArticle(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.enqueue(RequestType.KNOWLEDGE_ARTICLE, dto);
    }

    // =============================================
    // RELEASE TASKS
    // =============================================

    @Post('release-tasks')
    @HttpCode(HttpStatus.ACCEPTED)
    createReleaseTask(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.enqueue(RequestType.RELEASE_TASK, dto);
    }

    // =============================================
    // CONFIGURATION ITEMS
    // =============================================

    @Post('configuration-items')
    @HttpCode(HttpStatus.ACCEPTED)
    createConfigurationItem(@Body() dto: BaseSnowRequestDto) {
        return this.processingService.enqueue(RequestType.CONFIGURATION_ITEM, dto);
    }

    // =============================================
    // DLQ — REGISTROS FALLIDOS
    // =============================================

    /**
     * Lista TODOS los registros para debugging del dashboard.
     */
    @Get('all')
    @HttpCode(HttpStatus.OK)
    async getAllRequests() {
        const entities = await this.snowRequestService.findAll();
        return entities.map(e => ({
            correlationId: e.correlationId,
            internalNumber: e.internalNumber,
            type: e.type,
            priority: toLabel(e.priority),
            status: e.status,
            source: e.source,
            payload: e.payload,
            fingerprint: e.fingerprint,
            retryCount: e.retryCount,
            maxRetries: e.maxRetries,
            lastError: e.lastError,
            nextRetryAt: e.nextRetryAt,
            expiresAt: e.expiresAt,
            sysId: e.sysId,
            snowNumber: e.snowNumber,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
        }));
    }

    /**
     * Lista todos los registros en estado DELIVERED para el dashboard.
     */
    @Get('delivered')
    @HttpCode(HttpStatus.OK)
    async getDeliveredRequests() {
        const entities = await this.snowRequestService.findDelivered();
        return entities.map(e => ({
            correlationId: e.correlationId,
            internalNumber: e.internalNumber,
            type: e.type,
            priority: toLabel(e.priority),
            status: e.status,
            source: e.source,
            payload: e.payload,
            sysId: e.sysId,
            snowNumber: e.snowNumber,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
        }));
    }

    /**
     * Lista todos los registros en estado FAILED (DLQ lógica).
     * Incluye lastError y retryCount para diagnóstico.
     */
    @Get('failed')
    @HttpCode(HttpStatus.OK)
    async getFailedRequests() {
        const entities = await this.snowRequestService.findFailed();
        return entities.map(e => ({
            correlationId: e.correlationId,
            internalNumber: e.internalNumber,
            type: e.type,
            priority: toLabel(e.priority),
            status: e.status,
            source: e.source,
            payload: e.payload,
            fingerprint: e.fingerprint,
            retryCount: e.retryCount,
            maxRetries: e.maxRetries,
            lastError: e.lastError,
            nextRetryAt: e.nextRetryAt,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
        }));
    }

    /**
     * Reencola todos los registros FAILED de una vez.
     * Útil tras resolver un problema sistémico (ej: SN estuvo caído).
     * IMPORTANTE: debe declararse antes de failed/:correlationId/retry
     * para que NestJS no lo interprete como un correlationId literal "retry-all".
     */
    @Post('failed/retry-all')
    @HttpCode(HttpStatus.OK)
    async retryAllFailed() {
        const requeued = await this.snowRequestService.retryAllFailed();
        return { requeued };
    }

    /**
     * Reencola registros FAILED que cumplan el filtro.
     * Body (todos opcionales): { type, source, since, until }
     * Ejemplo: reintentar solo incidentes que fallaron entre las 14:00 y las 16:00.
     */
    @Post('failed/retry')
    @HttpCode(HttpStatus.OK)
    async retryFiltered(@Body() filter: DlqFilterDto) {
        const requeued = await this.snowRequestService.retryFiltered(filter);
        return { requeued, filter };
    }

    /**
     * Reencola un registro FAILED individual.
     * Resetea retryCount=0 y vuelve a QUEUED para que el worker lo procese.
     */
    @Post('failed/:correlationId/retry')
    @HttpCode(HttpStatus.OK)
    async retryFailedRequest(@Param('correlationId') correlationId: string) {
        const entity = await this.snowRequestService.retryFailed(correlationId);
        if (!entity) {
            throw new NotFoundException(`Solicitud no encontrada o no está en estado FAILED: ${correlationId}`);
        }
        return {
            correlationId: entity.correlationId,
            internalNumber: entity.internalNumber,
            status: entity.status,
            retryCount: entity.retryCount,
        };
    }

    /**
     * Descarta registros FAILED en lote según filtro.
     * Body (todos opcionales): { type, source, since, until }
     * Los registros pasan a DISCARDED y no serán reintentados.
     */
    @Delete('failed')
    @HttpCode(HttpStatus.OK)
    async discardFiltered(@Body() filter: DlqFilterDto) {
        const discarded = await this.snowRequestService.discardFiltered(filter);
        return { discarded, filter };
    }

    /**
     * Descarta un registro FAILED individual.
     * Pasa a DISCARDED — no aparece en DLQ activa ni en stats.
     */
    @Delete('failed/:correlationId')
    @HttpCode(HttpStatus.OK)
    async discardFailedRequest(@Param('correlationId') correlationId: string) {
        const entity = await this.snowRequestService.discardFailed(correlationId);
        if (!entity) {
            throw new NotFoundException(`Solicitud no encontrada o no está en estado FAILED: ${correlationId}`);
        }
        return {
            correlationId: entity.correlationId,
            internalNumber: entity.internalNumber,
            status: entity.status,
        };
    }

    /**
     * Estadísticas de la DLQ: total, desglose por tipo y prioridad,
     * top 10 patrones de error, fecha del más antiguo y más reciente.
     */
    @Get('dlq/stats')
    @HttpCode(HttpStatus.OK)
    async getDlqStats() {
        return this.snowRequestService.getDlqStats();
    }

    // =============================================
    // CONSULTA DE ESTADO
    // =============================================

    @Get(':correlationId')
    @HttpCode(HttpStatus.OK)
    async getRequestStatus(@Param('correlationId') correlationId: string) {
        const entity = await this.snowRequestService.findByCorrelationId(correlationId);

        if (!entity) {
            throw new NotFoundException(`Solicitud no encontrada: ${correlationId}`);
        }

        return {
            correlationId: entity.correlationId,
            internalNumber: entity.internalNumber,
            type: entity.type,
            priority: toLabel(entity.priority),
            status: entity.status,
            payload: entity.payload,
            fingerprint: entity.fingerprint,
            sysId: entity.sysId ?? null,
            snowNumber: entity.snowNumber ?? null,
            lastError: entity.lastError ?? null,
            retryCount: entity.retryCount,
            maxRetries: entity.maxRetries,
            nextRetryAt: entity.nextRetryAt,
            expiresAt: entity.expiresAt,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
}
