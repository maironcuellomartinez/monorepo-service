import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRequestDto {
    @ApiProperty({ example: 'uuid-issue-type', description: 'ID del tipo de solicitud' })
    issueTypeId: string;

    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico asignado' })
    technicianId: string;

    @ApiProperty({ example: 'uuid-customer', description: 'ID del cliente' })
    customerId: string;

    @ApiProperty({ example: 'uuid-corner', description: 'ID del corner' })
    cornerId: string;

    @ApiProperty({ example: 'uuid-company', description: 'ID de la empresa del cliente' })
    companyId: string;

    @ApiProperty({ example: '2026-03-25T10:00:00.000Z', description: 'Fecha/hora programada (ISO 8601)' })
    scheduledAt: string;

    @ApiPropertyOptional({ example: 'Traer el equipo sin cargador', description: 'Notas adicionales' })
    notes?: string;

    @ApiProperty({ description: 'Dispositivo del cliente', example: { serialNumber: 'SN-ABC-123456' } })
    device: { serialNumber: string };
}

export class UpdateRequestStatusDto {
    @ApiProperty({ example: 'uuid-technician', description: 'ID del técnico que actualiza el estado' })
    technicianId: string;

    @ApiProperty({ example: 'IN_PROGRESS', description: 'Nuevo estado de la solicitud' })
    newStatus: string;

    @ApiPropertyOptional({ example: 'Iniciando proceso de alta', description: 'Comentario del cambio' })
    comment?: string;
}

export class ListRequestsQueryDto {
    @ApiPropertyOptional({ description: 'Filtrar por estado(s) — separar con comas', example: 'CREATED,IN_PROGRESS' })
    @IsOptional() @IsString()
    status?: string;

    @ApiPropertyOptional({ example: 'uuid-issue-type' })
    @IsOptional() @IsString()
    issueTypeId?: string;

    @ApiPropertyOptional({ example: 'uuid-corner' })
    @IsOptional() @IsString()
    cornerId?: string;

    @ApiPropertyOptional({ example: 'uuid-company' })
    @IsOptional() @IsString()
    companyId?: string;

    @ApiPropertyOptional({ example: 'uuid-customer' })
    @IsOptional() @IsString()
    customerId?: string;

    @ApiPropertyOptional({ example: 'uuid-technician' })
    @IsOptional() @IsString()
    technicianId?: string;

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
}
