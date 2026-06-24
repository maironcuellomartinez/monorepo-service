import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateTokenExpiryDto } from './dto/update-token-expiry.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { AdminSessionGuard } from '../admin/guards/admin-session.guard';

@ApiTags('Clients')
@ApiHeader({ name: 'x-admin-api-key', required: false, description: 'API key de administracion (obsoleto, usar sesion)' })
@UseGuards(AdminSessionGuard)
@Controller('clients')
export class ClientsController {
    constructor(private readonly service: ClientsService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Registrar aplicacion externa', description: 'Devuelve clientId y clientSecret (solo una vez).' })
    @ApiResponse({ status: 201 })
    create(@Body() dto: CreateClientDto) {
        return this.service.create(dto);
    }

    @Get()
    @ApiOperation({ summary: 'Listar aplicaciones registradas (paginado)' })
    findAll(@Query() query: ListClientsDto) {
        return this.service.findAll(query);
    }

    @Get(':clientId')
    @ApiOperation({ summary: 'Detalle de aplicacion' })
    @ApiParam({ name: 'clientId' })
    findOne(@Param('clientId') clientId: string) {
        return this.service.findOne(clientId);
    }

    @Patch(':clientId/rotate-secret')
    @ApiOperation({ summary: 'Rotar secret de una aplicacion' })
    @ApiParam({ name: 'clientId' })
    rotateSecret(@Param('clientId') clientId: string) {
        return this.service.rotateSecret(clientId);
    }

    @Patch(':clientId/token-expiry')
    @ApiOperation({ summary: 'Actualizar duracion del access token' })
    @ApiParam({ name: 'clientId' })
    updateTokenExpiry(@Param('clientId') clientId: string, @Body() dto: UpdateTokenExpiryDto) {
        return this.service.updateTokenExpiry(clientId, dto.tokenExpiresInSeconds);
    }

    @Delete(':clientId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar aplicacion (soft-delete)' })
    @ApiParam({ name: 'clientId' })
    deactivate(@Param('clientId') clientId: string) {
        return this.service.deactivate(clientId);
    }

    @Patch(':clientId/reactivate')
    @ApiOperation({ summary: 'Reactivar aplicacion desactivada' })
    @ApiParam({ name: 'clientId' })
    reactivate(@Param('clientId') clientId: string) {
        return this.service.reactivate(clientId);
    }

    @Delete(':clientId/permanent')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar aplicacion permanentemente (no reversible)' })
    @ApiParam({ name: 'clientId' })
    remove(@Param('clientId') clientId: string) {
        return this.service.remove(clientId);
    }
}
