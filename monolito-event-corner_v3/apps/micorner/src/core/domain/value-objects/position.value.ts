import { Result } from "@app/result";

export class Position {
    private constructor(private readonly _value: number) { }

    get value(): number { return this._value; }
    toJSON() { return this._value; }

    static create(value: number): Result<Position> {
        if (value < 0) return Result.err(new Error('Position cannot be negative'));
        return Result.ok(new Position(value));
    }
}