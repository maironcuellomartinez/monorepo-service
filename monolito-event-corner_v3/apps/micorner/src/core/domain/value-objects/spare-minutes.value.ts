import { Result } from "@app/result";

// Similar para SpareMinutes, CloseMinutes (pueden ser cero)
export class SpareMinutes {
    private constructor(private readonly _value: number) { }
    static create(value: number): Result<SpareMinutes> {
        if (value < 0) return Result.err(new Error('Spare minutes cannot be negative'));
        return Result.ok(new SpareMinutes(value));
    }
    get value(): number { return this._value; }
    toJSON() { return this._value; }
}