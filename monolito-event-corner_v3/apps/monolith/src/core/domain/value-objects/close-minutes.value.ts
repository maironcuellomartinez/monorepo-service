import { Result } from "@app/result";

export class CloseMinutes {
    private constructor(private readonly _value: number) { }
    static create(value: number): Result<CloseMinutes> {
        if (value < 0) return Result.err(new Error('Close minutes cannot be negative'));
        return Result.ok(new CloseMinutes(value));
    }
    get value(): number { return this._value; }
    toJSON() { return this._value; }
}