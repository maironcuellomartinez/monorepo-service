import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
    ParseIntPipe,
    DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';

import { UserService } from '../services/user.service';
import { UserPolicyService } from '../services/user-policy.service';
import { CreateUserDto } from '../dtos/create-user.dto';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { Permissions, Roles } from '../decorators';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { TrackPerformance, BusinessMetric } from '../../observability';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly userPolicyService: UserPolicyService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Crear usuario' })
    @TrackPerformance()
    @BusinessMetric('user_create', { endpoint: 'create' })
    @Permissions('user:create')
    @Roles('admin')
    async create(@Body() createDto: CreateUserDto, @Req() req: Request) {
        // En un escenario real, req.user debe estar poblado por JwtStrategy
        const createdBy = req.user?.id || 'system';
        return this.userService.createUser({ ...createDto, createdBy });
    }

    @Get()
    @ApiOperation({ summary: 'Listar usuarios' })
    @ApiQuery({ name: 'isActive', required: false, type: Boolean })
    @ApiQuery({ name: 'searchTerm', required: false })
    @ApiQuery({ name: 'accountType', required: false, enum: ['user', 'service'] })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @Permissions('user:read')
    @Roles('admin')
    async findAll(
        @Query('isActive') isActive?: boolean,
        @Query('searchTerm') searchTerm?: string,
        @Query('accountType') accountType?: string,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
    ) {
        const activeFilter = isActive === undefined ? undefined : String(isActive) === 'true';

        return this.userService.getUsers({
            isActive: activeFilter,
            searchTerm,
            accountType,
            page,
            limit
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener usuario por ID' })
    @Permissions('user:read')
    async findOne(@Param('id') id: string) {
        return this.userService.getUserById(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar usuario' })
    @Permissions('user:update')
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdateUserDto,
        @Req() req: Request
    ) {
        const updatedBy = req.user?.id || 'system';
        // Filtrar undefined del DTO si es necesario, pero el service maneja partial updates
        return this.userService.updateUser(id, { ...updateDto, updatedBy });
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Desactivar usuario' })
    @Permissions('user:delete')
    @Roles('admin')
    async remove(@Param('id') id: string, @Req() req: Request) {
        const deletedBy = req.user?.id || 'system';
        await this.userService.deactivateUser(id, deletedBy);
        return { message: 'Usuario desactivado exitosamente' };
    }

    @Post(':id/reactivate')
    @ApiOperation({ summary: 'Reactivar usuario' })
    @Permissions('user:update')
    @Roles('admin')
    async reactivate(@Param('id') id: string, @Req() req: Request) {
        const updatedBy = req.user?.id || 'system';
        await this.userService.reactivateUser(id, updatedBy);
        return { message: 'Usuario reactivado' };
    }

    @Delete(':id/permanent')
    @ApiOperation({ summary: 'Eliminar usuario permanentemente (requiere isActive=false)' })
    @Permissions('user:delete')
    @Roles('admin')
    async hardDelete(@Param('id') id: string) {
        await this.userService.hardDeleteUser(id);
        return { message: 'Usuario eliminado permanentemente' };
    }

    @Get(':id/policies')
    @ApiOperation({ summary: 'Obtener políticas asignada al usuario' })
    @Permissions('user:read', 'policy:read')
    async getPolicies(@Param('id') id: string) {
        return this.userPolicyService.findPoliciesForUser(id);
    }

    // ── Role assignment ────────────────────────────────────────────────

    @Get(':id/roles')
    @ApiOperation({ summary: 'Obtener roles del usuario' })
    @Permissions('user:read')
    async getUserRoles(@Param('id') id: string) {
        return this.userService.getUserRoles(id);
    }

    @Post(':id/roles')
    @ApiOperation({ summary: 'Asignar rol a usuario' })
    @Roles('admin')
    @Permissions('user:update')
    async assignRole(
        @Param('id') id: string,
        @Body() body: { roleId: string; applicationId: string },
        @Req() req: Request,
    ) {
        const assignedBy = req.user?.id || 'system';
        return this.userService.assignRole(id, body.roleId, body.applicationId, assignedBy);
    }

    @Delete(':id/roles/:roleId')
    @ApiOperation({ summary: 'Remover rol de usuario' })
    @Roles('admin')
    @Permissions('user:update')
    async removeRole(
        @Param('id') id: string,
        @Param('roleId') roleId: string,
        @Req() req: Request,
    ) {
        const removedBy = req.user?.id || 'system';
        return this.userService.removeRole(id, roleId, removedBy);
    }

    // ── Application assignment ─────────────────────────────────────────

    @Get(':id/applications')
    @ApiOperation({ summary: 'Obtener aplicaciones del usuario' })
    @Permissions('user:read')
    async getUserApplications(@Param('id') id: string) {
        return this.userService.getUserApplications(id);
    }

    @Post(':id/applications')
    @ApiOperation({ summary: 'Vincular usuario a aplicación' })
    @Roles('admin')
    @Permissions('user:update')
    async assignApplication(
        @Param('id') id: string,
        @Body() body: { applicationId: string; membershipType?: string },
        @Req() req: Request,
    ) {
        const assignedBy = req.user?.id || 'system';
        return this.userService.assignApplication(
            id, body.applicationId, body.membershipType || 'member', assignedBy,
        );
    }

    @Delete(':id/applications/:applicationId')
    @ApiOperation({ summary: 'Desvincular usuario de aplicación' })
    @Roles('admin')
    @Permissions('user:update')
    async removeApplication(
        @Param('id') id: string,
        @Param('applicationId') applicationId: string,
        @Req() req: Request,
    ) {
        const removedBy = req.user?.id || 'system';
        return this.userService.removeApplication(id, applicationId, removedBy);
    }
}
