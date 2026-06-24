import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ApplicationService } from '../services/application.service';
import { Permissions, Roles } from '../decorators';
import {
    CreateApplicationDto,
    CreateOAuthClientDto,
    CreateM2mServiceDto,
    IssueTokenDto,
    UpdateScopesDto,
    RotateCredentialsDto,
} from '../dtos/application.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationController {
    constructor(private applicationService: ApplicationService) { }

    // ================================================================
    // INTERNAL APPLICATIONS
    // ================================================================

    /**
     * Crea una nueva aplicación interna (type='internal').
     * Genera apiKey + apiSecret. El secret se muestra solo esta vez.
     */
    @Post()
    @Roles('admin')
    @ApiOperation({ summary: 'Crear aplicación interna (M2M)' })
    async createApplication(@Body() dto: CreateApplicationDto) {
        return this.applicationService.createApplication(dto);
    }

    /**
     * Listado de aplicaciones con credenciales enmascaradas.
     */
    @Get()
    @Roles('admin')
    @Permissions('application:read')
    @ApiOperation({ summary: 'Listar aplicaciones' })
    async getApplications(
        @Query('isActive') isActive?: boolean,
        @Query('environment') environment?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.applicationService.getApplications({ isActive, environment, page, limit });
    }

    /**
     * Detalle de una aplicación por ID (credenciales enmascaradas).
     */
    @Get(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Obtener aplicación por ID' })
    @ApiParam({ name: 'id', description: 'UUID de la aplicación' })
    async getApplicationById(@Param('id') id: string) {
        return this.applicationService.getApplicationById(id);
    }

    /**
     * Actualiza nombre, descripcion o ambiente de cualquier aplicación.
     */
    @Patch(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Editar aplicación (nombre, descripcion, ambiente)' })
    @ApiParam({ name: 'id', description: 'UUID de la aplicación' })
    async updateApplication(
        @Param('id') id: string,
        @Body() dto: { name?: string; description?: string; environment?: string; settings?: Record<string, any>; ownerApplicationId?: string | null },
    ) {
        return this.applicationService.updateApplication(id, dto);
    }

    /**
     * Desactiva una aplicación (soft delete). Las credenciales dejan de funcionar.
     */
    @Post(':id/reactivate')
    @Roles('admin')
    @ApiOperation({ summary: 'Reactivar aplicación' })
    @ApiParam({ name: 'id', description: 'UUID de la aplicación' })
    async reactivateApplication(@Param('id') id: string) {
        await this.applicationService.reactivateApplication(id);
        return { success: true };
    }

    @Delete(':id')
    @Roles('admin')
    @ApiOperation({ summary: 'Desactivar aplicación (soft delete)' })
    @ApiParam({ name: 'id', description: 'UUID de la aplicación' })
    async deactivateApplication(@Param('id') id: string) {
        await this.applicationService.deactivateApplication(id);
        return { success: true };
    }

    @Delete(':id/permanent')
    @Roles('admin')
    @ApiOperation({ summary: 'Eliminar aplicación permanentemente (hard delete). Requiere que esté desactivada.' })
    @ApiParam({ name: 'id', description: 'UUID de la aplicación' })
    async deleteApplication(@Param('id') id: string) {
        await this.applicationService.deleteApplication(id);
        return { success: true };
    }

    /**
     * Regenera apiKey + apiSecret de una aplicación interna.
     * El nuevo secret se muestra solo esta vez.
     */
    @Post(':id/regenerate-api-key')
    @ApiOperation({ summary: 'Regenerar API Key de aplicación interna' })
    @ApiParam({ name: 'id', description: 'UUID de la aplicación' })
    async regenerateApiKey(
        @Param('id') id: string,
        @Body() dto: RotateCredentialsDto,
    ) {
        return this.applicationService.regenerateApiKey(id, dto.updatedBy);
    }

    /**
     * Valida un API Key + Secret. Uso interno / debugging.
     */
    @Post('validate-api-key')
    @ApiOperation({ summary: 'Validar API Key y Secret' })
    async validateApiKey(
        @Body('apiKey') apiKey: string,
        @Body('apiSecret') apiSecret: string,
    ) {
        return this.applicationService.validateApiKey(apiKey, apiSecret);
    }

    // ================================================================
    // M2M SERVICES (infraestructura — sin apiKey, solo JWT de larga duración)
    // ================================================================

    /**
     * Registra un servicio de infraestructura (api-gateway, api-snowq, etc.).
     * No genera apiKey/apiSecret — el JWT se emite manualmente vía issue-token.
     */
    @Post('m2m-service')
    @Roles('admin')
    @ApiOperation({ summary: 'Registrar servicio M2M de infraestructura' })
    async createM2mService(@Body() dto: CreateM2mServiceDto) {
        return this.applicationService.createM2mService(dto);
    }

    /**
     * Emite un JWT M2M de larga duración para un servicio de infraestructura.
     * El token se muestra una sola vez — copiar al .env como ABAC_M2M_TOKEN.
     */
    @Post(':id/issue-token')
    @Roles('admin')
    @ApiOperation({ summary: 'Emitir JWT M2M para servicio de infraestructura' })
    @ApiParam({ name: 'id', description: 'UUID del servicio m2m_service' })
    async issueM2mToken(
        @Param('id') id: string,
        @Body() dto: IssueTokenDto,
    ) {
        return this.applicationService.issueM2mToken(id, dto.issuedBy, dto.durationDays);
    }

    // ================================================================
    // OAUTH 2.0 CLIENTS
    // NOTA: rutas con segmento fijo ('oauth', 'validate-api-key', 'm2m-service')
    // deben estar ANTES de /:id/* para que NestJS no las interprete como IDs.
    // ================================================================

    /**
     * Registra un nuevo cliente OAuth 2.0 (type='oauth_client').
     * Devuelve client_id y client_secret. El secret es visible solo esta vez.
     */
    @Post('oauth')
    @Roles('admin')
    @ApiOperation({
        summary: 'Registrar cliente OAuth 2.0 (client_credentials)',
        description:
            'Crea un OAuth client con scopes allow-list. Los scopes son la intersección entre los solicitados y los permisos del owner.',
    })
    async createOAuthClient(@Body() dto: CreateOAuthClientDto) {
        return this.applicationService.createOAuthClient(dto);
    }

    /**
     * Actualiza los scopes permitidos de un OAuth client.
     * No afecta al client_id ni al client_secret.
     */
    @Patch(':id/scopes')
    @Roles('admin')
    @ApiOperation({ summary: 'Actualizar scopes de un OAuth client' })
    @ApiParam({ name: 'id', description: 'UUID del OAuth client' })
    async updateScopes(
        @Param('id') id: string,
        @Body() dto: UpdateScopesDto,
    ) {
        return this.applicationService.updateScopes(id, dto.scopes);
    }

    /**
     * Rota el client_secret de un OAuth client.
     * El client_id (apiKey) NO cambia. El nuevo secret se muestra solo esta vez.
     */
    @Post(':id/rotate-secret')
    @Roles('admin')
    @ApiOperation({
        summary: 'Rotar client_secret de un OAuth client',
        description: 'Solo rota el secret. El client_id permanece igual.',
    })
    @ApiParam({ name: 'id', description: 'UUID del OAuth client' })
    async rotateClientSecret(
        @Param('id') id: string,
        @Body() dto: RotateCredentialsDto,
    ) {
        return this.applicationService.rotateClientSecret(id, dto.updatedBy);
    }
}
