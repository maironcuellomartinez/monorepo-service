// api-gateway/inbound/admin/users.controller.ts
import { Controller, Get, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';

@ApiTags('Admin / Users')
@ApiBearerAuth('jwt')
@Controller('api/admin/users')
export class AdminUsersController {
    constructor(private readonly monolith: MonolithClient) {}

    @Get()
    @Permission('user', 'list')
    @ApiOperation({ summary: 'Listar todos los usuarios activos' })
    listAll() {
        return this.monolith.get('/users/all');
    }

    @Patch(':id')
    @Permission('user', 'update')
    @ApiOperation({ summary: 'Actualizar perfil de usuario' })
    @ApiParam({ name: 'id' })
    update(@Param('id') id: string, @Body() body: { name?: string; lastName?: string; companyId?: string | null }) {
        return this.monolith.patch(`/users/${id}`, body);
    }

    @Patch(':id/deactivate')
    @Permission('user', 'update')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar usuario' })
    @ApiParam({ name: 'id' })
    deactivate(@Param('id') id: string) {
        return this.monolith.patch(`/users/${id}/deactivate`, {});
    }

    @Patch(':id/activate')
    @Permission('user', 'update')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Activar usuario' })
    @ApiParam({ name: 'id' })
    activate(@Param('id') id: string) {
        return this.monolith.patch(`/users/${id}/activate`, {});
    }

    @Delete(':id')
    @Permission('user', 'delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar usuario' })
    @ApiParam({ name: 'id' })
    remove(@Param('id') id: string) {
        return this.monolith.delete(`/users/${id}`);
    }
}
