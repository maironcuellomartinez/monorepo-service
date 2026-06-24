import { Result } from "@app/result";

export class ServiceNowId {
    private constructor(private readonly _value: string) { }

    get value(): string {
        return this._value;
    }
    toJSON() { return this._value; }

    static create(value: string): Result<ServiceNowId> {
        if (!value || value.trim().length === 0) {
            return Result.err(new Error('ServiceNow ID cannot be empty'));
        }

        // Los sys_id de ServiceNow son strings de 32 caracteres (hex)
        // pero pueden ser también otros formatos, así que no validamos estrictamente
        return Result.ok(new ServiceNowId(value.trim()));
    }

    equals(other: ServiceNowId): boolean {
        return this._value === other.value;
    }
}