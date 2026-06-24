import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, IsArray, IsInt, Min, Max, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DeviceDto {
    @IsString() @IsNotEmpty()
    serialNumber: string;
}
import { IncidentStatus } from '../../../core/domain/enums/incident-status.enum';

export class CreateIncidentDto {
    @ApiProperty({ example: 'uuid-issue-type', description: 'ID del tipo de incidencia' })
    @IsString() @IsNotEmpty()
    issueTypeId: string;

    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente (usuario)' })
    @IsString() @IsNotEmpty()
    customerId: string;

    @ApiProperty({ example: 'uuid-corner', description: 'ID del corner donde se atiende' })
    @IsString() @IsNotEmpty()
    cornerId: string;

    @ApiProperty({ type: [String], example: ['uuid-slot-1'], description: 'IDs de los slots reservados' })
    @IsArray() @IsString({ each: true })
    slotIds: string[];

    @ApiProperty({ example: 'gateway', description: 'Origen de la creación (gateway, system, etc.)' })
    @IsString() @IsNotEmpty()
    origin: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    startTime?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    endTime?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    notes?: string;

    @ApiProperty({ type: () => DeviceDto, description: 'Dispositivo asociado a la incidencia' })
    @IsObject()
    @ValidateNested()
    @Type(() => DeviceDto)
    device: DeviceDto;

    @ApiPropertyOptional({ example: { channel: 'web' }, description: 'Metadatos adicionales' })
    @IsOptional()
    metadata?: Record<string, any>;
}

export class DeliverIncidentDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que registra la entrega' })
    @IsString() @IsNotEmpty()
    technicianId: string;
}

export class TakeIncidentDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que toma la incidencia' })
    @IsString() @IsNotEmpty()
    technicianId: string;
}

export class ReleaseIncidentDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que libera la incidencia' })
    @IsString() @IsNotEmpty()
    technicianId: string;

    @ApiPropertyOptional({ example: 'Requiere repuesto', description: 'Motivo de la liberación' })
    @IsOptional() @IsString()
    reason?: string;
}

export class ChangeStatusDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que cambia el estado' })
    @IsString() @IsNotEmpty()
    technicianId: string;

    @ApiProperty({ enum: IncidentStatus, example: IncidentStatus.IN_PROGRESS, description: 'Nuevo estado de la incidencia' })
    @IsString() @IsNotEmpty()
    newStatus: IncidentStatus;

    @ApiPropertyOptional({ example: 'Reparado exitosamente', description: 'Comentario opcional' })
    @IsOptional() @IsString()
    comment?: string;

    @ApiPropertyOptional({ example: 'Hardware', description: 'Categoría de cierre (requerida al cerrar)' })
    @IsOptional() @IsString()
    closeCategory?: string;
}

export class BatchStatusChangeItemDto {
    @ApiProperty({ example: 'uuid-incident' })
    @IsString() @IsNotEmpty()
    incidentId: string;

    @ApiProperty({ enum: IncidentStatus })
    @IsString() @IsNotEmpty()
    targetStatus: IncidentStatus;

    @ApiProperty({ example: 'uuid-technician' })
    @IsString() @IsNotEmpty()
    technicianId: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    comment?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    closeCategory?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    reason?: string;
}

export class BatchStatusChangeDto {
    @ApiProperty({ type: [BatchStatusChangeItemDto], description: 'Lista de cambios (máx 50)' })
    @IsArray()
    items: BatchStatusChangeItemDto[];
}

export class ValidateIncidentDto {
    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente que valida la resolución' })
    @IsString() @IsNotEmpty()
    customerId: string;
}

export class ReopenIncidentDto {
    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente que reabre la incidencia' })
    @IsString() @IsNotEmpty()
    customerId: string;

    @ApiPropertyOptional({ example: 'El problema persiste', description: 'Motivo del rechazo' })
    @IsOptional() @IsString()
    reason?: string;
}

export class CancelIncidentDto {
    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente que cancela la incidencia' })
    @IsString() @IsNotEmpty()
    customerId: string;

    @ApiPropertyOptional({ example: 'Ya no necesito el servicio', description: 'Motivo de la cancelación' })
    @IsOptional() @IsString()
    reason?: string;
}

export class ListIncidentsQueryDto {
    @ApiPropertyOptional({ description: 'Filtrar por estado(s) — separar con comas', example: 'CREATED,IN_PROGRESS' })
    @IsOptional() @IsString()
    status?: string;

    @ApiPropertyOptional({ example: 'uuid-issue-type' })
    @IsOptional() @IsString()
    issueTypeId?: string;

    @ApiPropertyOptional({ example: 'uuid-corner' })
    @IsOptional() @IsString()
    cornerId?: string;

    @ApiPropertyOptional({ example: 'uuid-customer' })
    @IsOptional() @IsString()
    customerId?: string;

    @ApiPropertyOptional({ example: 'uuid-technician' })
    @IsOptional() @IsString()
    technicianId?: string;

    @ApiPropertyOptional({ example: 'usuario@empresa.com' })
    @IsOptional() @IsString()
    customerEmail?: string;

    @ApiPropertyOptional({ example: 'INC0001234' })
    @IsOptional() @IsString()
    servicenowNumber?: string;

    @ApiPropertyOptional({ example: 'SN123456789' })
    @IsOptional() @IsString()
    deviceSerial?: string;

    @ApiPropertyOptional({ example: '2026-01-01' })
    @IsOptional() @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2026-12-31' })
    @IsOptional() @IsString()
    dateTo?: string;

    @ApiPropertyOptional({ example: 1, default: 1 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ example: 20, default: 20 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ description: 'Si es "true", solo devuelve incidencias sin técnico asignado', example: 'true' })
    @IsOptional() @IsString()
    availableOnly?: string;
}
