import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryLogsDto {
    @IsOptional() @IsString()
    service?: string;

    @IsOptional() @IsIn(['error', 'warn', 'info', 'http', 'debug', 'verbose'])
    level?: string;

    @IsOptional() @IsString()
    correlationId?: string;

    @IsOptional() @IsString()
    traceId?: string;

    @IsOptional() @IsDateString()
    from?: string;

    @IsOptional() @IsDateString()
    to?: string;

    @IsOptional() @IsString()
    search?: string;

    @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(500)
    limit?: number = 100;

    @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
    offset?: number = 0;
}
