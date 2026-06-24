import { Controller, Get, Post, Put, Delete, Body, Param, Inject, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam,
    ApiBearerAuth } from '@nestjs/swagger';
import { CORNER_ISSUE_CONFIG_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { CompanyIssueConfigService } from '@app/core/services/corner-issue-config/corner-issue-config.service';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';
import { CreateCompanyIssueConfigDto, UpdateCompanyIssueConfigDto } from './dto/company-issue-configs.dto';

@ApiTags('Company Issue Configs')
@ApiBearerAuth()
@Controller('internal/company-issue-configs')
export class InternalCompanyIssueConfigsController {
    constructor(
        @Inject(CORNER_ISSUE_CONFIG_SERVICE) private readonly service: CompanyIssueConfigService,
    ) {}

    @Get('company/:companyId')
    @ApiOperation({ summary: 'Configuraciones de una empresa', description: 'Retorna todas las configuraciones de grupo/tiempo por tipo de incidencia para la empresa.' })
    @ApiParam({ name: 'companyId', example: 'uuid-company' })
    @ApiResponse({ status: 200, description: 'Lista de configuraciones' })
    async getByCompany(@Param('companyId') companyId: string) {
        return unwrapOrThrow(await this.service.getByCompany(companyId));
    }

    @Get('company/:companyId/issue-type/:issueTypeId')
    @ApiOperation({ summary: 'Configuración específica empresa + tipo de incidencia' })
    @ApiParam({ name: 'companyId', example: 'uuid-company' })
    @ApiParam({ name: 'issueTypeId', example: 'uuid-issue-type' })
    @ApiResponse({ status: 200, description: 'Configuración encontrada' })
    @ApiResponse({ status: 404, description: 'No existe configuración para esa combinación' })
    async getByCompanyAndIssueType(
        @Param('companyId') companyId: string,
        @Param('issueTypeId') issueTypeId: string,
    ) {
        const result = unwrapOrThrow(await this.service.getByCompanyAndIssueType(companyId, issueTypeId));
        if (!result) throw new HttpException('Config not found', HttpStatus.NOT_FOUND);
        return result;
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear configuración empresa + tipo de incidencia', description: 'Define qué grupo de ServiceNow atiende una combinación empresa/tipo y el tiempo de trabajo estimado.' })
    @ApiResponse({ status: 201, description: 'Configuración creada' })
    async create(@Body() dto: CreateCompanyIssueConfigDto) {
        return unwrapOrThrow(await this.service.create(dto));
    }

    @Put(':id')
    @ApiOperation({ summary: 'Actualizar configuración', description: 'Actualización parcial del grupo de SN y/o el override de minutos.' })
    @ApiParam({ name: 'id', example: 'uuid-config' })
    @ApiResponse({ status: 200, description: 'Configuración actualizada' })
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateCompanyIssueConfigDto,
    ) {
        return unwrapOrThrow(await this.service.update(id, dto));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar configuración' })
    @ApiParam({ name: 'id', example: 'uuid-config' })
    @ApiResponse({ status: 204, description: 'Eliminada' })
    async delete(@Param('id') id: string) {
        unwrapOrThrow(await this.service.delete(id));
    }
}
