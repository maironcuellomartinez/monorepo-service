// api-gateway/inbound/admin/issue-types.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateIssueTypeDto, UpdateIssueTypeDto } from './dto/create-issue-type.dto';
import { TracingService } from '@app/observability';

@ApiTags('Issue Types')
@ApiBearerAuth('jwt')
@Controller('api/admin/issue-types')
export class IssueTypesController {
    constructor(
        private readonly monolith: MonolithClient,
        private readonly tracing: TracingService,
    ) { }

    @Get()
    @Permission('issue-type', 'list')
    @ApiOperation({ summary: 'Listar tipos de incidencia' })
    @ApiQuery({ name: 'treeId', required: false })
    @ApiQuery({ name: 'category', required: false })
    @ApiQuery({ name: 'deviceType', required: false })
    @ApiQuery({ name: 'visibleToUsers', required: false })
    async list(
        @Query('treeId') treeId?: string,
        @Query('category') category?: string,
        @Query('deviceType') deviceType?: string,
        @Query('visibleToUsers') visibleToUsers?: string,
    ) {
        return this.monolith.get('/issue-types', { treeId, category, deviceType, visibleToUsers });
    }

    @Get(':id')
    @Permission('issue-type', 'read')
    @ApiOperation({ summary: 'Obtener tipo de incidencia por ID' })
    @ApiParam({ name: 'id' })
    async getOne(@Param('id') id: string) {
        return this.monolith.get(`/issue-types/${id}`);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles('admin', 'manager', 'super-admin')
    @Permission('issue-type', 'create')
    @ApiOperation({ summary: 'Crear tipo de incidencia' })
    async create(@Body() dto: CreateIssueTypeDto) {
        return this.tracing.run('gateway.controller.issueTypes.create', { kind: 'server' }, () => this._create(dto));
    }
    private async _create(dto: CreateIssueTypeDto) {
        return this.monolith.post('/issue-types', dto);
    }

    @Put(':id')
    @Roles('admin', 'manager', 'super-admin')
    @Permission('issue-type', 'update')
    @ApiOperation({ summary: 'Actualizar tipo de incidencia' })
    @ApiParam({ name: 'id' })
    async update(@Param('id') id: string, @Body() dto: UpdateIssueTypeDto) {
        return this.tracing.run('gateway.controller.issueTypes.update', { kind: 'server', attributes: { 'issueType.id': id } }, () => this._update(id, dto));
    }
    private async _update(id: string, dto: UpdateIssueTypeDto) {
        return this.monolith.put(`/issue-types/${id}`, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('admin', 'manager', 'super-admin')
    @Permission('issue-type', 'delete')
    @ApiOperation({ summary: 'Eliminar tipo de incidencia' })
    @ApiParam({ name: 'id' })
    async delete(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.issueTypes.delete', { kind: 'server', attributes: { 'issueType.id': id } }, () => this._delete(id));
    }
    private async _delete(id: string) {
        return this.monolith.delete(`/issue-types/${id}`);
    }
}
