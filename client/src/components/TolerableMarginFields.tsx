import { useEffect, useId, useRef, useState } from 'react';
import { calculateTolerableMargin, tolerableMarginStatusLabel, type TolerableMarginConfig } from '@shared/tolerableMargin';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function MarginNumber({ label, value, onChange, disabled = false }: { label: string; value?: number | null; onChange: (value: number | null) => void; disabled?: boolean }) {
  const id = useId(), focused = useRef(false);
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => { if (!focused.current) setDraft(value === null || value === undefined ? '' : String(value)); }, [value]);
  return <div className="min-w-0"><label htmlFor={id} className="mb-1 block text-xs font-semibold">{label}</label>
    <input id={id} type="text" inputMode="decimal" disabled={disabled} value={draft} placeholder="Sin registrar"
      className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100"
      onFocus={() => { focused.current = true; }}
      onChange={e => {
        const raw = e.target.value; setDraft(raw);
        if (raw.trim() === '') { onChange(null); return; }
        const normalized = raw.trim().replace(',', '.');
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) && Number.isFinite(Number(normalized))) onChange(Number(normalized));
      }}
      onBlur={() => {
        focused.current = false;
        const normalized = draft.trim().replace(',', '.');
        if (normalized === '') { onChange(null); setDraft(''); }
        else if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) && Number.isFinite(Number(normalized))) { const n = Number(normalized); onChange(n); setDraft(String(n)); }
        else setDraft(value === null || value === undefined ? '' : String(value));
      }} />
  </div>;
}
export function TolerableMarginFields({ value, onChange, labelPrefix = 'Margen', disabled = false }: {
  value?: TolerableMarginConfig | null; onChange: (config: TolerableMarginConfig) => void; labelPrefix?: string; disabled?: boolean;
}) {
  const config = value ?? {}, id = useId();
  const patch = (change: Partial<TolerableMarginConfig>) => onChange({ ...config, ...change });
  const metrics = calculateTolerableMargin(config);
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border border-green-200 bg-green-50/70 p-3 text-slate-800">
    <legend className="px-1 text-sm font-semibold">Margen tolerable</legend>
    <p className="text-xs text-slate-600">Los límites están incluidos. El signo indica exceso o faltante; acercarse al valor ideal es mejor. Cero es una medición válida.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <MarginNumber label={`${labelPrefix} · Límite inferior`} value={config.lowerLimit} onChange={n => patch({ lowerLimit: n })} disabled={disabled} />
      <MarginNumber label={`${labelPrefix} · Límite superior`} value={config.upperLimit} onChange={n => patch({ upperLimit: n })} disabled={disabled} />
      <MarginNumber label={`${labelPrefix} · Valor ideal (opcional)`} value={config.idealValue} onChange={n => patch({ idealValue: n })} disabled={disabled} />
    </div>
    <div><label htmlFor={id} className="mb-1 block text-xs font-semibold">{labelPrefix} · Registro de mediciones</label>
      <select id={id} value={config.recordingMode ?? 'puntual'} onChange={e => patch({ recordingMode: e.target.value as 'puntual' | 'mensual' })} className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm">
        <option value="puntual">Puntual (valor directo)</option><option value="mensual">Mensual (cada mes se evalúa por separado)</option>
      </select>
    </div>
    {config.recordingMode === 'mensual' ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {MONTHS.map((month, index) => <MarginNumber key={month} label={`${labelPrefix} · ${month}`} value={config.monthlyValues?.[index]} disabled={disabled}
        onChange={n => { const monthlyValues = Array.from({ length: 12 }, (_, i) => config.monthlyValues?.[i] ?? null); monthlyValues[index] = n; patch({ monthlyValues }); }} />)}
    </div> : <MarginNumber label={`${labelPrefix} · Resultado actual`} value={config.currentValue} onChange={n => patch({ currentValue: n })} disabled={disabled} />}
    <p className={`text-xs ${metrics.status === 'invalid' ? 'font-semibold text-red-700' : 'text-slate-600'}`} role="status">{tolerableMarginStatusLabel(metrics)}</p>
    {config.recordingMode === 'mensual' && <p className="text-xs text-slate-600">No se promedian desviaciones positivas y negativas. Solo se evalúan los meses registrados; las casillas vacías no cuentan.</p>}
  </fieldset>;
}
