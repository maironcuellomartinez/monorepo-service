import { Result } from "@app/result";

// core/domain/value-objects/work-minutes.value.ts
export class WorkMinutes {
    private constructor(private readonly _value: number) { }

    get value(): number { return this._value; }
    toJSON() { return this._value; }

    static create(value: number): Result<WorkMinutes> {
        if (value <= 0) return Result.err(new Error('Work minutes must be positive'));
        if (value > 480) return Result.err(new Error('Work minutes cannot exceed 480'));
        return Result.ok(new WorkMinutes(value));
    }
}