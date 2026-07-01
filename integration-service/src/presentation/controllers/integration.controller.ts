import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    HttpCode,
    HttpStatus,
    UseGuards,
    UseInterceptors,
    Inject,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggingInterceptor } from '../../shared/interceptors/logging.interceptor';
import { InternalTokenGuard } from '../../shared/guards/internal-token.guard';

import { ProcessIntegrationDto } from '../../application/dto/process-integration.dto';
import { ProcessAppointmentCreatedUseCase } from '../../application/use-cases/process-appointment-created.usecase';
import { IIntegrationEventRepository } from '../../domain/interfaces/repository.interface';
import { TracingService } from '../../infrastructure/monitoring/tracing.service';

@ApiTags('Integration')
@ApiBearerAuth()
@Controller('integration')
@UseGuards(InternalTokenGuard, ThrottlerGuard)
@UseInterceptors(LoggingInterceptor)
export class IntegrationController {
    constructor(
        private readonly processAppointmentUseCase: ProcessAppointmentCreatedUseCase,
        @Inject('IIntegrationEventRepository')
        private readonly integrationEventRepository: IIntegrationEventRepository,
        private readonly tracing: TracingService,
    ) { }

    @Post('appointments')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Execute external integrations for an appointment event' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Integration result' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request data' })
    async processAppointment(@Body() dto: ProcessIntegrationDto) {
        return this.tracing.run('integration.controller.integration.processAppointment', { kind: 'server' }, () => this._processAppointment(dto));
    }

    private async _processAppointment(dto: ProcessIntegrationDto) {
        return this.processAppointmentUseCase.execute(dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get integration event status' })
    @ApiParam({ name: 'id', description: 'Integration event UUID' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Integration event found' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Integration event not found' })
    async getStatus(@Param('id') id: string) {
        const event = await this.integrationEventRepository.findById(id);

        if (!event) {
            throw new NotFoundException(`Integration event ${id} not found`);
        }

        return {
            id: event.id,
            correlationId: event.correlationId,
            eventType: event.eventType,
            source: event.source,
            status: event.status,
            retryCount: event.retryCount,
            error: event.error ?? null,
            steps: event.steps ?? [],
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
        };
    }

    @Get('correlation/:correlationId')
    @ApiOperation({ summary: 'Get integration event by correlation ID' })
    @ApiParam({ name: 'correlationId', description: 'Correlation ID' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Integration event found' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Integration event not found' })
    async getByCorrelationId(@Param('correlationId') correlationId: string) {
        const event = await this.integrationEventRepository.findByCorrelationId(correlationId);

        if (!event) {
            throw new NotFoundException(`Integration event with correlationId ${correlationId} not found`);
        }

        return {
            id: event.id,
            correlationId: event.correlationId,
            eventType: event.eventType,
            source: event.source,
            status: event.status,
            retryCount: event.retryCount,
            error: event.error ?? null,
            steps: event.steps ?? [],
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
        };
    }
}
