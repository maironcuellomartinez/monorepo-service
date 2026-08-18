// api-gateway/inbound/admin/users.controller.ts
import { Controller, Get, Patch, Delete, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { TracingService } from '@app/observability';

@ApiTags('Admin / Users')
@ApiBearerAuth('jwt')
@Controller('api/admin/users')
export class AdminUsersController {
    constructor(
        private readonly monolith: MonolithClient,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @Permission('user', 'list')
    @ApiOperation({ summary: 'Listar todos los usuarios activos' })
    listAll() {
        return this.monolith.get('/users/all');
    }

    @Get('search')
    @Permission('user', 'list')
    @ApiOperation({ summary: 'Buscar usuarios (activos e inactivos) por nombre, email o upn' })
    @ApiQuery({ name: 'q', required: true, description: 'Término de búsqueda (mínimo 2 caracteres)' })
    search(@Query('q') q: string) {
        return this.monolith.get('/users/search', { q, activeOnly: 'false' });
    }

    @Patch(':id')
    @Permission('user', 'update')
    @ApiOperation({ summary: 'Actualizar perfil de usuario' })
    @ApiParam({ name: 'id' })
    update(@Param('id') id: string, @Body() body: { name?: string; lastName?: string; companyId?: string | null }) {
        return this.tracing.run('gateway.controller.users.update', { kind: 'server', attributes: { 'user.id': id } }, () => this._update(id, body));
    }
    private async _update(id: string, body: { name?: string; lastName?: string; companyId?: string | null }) {
        return this.monolith.patch(`/users/${id}`, body);
    }

    @Patch(':id/deactivate')
    @Permission('user', 'update')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar usuario' })
    @ApiParam({ name: 'id' })
    deactivate(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.users.deactivate', { kind: 'server', attributes: { 'user.id': id } }, () => this._deactivate(id));
    }
    private async _deactivate(id: string) {
        return this.monolith.patch(`/users/${id}/deactivate`, {});
    }

    @Patch(':id/activate')
    @Permission('user', 'update')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Activar usuario' })
    @ApiParam({ name: 'id' })
    activate(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.users.activate', { kind: 'server', attributes: { 'user.id': id } }, () => this._activate(id));
    }
    private async _activate(id: string) {
        return this.monolith.patch(`/users/${id}/activate`, {});
    }

    @Delete(':id')
    @Permission('user', 'delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar usuario' })
    @ApiParam({ name: 'id' })
    remove(@Param('id') id: string) {
        return this.tracing.run('gateway.controller.users.remove', { kind: 'server', attributes: { 'user.id': id } }, () => this._remove(id));
    }
    private async _remove(id: string) {
        return this.monolith.delete(`/users/${id}`);
    }
}
