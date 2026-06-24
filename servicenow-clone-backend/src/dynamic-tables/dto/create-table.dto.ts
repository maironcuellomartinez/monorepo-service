import {
    IsString,
    IsNotEmpty,
    IsOptional,
    MaxLength,
    Matches,
    IsArray,
    ValidateNested,
    IsBoolean,
    IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

const VALID_FIELD_TYPES = [
    'string',
    'number',
    'boolean',
    'text',
    'datetime',
    'reference',
    'email',
    'url',
    'json',
    'decimal',
] as const;

export class CreateFieldDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    @Matches(/^[a-z][a-z0-9_]*$/, {
        message: 'Field name must start with lowercase letter and contain only lowercase letters, numbers, and underscores',
    })
    name: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    label: string;

    @IsString()
    @IsNotEmpty()
    @IsIn(VALID_FIELD_TYPES, {
        message: `Field type must be one of: ${VALID_FIELD_TYPES.join(', ')}`,
    })
    type: string;

    @IsBoolean()
    @IsOptional()
    mandatory?: boolean;

    @IsOptional()
    options?: Record<string, unknown>;
}

export class CreateTableDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    @Matches(/^[a-z][a-z0-9_]*$/, {
        message: 'Table name must start with lowercase letter and contain only lowercase letters, numbers, and underscores',
    })
    name: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    label: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    description?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateFieldDto)
    fields: CreateFieldDto[];
}