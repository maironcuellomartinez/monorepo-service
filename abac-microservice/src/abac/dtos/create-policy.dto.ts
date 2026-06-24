import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsString,
    IsEnum,
    IsObject,
    IsOptional,
    IsNumber,
    IsBoolean,
    Min,
    Max,
} from 'class-validator';

export class CreatePolicyDto {
    @ApiProperty({ description: 'Application ID', example: 'app-12345' })
    @IsNotEmpty()
    @IsString()
    appSlug!: string;

    @ApiProperty({ description: 'Permission code', example: 'app-12345' })
    @IsNotEmpty()
    @IsString()
    permissionCode!: string;

    @ApiProperty({ description: 'Conditions for the policy', example: 'app-12345' })
    @IsNotEmpty()
    @IsString()
    conditions: any;

    @ApiProperty({ description: 'Policy name', example: 'Admin Full Access' })
    @IsOptional()
    @IsString()
    name?: string;

    // @ApiProperty({ description: 'Resouce to control', example: 'document' })
    // @IsOptional()
    // @IsString()
    // resource?: string;

    // @ApiProperty({ description: 'Resource action', example: 'read' })
    // @IsOptional()
    // @IsString()
    // action?: string;

    @ApiProperty({ description: 'Policy effect', enum: ['allow', 'deny'], example: 'allow' })
    @IsEnum(['allow', 'deny'])
    @IsOptional()
    effect?: 'allow' | 'deny';

    // @ApiPropertyOptional({
    //     description: 'Subject rule (JSON rule condition)',
    //     type: 'object',
    //     example: {
    //         conditions: {
    //             any: [
    //                 { fact: 'sub', path: 'role', operator: 'equal', value: 'admin' }
    //             ],
    //         },
    //     }, additionalProperties: true
    // })
    // @IsOptional()
    // @IsObject()
    // subRule?: Record<string, any>;

    // @ApiProperty({
    //     description: 'Object rule (JSON rule condition)',
    //     type: 'object',
    //     example: {
    //         any: [
    //             { fact: 'obj.type', operator: 'in', value: ['document', 'user'] }
    //         ]
    //     }, additionalProperties: true
    // })
    // @IsObject()
    // @IsOptional()
    // objRule?: any;

    @ApiPropertyOptional({
        description: 'Policy priority (lower number = higher priority)',
        example: 1,
        default: 0
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1000)
    priority?: number = 1;

    @ApiPropertyOptional({
        description: 'Whether the policy is enabled',
        example: true,
        default: true
    })
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @ApiPropertyOptional({
        description: 'Policy description',
        example: 'Allows administrators to read all documents'
    })
    @IsOptional()
    @IsString()
    description?: string;
}