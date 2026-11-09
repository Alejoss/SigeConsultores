import {
  boundedObjectiveProgress, formatObjectivePercent, formatObjectiveValue,
  objectiveGoalStatusLabel, objectiveTrendLabel, objectiveVariationExplanation, objectiveChangePresentation,
  type ObjectiveResultMetrics,
} from "@shared/objectiveResultMetrics";

type Props = { metrics: ObjectiveResultMetrics; unit?: string; title?: string; variant?: "light" | "dark"; compact?: boolean };
export function ObjectiveResultSummary({ metrics, unit = "", title = "Resultado del objetivo", variant = "light", compact = false }: Props) {
  const dark = variant === "dark";
  const main = dark ? "text-white" : "text-slate-800";
  const secondary = dark ? "text-green-100" : "text-slate-500";
  const trendColor = metrics.trend === "improving" ? dark ? "text-green-200" : "text-green-700"
    : metrics.trend === "worsening" ? dark ? "text-red-200" : "text-red-700" : secondary;
  const numeric = (value: number | null) => `${formatObjectiveValue(value)}${value !== null && unit ? ` ${unit}` : ""}`;
  const change = objectiveChangePresentation(metrics, unit);
  const changeUnit = /%|porcentaje|percent/i.test(unit) ? "puntos porcentuales" : unit;
  const absoluteChange = `${metrics.absoluteChange !== null && metrics.absoluteChange > 0 ? "+" : ""}${formatObjectiveValue(metrics.absoluteChange)}${changeUnit ? ` ${changeUnit}` : ""}`;
  const rows = [
    { label: "Punto de partida", value: numeric(metrics.baseline) },
    { label: "Resultado actual", value: numeric(metrics.currentValue), current: true },
    { label: "Meta", value: numeric(metrics.goal) },
    { label: change.label, value: change.value, variation: true, relativeValue: change.relativeValue },
    { label: "Avance hacia la meta", value: formatObjectivePercent(metrics.goalProgress), progress: true },
  ];
  return <div className={`min-w-0 space-y-3 ${main}`} role="group" aria-label={title}>
    <h3 className={`text-sm font-bold ${secondary}`}>{title}</h3>
    {compact ? <>
      <p className="text-sm">Resultado actual: <strong className="text-lg break-words">{numeric(metrics.currentValue)}</strong></p>
      <p className={`text-xs ${secondary}`}>Inicio: {numeric(metrics.baseline)} · Meta: {numeric(metrics.goal)}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <p className="text-xs">{change.label}: <strong className={`block text-base ${trendColor}`}>{change.value}</strong>{change.relativeValue !== null && <span className={`mt-1 block text-xs font-normal ${secondary}`}>Variación relativa: {change.relativeValue}</span>}</p>
        <p className="text-xs">Avance hacia la meta: <strong className="block text-base">{formatObjectivePercent(metrics.goalProgress)}</strong></p>
      </div>
    </> : <dl className="space-y-2">
      {rows.map(row => <div key={row.label} className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2 ${dark ? "border-green-700" : "border-slate-100"}`}>
        <dt className={`text-xs ${secondary}`}>{row.label}</dt>
        <dd className={`max-w-full break-words font-semibold ${row.current ? "text-2xl" : "text-sm"} ${row.variation ? trendColor : main}`}>{row.value}{row.relativeValue !== undefined && row.relativeValue !== null && <span className={`mt-1 block text-xs font-normal ${secondary}`}>Variación relativa: {row.relativeValue}</span>}</dd>
      </div>)}
    </dl>}
    <p className={`text-xs ${trendColor}`}>{objectiveTrendLabel(metrics)}{!change.isPercentage && metrics.absoluteChange !== null && (metrics.variationUnavailable === "negative_baseline" || metrics.variationUnavailable === "zero_baseline") ? ` · Cambio absoluto: ${absoluteChange}` : ""}</p>
    {metrics.variationPercent === null && <p className={`text-xs ${secondary}`}>{objectiveVariationExplanation(metrics)}</p>}
    <div className={`h-2 rounded-full overflow-hidden ${dark ? "bg-green-950" : "bg-slate-100"}`} role="progressbar" aria-label="Avance hacia la meta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics.goalProgress === null ? undefined : boundedObjectiveProgress(metrics.goalProgress)} aria-valuetext={metrics.goalProgress === null ? "Sin avance calculable" : `${formatObjectivePercent(metrics.goalProgress)}. ${objectiveGoalStatusLabel(metrics)}`}>
      <div className={`h-full rounded-full ${metrics.goalStatus === "below_baseline" ? "bg-red-500" : dark ? "bg-green-300" : "bg-blue-500"}`} style={{ width: `${boundedObjectiveProgress(metrics.goalProgress)}%` }} />
    </div>
    <p className={`text-xs ${secondary}`}>{objectiveGoalStatusLabel(metrics)}{metrics.goalProgress !== null && (metrics.goalProgress < 0 || metrics.goalProgress > 100) ? ". La barra muestra solo el tramo entre inicio y meta; el porcentaje no se recorta." : ""}</p>
  </div>;
}
