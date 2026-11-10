import { calculateObjectiveResultMetrics, type ObjectiveResultMetrics } from './objectiveResultMetrics';

export type OtgResultSource = {
  puntoPartida?: unknown;
  puntoLlegada?: unknown;
  alcanzado?: unknown;
};

/** Missing inputs stay missing; reading a historical OTG never manufactures a numeric zero. */
export function otgNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Business result of the OTG, deliberately independent of its tasks and stored clipped percentages. */
export function calculateOtgResultMetrics(row: OtgResultSource): ObjectiveResultMetrics {
  return calculateObjectiveResultMetrics({
    baseline: otgNumericValue(row.puntoPartida),
    goal: otgNumericValue(row.puntoLlegada),
    currentValue: otgNumericValue(row.alcanzado),
  });
}
