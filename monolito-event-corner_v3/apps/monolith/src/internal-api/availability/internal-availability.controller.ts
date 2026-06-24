// internal-api/availability/internal-availability.controller.ts
import { Controller, Get, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery,
    ApiBearerAuth } from '@nestjs/swagger';
import { AVAILABILITY_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IAvailabilityService } from '@app/core/ports/incoming/availability/availability-service.port';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';

@ApiTags('Availability')
@ApiBearerAuth()
@Controller('internal/availability')
export class InternalAvailabilityController {
    constructor(
        @Inject(AVAILABILITY_SERVICE) private readonly service: IAvailabilityService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Disponibilidad de slots', description: 'Retorna los slots disponibles para un corner en una fecha dada, considerando la duración requerida.' })
    @ApiQuery({ name: 'cornerId', required: true, example: 'uuid-corner' })
    @ApiQuery({ name: 'date', required: true, example: '2026-03-25', description: 'Fecha en formato ISO (YYYY-MM-DD o ISO 8601)' })
    @ApiQuery({ name: 'duration', required: true, example: '60', description: 'Duración requerida en minutos' })
    @ApiQuery({ name: 'userId', required: false, description: 'ID del técnico solicitante. Permite ver slots HELD propios como disponibles.' })
    @ApiResponse({ status: 200, description: 'Lista de slots con su disponibilidad' })
    async getAvailability(
        @Query('cornerId') cornerId: string,
        @Query('date') date: string,
        @Query('duration') duration: string,
        @Query('userId') userId?: string,
    ) {
        return unwrapOrThrow(await this.service.getAvailability({
            cornerId,
            date: new Date(date),
            duration: parseInt(duration),
            userId: userId || undefined,
        }));
    }

    @Get('technicians')
    @ApiOperation({ summary: 'Disponibilidad de técnicos', description: 'Retorna el estado de disponibilidad de cada técnico asignado al corner para la fecha indicada.' })
    @ApiQuery({ name: 'cornerId', required: true, example: 'uuid-corner' })
    @ApiQuery({ name: 'date', required: true, example: '2026-03-25' })
    @ApiResponse({ status: 200, description: 'Lista de técnicos con su estado de disponibilidad' })
    async getTechnicians(
        @Query('cornerId') cornerId: string,
        @Query('date') date: string,
    ) {
        return unwrapOrThrow(await this.service.getTechniciansAvailability(cornerId, new Date(date)));
    }
}
