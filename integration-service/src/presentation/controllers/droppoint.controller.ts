import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
    UseInterceptors,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggingInterceptor } from '../../shared/interceptors/logging.interceptor';
import { InternalTokenGuard } from '../../shared/guards/internal-token.guard';
import {
    DroppointConnector,
    CreateShipmentRequest,
    UpdateShipmentRequest,
} from '../../infrastructure/external/connectors/droppoint.connector';

@ApiTags('Droppoint')
@ApiBearerAuth()
@Controller('droppoint')
@UseGuards(InternalTokenGuard, ThrottlerGuard)
@UseInterceptors(LoggingInterceptor)
export class DroppointController {
    constructor(private readonly droppointConnector: DroppointConnector) {}

    @Get('boxes/free')
    @ApiOperation({ summary: 'Get available locker boxes for a machine' })
    @ApiQuery({ name: 'machineRef', required: true, description: 'Corner placename as registered in Droppoint' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Available boxes' })
    async getAvailableBoxes(@Query('machineRef') machineRef: string) {
        return this.droppointConnector.getAvailableBoxes(machineRef);
    }

    @Get('shipments/:externalId')
    @ApiOperation({ summary: 'Get shipment details by external ID' })
    @ApiParam({ name: 'externalId', description: 'External ID linking to incident' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Shipment found' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Shipment not found' })
    async getShipment(@Param('externalId') externalId: string) {
        const shipment = await this.droppointConnector.getShipment(externalId);
        if (!shipment) {
            throw new NotFoundException(`Shipment ${externalId} not found in Droppoint`);
        }
        return shipment;
    }

    @Post('shipments')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Create a new shipment (reserve locker slot)' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Shipment created' })
    async createShipment(@Body() dto: CreateShipmentRequest) {
        return this.droppointConnector.createShipment(dto);
    }

    @Patch('shipments/state')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Update shipment state' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Shipment state updated' })
    async updateShipmentState(@Body() dto: UpdateShipmentRequest) {
        return this.droppointConnector.updateShipmentState(dto);
    }

    @Delete('shipments/:externalId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancel a shipment (release locker slot)' })
    @ApiParam({ name: 'externalId', description: 'External ID of the shipment to cancel' })
    @ApiQuery({ name: 'machineRef', required: true, description: 'Machine reference of the locker' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Shipment cancelled' })
    async cancelShipment(
        @Param('externalId') externalId: string,
        @Query('machineRef') machineRef: string,
    ) {
        await this.droppointConnector.cancelShipment(externalId, machineRef);
        return { externalId, cancelled: true };
    }
}
