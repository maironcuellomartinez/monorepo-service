// internal-api/companies/internal-companies.controller.ts
import {
    Controller, Get, Post, Put, Delete,
    Body, Param, Inject, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { TracingService } from '@app/observability';
import { COMPANY_SERVICE, ICompanyService } from '../../core/ports';
import { IIssueTypeTreeRepository, ISSUE_TYPE_TREE_REPOSITORY } from '../../core/ports/outgoing/repositories/issue-type-tree-repository.port';
import { IServiceNowProfileRepository } from '../../core/ports/outgoing/repositories/servicenow-profile-repository.port';
import { SERVICE_NOW_PROFILE_REPOSITORY } from '../../core/ports/outgoing/repositories/tokens';
import { SERVICENOW_PROFILE_SERVICE } from '../../core/ports/incoming/service-tokens';
import { IServiceNowProfileService } from '../../core/ports/incoming/servicenow/profile-service.port';
import { ServiceNowProfile } from '../../core/domain/entities/servicenow-profile.entity';
import { unwrapOrThrow } from '@app/shared/utils/result-to-http';

class CreateCompanyDto {
    @IsString() @IsNotEmpty()
    name: string;

    @IsString() @IsNotEmpty()
    treeId: string;

    @IsOptional() @IsString()
    profileId?: string | null;

    /** sys_id de la empresa en ServiceNow — crea el perfil SN automáticamente */
    @IsOptional() @IsString()
    snowCompanySysId?: string;

    /** Nombre de la empresa en ServiceNow */
    @IsOptional() @IsString()
    snowCompanyName?: string;
}

class UpdateCompanyDto {
    @IsOptional() @IsString()
    name?: string;

    @IsOptional() @IsString()
    treeId?: string;

    @IsOptional() @IsString()
    profileId?: string | null;

    @IsOptional() @IsBoolean()
    isActive?: boolean;
}

class CreateSnProfileDto {
    @IsString() @IsNotEmpty()
    name: string;

    @IsString() @IsNotEmpty()
    snowCompanySysId: string;

    @IsString() @IsNotEmpty()
    snowCompanyName: string;
}

class UpdateSnProfileDto {
    @IsOptional() @IsString() @IsNotEmpty()
    name?: string;

    @IsOptional() @IsString()
    snowCompanySysId?: string;

    @IsOptional() @IsString()
    snowCompanyName?: string;

    @IsOptional() @IsBoolean()
    isActive?: boolean;
}

class BulkSnProfileDto {
    @IsArray()
    profiles: CreateSnProfileDto[];
}

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('internal/companies')
export class InternalCompaniesController {
    constructor(
        @Inject(COMPANY_SERVICE) private readonly companyService: ICompanyService,
        @Inject(ISSUE_TYPE_TREE_REPOSITORY) private readonly treeRepo: IIssueTypeTreeRepository,
        @Inject(SERVICE_NOW_PROFILE_REPOSITORY) private readonly snProfileRepo: IServiceNowProfileRepository,
        @Inject(SERVICENOW_PROFILE_SERVICE) private readonly snProfileService: IServiceNowProfileService,
        private readonly tracing: TracingService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Listar todas las empresas activas' })
    async list() {
        const result = await this.companyService.listCompanies();
        return unwrapOrThrow(result).map((c) => this.toDto(c));
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

    @Get('sn-profiles')
    @ApiOperation({ summary: 'Listar perfiles de ServiceNow disponibles' })
    async listSnProfiles() {
        const result = await this.snProfileRepo.findAllActive();
        return unwrapOrThrow(result).map((p) => ({
            id: p.id.toString(),
            name: p.name,
            snowCompanySysId: p.snowCompanySysId.value,
            snowCompanyName: p.snowCompanyName,
        }));
    }

    @Post('sn-profiles')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear perfil de ServiceNow' })
    async createSnProfile(@Body() dto: CreateSnProfileDto) {
        return this.tracing.run('monolith.controller.companies.createSnProfile', { kind: 'server' }, () => this._createSnProfile(dto));
    }

    private async _createSnProfile(dto: CreateSnProfileDto) {
        const result = await this.snProfileService.createProfile({
            name: dto.name,
            snowCompanySysId: dto.snowCompanySysId as any,
            snowCompanyName: dto.snowCompanyName,
        });
        return this.toSnProfileDto(unwrapOrThrow(result));
    }

    @Post('sn-profiles/bulk')
    @ApiOperation({ summary: 'Importar perfiles de ServiceNow en masa' })
    async bulkImportSnProfiles(@Body() dto: BulkSnProfileDto) {
        return this.tracing.run(
            'monolith.controller.companies.bulkImportSnProfiles',
            { kind: 'server', attributes: { 'bulk.count': dto.profiles.length } },
            () => this._bulkImportSnProfiles(dto),
        );
    }

    private async _bulkImportSnProfiles(dto: BulkSnProfileDto) {
        const created: ReturnType<typeof this.toSnProfileDto>[] = [];
        const errors: Array<{ row: number; message: string }> = [];
        for (let i = 0; i < dto.profiles.length; i++) {
            const p = dto.profiles[i];
            const result = await this.snProfileService.createProfile({
                name: p.name,
                snowCompanySysId: p.snowCompanySysId as any,
                snowCompanyName: p.snowCompanyName,
            });
            if (result.isFailure) {
                errors.push({ row: i + 1, message: result.unwrapError().message });
            } else {
                created.push(this.toSnProfileDto(result.unwrap()));
            }
        }
        return { created: created.length, profiles: created, errors };
    }

    @Put('sn-profiles/:id')
    @ApiOperation({ summary: 'Actualizar perfil de ServiceNow' })
    @ApiParam({ name: 'id' })
    async updateSnProfile(@Param('id') id: string, @Body() dto: UpdateSnProfileDto) {
        return this.tracing.run(
            'monolith.controller.companies.updateSnProfile',
            { kind: 'server', attributes: { 'snProfile.id': id } },
            () => this._updateSnProfile(id, dto),
        );
    }

    private async _updateSnProfile(id: string, dto: UpdateSnProfileDto) {
        const result = await this.snProfileService.updateProfile(id as any, {
            name: dto.name,
            snowCompanySysId: dto.snowCompanySysId,
            snowCompanyName: dto.snowCompanyName,
            isActive: dto.isActive,
        });
        return this.toSnProfileDto(unwrapOrThrow(result));
    }

    @Delete('sn-profiles/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar perfil de ServiceNow' })
    @ApiParam({ name: 'id' })
    async deleteSnProfile(@Param('id') id: string) {
        return this.tracing.run(
            'monolith.controller.companies.deleteSnProfile',
            { kind: 'server', attributes: { 'snProfile.id': id } },
            () => this._deleteSnProfile(id),
        );
    }

    private async _deleteSnProfile(id: string) {
        const result = await this.snProfileService.updateProfile(id as any, { isActive: false });
        unwrapOrThrow(result);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener empresa por ID' })
    @ApiParam({ name: 'id' })
    async getOne(@Param('id') id: string) {
        const result = await this.companyService.getCompany(id);
        const company = unwrapOrThrow(result);
        if (!company) throw Object.assign(new Error('Company not found'), { status: 404 });
        return this.toDto(company);
    }

    @Post('bulk')
    @ApiOperation({ summary: 'Crear empresas en masa' })
    async bulkCreate(@Body() dto: { companies: CreateCompanyDto[] }) {
        return this.tracing.run(
            'monolith.controller.companies.bulkCreate',
            { kind: 'server', attributes: { 'bulk.count': dto.companies.length } },
            () => this._bulkCreate(dto),
        );
    }

    private async _bulkCreate(dto: { companies: CreateCompanyDto[] }) {
        const created: ReturnType<typeof this.toDto>[] = [];
        const errors: Array<{ row: number; message: string }> = [];
        for (let i = 0; i < dto.companies.length; i++) {
            const c = dto.companies[i];
            const result = await this.companyService.createCompany({
                name: c.name,
                treeId: c.treeId,
                profileId: c.profileId ?? null,
            });
            if (result.isFailure) {
                errors.push({ row: i + 1, message: result.unwrapError().message });
            } else {
                created.push(this.toDto(result.unwrap()));
            }
        }
        return { created: created.length, companies: created, errors };
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Crear empresa',
        description: 'Si se provee snowCompanySysId + snowCompanyName, crea el perfil SN automáticamente y lo vincula.',
    })
    async create(@Body() dto: CreateCompanyDto) {
        return this.tracing.run('monolith.controller.companies.create', { kind: 'server' }, () => this._create(dto));
    }

    private async _create(dto: CreateCompanyDto) {
        let resolvedProfileId = dto.profileId ?? null;

        // Creación atómica de perfil SN si se proveen los datos de ServiceNow
        if (dto.snowCompanySysId && dto.snowCompanyName && !resolvedProfileId) {
            const profileResult = await this.snProfileService.createProfile({
                name: dto.snowCompanyName,
                snowCompanySysId: dto.snowCompanySysId as any,
                snowCompanyName: dto.snowCompanyName,
            });
            const profile = unwrapOrThrow(profileResult);
            resolvedProfileId = profile.id.toString();
        }

        const result = await this.companyService.createCompany({
            name: dto.name,
            treeId: dto.treeId,
            profileId: resolvedProfileId,
        });
        return this.toDto(unwrapOrThrow(result));
    }

    @Put(':id')
    @ApiOperation({ summary: 'Actualizar empresa' })
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
            name: dto.name,
            treeId: dto.treeId,
            ...(dto.profileId !== undefined ? { profileId: dto.profileId } : {}),
            isActive: dto.isActive,
        });
        return this.toDto(unwrapOrThrow(result));
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

    private toSnProfileDto(p: ServiceNowProfile) {
        return {
            id: p.id.toString(),
            name: p.name,
            snowCompanySysId: p.snowCompanySysId.value,
            snowCompanyName: p.snowCompanyName,
            isActive: p.isActive,
        };
    }

    private toDto(c: any) {
        return {
            id: c.id.toString(),
            name: c.name,
            treeId: c.treeId?.toString() ?? null,
            profileId: c.profileId?.toString() ?? null,
            isDefault: c.name === 'DEFAULT',
            isActive: c.isActive,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        };
    }
}
