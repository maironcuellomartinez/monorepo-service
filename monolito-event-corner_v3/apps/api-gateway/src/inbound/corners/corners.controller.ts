// api-gateway/inbound/corners/corners.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { MonolithClient } from '../../client/monolith.client';
import { Permission } from '../../auth/decorators/permission.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateCornerDto } from './dto/create-corner.dto';
import { UpdateCornerDto } from './dto/update-corner.dto';
import { AddScheduleDto, AssignTechniciansDto } from './dto/add-schedule.dto';

@ApiTags('Corners')
@ApiBearerAuth('jwt')
@Controller('api/corners')
export class CornersController {
    constructor(private readonly monolith: MonolithClient) {}

    @Get()
    @Permission('corner', 'list')
    @ApiOperation({ summary: 'Listar corners' })
    async getAll() {
        return this.monolith.get('/corners');
    }

    @Get(':id')
    @Permission('corner', 'read')
    @ApiOperation({ summary: 'Obtener corner por ID' })
    @ApiParam({ name: 'id' })
    async getOne(@Param('id') id: string) {
        return this.monolith.get(`/corners/${id}`);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles('admin', 'super-admin')
    @Permission('corner', 'create')
    @ApiOperation({ summary: 'Crear corner' })
    async create(@Body() dto: CreateCornerDto) {
        return this.monolith.post('/corners', dto);
    }

    @Put(':id')
    @Roles('admin', 'super-admin')
    @Permission('corner', 'update')
    @ApiOperation({ summary: 'Actualizar corner' })
    @ApiParam({ name: 'id' })
    async update(@Param('id') id: string, @Body() dto: UpdateCornerDto) {
        return this.monolith.put(`/corners/${id}`, dto);
    }

    @Delete(':id')
    @Roles('admin', 'super-admin')
    @Permission('corner', 'delete')
    @ApiOperation({ summary: 'Eliminar corner' })
    @ApiParam({ name: 'id' })
    async deactivate(@Param('id') id: string) {
        return this.monolith.delete(`/corners/${id}`);
    }

    @Post(':id/schedules')
    @HttpCode(HttpStatus.CREATED)
    @Roles('admin', 'super-admin')
    @Permission('schedule', 'create')
    @ApiOperation({ summary: 'Crear horario en un corner' })
    @ApiParam({ name: 'id', description: 'Corner ID' })
    async addSchedule(@Param('id') cornerId: string, @Body() dto: AddScheduleDto) {
        return this.monolith.post(`/corners/${cornerId}/schedules`, dto);
    }

    @Get(':id/schedules')
    @Permission('schedule', 'list')
    @ApiOperation({ summary: 'Listar horarios de un corner' })
    @ApiParam({ name: 'id', description: 'Corner ID' })
    async getSchedules(@Param('id') cornerId: string) {
        return this.monolith.get(`/corners/${cornerId}/schedules`);
    }

    @Put(':id/schedules/:scheduleId')
    @Roles('admin', 'super-admin')
    @Permission('schedule', 'update')
    @ApiOperation({ summary: 'Actualizar horario de un corner' })
    @ApiParam({ name: 'id', description: 'Corner ID' })
    @ApiParam({ name: 'scheduleId' })
    async updateSchedule(
        @Param('id') cornerId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: AddScheduleDto,
    ) {
        return this.monolith.put(`/corners/${cornerId}/schedules/${scheduleId}`, dto);
    }

    @Delete(':id/schedules/:scheduleId')
    @Roles('admin', 'super-admin')
    @Permission('schedule', 'delete')
    @ApiOperation({ summary: 'Eliminar horario de un corner' })
    @ApiParam({ name: 'id', description: 'Corner ID' })
    @ApiParam({ name: 'scheduleId' })
    async deleteSchedule(
        @Param('id') cornerId: string,
        @Param('scheduleId') scheduleId: string,
    ) {
        return this.monolith.delete(`/corners/${cornerId}/schedules/${scheduleId}`);
    }

    @Post(':id/schedules/:scheduleId/technicians')
    @Roles('admin', 'super-admin')
    @Permission('schedule', 'assign-technicians')
    @ApiOperation({ summary: 'Asignar técnicos a un horario' })
    @ApiParam({ name: 'id', description: 'Corner ID' })
    @ApiParam({ name: 'scheduleId' })
    async assignTechnicians(
        @Param('id') cornerId: string,
        @Param('scheduleId') scheduleId: string,
        @Body() dto: AssignTechniciansDto,
    ) {
        return this.monolith.post(`/corners/${cornerId}/schedules/${scheduleId}/technicians`, dto);
    }
}
