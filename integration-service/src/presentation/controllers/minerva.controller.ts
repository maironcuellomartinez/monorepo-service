import {
    Controller,
    Get,
    Param,
    HttpStatus,
    UseGuards,
    UseInterceptors,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggingInterceptor } from '../../shared/interceptors/logging.interceptor';
import { InternalTokenGuard } from '../../shared/guards/internal-token.guard';
import { MinervaConnector } from '../../infrastructure/external/connectors/minerva.connector';

@ApiTags('Minerva')
@ApiBearerAuth()
@Controller('minerva')
@UseGuards(InternalTokenGuard, ThrottlerGuard)
@UseInterceptors(LoggingInterceptor)
export class MinervaController {
    constructor(
        private readonly minervaConnector: MinervaConnector,
    ) {}

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

    @Get('users/:userId/devices')
    @ApiOperation({ summary: 'Get all devices assigned to a user' })
    @ApiParam({ name: 'userId', description: 'User ID' })
    @ApiResponse({ status: HttpStatus.OK, description: 'User devices' })
    async getDevicesByUser(@Param('userId') userId: string) {
        return this.minervaConnector.getDevicesByUser(userId);
    }
}
