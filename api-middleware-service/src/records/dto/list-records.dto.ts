import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para listar solicitudes
 */
export class ListRequestsDto {
    /**
     * Estado(s) separados por coma
     * @example 'CREATED,IN_PROGRESS'
     */
    @ApiPropertyOptional({ description: 'Estado(s) separados por coma', example: 'CREATED,IN_PROGRESS' })
    @IsOptional() @IsString()
    status?: string;

    /**
     * ID del tipo de incidencia
     * @example 'uuid-issue-type'
     */
    @ApiPropertyOptional({ example: 'uuid-issue-type' })
    @IsOptional() @IsString()
    issueTypeId?: string;

    /**
     * ID de la esquina
     * @example 'uuid-corner'
     */
    @ApiPropertyOptional({ example: 'uuid-corner' })
    @IsOptional() @IsString()
    cornerId?: string;

    /**
     * ID de la compañia
     * @example 'uuid-company'
     */
    @ApiPropertyOptional({ example: 'uuid-company' })
    @IsOptional() @IsString()
    companyId?: string;

    /**
     * Fecha inicial
     * @example '2026-01-01'
     */
    @ApiPropertyOptional({ example: '2026-01-01' })
    @IsOptional() @IsString()
    dateFrom?: string;

    /**
     * Fecha final
     * @example '2026-12-31'
     */
    @ApiPropertyOptional({ example: '2026-12-31' })
    @IsOptional() @IsString()
    dateTo?: string;

    /**
     * Página
     * @example 1
     * @default 1
     */
    @ApiPropertyOptional({ example: 1, default: 1 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    page?: number = 1;

    /**
     * Limite
     * @example 20
     * @default 20
     */
    @ApiPropertyOptional({ example: 20, default: 20 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
    limit?: number = 20;
}
