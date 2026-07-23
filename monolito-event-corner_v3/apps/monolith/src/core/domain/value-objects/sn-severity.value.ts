import { Result } from '@app/result';

export const SN_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type SnSeverityValue = (typeof SN_SEVERITIES)[number];

/**
 * Severidad del ticket en ServiceNow. Hoy api-snowq-service la mapea al campo
 * custom `u_severity`. Valores: critical | high | medium | low.
 */
export class SnSeverity {
  private static readonly DEFAULT: SnSeverityValue = 'medium';

  private constructor(private readonly _value: SnSeverityValue) {}

  get value(): SnSeverityValue {
    return this._value;
  }
  toJSON() {
    return this._value;
  }

  static create(value: string): Result<SnSeverity> {
    if (!SN_SEVERITIES.includes(value as SnSeverityValue)) {
      return Result.err(
        new Error(`SN severity must be one of: ${SN_SEVERITIES.join(', ')}`),
      );
    }
    return Result.ok(new SnSeverity(value as SnSeverityValue));
  }

  static default(): SnSeverity {
    return new SnSeverity(SnSeverity.DEFAULT);
  }
}
