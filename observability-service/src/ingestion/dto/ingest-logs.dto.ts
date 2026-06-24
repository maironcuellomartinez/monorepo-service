import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class LogEntryDto {
    @IsIn(['error', 'warn', 'info', 'http', 'debug', 'verbose'])
    level: string;

    @IsString()
    message: string;

    @IsString()
    service: string;

    @IsDateString()
    timestamp: string;

    @IsOptional() @IsString()
    correlationId?: string;

    @IsOptional() @IsString()
    traceId?: string;

    @IsOptional() @IsString()
    spanId?: string;

    @IsOptional() @IsString()
    context?: string;

    @IsOptional() @IsString()
    stack?: string;

    @IsOptional() @IsObject()
    meta?: Record<string, any>;
}

export class IngestLogsDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LogEntryDto)
    logs: LogEntryDto[];

    @IsOptional() @IsNumber()
    batchSize?: number;
}
