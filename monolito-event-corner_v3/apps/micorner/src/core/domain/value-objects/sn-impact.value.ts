import { Result } from '@app/result';

/**
 * Impacto del ticket en ServiceNow (campo `impact`).
 * Entero 1–3. Nota: la escala numérica debe alinearse con la matriz de
 * priority de la instancia de ServiceNow (en SN estándar 1=High … 3=Low).
 */
export class SnImpact {
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

  static create(value: number): Result<SnImpact> {
    if (
      !Number.isInteger(value) ||
      value < SnImpact.MIN ||
      value > SnImpact.MAX
    ) {
      return Result.err(
        new Error(
          `SN impact must be an integer between ${SnImpact.MIN} and ${SnImpact.MAX}`,
        ),
      );
    }
    return Result.ok(new SnImpact(value));
  }

  static default(): SnImpact {
    return new SnImpact(SnImpact.DEFAULT);
  }
}
