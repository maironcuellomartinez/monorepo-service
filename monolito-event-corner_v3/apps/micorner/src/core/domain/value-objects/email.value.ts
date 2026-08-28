import { Result } from "@app/result";
import { InvalidEmailError } from "../errors/value-object.errors";

export class Email {
    private constructor(private readonly _value: string) { }

    get value(): string {
        return this._value;
    }

    equals(other: Email): boolean {
        return this._value === other._value;
    }

    private static readonly EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    static create(value: string): Result<Email, InvalidEmailError> {
        if (!value || typeof value !== 'string') {
            return Result.err(new InvalidEmailError(value ?? 'undefined', 'Email is required'));
        }

        const trimmed = value.trim();

        if (trimmed.length === 0) {
            return Result.err(new InvalidEmailError(value, 'Email cannot be empty'));
        }

        if (trimmed.length > 254) {
            return Result.err(new InvalidEmailError(value, 'Email is too long (max 254 characters)'));
        }

        if (!this.EMAIL_REGEX.test(trimmed)) {
            return Result.err(new InvalidEmailError(value, 'Invalid email format'));
        }

        return Result.ok(new Email(trimmed.toLowerCase()));
    }

    static reconstitute(value: string): Email {
        return new Email(value);
    }

    toJSON() { return this._value; }

    toString(): string {
        return this._value;
    }
}