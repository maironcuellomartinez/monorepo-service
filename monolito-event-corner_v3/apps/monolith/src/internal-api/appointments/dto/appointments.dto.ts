import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, IsArray, IsInt, Min, Max, IsObject, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

class DeviceDto {
    @IsString() @IsNotEmpty()
    serialNumber: string;
}
import { AppointmentStatus } from '../../../core/domain/enums/appointment-status.enum';

export class CreateAppointmentDto {
    @ApiProperty({ example: 'uuid-issue-type', description: 'ID del tipo de cita' })
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

    @ApiProperty({ type: () => DeviceDto, description: 'Dispositivo asociado a la cita' })
    @IsObject()
    @ValidateNested()
    @Type(() => DeviceDto)
    device: DeviceDto;

    @ApiPropertyOptional({ example: { channel: 'web' }, description: 'Metadatos adicionales' })
    @IsOptional()
    metadata?: Record<string, any>;

    @ApiPropertyOptional({ description: 'ABAC externalId de quien crea la cita — si es técnico, se usa como assigned_to en ServiceNow (solo citas kind=ISSUE)' })
    @IsOptional() @IsString()
    creatorExternalId?: string;
}

export class DeliverAppointmentDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que registra la entrega' })
    @IsString() @IsNotEmpty()
    technicianId: string;
}

export class TakeAppointmentDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que toma la cita' })
    @IsString() @IsNotEmpty()
    technicianId: string;

    @ApiPropertyOptional({ type: [String], example: ['uuid-slot-nuevo'], description: 'Requerido si la cita está CLOSED o CANCELED: horario nuevo — se reabre y reprograma automáticamente al tomarla.' })
    @IsOptional() @IsArray() @IsString({ each: true })
    slotIds?: string[];
}

export class RescheduleAppointmentDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico asignado (debe ser el actual)' })
    @IsString() @IsNotEmpty()
    technicianId: string;

    @ApiProperty({ type: [String], example: ['uuid-slot-nuevo'], description: 'IDs de los slots nuevos — obtenidos vía GET /internal/availability para la fecha elegida' })
    @IsArray() @IsString({ each: true })
    slotIds: string[];
}

export class SetEstimatedCloseDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico asignado (debe ser el actual)' })
    @IsString() @IsNotEmpty()
    technicianId: string;

    @ApiProperty({ example: '2026-08-11T00:00:00.000Z', description: 'Nueva fecha estimada de cierre' })
    @IsDateString()
    estimatedCloseAt: string;
}

export class ReleaseAppointmentDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que libera la cita' })
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

    @ApiProperty({ enum: AppointmentStatus, example: AppointmentStatus.IN_PROGRESS, description: 'Nuevo estado de la cita' })
    @IsString() @IsNotEmpty()
    newStatus: AppointmentStatus;

    @ApiPropertyOptional({ example: 'Reparado exitosamente', description: 'Comentario opcional' })
    @IsOptional() @IsString()
    comment?: string;

    @ApiPropertyOptional({ example: 'Hardware', description: 'Categoría de cierre (requerida al cerrar)' })
    @IsOptional() @IsString()
    closeCategory?: string;
}

export class BatchStatusChangeItemDto {
    @ApiProperty({ example: 'uuid-appointment' })
    @IsString() @IsNotEmpty()
    incidentId: string;

    @ApiProperty({ enum: AppointmentStatus })
    @IsString() @IsNotEmpty()
    targetStatus: AppointmentStatus;

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

export class ValidateAppointmentDto {
    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente que valida la resolución' })
    @IsString() @IsNotEmpty()
    customerId: string;
}

export class ReopenAppointmentDto {
    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente que reabre la cita' })
    @IsString() @IsNotEmpty()
    customerId: string;

    @ApiPropertyOptional({ example: 'El problema persiste', description: 'Motivo del rechazo' })
    @IsOptional() @IsString()
    reason?: string;
}

export class CancelAppointmentDto {
    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente que cancela la cita' })
    @IsString() @IsNotEmpty()
    customerId: string;

    @ApiPropertyOptional({ example: 'Ya no necesito el servicio', description: 'Motivo de la cancelación' })
    @IsOptional() @IsString()
    reason?: string;
}

export class ListAppointmentsQueryDto {
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

    @ApiPropertyOptional({ description: 'Si es "true", solo devuelve citas sin técnico asignado', example: 'true' })
    @IsOptional() @IsString()
    availableOnly?: string;
}
