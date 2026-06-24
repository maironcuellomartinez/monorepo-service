import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Policy } from './policy.entity';
import { RuleCondition } from '../abac/interfaces/rules.interface';
import { BaseEntity } from './base.entity';

@Entity('policy_rules')
@Index(['policyId', 'priority'])
@Index(['operator', 'isActive'])
export class PolicyRule extends BaseEntity {
    @Column({ type: 'json' })
    condition!: RuleCondition; // Usar la interfaz específica

    @Column({ type: 'enum', enum: ['AND', 'OR', 'NOT'], default: 'AND' })
    operator!: 'AND' | 'OR' | 'NOT';

    @Column({ type: 'int', default: 0 })
    priority!: number;

    @Column({ type: 'uuid' })
    policyId!: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    ruleType!: string;

    @ManyToOne(() => Policy, (policy) => policy.rules, {
        onDelete: 'CASCADE',
        persistence: false
    })
    @JoinColumn({ name: 'policyId' })
    policy!: Policy;

    // Validación mejorada de condición
    isValidCondition(): boolean {
        try {
            return !!this.condition &&
                typeof this.condition === 'object' &&
                this.hasValidConditionStructure(this.condition);
        } catch {
            return false;
        }
    }

    private hasValidConditionStructure(condition: any): boolean {
        if (condition.all && Array.isArray(condition.all)) {
            return condition.all.every((c: any) => this.isBasicCondition(c));
        }
        if (condition.any && Array.isArray(condition.any)) {
            return condition.any.every((c: any) => this.isBasicCondition(c));
        }
        if (condition.not && typeof condition.not === 'object') {
            return this.isBasicCondition(condition.not);
        }
        return this.isBasicCondition(condition);
    }

    private isBasicCondition(condition: any): boolean {
        return condition &&
            typeof condition === 'object' &&
            typeof condition.fact === 'string' &&
            typeof condition.operator === 'string' &&
            condition.value !== undefined;
    }
}