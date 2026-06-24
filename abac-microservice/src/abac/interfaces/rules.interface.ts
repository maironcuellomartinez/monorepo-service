// src/abac/interfaces/rules.interface.ts
export interface RuleCondition {
    all?: Condition[];
    any?: Condition[];
    not?: Condition;
    fact?: string;
    operator?: string;
    value?: any;
    path?: string;
    priority?: number;
}

export interface Condition {
    fact: string;
    operator: string;
    value: any;
    path?: string;
    priority?: number;
}

export interface RuleDefinition {
    conditions: RuleCondition;
    event: { type: string; params?: any };
    name?: string;
    priority?: number;
}
