import { Result } from "@app/result";

// core/domain/value-objects/servicenow-group.value.ts
export class ServiceNowGroup {
    private constructor(private readonly _value: string) { }

    get value(): string {
        return this._value;
    }
    toJSON() { return this._value; }

    static create(value: string): Result<ServiceNowGroup> {
        if (!value || value.trim().length === 0) {
            return Result.err(new Error('ServiceNow group cannot be empty'));
        }

        return Result.ok(new ServiceNowGroup(value.trim()));
    }
}
