import { describe, expect, it } from 'vitest';
import { calculateOtgResultMetrics, otgNumericValue } from '../../shared/otgResultMetrics';
import { objectiveChangePresentation } from '../../shared/objectiveResultMetrics';

describe('OTG business-result read adapter', () => {
  it('separates variation and goal progress from stale saved percentages and task completion', () => {
    const row = { puntoPartida: 150, alcanzado: 190, puntoLlegada: 250, porcentajeAlcanzadoOTG: 100, porcentajeCumplimiento: 100, acciones: [{ porcentajeCompletado: 100 }] };
    const before = JSON.stringify(row);
    expect(calculateOtgResultMetrics(row)).toMatchObject({ currentValue: 190, absoluteChange: 40, variationPercent: 26.67, goalProgress: 40, trend: 'improving' });
    expect(JSON.stringify(row)).toBe(before);
  });
  it('presents percentage-point change first for percentage indicators', () => {
    const metrics=calculateOtgResultMetrics({ puntoPartida: 5, alcanzado: 10, puntoLlegada: 15 });
    expect(objectiveChangePresentation(metrics,'%')).toMatchObject({ value: '+5 puntos porcentuales', relativeValue: '+100 %' });
    expect(metrics.goalProgress).toBe(50);
  });
  it('allows loss below zero without clipping', () => {
    expect(calculateOtgResultMetrics({ puntoPartida: 10, alcanzado: -5, puntoLlegada: 20 })).toMatchObject({ variationPercent: -150, goalProgress: -150, trend: 'worsening', goalStatus: 'below_baseline' });
  });
  it('allows exceeding the goal without clipping', () => {
    expect(calculateOtgResultMetrics({ puntoPartida: 10, alcanzado: 25, puntoLlegada: 20 })).toMatchObject({ variationPercent: 150, goalProgress: 150, goalStatus: 'goal_exceeded' });
  });
  it('recognizes a reduction as improvement when the goal is lower', () => {
    expect(calculateOtgResultMetrics({ puntoPartida: 200, alcanzado: 180, puntoLlegada: 160 })).toMatchObject({ variationPercent: -10, goalProgress: 50, trend: 'improving' });
  });
  it('retains genuine zero and explains zero initial value', () => {
    expect(calculateOtgResultMetrics({ puntoPartida: 0, alcanzado: 30, puntoLlegada: 75 })).toMatchObject({ baseline: 0, goalProgress: 40, absoluteChange: 30, variationPercent: null, variationUnavailable: 'zero_baseline' });
    expect(calculateOtgResultMetrics({ puntoPartida: 10, alcanzado: 0, puntoLlegada: 20 }).currentValue).toBe(0);
  });
  it('explains recovery from a negative initial value without misleading relative growth', () => {
    expect(calculateOtgResultMetrics({ puntoPartida: -10, alcanzado: 0, puntoLlegada: 10 })).toMatchObject({ goalProgress: 50, absoluteChange: 10, variationPercent: null, variationUnavailable: 'negative_baseline' });
  });
  it('does not infer missing measurements from tasks or stored progress', () => {
    const row={porcentajeAlcanzadoOTG:100,porcentajeCumplimiento:100} as any;
    expect(calculateOtgResultMetrics(row)).toMatchObject({ baseline:null,goal:null,currentValue:null,goalProgress:null,variationPercent:null });
  });
  it('keeps absent start distinct from zero and explains an equal start/goal', () => {
    expect(calculateOtgResultMetrics({ alcanzado: 10, puntoLlegada: 20 })).toMatchObject({ baseline:null,goalProgress:null,variationUnavailable:'missing_baseline' });
    expect(calculateOtgResultMetrics({ puntoPartida: 10, alcanzado: 12, puntoLlegada: 10 }).goalProgress).toBeNull();
  });
  it('supports numeric historical strings without mutating their representation', () => {
    const row={puntoPartida:'150',alcanzado:'190',puntoLlegada:'250'};
    expect(calculateOtgResultMetrics(row).variationPercent).toBe(26.67);
    expect(row.alcanzado).toBe('190');
  });
  it.each([undefined,null,'','  ',true,false,{},[],NaN,Infinity,'invalid'])('rejects missing/non-finite input %s rather than creating zero', value => {
    expect(otgNumericValue(value)).toBeNull();
  });
});
