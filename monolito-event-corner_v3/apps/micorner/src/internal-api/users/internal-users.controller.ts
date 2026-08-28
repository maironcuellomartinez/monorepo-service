// internal-api/users/internal-users.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Inject, HttpCode, HttpStatus, HttpException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsNotEmpty } from 'class-validator';
import { USER_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { IUserService } from '@app/core/ports/incoming/user/user-service.port';
import { TracingService } from '@app/observability';

export class SyncUserDto {
    /** ABAC userId — se usa como externalId en el micorner */
    @IsString()
    @IsNotEmpty()
    external_id!: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    last_name?: string;

    @IsString()
    @IsOptional()
    full_name?: string;

    /** User Principal Name (UPN) — identificador de tipo correo usado para login/identidad. */
    @IsString()
    @IsOptional()
    upn?: string;

    @IsString()
    @IsOptional()
    domain?: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('internal/users')
export class InternalUsersController {
    constructor(
        @Inject(USER_SERVICE) private readonly userService: IUserService,
        private readonly tracing: TracingService,
    ) { }

    /**
     * Upsert de usuario a partir de datos del proveedor de identidad (ABAC/Entra ID).
     * - Si ya existe por externalId → actualiza nombre/email y retorna.
     * - Si no existe → crea con companyId=null y retorna.
     * Llamado por el api-gateway en GET /api/auth/me.
     */
    @Post('sync')
    @ApiOperation({
        summary: 'Sincronizar usuario desde proveedor de identidad',
        description: 'Upsert basado en externalId (ABAC userId). Crea el usuario si no existe, actualiza si ya existe.',
    })
    async sync(@Body() dto: SyncUserDto) {
        return this.tracing.run('micorner.controller.users.sync', { kind: 'server' }, () => this._sync(dto));
    }

    private async _sync(dto: SyncUserDto) {
        const result = await this.userService.syncUser(dto);
        if (result.isFailure) {
            throw new HttpException(
                { message: result.unwrapError().message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        const user = result.unwrap();
        return {
            id: user.id.toString(),
            externalId: user.externalId,
            email: user.email?.value ?? null,
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
            upn: user.upn,
            isActive: user.isActive,
        };
    }

    /**
     * Listar usuarios activos con empresa — para incident creation picker.
     */
    @Get()
    @ApiOperation({ summary: 'Listar usuarios activos con empresa asignada' })
    async list() {
        const result = await this.userService.listUsers();
        if (result.isFailure) {
            throw new HttpException(
                { message: result.unwrapError().message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        return result.unwrap().map((user) => ({
            id: user.id.toString(),
            externalId: user.externalId,
            email: user.email?.value ?? null,
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
            upn: user.upn,
            isActive: user.isActive,
        }));
    }

    /**
     * Listar TODOS los usuarios activos — para administración de usuarios (admin).
     */
    @Get('all')
    @ApiOperation({ summary: 'Listar todos los usuarios activos (admin)' })
    async listAll() {
        const result = await this.userService.listAllUsers();
        if (result.isFailure) {
            throw new HttpException(
                { message: result.unwrapError().message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        return result.unwrap().map((user) => ({
            id: user.id.toString(),
            externalId: user.externalId,
            email: user.email?.value ?? null,
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
            upn: user.upn,
            isActive: user.isActive,
        }));
    }

    /**
     * Actualizar perfil de un usuario (nombre, apellido, empresa).
     */
    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar perfil de usuario' })
    @ApiParam({ name: 'id' })
    async update(@Param('id') id: string, @Body() body: { name?: string; lastName?: string; companyId?: string | null }) {
        return this.tracing.run('micorner.controller.users.update', { kind: 'server', attributes: { 'user.id': id } }, () => this._update(id, body));
    }

    private async _update(id: string, body: { name?: string; lastName?: string; companyId?: string | null }) {
        const result = await this.userService.updateUserProfile(id, body);
        if (result.isFailure) {
            throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
        }
        const user = result.unwrap();
        return {
            id: user.id.toString(),
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
        };
    }

    /**
     * Asignar empresa a un usuario.
     */
    @Patch(':id/company')
    @ApiOperation({ summary: 'Asignar empresa a un usuario' })
    @ApiParam({ name: 'id' })
    async assignCompany(@Param('id') id: string, @Body() body: { companyId: string | null }) {
        return this.tracing.run('micorner.controller.users.assignCompany', { kind: 'server', attributes: { 'user.id': id } }, () => this._assignCompany(id, body));
    }

    private async _assignCompany(id: string, body: { companyId: string | null }) {
        const result = await this.userService.assignCompany(id, body.companyId);
        if (result.isFailure) {
            throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
        }
        const user = result.unwrap();
        return { id: user.id.toString(), companyId: user.companyId?.toString() ?? null };
    }

    /**
     * Desactivar usuario.
     */
    @Patch(':id/deactivate')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar usuario' })
    @ApiParam({ name: 'id' })
    async deactivate(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.users.deactivate', { kind: 'server', attributes: { 'user.id': id } }, () => this._deactivate(id));
    }

    private async _deactivate(id: string) {
        const result = await this.userService.deactivateUser(id);
        if (result.isFailure) {
            throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * Activar usuario.
     */
    @Patch(':id/activate')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Activar usuario' })
    @ApiParam({ name: 'id' })
    async activate(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.users.activate', { kind: 'server', attributes: { 'user.id': id } }, () => this._activate(id));
    }

    private async _activate(id: string) {
        const result = await this.userService.activateUser(id);
        if (result.isFailure) {
            throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * Eliminar usuario (soft delete).
     */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar usuario (soft delete)' })
    @ApiParam({ name: 'id' })
    async delete(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.users.delete', { kind: 'server', attributes: { 'user.id': id } }, () => this._delete(id));
    }

    private async _delete(id: string) {
        const result = await this.userService.deleteUser(id);
        if (result.isFailure) {
            throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * Búsqueda de usuarios activos por nombre, email o upn.
     * Reemplaza el filtrado client-side sobre el listado completo.
     */
    @Get('search')
    @ApiOperation({ summary: 'Buscar usuarios por nombre, email o upn' })
    @ApiQuery({ name: 'q', required: true, description: 'Término de búsqueda (mínimo 2 caracteres)' })
    @ApiQuery({ name: 'withCompany', required: false, description: 'Si es "true", solo devuelve usuarios con empresa asignada' })
    @ApiQuery({ name: 'activeOnly', required: false, description: 'Si es "false", incluye usuarios inactivos (default: true)' })
    async search(
        @Query('q') q: string,
        @Query('withCompany') withCompany?: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        if (!q || q.trim().length < 2) {
            throw new BadRequestException('El parámetro q debe tener al menos 2 caracteres');
        }
        const result = await this.userService.searchUsers(q.trim(), {
            requireCompany: withCompany === 'true',
            activeOnly: activeOnly !== 'false',
        });
        if (result.isFailure) {
            throw new HttpException(
                { message: result.unwrapError().message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        return result.unwrap().map((user) => ({
            id: user.id.toString(),
            externalId: user.externalId,
            email: user.email?.value ?? null,
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
            upn: user.upn,
            isActive: user.isActive,
        }));
    }

    /**
     * Buscar usuario por email — usado por el admin al añadir técnicos.
     */
    @Get('by-email/:email')
    @ApiOperation({ summary: 'Obtener usuario por email' })
    @ApiParam({ name: 'email' })
    async getByEmail(@Param('email') email: string) {
        const result = await this.userService.getUserByEmail(email);
        if (result.isFailure) {
            throw new HttpException(
                { message: result.unwrapError().message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        const user = result.unwrap();
        if (!user) {
            throw new HttpException({ message: 'User not found' }, HttpStatus.NOT_FOUND);
        }
        return {
            id: user.id.toString(),
            externalId: user.externalId,
            email: user.email?.value ?? null,
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
            upn: user.upn,
            isActive: user.isActive,
        };
    }

    /**
     * Buscar usuario por externalId (ABAC userId / Entra OID).
     */
    @Get('by-external-id/:externalId')
    @ApiOperation({ summary: 'Obtener usuario por externalId (ABAC userId)' })
    @ApiParam({ name: 'externalId' })
    async getByExternalId(@Param('externalId') externalId: string) {
        const result = await this.userService.getUserByExternalId(externalId);
        if (result.isFailure) {
            throw new HttpException(
                { message: result.unwrapError().message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        const user = result.unwrap();
        if (!user) {
            throw new HttpException({ message: 'User not found' }, HttpStatus.NOT_FOUND);
        }
        return {
            id: user.id.toString(),
            externalId: user.externalId,
            email: user.email?.value ?? null,
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
            upn: user.upn,
            isActive: user.isActive,
        };
    }

    /**
     * Obtener usuario por ID interno del micorner.
     */
    @Get(':id')
    @ApiOperation({ summary: 'Obtener usuario por ID' })
    @ApiParam({ name: 'id' })
    async getById(@Param('id') id: string) {
        const result = await this.userService.getUser(id as any);
        if (result.isFailure) {
            throw new HttpException(
                { message: result.unwrapError().message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
        const user = result.unwrap();
        if (!user) {
            throw new HttpException({ message: 'User not found' }, HttpStatus.NOT_FOUND);
        }
        return {
            id: user.id.toString(),
            externalId: user.externalId,
            email: user.email?.value ?? null,
            name: user.name,
            lastName: user.lastName,
            fullName: user.fullName,
            companyId: user.companyId?.toString() ?? null,
            upn: user.upn,
            isActive: user.isActive,
        };
    }
}
