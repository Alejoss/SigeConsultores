import { calculateObjectiveResultMetrics, type ObjectiveResultMetrics } from './objectiveResultMetrics';

/** Stored only when a user opts into this new tracking method. Existing values are not converted. */
export type TolerableMarginConfig = {
  lowerLimit?: number | null;
  upperLimit?: number | null;
  idealValue?: number | null;
  recordingMode?: 'puntual' | 'mensual';
  currentValue?: number | null;
  monthlyValues?: (number | null)[];
};
export type TolerableMarginMetrics = {
  lowerLimit: number | null;
  upperLimit: number | null;
  idealValue: number | null;
  recordingMode: 'puntual' | 'mensual';
  currentValue: number | null;
  latestMonthIndex: number | null;
  sampleCount: number;
  withinCount: number;
  compliancePercent: number | null;
  distanceToIdeal: number | null;
  status: 'pending' | 'invalid' | 'inside' | 'boundary' | 'above' | 'below';
  samples: { index: number; value: number; within: boolean }[];
};
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function calculateTolerableMargin(config?: TolerableMarginConfig | null): TolerableMarginMetrics {
  const lowerLimit = finite(config?.lowerLimit), upperLimit = finite(config?.upperLimit), idealValue = finite(config?.idealValue);
  const recordingMode = config?.recordingMode === 'mensual' ? 'mensual' : 'puntual';
  const boundsValid = lowerLimit !== null && upperLimit !== null && lowerLimit < upperLimit;
  const idealValid = idealValue === null || (boundsValid && idealValue >= lowerLimit! && idealValue <= upperLimit!);
  const values = recordingMode === 'mensual' ? (config?.monthlyValues ?? []).slice(0, 12) : [config?.currentValue];
  const samples = values.flatMap((v, index) => {
    const value = finite(v);
    return value === null ? [] : [{ index, value, within: boundsValid && value >= lowerLimit! && value <= upperLimit! }];
  });
  const currentValue = samples.length ? samples[samples.length - 1].value : null;
  const withinCount = samples.filter(s => s.within).length;
  const status: TolerableMarginMetrics['status'] = !boundsValid || !idealValid
    ? (lowerLimit === null || upperLimit === null ? 'pending' : 'invalid')
    : currentValue === null ? 'pending' : currentValue < lowerLimit! ? 'below' : currentValue > upperLimit! ? 'above'
      : currentValue === lowerLimit || currentValue === upperLimit ? 'boundary' : 'inside';
  return { lowerLimit, upperLimit, idealValue, recordingMode, currentValue,
    latestMonthIndex: recordingMode === 'mensual' && samples.length ? samples[samples.length - 1].index : null,
    sampleCount: samples.length, withinCount, compliancePercent: boundsValid && idealValid && samples.length ? withinCount / samples.length * 100 : null,
    distanceToIdeal: currentValue !== null && idealValue !== null ? Math.abs(currentValue - idealValue) : null, status, samples };
}
export function tolerableMarginStatusLabel(metrics: TolerableMarginMetrics): string {
  return metrics.status === 'above' ? 'Fuera del margen · por exceso'
    : metrics.status === 'below' ? 'Fuera del margen · por defecto'
    : metrics.status === 'boundary' ? 'En el límite permitido'
    : metrics.status === 'inside' ? (metrics.idealValue !== null && metrics.currentValue === metrics.idealValue ? 'Valor ideal · dentro del margen' : 'Dentro del margen')
    : metrics.status === 'invalid' ? 'Revisa los límites y el valor ideal' : metrics.lowerLimit === null || metrics.upperLimit === null ? 'Configura los límites del margen' : 'Sin medición registrada';
}
export function calculateTolerableObjectiveResult(baseline: number | null | undefined, config?: TolerableMarginConfig | null): ObjectiveResultMetrics {
  const tolerance = calculateTolerableMargin(config);
  const result = calculateObjectiveResultMetrics({ baseline, goal: tolerance.idealValue, currentValue: tolerance.currentValue });
  const previousDistance = finite(baseline) !== null && tolerance.idealValue !== null ? Math.abs(baseline! - tolerance.idealValue) : null;
  const validConfig = tolerance.lowerLimit !== null && tolerance.upperLimit !== null && tolerance.lowerLimit < tolerance.upperLimit
    && tolerance.idealValue !== null && tolerance.idealValue >= tolerance.lowerLimit && tolerance.idealValue <= tolerance.upperLimit;
  const unavailable: NonNullable<ObjectiveResultMetrics['toleranceImprovement']>['unavailable'] = tolerance.idealValue === null ? 'missing_ideal'
    : !validConfig ? 'invalid_config' : previousDistance === null ? 'missing_baseline'
    : tolerance.currentValue === null ? 'missing_value' : previousDistance === 0 ? 'zero_initial_distance'
    : !Number.isFinite(previousDistance) || !Number.isFinite(tolerance.distanceToIdeal) ? 'invalid_config' : null;
  const reduction = unavailable === null ? (previousDistance! - tolerance.distanceToIdeal!) / previousDistance! * 100 : null;
  const reductionPercent = reduction !== null && Number.isFinite(reduction) ? Number(reduction.toFixed(2)) || 0 : null;
  result.goalProgress = null; // A tolerance band is not an unbounded linear goal.
  result.goalStatus = 'pending';
  result.trend = !validConfig || previousDistance === null || tolerance.distanceToIdeal === null ? 'unknown'
    : tolerance.distanceToIdeal < previousDistance ? 'improving' : tolerance.distanceToIdeal > previousDistance ? 'worsening' : 'unchanged';
  return { ...result, tolerance, toleranceImprovement: {
    initialDistance: previousDistance !== null && Number.isFinite(previousDistance) ? previousDistance : null,
    reductionPercent, unavailable: reduction !== null && !Number.isFinite(reduction) ? 'invalid_config' : unavailable,
  } };
}
export function tolerableImprovementExplanation(metrics: ObjectiveResultMetrics): string {
  switch (metrics.toleranceImprovement?.unavailable) {
    case 'missing_ideal': return 'Define un valor ideal para medir la reducción de la desviación.';
    case 'invalid_config': return 'Revisa los límites y el valor ideal antes de comparar la desviación.';
    case 'missing_baseline': return 'Sin punto de partida definido para comparar la desviación.';
    case 'missing_value': return 'Sin medición registrada para comparar la desviación.';
    case 'zero_initial_distance': return 'El punto de partida ya coincide con el ideal; no se calcula una reducción porcentual.';
    default: return 'Un porcentaje positivo indica reducción de la distancia al ideal (mejora); uno negativo indica aumento de esa distancia (retroceso).';
  }
}
