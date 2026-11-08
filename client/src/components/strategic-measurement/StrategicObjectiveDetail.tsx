import { useCallback, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject, type Ref } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useStrategicAutosave } from "@/hooks/useStrategicAutosave";
import { emptyStrategicMeasurementConfig, isStrategicMeasurementConfigured, type StrategicMeasuredObjective, type StrategicMeasurementConfig, type StrategicMeasurement } from "@shared/strategicObjectiveMeasurement";
import { configToDraft, draftToConfig, configDraftError, isCalendarDate, localToday, StrategicConfigFields, StrategicDefinitionFields, type StrategicConfigDraft, type StrategicDefinitionDraft } from "./StrategicMeasurementFields";
import { StrategicSaveState } from "./StrategicSaveState";

export type StrategicObjectiveDetailHandle = { flush: () => Promise<boolean> };
type SaveRegistry = MutableRefObject<Partial<Record<"definition" | "config" | "measurement", () => Promise<boolean>>>>;
function useSaveRegistration(registry: SaveRegistry, key: "definition" | "config" | "measurement", flush: () => Promise<boolean>) {
  useEffect(() => {
    registry.current[key] = flush;
    return () => { delete registry.current[key]; };
  }, [registry, key, flush]);
}

export function strategicMeasurementLabel(objective: StrategicMeasuredObjective): string {
  return objective.measurementStatus === "pending_configuration" ? "Pendiente de configuración" : objective.percent === null ? "Sin medición" : `${objective.percent}%`;
}

function DefinitionEditor({ objective, canManage, onSaved, registry }: { objective: StrategicMeasuredObjective; canManage: boolean; onSaved: () => void; registry: SaveRegistry }) {
  const [draft, setDraft] = useState<StrategicDefinitionDraft>(() => ({ name: objective.name, description: objective.description, target: objective.target, responsible: objective.responsible, deadline: objective.deadline?.slice(0, 10) ?? "" }));
  const dirtyFields = useRef(new Set<keyof StrategicDefinitionDraft>());
  const mutation = trpc.strategicObjectives.update.useMutation();
  const autosave = useStrategicAutosave<Partial<StrategicDefinitionDraft>>(async value => {
    await mutation.mutateAsync({ id: objective.id, ...value });
    onSaved();
  });
  useSaveRegistration(registry, "definition", autosave.flush);
  function change(next: StrategicDefinitionDraft) {
    for (const key of Object.keys(next) as (keyof StrategicDefinitionDraft)[]) {
      if (next[key] !== draft[key]) dirtyFields.current.add(key);
    }
    setDraft(next);
    const patch = Object.fromEntries(Array.from(dirtyFields.current).map(key => [key, next[key]])) as Partial<StrategicDefinitionDraft>;
    autosave.schedule(canManage && next.name.trim() && (!next.deadline || isCalendarDate(next.deadline)) ? patch : null);
  }
  return <section className="space-y-3">
    <h3 className="font-semibold text-slate-800">Definición del objetivo</h3>
    <StrategicDefinitionFields value={draft} onChange={change} disabled={!canManage} />
    {canManage && <><StrategicSaveState {...autosave} />{!draft.name.trim() && <p className="text-xs text-amber-700">El nombre es obligatorio; completa el campo para guardar.</p>}</>}
  </section>;
}

function ConfigEditor({ companyId, objective, canManage, onSaved, registry }: { companyId: number; objective: StrategicMeasuredObjective; canManage: boolean; onSaved: () => void; registry: SaveRegistry }) {
  // Hydrate once. Background refetches update indicators, never the active draft/cursor.
  const [draft, setDraft] = useState<StrategicConfigDraft>(() => configToDraft(objective.measurementConfig ?? emptyStrategicMeasurementConfig()));
  const mutation = trpc.strategicObjectives.saveMeasurementConfig.useMutation();
  const autosave = useStrategicAutosave<StrategicMeasurementConfig>(async config => {
    await mutation.mutateAsync({ companyId, objectiveId: objective.id, config });
    onSaved();
  });
  useSaveRegistration(registry, "config", autosave.flush);
  const error = configDraftError(draft);
  function change(next: StrategicConfigDraft) {
    setDraft(next);
    autosave.schedule(canManage && !configDraftError(next) ? draftToConfig(next) : null);
  }
  return <section className="space-y-3 border-t pt-5">
    <h3 className="font-semibold text-slate-800">Indicador propio del OE</h3>
    <p className="text-sm text-slate-500">Este avance se mide con valores reales. No se calcula a partir de los OTE ni modifica su contribución por área.</p>
    <StrategicConfigFields value={draft} onChange={change} disabled={!canManage} />
    {error && <p role="alert" className="text-xs text-amber-700">{error}</p>}
    {!isStrategicMeasurementConfigured(draftToConfig(draft)) && <p className="text-xs text-amber-700">{canManage ? "Pendiente de configuración. Puedes completar el borrador por etapas; aún no se puede registrar una medición." : "Pendiente de configuración. La definición del indicador se completa en Estrategia → Objetivos Estratégicos."}</p>}
    {canManage && <StrategicSaveState {...autosave} />}
  </section>;
}

type MeasurementDraft = { measurementDate: string; value: string; observation: string; evidence: string };
type MeasurementInput = Omit<MeasurementDraft, "value"> & { value: number };
export function measurementDraftError(draft: MeasurementDraft): string | null {
  if (!isCalendarDate(draft.measurementDate)) return "Completa una fecha válida de medición.";
  if (draft.measurementDate > localToday()) return "La fecha de medición no puede ser futura.";
  if (!draft.value.trim() || !Number.isFinite(Number(draft.value))) return "Ingresa un valor real finito (0 es un valor válido).";
  return null;
}
function MeasurementCapture({ companyId, objective, measurements, onSaved, registry }: { companyId: number; objective: StrategicMeasuredObjective; measurements: StrategicMeasurement[]; onSaved: () => void; registry: SaveRegistry }) {
  const [draft, setDraft] = useState<MeasurementDraft>({ measurementDate: "", value: "", observation: "", evidence: "" });
  const [touched, setTouched] = useState(false);
  const configured = isStrategicMeasurementConfigured(objective.measurementConfig);
  const mutation = trpc.strategicObjectives.saveMeasurement.useMutation();
  const autosave = useStrategicAutosave<MeasurementInput>(async input => {
    await mutation.mutateAsync({ companyId, objectiveId: objective.id, ...input });
    onSaved();
  });
  useSaveRegistration(registry, "measurement", autosave.flush);
  function change(key: keyof MeasurementDraft, value: string) {
    let next = { ...draft, [key]: value };
    if (key === "measurementDate") {
      const existing = measurements.find(row => row.measurementDate === value);
      if (existing) {
        next = { measurementDate: value, value: String(existing.value), observation: existing.observation, evidence: existing.evidence };
        setDraft(next);
        setTouched(false);
        autosave.schedule(null);
        return;
      }
    }
    setDraft(next);
    setTouched(true);
    // Invalid/partial dates cancel the queued write, even if value was already entered.
    autosave.schedule(configured && !measurementDraftError(next) ? { ...next, value: Number(next.value) } : null);
  }
  return <section className="space-y-3 border-t pt-5">
    <h3 className="font-semibold text-slate-800">Registrar valor real</h3>
    <p className="text-xs text-slate-500">Los campos válidos se guardan automáticamente. La misma fecha actualiza su registro; otra fecha agrega un punto al historial.</p>
    {!configured && <p className="text-sm text-amber-700">Completa primero el indicador en Estrategia → Objetivos Estratégicos; después podrás registrar su valor real aquí.</p>}
    <fieldset disabled={!configured} className="space-y-4 disabled:opacity-60">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium space-y-1.5"><span>Fecha de medición *</span><Input type="date" max={localToday()} value={draft.measurementDate} onChange={e => change("measurementDate", e.target.value)} /></label>
        <label className="block text-sm font-medium space-y-1.5"><span>Valor real *{objective.measurementConfig?.unit ? ` (${objective.measurementConfig.unit})` : ""}</span><Input type="number" step="any" value={draft.value} onChange={e => change("value", e.target.value)} /></label>
      </div>
      <label className="block text-sm font-medium space-y-1.5"><span>Observación</span><Textarea value={draft.observation} onChange={e => change("observation", e.target.value)} /></label>
      <label className="block text-sm font-medium space-y-1.5"><span>Evidencia / Referencia</span><Textarea placeholder="Enlace, documento de referencia o explicación de la evidencia" value={draft.evidence} onChange={e => change("evidence", e.target.value)} /></label>
    </fieldset>
    {touched && measurementDraftError(draft) && <p role="alert" className="text-xs text-amber-700">{measurementDraftError(draft)}</p>}
    <StrategicSaveState {...autosave} />
  </section>;
}

export function StrategicMeasurementHistory({ measurements, unit }: { measurements: StrategicMeasurement[]; unit: string }) {
  const rows = [...measurements].sort((a, b) => b.measurementDate.localeCompare(a.measurementDate) || b.id - a.id);
  return <section className="space-y-3 border-t pt-5">
    <h3 className="font-semibold text-slate-800">Historial de mediciones reales</h3>
    {rows.length === 0 ? <p className="text-sm text-slate-500">Sin mediciones. No se asigna 0% por falta de datos.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left">
      <thead><tr className="border-b text-slate-500"><th className="p-2">Fecha</th><th className="p-2">Valor real</th><th className="p-2">Avance</th><th className="p-2">Observación</th><th className="p-2">Evidencia / Referencia</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-b"><td className="p-2 whitespace-nowrap">{row.measurementDate}</td><td className="p-2">{row.value} {unit}</td><td className="p-2">{row.percent}%</td><td className="p-2 whitespace-pre-wrap break-words">{row.observation || "—"}</td><td className="p-2 whitespace-pre-wrap break-words">{row.evidence || "—"}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}

export function StrategicObjectiveDetail({ companyId, objectiveId, canManage, mode, onClose, onSaved, detailRef }: { companyId: number; objectiveId: number; canManage: boolean; mode: "definition" | "measurement"; onClose?: () => void; onSaved?: () => void; detailRef?: Ref<StrategicObjectiveDetailHandle> }) {
  const registry: SaveRegistry = useRef({});
  const [closing, setClosing] = useState(false);
  const flush = useCallback(async () => {
    setClosing(true);
    const results = await Promise.all(Object.values(registry.current).map(save => save()));
    setClosing(false);
    return results.every(Boolean);
  }, []);
  useImperativeHandle(detailRef, () => ({ flush }), [flush]);
  const query = trpc.strategicObjectives.getMeasurementDetail.useQuery({ companyId, objectiveId }, { enabled: companyId > 0 });
  const utils = trpc.useUtils();
  function saved() {
    void utils.strategicObjectives.getMeasurementDetail.invalidate({ companyId, objectiveId });
    void utils.strategicObjectives.getMeasurementOverview.invalidate({ companyId });
    void utils.strategicObjectives.list.invalidate({ companyId });
    onSaved?.();
  }
  if (query.isLoading) return <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (query.error || !query.data) return <div className="p-4 text-red-700" role="alert">No se pudo cargar el detalle. <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div>;
  const { objective, measurements } = query.data;
  return <div className="w-full space-y-5 rounded-xl border border-blue-200 bg-white p-5" key={objectiveId}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-lg text-slate-800">{objective.name}</h2><p className="text-sm text-slate-500">{strategicMeasurementLabel(objective)}{objective.latestMeasurement ? ` · Última medición: ${objective.latestMeasurement.measurementDate}` : ""}</p></div>{onClose && <Button variant="outline" disabled={closing} onClick={async () => { if (await flush()) onClose(); }}>{closing ? "Guardando…" : "Cerrar"}</Button>}</div>
    <p className="text-xs text-slate-500">{mode === "definition" ? "Aquí se define el objetivo y su indicador. Las mediciones y su historial se consultan en Desempeño → Objetivos Estratégicos." : "La definición y el indicador vienen de Estrategia y aquí son solo de lectura. En Desempeño se registran los resultados reales."}</p>
    {canManage && <p className="text-xs text-slate-500">{mode === "definition" ? "Autoguardado activo para la definición y el indicador." : "Autoguardado activo solo para las mediciones: fecha, valor real, observación y evidencia."}</p>}
    <DefinitionEditor registry={registry} objective={objective} canManage={canManage && mode === "definition"} onSaved={saved} />
    <ConfigEditor registry={registry} companyId={companyId} objective={objective} canManage={canManage && mode === "definition"} onSaved={saved} />
    {mode === "measurement" && canManage && <MeasurementCapture registry={registry} companyId={companyId} objective={objective} measurements={measurements} onSaved={saved} />}
    {mode === "measurement" && <StrategicMeasurementHistory measurements={measurements} unit={objective.measurementConfig?.unit ?? ""} />}
  </div>;
}
