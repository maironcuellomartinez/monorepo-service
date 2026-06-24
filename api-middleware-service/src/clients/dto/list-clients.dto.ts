import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListClientsDto {
    @ApiPropertyOptional({ example: 1, description: 'Numero de pagina (default: 1)' })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ example: 20, description: 'Registros por pagina (default: 20, max: 100)' })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
    limit?: number = 20;
}

export type PaginatedClientsDto<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
