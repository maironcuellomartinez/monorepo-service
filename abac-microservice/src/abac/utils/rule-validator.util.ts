// src/abac/utils/rule-validator.util.ts
import { RuleCondition, Condition } from '../interfaces/rules.interface';

export class RuleValidator {
    static isValidCondition(condition: any): condition is RuleCondition {
        if (!condition || typeof condition !== 'object') {
            return false;
        }

        // Verificar estructura de condición compuesta
        if (condition.all && Array.isArray(condition.all)) {
            return condition.all.every((c: any) => this.isBasicCondition(c));
        }
        if (condition.any && Array.isArray(condition.any)) {
            return condition.any.every((c: any) => this.isBasicCondition(c));
        }
        if (condition.not && typeof condition.not === 'object') {
            return this.isBasicCondition(condition.not);
        }

        // Verificar condición básica
        return this.isBasicCondition(condition);
    }

    static isBasicCondition(condition: any): condition is Condition {
        return condition &&
            typeof condition === 'object' &&
            typeof condition.fact === 'string' &&
            typeof condition.operator === 'string' &&
            condition.value !== undefined;
    }

    static normalizeCondition(condition: any): RuleCondition {
        if (!this.isValidCondition(condition)) {
            throw new Error('Invalid condition structure');
        }

        // Asegurar que la condición tenga la estructura correcta
        if (this.isBasicCondition(condition)) {
            return {
                fact: condition.fact,
                operator: condition.operator,
                value: condition.value,
                path: condition.path,
                priority: condition.priority
            };
        }

        return condition;
    }

    static createCondition(fact: string, operator: string, value: any, path?: string): Condition {
        return {
            fact,
            operator,
            value,
            path
        };
    }

    static createAndCondition(conditions: Condition[]): RuleCondition {
        return { all: conditions };
    }

    static createOrCondition(conditions: Condition[]): RuleCondition {
        return { any: conditions };
    }

    static createNotCondition(condition: Condition): RuleCondition {
        return { not: condition };
    }
}
