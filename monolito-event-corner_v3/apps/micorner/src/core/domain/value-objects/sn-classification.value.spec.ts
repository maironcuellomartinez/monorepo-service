// core/domain/value-objects/sn-classification.value.spec.ts
import { SnUrgency } from './sn-urgency.value';
import { SnImpact } from './sn-impact.value';
import { SnSeverity } from './sn-severity.value';

describe('SnUrgency', () => {
  it.each([1, 2, 3])('acepta el valor válido %i', (v) => {
    const r = SnUrgency.create(v);
    expect(r.isSuccess).toBe(true);
    expect(r.unwrap().value).toBe(v);
  });

  it.each([0, 4, -1, 2.5, NaN])('rechaza el valor inválido %p', (v) => {
    expect(SnUrgency.create(v).isFailure).toBe(true);
  });

  it('default es 2', () => {
    expect(SnUrgency.default().value).toBe(2);
  });
});

describe('SnImpact', () => {
  it.each([1, 2, 3])('acepta el valor válido %i', (v) => {
    expect(SnImpact.create(v).isSuccess).toBe(true);
  });

  it.each([0, 4, 1.1])('rechaza el valor inválido %p', (v) => {
    expect(SnImpact.create(v).isFailure).toBe(true);
  });

  it('default es 2', () => {
    expect(SnImpact.default().value).toBe(2);
  });
});

describe('SnSeverity', () => {
  it.each(['critical', 'high', 'medium', 'low'])('acepta "%s"', (v) => {
    const r = SnSeverity.create(v);
    expect(r.isSuccess).toBe(true);
    expect(r.unwrap().value).toBe(v);
  });

  it.each(['urgent', 'MEDIUM', '', 'none'])('rechaza "%s"', (v) => {
    expect(SnSeverity.create(v).isFailure).toBe(true);
  });

  it('default es medium', () => {
    expect(SnSeverity.default().value).toBe('medium');
  });
});
