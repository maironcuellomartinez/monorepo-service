import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class MetricPointDto {
    @IsString()
    name: string;

    @IsString()
    service: string;

    @IsNumber()
    value: number;

    @IsOptional() @IsString()
    unit?: string;

    @IsString()
    type: string;

    @IsOptional() @IsObject()
    labels?: Record<string, string>;

    @IsOptional() @IsString()
    correlationId?: string;

    @IsDateString()
    timestamp: string;
}

export class IngestMetricsDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MetricPointDto)
    metrics: MetricPointDto[];
}
