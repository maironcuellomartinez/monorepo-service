// src/abac/dtos/policy-rule.dto.ts
import { IsObject, IsOptional, IsIn, IsInt, Min, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { RuleCondition } from '../interfaces/rules.interface';
import { RuleValidator } from '../utils/rule-validator.util';

export class CreatePolicyRuleDto {
    @IsObject()
    @ValidateNested()
    @Type(() => Object)
    condition!: RuleCondition;

    @IsOptional()
    @IsIn(['AND', 'OR', 'NOT'])
    operator?: 'AND' | 'OR' | 'NOT';

    @IsOptional()
    @IsInt()
    @Min(0)
    priority?: number;

    @IsOptional()
    ruleType?: string;

    @IsString()
    createdBy!: string;

    // Validador personalizado
    isValidCondition(): boolean {
        return RuleValidator.isValidCondition(this.condition);
    }
}
