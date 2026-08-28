// internal-api/companies/internal-companies.controller.ts
import {
    Controller, Get, Put, Delete, Post,
    Body, Param, Inject, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { TracingService } from '@app/observability';
import { COMPANY_SERVICE, ICompanyService } from '../../core/ports';
import { IIssueTypeTreeRepository, ISSUE_TYPE_TREE_REPOSITORY } from '../../core/ports/outgoing/repositories/issue-type-tree-repository.port';
import { IServiceNowProfileRepository } from '../../core/ports/outgoing/repositories/servicenow-profile-repository.port';
import { SERVICE_NOW_PROFILE_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';
import { SnCompanySyncJob } from '../../infrastructure/jobs/sn-company-sync.job';
import { Company } from '../../core/domain/entities/company.entity';
import { ServiceNowProfile } from '../../core/domain/entities/servicenow-profile.entity';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';

class UpdateCompanyDto {
    @IsOptional() @IsString()
    treeId?: string | null;

    @IsOptional() @IsBoolean()
    isActive?: boolean;
}

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('internal/companies')
export class InternalCompaniesController {
    constructor(
        @Inject(COMPANY_SERVICE) private readonly companyService: ICompanyService,
        @Inject(ISSUE_TYPE_TREE_REPOSITORY) private readonly treeRepo: IIssueTypeTreeRepository,
        @Inject(SERVICE_NOW_PROFILE_REPOSITORY) private readonly snProfileRepo: IServiceNowProfileRepository,
        private readonly snCompanySyncJob: SnCompanySyncJob,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Listar todas las empresas activas (sincronizadas desde ServiceNow)' })
    async list() {
        const result = await this.companyService.listCompanies();
        const companies = unwrapOrThrow(result);

        // Se resuelve por findById (no findAllActive) para que una compañía
        // vinculada a un perfil desactivado siga mostrando su sys_id/nombre SN
        // — mismo criterio que getOne()/update(), que usan profileMapFor().
        // resolveSnowCompanySysId() también sigue usando ese perfil aunque
        // esté inactive, así que ocultarlo acá sería mostrar un dato distinto
        // del que realmente se usa al abrir el ticket en SN.
        const profileById = new Map<string, ServiceNowProfile>();
        for (const c of companies) {
            if (!c.profileId) continue;
            const key = c.profileId.toString();
            if (profileById.has(key)) continue;
            const profile = await this.profileById(key);
            if (profile) profileById.set(key, profile);
        }

        return companies.map((c) => this.toDto(c, profileById));
    }

    @Get('trees')
    @ApiOperation({ summary: 'Listar árboles de tipos de cita disponibles' })
    async listTrees() {
        const result = await this.treeRepo.findAll();
        return unwrapOrThrow(result).map((t) => ({
            id: t.id.toString(),
            name: t.name,
        }));
    }

    @Post('sync-from-sn')
    @ApiOperation({
        summary: 'Sincronizar empresas desde ServiceNow',
        description: 'Ejecuta bajo demanda el mismo proceso que corre el cron SnCompanySyncJob: importa perfiles nuevos del catálogo de SN y crea la Company local vinculada (sin árbol asignado) para cada perfil que todavía no tenga una.',
    })
    async syncFromSn() {
        return this.tracing.run(
            'monolith.controller.companies.syncFromSn',
            { kind: 'server' },
            () => this.snCompanySyncJob.run(),
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener empresa por ID' })
    @ApiParam({ name: 'id' })
    async getOne(@Param('id') id: string) {
        const result = await this.companyService.getCompany(id);
        const company = unwrapOrThrow(result);
        if (!company) throw Object.assign(new Error('Company not found'), { status: 404 });

        return this.toDto(company, await this.profileMapFor(company));
    }

    @Put(':id')
    @ApiOperation({
        summary: 'Actualizar empresa',
        description: 'Solo permite asignar el árbol de tipos de cita y activar/desactivar — el nombre y el vínculo a ServiceNow los gobierna el sync.',
    })
    @ApiParam({ name: 'id' })
    async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
        return this.tracing.run(
            'monolith.controller.companies.update',
            { kind: 'server', attributes: { 'company.id': id } },
            () => this._update(id, dto),
        );
    }

    private async _update(id: string, dto: UpdateCompanyDto) {
        const result = await this.companyService.updateCompany(id, {
            ...(dto.treeId !== undefined ? { treeId: dto.treeId } : {}),
            isActive: dto.isActive,
        });
        const company = unwrapOrThrow(result);
        return this.toDto(company, await this.profileMapFor(company));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar empresa (soft delete)' })
    @ApiParam({ name: 'id' })
    async delete(@Param('id') id: string) {
        return this.tracing.run(
            'monolith.controller.companies.delete',
            { kind: 'server', attributes: { 'company.id': id } },
            () => this._delete(id),
        );
    }

    private async _delete(id: string) {
        const result = await this.companyService.updateCompany(id, { isActive: false });
        unwrapOrThrow(result);
    }

    /** Perfil por id, sin filtrar por isActive — un perfil desactivado sigue siendo el que usa resolveSnowCompanySysId() para la compañía que lo referencia. */
    private async profileById(id: string): Promise<ServiceNowProfile | null> {
        const profileResult = await this.snProfileRepo.findById(id as any);
        return profileResult.isFailure ? null : profileResult.unwrap();
    }

    private async profileMapFor(company: Company): Promise<Map<string, ServiceNowProfile>> {
        const profileById = new Map<string, ServiceNowProfile>();
        if (!company.profileId) return profileById;
        const profile = await this.profileById(company.profileId.toString());
        if (profile) profileById.set(company.profileId.toString(), profile);
        return profileById;
    }

    private toDto(c: Company, profileById: Map<string, ServiceNowProfile>) {
        const profile = c.profileId ? profileById.get(c.profileId.toString()) : undefined;
        return {
            id: c.id.toString(),
            name: c.name,
            treeId: c.treeId?.toString() ?? null,
            profileId: c.profileId?.toString() ?? null,
            snowCompanySysId: profile?.snowCompanySysId.value ?? null,
            snowCompanyName: profile?.snowCompanyName ?? null,
            isActive: c.isActive,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        };
    }
}
