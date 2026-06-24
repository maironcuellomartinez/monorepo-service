// api-gateway/inbound/admin/companies.controller.ts
import {
    Controller, Get, Post, Put, Delete,
    Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';

class CreateCompanyDto {
    @IsString() @IsNotEmpty()
    name: string;

    @IsString() @IsNotEmpty()
    treeId: string;

    @IsOptional() @IsString()
    profileId?: string | null;
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
    profiles: CreateSnProfileDto[];
}

@ApiTags('Admin / Companies')
@ApiBearerAuth('jwt')
@Controller('api/admin/companies')
export class AdminCompaniesController {
    constructor(private readonly monolith: MonolithClient) {}

    @Get()
    @Permission('company', 'list')
    @ApiOperation({ summary: 'Listar empresas activas' })
    list() {
        return this.monolith.get('/companies');
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
        return this.monolith.post('/companies/sn-profiles', dto);
    }

    @Post('sn-profiles/bulk')
    @Roles('admin', 'super-admin')
    @Permission('company', 'create')
    @ApiOperation({ summary: 'Importar perfiles de ServiceNow en masa' })
    bulkImportSnProfiles(@Body() dto: BulkSnProfileDto) {
        return this.monolith.post('/companies/sn-profiles/bulk', dto);
    }

    @Put('sn-profiles/:id')
    @Roles('admin', 'super-admin')
    @Permission('company', 'update')
    @ApiOperation({ summary: 'Actualizar perfil de ServiceNow' })
    @ApiParam({ name: 'id' })
    updateSnProfile(@Param('id') id: string, @Body() dto: UpdateSnProfileDto) {
        return this.monolith.put(`/companies/sn-profiles/${id}`, dto);
    }

    @Delete('sn-profiles/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('admin', 'super-admin')
    @Permission('company', 'delete')
    @ApiOperation({ summary: 'Desactivar perfil de ServiceNow' })
    @ApiParam({ name: 'id' })
    deleteSnProfile(@Param('id') id: string) {
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
        return this.monolith.post('/companies/bulk', dto);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles('admin', 'super-admin')
    @Permission('company', 'create')
    @ApiOperation({ summary: 'Crear empresa' })
    create(@Body() dto: CreateCompanyDto) {
        return this.monolith.post('/companies', dto);
    }

    @Put(':id')
    @Roles('admin', 'super-admin')
    @Permission('company', 'update')
    @ApiOperation({ summary: 'Actualizar empresa' })
    @ApiParam({ name: 'id' })
    update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
        return this.monolith.put(`/companies/${id}`, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Roles('admin', 'super-admin')
    @Permission('company', 'delete')
    @ApiOperation({ summary: 'Desactivar empresa' })
    @ApiParam({ name: 'id' })
    delete(@Param('id') id: string) {
        return this.monolith.delete(`/companies/${id}`);
    }
}
