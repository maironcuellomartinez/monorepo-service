import { Result } from "@app/result";

export class ServiceNowCategory {
    private constructor(private readonly _value: string) { }

    get value(): string {
        return this._value;
    }
    toJSON() { return this._value; }

    static create(value: string): Result<ServiceNowCategory> {
        if (!value || value.trim().length === 0) {
            return Result.err(new Error('ServiceNow category cannot be empty'));
        }

        return Result.ok(new ServiceNowCategory(value.trim()));
    }
}