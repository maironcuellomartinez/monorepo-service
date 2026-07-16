// api-gateway/inbound/admin/companies.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TracingService } from '@app/observability';
import { ServiceNowCatalogClient } from '../../outbound/servicenow/servicenow-catalog.client';

class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  treeId: string;

  @IsOptional()
  @IsString()
  profileId?: string | null;

  /** sys_id de la empresa en ServiceNow — si se provee, se valida y crea el perfil SN automáticamente */
  @IsOptional()
  @IsString()
  snowCompanySysId?: string;

  /** Nombre de la empresa en ServiceNow — requerido si se provee snowCompanySysId */
  @IsOptional()
  @IsString()
  snowCompanyName?: string;
}

class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  treeId?: string;

  @IsOptional()
  @IsString()
  profileId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class CreateSnProfileDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  snowCompanySysId: string;

  @IsString()
  @IsNotEmpty()
  snowCompanyName: string;
}

class UpdateSnProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  snowCompanySysId?: string;

  @IsOptional()
  @IsString()
  snowCompanyName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class BulkSnProfileDto {
  profiles: CreateSnProfileDto[];
}

@ApiTags('Admin / Companies')
@ApiBearerAuth('jwt')
@Controller('api/admin/companies')
export class AdminCompaniesController {
  constructor(
    private readonly monolith: MonolithClient,
    private readonly snCatalog: ServiceNowCatalogClient,
    private readonly tracing: TracingService,
  ) {}

  private validateSnCompany(sys_id: string): Promise<{ name: string }> {
    return this.snCatalog.getCompanyBySysId(sys_id);
  }

  @Get()
  @Permission('company', 'list')
  @ApiOperation({ summary: 'Listar empresas activas' })
  list() {
    return this.monolith.get('/companies');
  }

  @Get('sn-catalog')
  @Permission('company', 'list')
  @ApiOperation({
    summary:
      'Listar empresas disponibles en ServiceNow (para el picker de creación)',
  })
  listSnCatalog() {
    return this.snCatalog.getCompanies();
  }

  @Post('sync-from-sn')
  @Roles('admin', 'super-admin')
  @Permission('company', 'create')
  @ApiOperation({
    summary: 'Sincronizar perfiles de ServiceNow',
    description:
      'Importa al monolito los perfiles de empresa del catálogo de ServiceNow que aún no están registrados. ' +
      'No crea compañías locales — esas se gestionan manualmente.',
  })
  async syncFromServiceNow() {
    return this.tracing.run(
      'gateway.controller.companies.syncFromServiceNow',
      { kind: 'server' },
      () => this._syncFromServiceNow(),
    );
  }
  private async _syncFromServiceNow() {
    const snCompanies = await this.snCatalog.getCompanies();

    const existingProfiles = await this.monolith.get<
      Array<{ snowCompanySysId: string }>
    >('/companies/sn-profiles');
    const existingSysIds = new Set(
      existingProfiles.map((p) => p.snowCompanySysId),
    );

    const created: unknown[] = [];
    const skipped: Array<{ sys_id: string; name: string }> = [];
    const errorDetails: Array<{
      sys_id: string;
      name: string;
      message: string;
    }> = [];

    for (const snCompany of snCompanies) {
      if (existingSysIds.has(snCompany.sys_id)) {
        skipped.push({ sys_id: snCompany.sys_id, name: snCompany.name });
        continue;
      }
      try {
        const profile = await this.monolith.post('/companies/sn-profiles', {
          name: snCompany.name,
          snowCompanySysId: snCompany.sys_id,
          snowCompanyName: snCompany.name,
        });
        created.push(profile);
      } catch (err: any) {
        errorDetails.push({
          sys_id: snCompany.sys_id,
          name: snCompany.name,
          message: err?.message ?? 'Unknown error',
        });
      }
    }

    return {
      synced: created.length,
      skipped: skipped.length,
      errors: errorDetails.length,
      profiles: created,
      skippedCompanies: skipped,
      errorDetails,
    };
  }

  @Get('trees')
  @Permission('company', 'list')
  @ApiOperation({ summary: 'Listar árboles de tipos de cita' })
  listTrees() {
    return this.monolith.get('/companies/trees');
  }

  @Get('sn-profiles')
  @Permission('company', 'list')
  @ApiOperation({ summary: 'Listar perfiles de ServiceNow' })
  listSnProfiles() {
    return this.monolith.get('/companies/sn-profiles');
  }

  @Post('sn-profiles')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'super-admin')
  @Permission('company', 'create')
  @ApiOperation({ summary: 'Crear perfil de ServiceNow' })
  createSnProfile(@Body() dto: CreateSnProfileDto) {
    return this.tracing.run(
      'gateway.controller.companies.createSnProfile',
      { kind: 'server' },
      () => this._createSnProfile(dto),
    );
  }
  private async _createSnProfile(dto: CreateSnProfileDto) {
    return this.monolith.post('/companies/sn-profiles', dto);
  }

  @Post('sn-profiles/bulk')
  @Roles('admin', 'super-admin')
  @Permission('company', 'create')
  @ApiOperation({ summary: 'Importar perfiles de ServiceNow en masa' })
  bulkImportSnProfiles(@Body() dto: BulkSnProfileDto) {
    return this.tracing.run(
      'gateway.controller.companies.bulkImportSnProfiles',
      { kind: 'server' },
      () => this._bulkImportSnProfiles(dto),
    );
  }
  private async _bulkImportSnProfiles(dto: BulkSnProfileDto) {
    return this.monolith.post('/companies/sn-profiles/bulk', dto);
  }

  @Put('sn-profiles/:id')
  @Roles('admin', 'super-admin')
  @Permission('company', 'update')
  @ApiOperation({ summary: 'Actualizar perfil de ServiceNow' })
  @ApiParam({ name: 'id' })
  updateSnProfile(@Param('id') id: string, @Body() dto: UpdateSnProfileDto) {
    return this.tracing.run(
      'gateway.controller.companies.updateSnProfile',
      { kind: 'server', attributes: { 'snProfile.id': id } },
      () => this._updateSnProfile(id, dto),
    );
  }
  private async _updateSnProfile(id: string, dto: UpdateSnProfileDto) {
    return this.monolith.put(`/companies/sn-profiles/${id}`, dto);
  }

  @Delete('sn-profiles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'super-admin')
  @Permission('company', 'delete')
  @ApiOperation({ summary: 'Desactivar perfil de ServiceNow' })
  @ApiParam({ name: 'id' })
  deleteSnProfile(@Param('id') id: string) {
    return this.tracing.run(
      'gateway.controller.companies.deleteSnProfile',
      { kind: 'server', attributes: { 'snProfile.id': id } },
      () => this._deleteSnProfile(id),
    );
  }
  private async _deleteSnProfile(id: string) {
    return this.monolith.delete(`/companies/sn-profiles/${id}`);
  }

  @Get(':id')
  @Permission('company', 'list')
  @ApiOperation({ summary: 'Obtener empresa por ID' })
  @ApiParam({ name: 'id' })
  getOne(@Param('id') id: string) {
    return this.monolith.get(`/companies/${id}`);
  }

  @Post('bulk')
  @Roles('admin', 'super-admin')
  @Permission('company', 'create')
  @ApiOperation({ summary: 'Crear empresas en masa' })
  bulkCreate(@Body() dto: { companies: CreateCompanyDto[] }) {
    return this.tracing.run(
      'gateway.controller.companies.bulkCreate',
      { kind: 'server' },
      () => this._bulkCreate(dto),
    );
  }
  private async _bulkCreate(dto: { companies: CreateCompanyDto[] }) {
    return this.monolith.post('/companies/bulk', dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'super-admin')
  @Permission('company', 'create')
  @ApiOperation({
    summary: 'Crear empresa',
    description:
      'Si se provee snowCompanySysId, valida que exista en ServiceNow y crea el perfil SN automáticamente.',
  })
  async create(@Body() dto: CreateCompanyDto) {
    return this.tracing.run(
      'gateway.controller.companies.create',
      { kind: 'server' },
      () => this._create(dto),
    );
  }
  private async _create(dto: CreateCompanyDto) {
    // Validar empresa en SN y resolver nombre si no se proveyó
    let resolvedSnName = dto.snowCompanyName;
    if (dto.snowCompanySysId) {
      const snCompany = await this.validateSnCompany(dto.snowCompanySysId);
      resolvedSnName = resolvedSnName ?? snCompany.name;
    }

    return this.monolith.post('/companies', {
      name: dto.name,
      treeId: dto.treeId,
      profileId: dto.profileId ?? undefined,
      ...(dto.snowCompanySysId && {
        snowCompanySysId: dto.snowCompanySysId,
        snowCompanyName: resolvedSnName,
      }),
    });
  }

  @Put(':id')
  @Roles('admin', 'super-admin')
  @Permission('company', 'update')
  @ApiOperation({ summary: 'Actualizar empresa' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.tracing.run(
      'gateway.controller.companies.update',
      { kind: 'server', attributes: { 'company.id': id } },
      () => this._update(id, dto),
    );
  }
  private async _update(id: string, dto: UpdateCompanyDto) {
    return this.monolith.put(`/companies/${id}`, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'super-admin')
  @Permission('company', 'delete')
  @ApiOperation({ summary: 'Desactivar empresa' })
  @ApiParam({ name: 'id' })
  delete(@Param('id') id: string) {
    return this.tracing.run(
      'gateway.controller.companies.delete',
      { kind: 'server', attributes: { 'company.id': id } },
      () => this._delete(id),
    );
  }
  private async _delete(id: string) {
    return this.monolith.delete(`/companies/${id}`);
  }
}
