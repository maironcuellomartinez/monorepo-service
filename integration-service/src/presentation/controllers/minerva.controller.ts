import {
    Controller,
    Get,
    Post,
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
import { MinervaConnector, MinervaAssignmentRequest } from '../../infrastructure/external/connectors/minerva.connector';

class AssignDeviceDto implements MinervaAssignmentRequest {
    serialNumber: string;
    appointmentId: string;
    userId: string;
    userName?: string;
    cornerId: string;
}

class ReleaseDeviceDto {
    reason?: string;
}

@ApiTags('Minerva')
@ApiBearerAuth()
@Controller('minerva')
@UseGuards(InternalTokenGuard, ThrottlerGuard)
@UseInterceptors(LoggingInterceptor)
export class MinervaController {
    constructor(private readonly minervaConnector: MinervaConnector) {}

    @Get('devices')
    @ApiOperation({ summary: 'List available devices by type' })
    @ApiQuery({ name: 'deviceType', required: true })
    @ApiResponse({ status: HttpStatus.OK, description: 'Available devices' })
    async listAvailableDevices(@Query('deviceType') deviceType: string) {
        return this.minervaConnector.listAvailableDevices(deviceType);
    }

    @Get('devices/:serial')
    @ApiOperation({ summary: 'Get device by serial number' })
    @ApiParam({ name: 'serial', description: 'Device serial number' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Device found' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Device not found' })
    async getDevice(@Param('serial') serial: string) {
        const device = await this.minervaConnector.getDeviceBySerial(serial);
        if (!device) {
            throw new NotFoundException(`Device ${serial} not found in Minerva`);
        }
        return device;
    }

    @Post('devices/:serial/assign')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Assign device to a user/appointment' })
    @ApiParam({ name: 'serial', description: 'Device serial number' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Device assigned' })
    async assignDevice(
        @Param('serial') serial: string,
        @Body() dto: AssignDeviceDto,
    ) {
        return this.minervaConnector.assignDevice({ ...dto, serialNumber: serial });
    }

    @Post('devices/:serial/release')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Release a previously assigned device' })
    @ApiParam({ name: 'serial', description: 'Device serial number' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Device released' })
    async releaseDevice(@Param('serial') serial: string) {
        await this.minervaConnector.releaseDevice(serial);
        return { serialNumber: serial, released: true };
    }

    @Get('users/:userId/devices')
    @ApiOperation({ summary: 'Get all devices assigned to a user' })
    @ApiParam({ name: 'userId', description: 'User ID' })
    @ApiResponse({ status: HttpStatus.OK, description: 'User devices' })
    async getDevicesByUser(@Param('userId') userId: string) {
        return this.minervaConnector.getDevicesByUser(userId);
    }
}
