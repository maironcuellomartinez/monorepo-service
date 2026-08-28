// api-gateway/inbound/admin/companies.controller.ts
import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
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
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TracingService } from '@app/observability';

class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  treeId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Admin / Companies')
@ApiBearerAuth('jwt')
@Controller('api/admin/companies')
export class AdminCompaniesController {
  constructor(
    private readonly monolith: MonolithClient,
    private readonly tracing: TracingService,
  ) {}

  @Get()
  @Permission('company', 'list')
  @ApiOperation({ summary: 'Listar empresas activas (sincronizadas desde ServiceNow)' })
  list() {
    return this.monolith.get('/companies');
  }

  @Get('trees')
  @Permission('company', 'list')
  @ApiOperation({ summary: 'Listar árboles de tipos de cita' })
  listTrees() {
    return this.monolith.get('/companies/trees');
  }

  @Post('sync-from-sn')
  @Roles('admin', 'super-admin')
  @Permission('company', 'create')
  @ApiOperation({
    summary: 'Sincronizar empresas desde ServiceNow',
    description:
      'Importa al monolito las empresas del catálogo de ServiceNow que todavía no están registradas y crea la compañía local vinculada a cada una (sin árbol asignado hasta que el admin lo configure).',
  })
  syncFromServiceNow() {
    return this.tracing.run(
      'gateway.controller.companies.syncFromServiceNow',
      { kind: 'server' },
      // Timeout largo a propósito: sincroniza el catálogo completo de SN en
      // una sola llamada síncrona (perfil + compañía por empresa) — con el
      // timeout default de 8s del cliente monolith, un catálogo real lo
      // supera con facilidad. Eso dispararía los 3 reintentos configurados a
      // nivel cliente, cada uno relanzando otra corrida completa del sync en
      // el monolito (sin este timeout, la corrida "lenta pero exitosa" se
      // reporta como fallo y el circuit breaker compartido con el resto del
      // tráfico gateway→monolith termina abriéndose).
      () => this.monolith.post('/companies/sync-from-sn', undefined, undefined, 60_000),
    );
  }

  @Get(':id')
  @Permission('company', 'list')
  @ApiOperation({ summary: 'Obtener empresa por ID' })
  @ApiParam({ name: 'id' })
  getOne(@Param('id') id: string) {
    return this.monolith.get(`/companies/${id}`);
  }

  @Put(':id')
  @Roles('admin', 'super-admin')
  @Permission('company', 'update')
  @ApiOperation({
    summary: 'Actualizar empresa',
    description: 'Solo permite asignar el árbol de tipos de cita y activar/desactivar.',
  })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.tracing.run(
      'gateway.controller.companies.update',
      { kind: 'server', attributes: { 'company.id': id } },
      () => this.monolith.put(`/companies/${id}`, dto),
    );
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
      () => this.monolith.delete(`/companies/${id}`),
    );
  }
}
