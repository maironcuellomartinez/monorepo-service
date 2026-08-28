import { Result } from "@app/result";

// core/domain/value-objects/servicenow-number.value.ts
export class ServiceNowNumber {
    private constructor(private readonly _value: string) { }

    get value(): string {
        return this._value;
    }
    toJSON() { return this._value; }

    static create(value: string): Result<ServiceNowNumber> {
        if (!value || value.trim().length === 0) {
            return Result.err(new Error('ServiceNow number cannot be empty'));
        }

        // Formato típico: INC0012345, REQ0012345, RITM0012345
        const snRegex = /^(INC|REQ|RITM|CHG)\d{6,}$/i;
        if (!snRegex.test(value.trim())) {
            return Result.err(new Error('Invalid ServiceNow number format'));
        }

        return Result.ok(new ServiceNowNumber(value.trim().toUpperCase()));
    }
}
