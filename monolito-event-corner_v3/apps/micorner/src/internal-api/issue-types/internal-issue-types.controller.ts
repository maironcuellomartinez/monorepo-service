// internal-api/issue-types/internal-issue-types.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ISSUE_TYPE_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IIssueTypeService } from '@app/core/ports/incoming/admin/issue-type-service.port';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { IssueCategory } from '@app/core/domain/enums/issue-category.enum';
import { CreateIssueTypeDto, UpdateIssueTypeDto } from './dto/issue-types.dto';
import { TracingService } from '@app/observability';

@ApiTags('Issue Types')
@ApiBearerAuth()
@Controller('internal/issue-types')
export class InternalIssueTypesController {
    constructor(
        @Inject(ISSUE_TYPE_SERVICE) private readonly service: IIssueTypeService,
        private readonly tracing: TracingService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Listar tipos de incidencia', description: 'Soporta filtros por categoría, tipo de dispositivo y visibilidad para usuarios.' })
    @ApiQuery({ name: 'treeId', required: false })
    @ApiQuery({ name: 'category', required: false, enum: IssueCategory })
    @ApiQuery({ name: 'deviceType', required: false, example: 'laptop' })
    @ApiQuery({ name: 'visibleToUsers', required: false, example: 'true', description: '"true" o "false"' })
    @ApiResponse({ status: 200, description: 'Lista de tipos de incidencia' })
    async list(
        @Query('treeId') treeId?: string,
        @Query('category') category?: IssueCategory,
        @Query('deviceType') deviceType?: string,
        @Query('visibleToUsers') visibleToUsers?: string,
    ) {
        return unwrapOrThrow(await this.service.listIssueTypes({
            treeId,
            category,
            deviceType,
            visibleToUsers: visibleToUsers !== undefined ? visibleToUsers === 'true' : undefined,
        }));
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener tipo de incidencia por ID' })
    @ApiParam({ name: 'id', example: 'uuid-issue-type' })
    @ApiResponse({ status: 200, description: 'Detalle del tipo de incidencia' })
    @ApiResponse({ status: 404, description: 'No encontrado' })
    async getOne(@Param('id') id: string) {
        return unwrapOrThrow(await this.service.getIssueType(id));
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear tipo de incidencia' })
    @ApiResponse({ status: 201, description: 'Tipo de incidencia creado' })
    async create(@Body() body: CreateIssueTypeDto) {
        return this.tracing.run('micorner.controller.issueTypes.create', { kind: 'server' }, () => this._create(body));
    }

    private async _create(body: CreateIssueTypeDto) {
        return unwrapOrThrow(await this.service.createIssueType(body));
    }

    @Put(':id')
    @ApiOperation({ summary: 'Actualizar tipo de incidencia', description: 'Actualización parcial — solo se modifican los campos enviados.' })
    @ApiParam({ name: 'id', example: 'uuid-issue-type' })
    @ApiResponse({ status: 200, description: 'Tipo actualizado' })
    async update(@Param('id') id: string, @Body() body: UpdateIssueTypeDto) {
        return this.tracing.run('micorner.controller.issueTypes.update', { kind: 'server', attributes: { 'issueType.id': id } }, () => this._update(id, body));
    }

    private async _update(id: string, body: UpdateIssueTypeDto) {
        return unwrapOrThrow(await this.service.updateIssueType({ id, ...body }));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar tipo de incidencia' })
    @ApiParam({ name: 'id', example: 'uuid-issue-type' })
    @ApiResponse({ status: 204, description: 'Eliminado' })
    @ApiResponse({ status: 404, description: 'No encontrado' })
    async delete(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.issueTypes.delete', { kind: 'server', attributes: { 'issueType.id': id } }, () => this._delete(id));
    }

    private async _delete(id: string) {
        unwrapOrThrow(await this.service.deleteIssueType(id));
    }
}
