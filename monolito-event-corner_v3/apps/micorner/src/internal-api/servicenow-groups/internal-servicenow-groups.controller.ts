import { Controller, Get, Post, Put, Delete, Body, Param, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam,
    ApiBearerAuth } from '@nestjs/swagger';
import { SERVICENOW_GROUP_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { ServiceNowGroupService } from '@app/core/services/servicenow/servicenow-group.service';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { RegisterSnowGroupDto, UpdateSnowGroupDto, SyncSnowGroupsDto } from './dto/servicenow-groups.dto';
import { TracingService } from '@app/observability';

@ApiTags('ServiceNow Groups')
@ApiBearerAuth()
@Controller('internal/servicenow-groups')
export class InternalServiceNowGroupsController {
    constructor(
        @Inject(SERVICENOW_GROUP_SERVICE) private readonly service: ServiceNowGroupService,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Listar grupos de ServiceNow', description: 'Catálogo de grupos resolutores disponibles para asignar a corners y company-issue-configs.' })
    @ApiResponse({ status: 200, description: 'Lista de grupos' })
    async findAll() {
        return unwrapOrThrow(await this.service.findAll());
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Registrar grupo de ServiceNow', description: 'Registra un grupo resolutor en el catálogo local. El sys_id real debe configurarse directamente en la entidad.' })
    @ApiResponse({ status: 201, description: 'Grupo registrado' })
    async register(@Body() dto: RegisterSnowGroupDto) {
        return this.tracing.run('micorner.controller.snGroups.register', { kind: 'server' }, () => this._register(dto));
    }

    private async _register(dto: RegisterSnowGroupDto) {
        return unwrapOrThrow(await this.service.register(dto.groupId, dto.groupName, dto.description));
    }

    @Post('sync')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Sincronizar catálogo local con ServiceNow', description: 'Upsert masivo — reemplaza/actualiza el catálogo local con la lista de grupos vigentes en ServiceNow.' })
    @ApiResponse({ status: 200, description: 'Cantidad de grupos sincronizados' })
    async sync(@Body() dto: SyncSnowGroupsDto) {
        return this.tracing.run('micorner.controller.snGroups.sync', { kind: 'server' }, () => this._sync(dto));
    }

    private async _sync(dto: SyncSnowGroupsDto) {
        const count = unwrapOrThrow(await this.service.syncMany(dto.groups));
        return { synced: count };
    }

    @Put(':id')
    @ApiOperation({ summary: 'Actualizar grupo de ServiceNow' })
    @ApiParam({ name: 'id', example: 'uuid-group' })
    @ApiResponse({ status: 200, description: 'Grupo actualizado' })
    async update(@Param('id') id: string, @Body() dto: UpdateSnowGroupDto) {
        return this.tracing.run('micorner.controller.snGroups.update', { kind: 'server', attributes: { 'snGroup.id': id } }, () => this._update(id, dto));
    }

    private async _update(id: string, dto: UpdateSnowGroupDto) {
        return unwrapOrThrow(await this.service.update(id, dto));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar grupo de ServiceNow' })
    @ApiParam({ name: 'id', example: 'uuid-group' })
    @ApiResponse({ status: 204, description: 'Eliminado' })
    async delete(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.snGroups.delete', { kind: 'server', attributes: { 'snGroup.id': id } }, () => this._delete(id));
    }

    private async _delete(id: string) {
        unwrapOrThrow(await this.service.delete(id));
    }
}
