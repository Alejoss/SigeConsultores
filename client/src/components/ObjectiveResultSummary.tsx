import {
  boundedObjectiveProgress, formatObjectivePercent, formatObjectiveValue,
  objectiveGoalStatusLabel, objectiveTrendLabel, objectiveVariationExplanation, objectiveChangePresentation,
  type ObjectiveResultMetrics,
} from '@shared/objectiveResultMetrics';
import { tolerableImprovementExplanation, tolerableMarginStatusLabel } from '@shared/tolerableMargin';

type Props = { metrics: ObjectiveResultMetrics; unit?: string; title?: string; variant?: 'light' | 'dark'; compact?: boolean };
export function ObjectiveResultSummary({ metrics, unit = '', title = 'Resultado del objetivo', variant = 'light', compact = false }: Props) {
  const dark = variant === 'dark', tolerance = metrics.tolerance;
  const main = dark ? 'text-white' : 'text-slate-800';
  const secondary = dark ? 'text-green-100' : 'text-slate-500';
  const trendColor = metrics.trend === 'improving' ? dark ? 'text-green-200' : 'text-green-700'
    : metrics.trend === 'worsening' ? dark ? 'text-red-200' : 'text-red-700' : secondary;
  const change = objectiveChangePresentation(metrics, unit);
  const numeric = (value: number | null) => `${formatObjectiveValue(value, change.isPercentage)}${value !== null && unit ? ` ${unit}` : ''}`;
  const absoluteUnit = change.isPercentage ? (dark ? 'p.p.' : 'puntos porcentuales') : unit;
  const absoluteChange = metrics.absoluteChange === null ? '—' : `${metrics.absoluteChange > 0 ? '+' : ''}${formatObjectiveValue(metrics.absoluteChange, change.isPercentage)}${absoluteUnit ? ` ${absoluteUnit}` : ''}`;
  const relative = metrics.variationPercent === null ? metrics.currentValue === null ? '—' : metrics.variationUnavailable === 'not_numeric' ? 'No aplica' : 'No calculable' : formatObjectivePercent(metrics.variationPercent, true);
  const rows: { label: string; value: string; current?: boolean; emphasis?: boolean; tone?: string; help?: string }[] = [
    { label: 'Punto de partida', value: numeric(metrics.baseline) },
    { label: tolerance?.recordingMode === 'mensual' ? 'Resultado actual · última medición' : 'Resultado actual', value: numeric(metrics.currentValue), current: true },
    ...(tolerance ? [
      { label: 'Límite inferior', value: numeric(tolerance.lowerLimit) },
      { label: 'Límite superior', value: numeric(tolerance.upperLimit) },
      ...(tolerance.idealValue !== null ? [{ label: 'Valor ideal', value: numeric(tolerance.idealValue) }] : []),
      { label: 'Reducción de la desviación respecto al ideal', value: formatObjectivePercent(metrics.toleranceImprovement?.reductionPercent), emphasis: true, help: tolerableImprovementExplanation(metrics) },
      { label: 'Tendencia', value: objectiveTrendLabel(metrics), tone: trendColor },
      { label: 'Estado actual', value: tolerableMarginStatusLabel(tolerance), tone: tolerance.status === 'above' || tolerance.status === 'below' || tolerance.status === 'invalid' ? dark ? 'text-red-200' : 'text-red-700' : main },
    ] : [{ label: 'Meta', value: numeric(metrics.goal) }]),
    { label: 'Cambio respecto al inicio', value: absoluteChange, help: change.isPercentage ? 'p.p. significa puntos porcentuales.' : 'Diferencia entre el resultado actual y el punto de partida, en la unidad del indicador.' },
    ...(!tolerance ? [{ label: 'Variación relativa', value: relative, help: 'Cambio porcentual respecto al inicio; no equivale al cumplimiento de la meta.' }] : []),
    ...(tolerance ? [
      ...(tolerance.distanceToIdeal !== null ? [{ label: 'Distancia al valor ideal', value: numeric(tolerance.distanceToIdeal) }] : []),
      ...(tolerance.recordingMode === 'mensual' ? [{ label: 'Mediciones dentro del margen', value: formatObjectivePercent(tolerance.compliancePercent) }] : []),
    ] : [{ label: 'Avance hacia la meta', value: formatObjectivePercent(metrics.goalProgress) }]),
  ];
  return <div className={`min-w-0 space-y-3 ${main}`} role="group" aria-label={title}>
    <h3 className={`text-sm font-bold ${secondary}`}>{title}</h3>
    <dl className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {rows.map(row => <div key={row.label} className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2 ${dark ? 'border-green-700' : 'border-slate-100'}`}>
        <dt className={`min-w-0 text-xs ${secondary}`} title={row.help}>{row.label}</dt>
        <dd className={`max-w-full break-words text-right font-semibold ${row.current ? compact ? 'text-lg' : 'text-2xl' : row.emphasis ? 'text-lg' : 'text-sm'} ${row.tone || main}`} title={row.help}>{row.value}</dd>
      </div>)}
    </dl>
    {!tolerance && <p className={`text-xs ${trendColor}`}>{objectiveTrendLabel(metrics)}</p>}
    {!tolerance && metrics.variationPercent === null && <p className={`text-xs ${secondary}`}>{objectiveVariationExplanation(metrics)}</p>}
    {tolerance ? <>
      <p className={`text-xs ${secondary}`}>{tolerableImprovementExplanation(metrics)}{tolerance.recordingMode === 'mensual' ? ' Esta comparación utiliza la última medición registrada.' : ''}</p>
      {tolerance.lowerLimit !== null && tolerance.upperLimit !== null && tolerance.lowerLimit < tolerance.upperLimit && <div className="space-y-1" role="img" aria-label={`Margen permitido: ${numeric(tolerance.lowerLimit)} a ${numeric(tolerance.upperLimit)}. ${tolerableMarginStatusLabel(tolerance)}`}>
        <div className={`relative h-3 rounded-full ${dark ? 'bg-green-300/50' : 'bg-green-200'}`}>
          {tolerance.idealValue !== null && <span className={`absolute top-0 h-3 w-px ${dark ? 'bg-white' : 'bg-green-900'}`} style={{ left: `${boundedObjectiveProgress((tolerance.idealValue - tolerance.lowerLimit) / (tolerance.upperLimit - tolerance.lowerLimit) * 100)}%` }} />}
          {tolerance.currentValue !== null && <span className={`absolute -top-1 h-5 w-1 -translate-x-1/2 rounded ${tolerance.status === 'above' || tolerance.status === 'below' ? 'bg-red-500' : dark ? 'bg-white' : 'bg-green-800'}`} style={{ left: `${boundedObjectiveProgress((tolerance.currentValue - tolerance.lowerLimit) / (tolerance.upperLimit - tolerance.lowerLimit) * 100)}%` }} />}
        </div>
        <div className={`flex justify-between text-xs ${secondary}`}><span>{numeric(tolerance.lowerLimit)}</span><span>{numeric(tolerance.upperLimit)}</span></div>
      </div>}
      <p className={`text-xs ${secondary}`}>{tolerance.recordingMode === 'mensual' ? `${tolerance.withinCount} de ${tolerance.sampleCount} mediciones registradas dentro del margen. No se promedian desviaciones opuestas.` : 'Los límites están incluidos. Estar dentro del margen no significa haber llegado al valor ideal.'}</p>
      <div className={`space-y-1 rounded-md p-2 text-xs ${dark ? 'bg-green-950/30' : 'bg-slate-50'} ${secondary}`} role="group" aria-label="Lectura secundaria: variación del valor">
        <dl><div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt>Variación relativa</dt><dd className="break-words text-right font-normal">{relative}</dd></div></dl>
        <p>El signo indica aumento o disminución del valor; no mejora o retroceso.</p>
        {metrics.variationPercent === null && <p>{objectiveVariationExplanation(metrics)}</p>}
      </div>
    </> : <>
      <div className={`h-2 overflow-hidden rounded-full ${dark ? 'bg-green-950' : 'bg-slate-100'}`} role="progressbar" aria-label="Avance hacia la meta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics.goalProgress === null ? undefined : boundedObjectiveProgress(metrics.goalProgress)} aria-valuetext={metrics.goalProgress === null ? 'Sin avance calculable' : `${formatObjectivePercent(metrics.goalProgress)}. ${objectiveGoalStatusLabel(metrics)}`}>
        <div className={`h-full rounded-full ${metrics.goalStatus === 'below_baseline' ? 'bg-red-500' : dark ? 'bg-green-300' : 'bg-blue-500'}`} style={{ width: `${boundedObjectiveProgress(metrics.goalProgress)}%` }} />
      </div>
      <p className={`text-xs ${secondary}`}>{objectiveGoalStatusLabel(metrics)}{metrics.goalProgress !== null && (metrics.goalProgress < 0 || metrics.goalProgress > 100) ? '. La barra muestra solo el tramo entre inicio y meta; el porcentaje no se recorta.' : ''}</p>
    </>}
  </div>;
}
