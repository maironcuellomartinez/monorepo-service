import { Result } from "@app/result";
import { InvalidSerialNumberError } from "../errors/value-object.errors";

export class SerialNumber {
    private constructor(private readonly _value: string) { }

    get value(): string {
        return this._value;
    }

    equals(other: SerialNumber): boolean {
        return this._value === other._value;
    }

    private static readonly SERIAL_REGEX = /^[A-Z0-9]{5,50}$/;
    private static readonly MIN_LENGTH = 5;
    private static readonly MAX_LENGTH = 50;

    static create(value: string): Result<SerialNumber, InvalidSerialNumberError> {
        if (!value || typeof value !== 'string') {
            return Result.err(new InvalidSerialNumberError(value ?? 'undefined', 'Serial number is required'));
        }

        const trimmed = value.trim();

        if (trimmed.length === 0) {
            return Result.err(new InvalidSerialNumberError(value, 'Serial number cannot be empty'));
        }

        if (trimmed.length < this.MIN_LENGTH) {
            return Result.err(new InvalidSerialNumberError(value, `Serial number must be at least ${this.MIN_LENGTH} characters`));
        }

        if (trimmed.length > this.MAX_LENGTH) {
            return Result.err(new InvalidSerialNumberError(value, `Serial number must be at most ${this.MAX_LENGTH} characters`));
        }

        const normalized = trimmed.toUpperCase();

        if (!this.SERIAL_REGEX.test(normalized)) {
            return Result.err(new InvalidSerialNumberError(value, 'Serial number must contain only letters and numbers'));
        }

        return Result.ok(new SerialNumber(normalized));
    }

    static reconstitute(value: string): SerialNumber {
        return new SerialNumber(value);
    }

    toJSON() { return this._value; }

    toString(): string {
        return this._value;
    }
}