// api-gateway/inbound/requests/requests.controller.ts
import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    HttpException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateRequestDto, UpdateRequestStatusDto } from './dto/create-request.dto';
import { TracingService } from '@app/observability';

@ApiTags('Requests')
@ApiBearerAuth('jwt')
@Controller('api/requests')
export class RequestsController {
    constructor(
        private readonly monolith: MonolithClient,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @Permission('request', 'list')
    @ApiOperation({ summary: 'Listar solicitudes', description: 'Requiere technicianId o customerId como query param.' })
    @ApiQuery({ name: 'technicianId', required: false })
    @ApiQuery({ name: 'customerId', required: false })
    async list(
        @Query('technicianId') technicianId?: string,
        @Query('customerId') customerId?: string,
    ) {
        if (technicianId) {
            return this.monolith.get(`/requests/technician/${technicianId}`);
        }
        if (customerId) {
            return this.monolith.get(`/requests/customer/${customerId}`);
        }
        throw new HttpException('Query param "technicianId" or "customerId" is required', HttpStatus.BAD_REQUEST);
    }

    @Get(':id')
    @Permission('request', 'read')
    @ApiOperation({ summary: 'Obtener solicitud por ID' })
    @ApiParam({ name: 'id' })
    async getOne(@Param('id') id: string) {
        return this.monolith.get(`/requests/${id}`);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles('employee', 'technician', 'admin', 'super-admin')
    @Permission('request', 'create')
    @ApiOperation({ summary: 'Crear solicitud' })
    async create(@Body() dto: CreateRequestDto) {
        return this.tracing.run('gateway.controller.requests.create', { kind: 'server' }, () => this._create(dto));
    }
    private async _create(dto: CreateRequestDto) {
        return this.monolith.post('/requests', dto);
    }

    @Patch(':id/status')
    @Roles('technician', 'admin', 'super-admin')
    @Permission('request', 'change-status')
    @ApiOperation({ summary: 'Cambiar estado de solicitud' })
    @ApiParam({ name: 'id' })
    async updateStatus(@Param('id') id: string, @Body() dto: UpdateRequestStatusDto) {
        return this.tracing.run('gateway.controller.requests.updateStatus', { kind: 'server', attributes: { 'request.id': id } }, () => this._updateStatus(id, dto));
    }
    private async _updateStatus(id: string, dto: UpdateRequestStatusDto) {
        return this.monolith.patch(`/requests/${id}/status`, dto);
    }
}
