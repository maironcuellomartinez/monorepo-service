import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsString,
    IsObject,
    ValidateNested,
    IsOptional,
    IsISO8601,
    IsIP,
    IsEmail,
    IsArray,
    ArrayNotEmpty,
    IsBoolean,
    IsNumber
} from 'class-validator';
import { Type } from 'class-transformer';

class SubjectDto {
    @ApiPropertyOptional({ description: 'User ID' })
    @IsOptional()
    @IsString()
    id?: string;

    @ApiPropertyOptional({ description: 'User role' })
    @IsOptional()
    @IsString()
    role?: string;

    @ApiPropertyOptional({ description: 'User department' })
    @IsOptional()
    @IsString()
    department?: string;

    @ApiPropertyOptional({ description: 'User email' })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({
        description: 'Custom user attributes',
        type: 'object',
        example: { clearanceLevel: 5, projects: ['projectA', 'projectB'] }, additionalProperties: true
    })
    @IsOptional()
    @IsObject()
    attributes?: Record<string, any>;
}

class ResourceDto {
    @ApiProperty({ description: 'Resource type' })
    @IsNotEmpty()
    @IsString()
    type!: string;

    @ApiPropertyOptional({ description: 'Resource ID' })
    @IsOptional()
    @IsString()
    id?: string;

    @ApiPropertyOptional({ description: 'Resource owner' })
    @IsOptional()
    @IsString()
    owner?: string;

    @ApiPropertyOptional({
        description: 'Resource attributes',
        type: 'object',
        example: { sensitivity: 'high', category: 'confidential' }, additionalProperties: true
    })
    @IsOptional()
    @IsObject()
    attributes?: Record<string, any>;

    @ApiPropertyOptional({ description: 'Resource tags' })
    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    tags?: string[];
}

class ContextDto {
    @ApiPropertyOptional({ description: 'Request timestamp (ISO 8601)' })
    @IsOptional()
    @IsISO8601()
    timestamp?: string;

    @ApiPropertyOptional({ description: 'Client IP address' })
    @IsOptional()
    @IsIP()
    ip?: string;

    @ApiPropertyOptional({ description: 'HTTP method' })
    @IsOptional()
    @IsString()
    method?: string;

    @ApiPropertyOptional({ description: 'User agent' })
    @IsOptional()
    @IsString()
    userAgent?: string;

    @ApiPropertyOptional({ description: 'Request location' })
    @IsOptional()
    @IsString()
    location?: string;

    @ApiPropertyOptional({ description: 'Device type' })
    @IsOptional()
    @IsString()
    device?: string;

    @ApiPropertyOptional({
        description: 'Custom context properties',
        type: 'object',
        example: { businessUnit: 'finance', environment: 'production' }, additionalProperties: true
    })
    @IsOptional()
    @IsObject()
    custom?: Record<string, any>;
}

export class EvaluatePolicyDto {
    @ApiProperty({ description: 'Application identifier', example: 'hr-system' })
    @IsNotEmpty()
    @IsString()
    appId!: string;

    @ApiProperty({ description: 'Subject (user) information', type: SubjectDto })
    @ValidateNested()
    @Type(() => SubjectDto)
    subject!: SubjectDto;

    @ApiProperty({ description: 'Resource information', type: ResourceDto })
    @ValidateNested()
    @Type(() => ResourceDto)
    resource!: ResourceDto;

    @ApiProperty({
        description: 'Action to evaluate',
        examples: {
            read: { value: 'read' },
            write: { value: 'write' },
            delete: { value: 'delete' },
            approve: { value: 'approve' }
        }
    })
    @IsNotEmpty()
    @IsString()
    action!: string;

    @ApiPropertyOptional({
        description: 'Contextual information about the request',
        type: ContextDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContextDto)
    context?: ContextDto;

    @ApiPropertyOptional({
        description: 'Enable detailed debug information',
        default: false
    })
    @IsOptional()
    @IsBoolean()
    debug?: boolean;

    @ApiPropertyOptional({
        description: 'Timeout for policy evaluation in milliseconds',
        default: 5000
    })
    @IsOptional()
    @IsNumber()
    timeout?: number;
}

// Response DTO para la evaluación
export class EvaluatePolicyResponseDto {
    @ApiProperty({ description: 'Whether access is allowed' })
    allowed!: boolean;

    @ApiPropertyOptional({
        description: 'Detailed evaluation results',
        type: 'object',
        example: {
            evaluatedPolicies: 5,
            matchingPolicies: 2,
            finalDecision: 'deny',
            reasons: ['Policy ID-123: deny - priority 10', 'Policy ID-456: allow - priority 5']
        }, additionalProperties: true
    })
    @IsOptional()
    details?: {
        evaluatedPolicies: number;
        matchingPolicies: number;
        finalDecision: 'allow' | 'deny';
        reasons: string[];
        executionTime: number;
    };

    @ApiPropertyOptional({
        description: 'Debug information when debug=true',
        type: 'object', additionalProperties: true
    })
    @IsOptional()
    debug?: {
        facts: any;
        rulesEvaluated: any[];
        engineEvents: any[];
    };

    @ApiProperty({ description: 'Evaluation timestamp' })
    timestamp!: string;
}