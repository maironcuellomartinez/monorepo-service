import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryMetricsDto {
    @IsOptional() @IsString()
    name?: string;

    @IsOptional() @IsString()
    service?: string;

    @IsOptional() @IsString()
    correlationId?: string;

    @IsOptional() @IsDateString()
    from?: string;

    @IsOptional() @IsDateString()
    to?: string;

    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(500)
    limit?: number = 100;

    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    offset?: number = 0;
}
