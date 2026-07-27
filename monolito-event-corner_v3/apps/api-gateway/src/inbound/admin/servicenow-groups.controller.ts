import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { ServiceNowCatalogClient } from '../../outbound/servicenow/servicenow-catalog.client';

@ApiTags('Admin - ServiceNow Groups')
@ApiBearerAuth('jwt')
@Controller('api/admin/servicenow-groups')
export class AdminServiceNowGroupsController {
  constructor(
    private readonly monolith: MonolithClient,
    private readonly snCatalog: ServiceNowCatalogClient,
  ) {}

  /** Catálogo local del monolith (grupos ya registrados) */
  @Get()
  @Permission('corner', 'list')
  @ApiOperation({
    summary: 'Listar grupos de ServiceNow registrados en el monolith',
  })
  findAll() {
    return this.monolith.get('/servicenow-groups');
  }

  /** Catálogo de SN-clone (fuente de verdad — para el picker del dashboard) */
  @Get('sn-catalog')
  @Permission('corner', 'list')
  @ApiOperation({
    summary:
      'Listar grupos disponibles en ServiceNow (para pickers de corner y CompanyIssueConfig)',
  })
  listSnCatalog() {
    return this.snCatalog.getGroups();
  }

  /** Validar que un sys_id de grupo existe en SN-clone */
  @Get('sn-catalog/:sys_id')
  @Permission('corner', 'list')
  @ApiOperation({ summary: 'Verificar que un grupo existe en ServiceNow' })
  @ApiParam({ name: 'sys_id', description: 'sys_id del grupo en ServiceNow' })
  validateGroup(@Param('sys_id') sys_id: string) {
    return this.snCatalog.getGroupBySysId(sys_id);
  }

  /** Trae el catálogo vivo de SN y lo upsertea en el catálogo local del monolith */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @Permission('corner', 'list')
  @ApiOperation({
    summary: 'Sincronizar catálogo local con ServiceNow',
    description: 'Trae los grupos vigentes de ServiceNow y actualiza el catálogo local — evita llamar a SN en cada carga del picker de corners.',
  })
  async sync() {
    const groups = await this.snCatalog.getGroups();
    return this.monolith.post('/servicenow-groups/sync', {
      groups: groups.map((g) => ({ groupId: g.sys_id, groupName: g.name })),
    });
  }
}
