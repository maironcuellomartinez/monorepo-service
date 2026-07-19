import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Permission } from '../../auth/decorators/permission.decorator';
import { ServiceNowCatalogClient } from '../../outbound/servicenow/servicenow-catalog.client';

@ApiTags('Admin - ServiceNow Locations')
@ApiBearerAuth('jwt')
@Controller('api/admin/servicenow-locations')
export class AdminServiceNowLocationsController {
  constructor(private readonly snCatalog: ServiceNowCatalogClient) {}

  /** Catálogo de ubicaciones de SN (cmn_location) — para el picker de Location del corner */
  @Get('sn-catalog')
  @Permission('corner', 'list')
  @ApiOperation({
    summary: 'Listar ubicaciones disponibles en ServiceNow (picker de corner)',
  })
  listSnCatalog() {
    return this.snCatalog.getLocations();
  }
}
