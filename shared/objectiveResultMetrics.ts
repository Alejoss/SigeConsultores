export type ObjectiveResultInput = {
  baseline: number | null | undefined;
  goal: number | null | undefined;
  currentValue: number | null | undefined;
  /** Checklist/direct task percentages are not changes in a numeric business indicator. */
  numericComparison?: boolean;
  /** Preserve the existing progress semantics for checklist tracking. */
  goalProgressOverride?: number | null;
};
export type ObjectiveResultMetrics = {
  baseline: number | null;
  goal: number | null;
  currentValue: number | null;
  absoluteChange: number | null;
  variationPercent: number | null;
  variationUnavailable: "missing_value" | "missing_baseline" | "zero_baseline" | "negative_baseline" | "not_numeric" | null;
  goalProgress: number | null;
  trend: "improving" | "worsening" | "unchanged" | "unknown";
  goalStatus: "below_baseline" | "in_progress" | "goal_reached" | "goal_exceeded" | "pending";
};
const finite = (n: number | null | undefined): number | null => typeof n === "number" && Number.isFinite(n) ? n : null;
const rounded = (n: number): number | null => Number.isFinite(n) ? (Object.is(Number(n.toFixed(2)), -0) ? 0 : Number(n.toFixed(2))) : null;
export function calculateObjectiveResultMetrics(input: ObjectiveResultInput): ObjectiveResultMetrics {
  const baseline = finite(input.baseline), goal = finite(input.goal), currentValue = finite(input.currentValue);
  const absoluteChange = baseline !== null && currentValue !== null ? finite(currentValue - baseline) : null;
  let variationUnavailable: ObjectiveResultMetrics["variationUnavailable"] = input.numericComparison === false ? "not_numeric"
    : currentValue === null ? "missing_value" : baseline === null ? "missing_baseline"
    : baseline === 0 ? "zero_baseline" : baseline < 0 ? "negative_baseline" : null;
  const variationPercent = variationUnavailable === null && absoluteChange !== null ? rounded(absoluteChange / baseline! * 100) : null;
  if (variationPercent === null && variationUnavailable === null) variationUnavailable = "missing_value";
  const goalProgress = input.goalProgressOverride !== undefined ? rounded(finite(input.goalProgressOverride) ?? NaN)
    : baseline !== null && goal !== null && goal !== baseline && currentValue !== null
      ? rounded((currentValue - baseline) / (goal - baseline) * 100) : null;
  const direction = baseline !== null && goal !== null ? Math.sign(goal - baseline) : 0;
  const directedChange = absoluteChange !== null ? absoluteChange * direction : null;
  const trend: ObjectiveResultMetrics["trend"] = directedChange === null || direction === 0 ? "unknown"
    : directedChange > 0 ? "improving" : directedChange < 0 ? "worsening" : "unchanged";
  const goalStatus: ObjectiveResultMetrics["goalStatus"] = goalProgress === null ? "pending"
    : goalProgress < 0 ? "below_baseline" : goalProgress > 100 ? "goal_exceeded" : goalProgress === 100 ? "goal_reached" : "in_progress";
  return { baseline, goal, currentValue, absoluteChange, variationPercent, variationUnavailable, goalProgress, trend, goalStatus };
}
export function boundedObjectiveProgress(value: number | null | undefined): number {
  return Math.max(0, Math.min(100, finite(value) ?? 0));
}
export function formatObjectiveValue(value: number | null | undefined): string {
  const n=finite(value);return n === null ? "—" : new Intl.NumberFormat("es-EC", { maximumFractionDigits: 6 }).format(n);
}
export function formatObjectivePercent(value: number | null | undefined, signed = false): string {
  const n=finite(value);return n === null ? "—" : `${signed && n > 0 ? "+" : ""}${new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 }).format(n)} %`;
}
export function objectiveVariationExplanation(metrics: ObjectiveResultMetrics): string {
  switch(metrics.variationUnavailable) {
    case "zero_baseline": return "No calculable: inicio igual a cero.";
    case "negative_baseline": return "No se expresa en porcentaje con un inicio negativo; consulta el cambio absoluto.";
    case "not_numeric": return "No aplica al seguimiento por cumplimiento.";
    case "missing_baseline": return "Sin punto de partida definido.";
    case "missing_value": return "Sin medición registrada.";
    default: return "Cambio respecto al punto de partida; no mide el cumplimiento de la meta.";
  }
}
export function objectiveTrendLabel(metrics: ObjectiveResultMetrics): string {
  return metrics.trend === "improving" ? "Mejora" : metrics.trend === "worsening" ? "Retroceso" : metrics.trend === "unchanged" ? "Sin cambio" : "Sin comparación";
}
export function objectiveGoalStatusLabel(metrics: ObjectiveResultMetrics): string {
  return metrics.goalStatus === "below_baseline" ? "Por debajo del inicio" : metrics.goalStatus === "goal_exceeded" ? "Meta superada"
    : metrics.goalStatus === "goal_reached" ? "Meta alcanzada" : metrics.goalStatus === "pending" ? "Sin avance calculable" : "En camino a la meta";
}

/** Present percentage-point change first only when the business indicator itself is a percentage. */
export function objectiveChangePresentation(metrics: ObjectiveResultMetrics, unit = ""): {
  isPercentage: boolean; label: string; value: string; relativeValue: string | null;
} {
  const isPercentage = /%|\bporcentajes?\b|\bpercent(?:age)?\b|\bpor ciento\b/i.test(unit)
    && metrics.variationUnavailable !== "not_numeric";
  const missing = metrics.currentValue === null ? "—" : metrics.variationUnavailable === "not_numeric" ? "No aplica" : "No calculable";
  const relative = metrics.variationPercent === null ? missing : formatObjectivePercent(metrics.variationPercent, true);
  const points = metrics.absoluteChange === null ? "—"
    : `${metrics.absoluteChange > 0 ? "+" : ""}${formatObjectiveValue(metrics.absoluteChange)} puntos porcentuales`;
  return { isPercentage, label: isPercentage ? "Cambio respecto al inicio" : "Variación respecto al inicio", value: isPercentage ? points : relative, relativeValue: isPercentage ? relative : null };
}
