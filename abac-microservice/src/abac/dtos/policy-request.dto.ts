import { IsString, IsUUID, IsOptional, IsIn, IsInt, Min, IsObject, MinLength, MaxLength } from 'class-validator';

export class CreatePolicyDto {
    @IsString()
    @MinLength(3)
    @MaxLength(100)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsUUID()
    applicationId!: string;

    @IsOptional()
    @IsIn(['system', 'role', 'user', 'custom'])
    type?: 'system' | 'role' | 'user' | 'custom';

    @IsOptional()
    @IsInt()
    @Min(0)
    priority?: number;

    @IsOptional()
    @IsIn(['allow', 'deny'])
    effect?: 'allow' | 'deny';

    @IsOptional()
    @IsObject()
    conditions?: Record<string, any>;

    @IsOptional()
    @IsString()
    createdBy?: string;
}

export class UpdatePolicyDto {
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsIn(['system', 'role', 'user', 'custom'])
    type?: 'system' | 'role' | 'user' | 'custom';

    @IsOptional()
    @IsInt()
    @Min(0)
    priority?: number;

    @IsOptional()
    @IsIn(['allow', 'deny'])
    effect?: 'allow' | 'deny';

    @IsOptional()
    @IsObject()
    conditions?: Record<string, any>;

    @IsOptional()
    @IsString()
    updatedBy?: string;
}

export class CreatePolicyRuleDto {
    @IsObject()
    conditions!: Record<string, any>;

    @IsOptional()
    @IsIn(['AND', 'OR', 'NOT'])
    operator?: 'AND' | 'OR' | 'NOT';

    @IsOptional()
    @IsInt()
    @Min(0)
    priority?: number;

    @IsOptional()
    @IsString()
    ruleType?: string;

    @IsOptional()
    @IsString()
    createdBy?: string;
}

export class PolicyFilters {
    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    isActive?: boolean;

    @IsOptional()
    @IsIn(['allow', 'deny'])
    effect?: 'allow' | 'deny';

    @IsOptional()
    @IsString()
    searchTerm?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number;
}
