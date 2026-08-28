import { Result } from '@app/result';

/**
 * Urgencia del ticket en ServiceNow (campo `urgency`).
 * Entero 1–3. Nota: la escala numérica debe alinearse con la matriz de
 * priority de la instancia de ServiceNow (en SN estándar 1=High … 3=Low).
 */
export class SnUrgency {
  private static readonly MIN = 1;
  private static readonly MAX = 3;
  private static readonly DEFAULT = 2;

  private constructor(private readonly _value: number) {}

  get value(): number {
    return this._value;
  }
  toJSON() {
    return this._value;
  }

  static create(value: number): Result<SnUrgency> {
    if (
      !Number.isInteger(value) ||
      value < SnUrgency.MIN ||
      value > SnUrgency.MAX
    ) {
      return Result.err(
        new Error(
          `SN urgency must be an integer between ${SnUrgency.MIN} and ${SnUrgency.MAX}`,
        ),
      );
    }
    return Result.ok(new SnUrgency(value));
  }

  static default(): SnUrgency {
    return new SnUrgency(SnUrgency.DEFAULT);
  }
}
