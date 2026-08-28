// api-gateway/inbound/admin/issue-type-trees.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { MicornerClient } from '../../client/micorner.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TracingService } from '@app/observability';

class CreateTreeDto {
    @IsString() @IsNotEmpty()
    id: string;

    @IsString() @IsNotEmpty()
    name: string;
}

class RenameTreeDto {
    @IsString() @IsNotEmpty()
    name: string;
}

@ApiTags('Admin / Issue Type Trees')
@ApiBearerAuth('jwt')
@Controller('api/admin/trees')
export class AdminIssueTypeTreesController {
    constructor(
        private readonly micorner: MicornerClient,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @Permission('issue-type', 'list')
    @ApiOperation({ summary: 'Listar árboles de tipos de cita' })
    list() {
        return this.micorner.get('/trees');
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles('admin', 'super-admin')
    @Permission('issue-type', 'create')
    @ApiOperation({ summary: 'Crear árbol de tipos de cita' })
    create(@Body() dto: CreateTreeDto) {
        return this.tracing.run('gateway.controller.trees.create', { kind: 'server' }, () => this._create(dto));
    }
    private async _create(dto: CreateTreeDto) {
        return this.micorner.post('/trees', dto);
    }

    @Put(':id')
    @Roles('admin', 'super-admin')
    @Permission('issue-type', 'create')
    @ApiOperation({ summary: 'Renombrar árbol' })
    @ApiParam({ name: 'id' })
    rename(@Param('id') id: string, @Body() dto: RenameTreeDto) {
        return this.tracing.run('gateway.controller.trees.rename', { kind: 'server', attributes: { 'tree.id': id } }, () => this._rename(id, dto));
    }
    private async _rename(id: string, dto: RenameTreeDto) {
        return this.micorner.put(`/trees/${id}`, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('admin', 'super-admin')
    @Permission('issue-type', 'create')
    @ApiOperation({ summary: 'Eliminar árbol' })
    @ApiParam({ name: 'id' })
    delete(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.trees.delete', { kind: 'server', attributes: { 'tree.id': id } }, () => this._delete(id));
    }
    private async _delete(id: string) {
        return this.micorner.delete(`/trees/${id}`);
    }
}
