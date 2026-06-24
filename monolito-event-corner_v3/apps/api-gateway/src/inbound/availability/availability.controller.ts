// api-gateway/inbound/availability/availability.controller.ts
import {
    Controller,
    Get,
    Param,
    Query,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';

@ApiTags('Availability')
@ApiBearerAuth('jwt')
@Controller('api/availability')
export class AvailabilityController {
    constructor(private readonly monolith: MonolithClient) {}

    @Get(':cornerId')
    @Permission('availability', 'read')
    @ApiOperation({ summary: 'Disponibilidad de slots', description: 'Devuelve los slots disponibles en un corner para una fecha y duración.' })
    @ApiParam({ name: 'cornerId' })
    @ApiQuery({ name: 'date', description: 'Fecha ISO 8601 (YYYY-MM-DD)' })
    @ApiQuery({ name: 'duration', description: 'Duración en minutos' })
    @ApiQuery({ name: 'userId', required: false, description: 'ID del técnico. Permite ver slots HELD propios como disponibles.' })
    async getAvailability(
        @Param('cornerId') cornerId: string,
        @Query('date') date: string,
        @Query('duration') duration: string,
        @Query('userId') userId?: string,
    ) {
        if (!date) throw new BadRequestException('Query param "date" is required');
        if (!duration) throw new BadRequestException('Query param "duration" is required');
        if (isNaN(new Date(date).getTime())) throw new BadRequestException('Invalid date format');
        if (isNaN(parseInt(duration)) || parseInt(duration) <= 0) throw new BadRequestException('Invalid duration');

        return this.monolith.get('/availability', { cornerId, date, duration, ...(userId && { userId }) });
    }

    @Get(':cornerId/technicians')
    @Permission('availability', 'read-technicians')
    @ApiOperation({ summary: 'Disponibilidad de técnicos', description: 'Devuelve qué técnicos están disponibles en un corner para una fecha.' })
    @ApiParam({ name: 'cornerId' })
    @ApiQuery({ name: 'date', description: 'Fecha ISO 8601 (YYYY-MM-DD)' })
    async getTechniciansAvailability(
        @Param('cornerId') cornerId: string,
        @Query('date') date: string,
    ) {
        if (!date) throw new BadRequestException('Query param "date" is required');
        if (isNaN(new Date(date).getTime())) throw new BadRequestException('Invalid date format');

        return this.monolith.get('/availability/technicians', { cornerId, date });
    }
}
