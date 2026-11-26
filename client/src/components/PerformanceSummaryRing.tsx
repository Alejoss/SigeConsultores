import { boundedObjectiveProgress, formatObjectivePercent } from "@shared/objectiveResultMetrics";

export function PerformanceSummaryRing({ value, color, label, description }: {
  value: number | null; color: string; label: string; description: string;
}) {
  if (value === null || !Number.isFinite(value)) return null;
  const percentage = formatObjectivePercent(value);
  const visualProgress = boundedObjectiveProgress(value);
  const explanation = value < 0 ? "El resultado es negativo; el anillo no representa avance positivo."
    : value > 100 ? "El resultado supera el 100 %; el anillo se muestra completo." : "";
  return <span className="block shrink-0" role="img" aria-label={`Avance general de ${label}: ${percentage}`} title={`${description}: ${percentage}.${explanation ? ` ${explanation}` : ""}`}>
    <span className="relative block h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="28" fill="none" stroke="#f1f5f9" strokeWidth="4" />
        <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4" pathLength="100"
          strokeDasharray={`${visualProgress} 100`} strokeLinecap={visualProgress === 0 ? "butt" : "round"}
          transform="rotate(-90 32 32)" data-visual-progress={visualProgress} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-bold tabular-nums whitespace-nowrap"
        style={{ color, fontSize: percentage.length > 9 ? 9 : percentage.length > 7 ? 10 : 12 }} aria-hidden="true">{percentage}</span>
    </span>
    <span className="mt-0.5 block text-center text-[9px] leading-tight text-slate-500" aria-hidden="true">Avance general</span>
  </span>;
}
