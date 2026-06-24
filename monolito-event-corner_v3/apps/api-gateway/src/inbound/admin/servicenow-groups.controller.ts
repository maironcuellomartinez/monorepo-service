import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';

@ApiTags('Admin - ServiceNow Groups')
@ApiBearerAuth('jwt')
@Controller('api/admin/servicenow-groups')
export class AdminServiceNowGroupsController {
    constructor(private readonly monolith: MonolithClient) {}

    @Get()
    @Permission('corner', 'list')
    @ApiOperation({ summary: 'Listar grupos de ServiceNow disponibles' })
    async findAll() {
        return this.monolith.get('/servicenow-groups');
    }
}
