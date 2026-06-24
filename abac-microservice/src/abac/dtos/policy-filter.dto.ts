import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsString,
    IsEnum,
    IsBoolean,
    IsNumber,
    Min,
} from 'class-validator';

export class PolicyFilterDto {
    @ApiPropertyOptional({ description: 'Filter by application ID' })
    @IsOptional()
    @IsString()
    appId?: string;

    @ApiPropertyOptional({ description: 'Filter by resource' })
    @IsOptional()
    @IsString()
    resource?: string;

    @ApiPropertyOptional({ description: 'Filter by action' })
    @IsOptional()
    @IsString()
    action?: string;

    @ApiPropertyOptional({
        description: 'Filter by effect',
        enum: ['allow', 'deny']
    })
    @IsOptional()
    @IsEnum(['allow', 'deny'])
    effect?: 'allow' | 'deny';

    @ApiPropertyOptional({ description: 'Filter by enabled status' })
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @ApiPropertyOptional({
        description: 'Minimum priority',
        example: 0
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    priorityMin?: number;

    @ApiPropertyOptional({
        description: 'Maximum priority',
        example: 100
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    priorityMax?: number;

    @ApiPropertyOptional({
        description: 'Search in policy name and description'
    })
    @IsOptional()
    @IsString()
    search?: string;
}