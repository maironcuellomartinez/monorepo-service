import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class ListIssuesDto {
    @ApiPropertyOptional({ description: 'Fecha de inicio (ISO 8601)', example: '2026-01-01T00:00:00.000Z' })
    @IsOptional() @IsISO8601({ strict: true })
    startDate?: string;

    @ApiPropertyOptional({ description: 'Fecha de fin (ISO 8601)', example: '2026-12-31T23:59:59.999Z' })
    @IsOptional() @IsISO8601({ strict: true })
    endDate?: string;

    @ApiPropertyOptional({ example: 'INC0001234' })
    @IsOptional() @IsString()
    serviceNowId?: string;

    @ApiPropertyOptional({ example: 'TASK0001234' })
    @IsOptional() @IsString()
    serviceNowTaskNumber?: string;

    @ApiPropertyOptional({ example: 'abc123def456' })
    @IsOptional() @IsString()
    serviceNowTaskId?: string;

    @ApiPropertyOptional({ example: 'Hardware' })
    @IsOptional() @IsString()
    tipology?: string;

    @ApiPropertyOptional({ example: 'Descripción del issue' })
    @IsOptional() @IsString()
    descripcion?: string;

    @ApiPropertyOptional({ example: 'usuario@empresa.com' })
    @IsOptional() @IsString()
    customerUser?: string;
}
