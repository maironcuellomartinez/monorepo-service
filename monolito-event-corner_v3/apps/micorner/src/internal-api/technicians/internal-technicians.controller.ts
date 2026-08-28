// internal-api/technicians/internal-technicians.controller.ts
import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    Inject, HttpCode, HttpStatus, HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';
import { TECHNICIAN_SERVICE } from '@app/core/ports/incoming/service-tokens';
import { ITechnicianService } from '@app/core/ports/incoming/technician/technician-service.port';
import { CornerId, TechnicianId } from '@app/core/domain/value-objects/ids';
import { TracingService } from '@app/observability';

export class AssignCornerDto {
    @IsString()
    @IsNotEmpty()
    cornerId: string;
}

export class CreateTechnicianDto {
    /** micornerUserId del User al que se vincula este técnico */
    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsOptional()
    cornerId?: string;

    @IsString()
    @IsOptional()
    lastName?: string;
}

function mapTechnician(t: any) {
    return {
        id: t.id.toString(),
        userId: t.userId?.toString() ?? null,
        name: t.name,
        lastName: t.lastName,
        fullName: t.fullName,
        email: t.email,
        cornerId: t.cornerId?.toString() ?? null,
        disabled: t.disabled,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
    };
}

@ApiTags('Technicians')
@ApiBearerAuth()
@Controller('internal/technicians')
export class InternalTechniciansController {
    constructor(
        @Inject(TECHNICIAN_SERVICE) private readonly service: ITechnicianService,
        private readonly tracing: TracingService,
    ) { }

    @Get('by-user/:userId')
    @ApiOperation({ summary: 'Obtener perfil de técnico por micornerUserId' })
    @ApiParam({ name: 'userId' })
    async getByUserId(@Param('userId') userId: string) {
        const result = await this.service.getTechnicianByUserId(userId);
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.INTERNAL_SERVER_ERROR);
        const technician = result.unwrap();
        if (!technician) return null;
        return mapTechnician(technician);
    }

    @Get()
    @ApiOperation({ summary: 'Listar técnicos. Sin cornerId devuelve todos.' })
    @ApiQuery({ name: 'cornerId', required: false })
    async list(@Query('cornerId') cornerId?: string) {
        const result = cornerId
            ? await this.service.getTechniciansByCorner(CornerId(cornerId as any))
            : await this.service.getAllTechnicians();
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.INTERNAL_SERVER_ERROR);
        return result.unwrap().map(mapTechnician);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Crear técnico vinculado a un User' })
    async create(@Body() dto: CreateTechnicianDto) {
        return this.tracing.run('micorner.controller.technicians.create', { kind: 'server' }, () => this._create(dto));
    }

    private async _create(dto: CreateTechnicianDto) {
        const result = await this.service.createTechnician({
            userId: dto.userId,
            name: dto.name,
            email: dto.email,
            cornerId: dto.cornerId ? dto.cornerId : undefined,
            lastName: dto.lastName,
        });
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
        return mapTechnician(result.unwrap());
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obtener técnico por ID' })
    @ApiParam({ name: 'id' })
    async getOne(@Param('id') id: string) {
        const result = await this.service.getTechnician(TechnicianId(id as any));
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.INTERNAL_SERVER_ERROR);
        const technician = result.unwrap();
        if (!technician) throw new HttpException({ message: 'Technician not found' }, HttpStatus.NOT_FOUND);
        return mapTechnician(technician);
    }

    @Patch(':id/corner')
    @ApiOperation({ summary: 'Asignar técnico a un corner (transferencia)' })
    @ApiParam({ name: 'id' })
    async assignCorner(@Param('id') id: string, @Body() dto: AssignCornerDto) {
        return this.tracing.run('micorner.controller.technicians.assignCorner', { kind: 'server', attributes: { 'technician.id': id } }, () => this._assignCorner(id, dto));
    }

    private async _assignCorner(id: string, dto: AssignCornerDto) {
        const result = await this.service.updateTechnician(TechnicianId(id as any), {
            cornerId: CornerId(dto.cornerId as any),
        });
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
        return mapTechnician(result.unwrap());
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar técnico permanentemente' })
    @ApiParam({ name: 'id' })
    async remove(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.technicians.remove', { kind: 'server', attributes: { 'technician.id': id } }, () => this._remove(id));
    }

    private async _remove(id: string) {
        const result = await this.service.deleteTechnician(id);
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
    }

    @Patch(':id/disable')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Deshabilitar técnico' })
    @ApiParam({ name: 'id' })
    async disable(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.technicians.disable', { kind: 'server', attributes: { 'technician.id': id } }, () => this._disable(id));
    }

    private async _disable(id: string) {
        const result = await this.service.disableTechnician(TechnicianId(id as any));
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
    }

    @Patch(':id/enable')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Habilitar técnico' })
    @ApiParam({ name: 'id' })
    async enable(@Param('id') id: string) {
        return this.tracing.run('micorner.controller.technicians.enable', { kind: 'server', attributes: { 'technician.id': id } }, () => this._enable(id));
    }

    private async _enable(id: string) {
        const result = await this.service.enableTechnician(TechnicianId(id as any));
        if (result.isFailure) throw new HttpException({ message: result.unwrapError().message }, HttpStatus.BAD_REQUEST);
    }
}
