import { Controller, Post, Patch, Delete, Body, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreatePermissionDto } from '../dtos/create-permission.dto';
import { PermissionService } from '../services/permission.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionController {
    constructor(private readonly service: PermissionService) { }

    @Post()
    @Roles('admin')
    @ApiOperation({ summary: 'Crear permiso (resource:action)' })
    async create(@Body() dto: CreatePermissionDto) {
        return this.service.createPermission(dto);
    }

    @Get()
    @Roles('admin')
    @ApiOperation({ summary: 'Listar permisos. Con ?applicationId= filtra solo los asignados a roles de esa app.' })
    async findAll(
        @Query('resource') resource?: string,
        @Query('category') category?: string,
        @Query('searchTerm') searchTerm?: string,
        @Query('isActive') isActive?: boolean,
        @Query('applicationId') applicationId?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        const result = await this.service.getPermissions({ resource, category, searchTerm, isActive, applicationId, page, limit });
        return result.permissions;
    }

    @Get(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Obtener permiso por ID' })
    @ApiParam({ name: 'id', description: 'UUID del permiso' })
    async getById(@Param('id') id: string) {
        return this.service.getPermissionById(id);
    }

    @Patch(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Actualizar descripcion, categoria o peso de un permiso' })
    @ApiParam({ name: 'id', description: 'UUID del permiso' })
    async update(
        @Param('id') id: string,
        @Body() dto: { description?: string; category?: string; weight?: number; updatedBy?: string },
    ) {
        return this.service.updatePermission(id, dto);
    }

    @Delete(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Desactivar permiso (soft delete)' })
    @ApiParam({ name: 'id', description: 'UUID del permiso' })
    async deactivate(
        @Param('id') id: string,
        @Body('deletedBy') deletedBy: string,
    ) {
        await this.service.deactivatePermission(id, deletedBy || 'admin');
        return { success: true };
    }

    @Post(':id/reactivate')
    @Roles('admin')
    @ApiOperation({ summary: 'Reactivar permiso' })
    @ApiParam({ name: 'id', description: 'UUID del permiso' })
    async reactivate(
        @Param('id') id: string,
        @Body('updatedBy') updatedBy: string,
    ) {
        await this.service.reactivatePermission(id, updatedBy || 'admin');
        return { success: true };
    }

    @Delete(':id/permanent')
    @Roles('admin')
    @ApiOperation({ summary: 'Eliminar permiso permanentemente (requiere isActive=false)' })
    @ApiParam({ name: 'id', description: 'UUID del permiso' })
    async hardDelete(@Param('id') id: string) {
        await this.service.hardDeletePermission(id);
        return { success: true };
    }
}
