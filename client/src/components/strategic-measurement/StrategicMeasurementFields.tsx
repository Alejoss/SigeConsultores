import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isStrategicMeasurementDate, type StrategicMeasurementConfig } from "@shared/strategicObjectiveMeasurement";
import { cloneElement, useId, type ReactElement } from "react";

export type StrategicDefinitionDraft = { name: string; description: string; target: string; responsible: string; deadline: string };
export type StrategicConfigDraft = Omit<StrategicMeasurementConfig, "weight" | "baseline" | "goal"> & { weight: string; baseline: string; goal: string };
export const emptyDefinition = (): StrategicDefinitionDraft => ({ name: "", description: "", target: "", responsible: "", deadline: "" });
export function configToDraft(config: StrategicMeasurementConfig): StrategicConfigDraft {
  return { ...config, weight: config.weight?.toString() ?? "", baseline: config.baseline?.toString() ?? "", goal: config.goal?.toString() ?? "" };
}
export function draftToConfig(draft: StrategicConfigDraft): StrategicMeasurementConfig {
  const number = (value: string) => value.trim() === "" ? null : Number(value);
  return { ...draft, weight: number(draft.weight), baseline: number(draft.baseline), goal: number(draft.goal) };
}
export const isCalendarDate = isStrategicMeasurementDate;
export function localToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function configDraftError(draft: StrategicConfigDraft): string | null {
  for (const key of ["weight", "baseline", "goal"] as const) {
    if (draft[key] !== "" && !Number.isFinite(Number(draft[key]))) return "Ingresa números finitos o deja el campo vacío.";
  }
  if (draft.weight !== "" && (Number(draft.weight) <= 0 || Number(draft.weight) > 100)) return "La ponderación debe ser mayor que 0 y hasta 100%.";
  if (draft.deadline && !isCalendarDate(draft.deadline)) return "Completa una fecha válida para el indicador.";
  return null;
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className="space-y-1.5 text-sm font-medium text-slate-700"><label className="block" htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}
export function StrategicDefinitionFields({ value, onChange, disabled = false }: { value: StrategicDefinitionDraft; onChange: (value: StrategicDefinitionDraft) => void; disabled?: boolean }) {
  const change = (key: keyof StrategicDefinitionDraft, next: string) => onChange({ ...value, [key]: next });
  return <div className="space-y-4">
    <Field label="Nombre del objetivo *"><Input disabled={disabled} value={value.name} onChange={e => change("name", e.target.value)} /></Field>
    <Field label="Justificación / Descripción"><Textarea disabled={disabled} value={value.description} onChange={e => change("description", e.target.value)} /></Field>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Meta (texto)"><Input disabled={disabled} value={value.target} onChange={e => change("target", e.target.value)} placeholder="Se conserva la meta existente" /></Field>
      <Field label="Responsable"><Input disabled={disabled} value={value.responsible} onChange={e => change("responsible", e.target.value)} /></Field>
    </div>
  </div>;
}

export function StrategicConfigFields({ value, onChange, disabled = false }: { value: StrategicConfigDraft; onChange: (value: StrategicConfigDraft) => void; disabled?: boolean }) {
  const change = (key: keyof StrategicConfigDraft, next: string) => onChange({ ...value, [key]: next });
  const baseline = value.baseline.trim() === "" ? null : Number(value.baseline);
  const goal = value.goal.trim() === "" ? null : Number(value.goal);
  const direction = baseline !== null && goal !== null && Number.isFinite(baseline) && Number.isFinite(goal)
    ? baseline === goal ? "El punto de partida y la meta numérica no pueden ser iguales. El indicador queda pendiente de configuración."
      : goal > baseline ? "Sentido del indicador: aumentar. Un valor mayor acerca el objetivo a su meta."
        : "Sentido del indicador: disminuir. Un valor menor acerca el objetivo a su meta."
    : "Define punto de partida y meta numérica para determinar si el indicador debe aumentar o disminuir.";
  return <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Situación inicial"><Textarea disabled={disabled} value={value.initialSituation} onChange={e => change("initialSituation", e.target.value)} /></Field>
      <Field label="Resultado esperado"><Textarea disabled={disabled} value={value.expectedResult} onChange={e => change("expectedResult", e.target.value)} /></Field>
    </div>
    <Field label="Indicador *"><Input disabled={disabled} value={value.indicator} onChange={e => change("indicator", e.target.value)} placeholder="Ej.: participación de mercado" /></Field>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Ponderación (%) *"><Input disabled={disabled} type="number" step="any" min="0" max="100" value={value.weight} onChange={e => change("weight", e.target.value)} /></Field>
      <Field label="Punto de partida *"><Input disabled={disabled} type="number" step="any" value={value.baseline} onChange={e => change("baseline", e.target.value)} /></Field>
      <Field label="Meta numérica *"><Input disabled={disabled} type="number" step="any" value={value.goal} onChange={e => change("goal", e.target.value)} /></Field>
      <Field label="Unidad *"><Input disabled={disabled} value={value.unit} onChange={e => change("unit", e.target.value)} placeholder="%, USD, días, unidades…" /></Field>
      <Field label="Fecha límite del objetivo *"><Input disabled={disabled} type="date" value={value.deadline} onChange={e => change("deadline", e.target.value)} /></Field>
    </div>
    <p className="text-sm text-slate-600">{direction}</p>
    <p className="text-xs text-slate-500">Avance = (valor real − punto de partida) / (meta numérica − punto de partida), limitado entre 0% y 100%. Las ponderaciones de todos los OE deben sumar 100% para calcular el avance global.</p>
  </div>;
}
