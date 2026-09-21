import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ActivePlanningCycleBadge } from "@/components/ActivePlanningCycleBadge";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;
const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

const TRACKING_LABELS = {
  puntual: "Puntual (valor directo)",
  mensual_sumatoria: "Mensual sumatoria (12 meses)",
  mensual_promedio: "Mensual promedio (12 meses)",
  mensual_checklist: "Lista de verificación mensual",
} as const;

type ScheduleType = "once" | "weekly" | "monthly";
type TrackingType = keyof typeof TRACKING_LABELS;

type ActivityOccurrence = {
  date: string;
  completed: boolean;
};

interface Activity {
  id: number;
  processId: number;
  requirement: string;
  description: string | null;
  responsible: string | null;
  observations: string | null;
  dueDate: string | null;
  scheduleType: ScheduleType;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  scheduleWeekday: number | null;
  scheduleDayOfMonth: number | null;
  trackingType: TrackingType;
  trackingStartValue: string | number | null;
  trackingTargetValue: string | number | null;
  trackingCurrentValue: string | number | null;
  trackingUnit: string | null;
  monthlyTrackingValues: string | null;
  monthlyChecklistValues: string | null;
  completedOccurrenceDates: string | null;
  progress: number;
  isCompleted: boolean;
  trackingSummary: string;
  scheduleSummary: string;
  occurrences: ActivityOccurrence[];
  occurrenceCompleted: number;
  occurrenceTotal: number;
  evaluationMode?: "meses" | "vigencia";
  validFrom?: string | null;
  validUntil?: string | null;
}

interface ActivityForm {
  requirement: string;
  description: string;
  responsible: string;
  observations: string;
  scheduleType: ScheduleType;
  dueDate: string;
  scheduleStartDate: string;
  scheduleEndDate: string;
  scheduleWeekday: number;
  scheduleDayOfMonth: number;
  trackingType: TrackingType;
  trackingStartValue: number;
  trackingTargetValue: number;
  trackingCurrentValue: number;
  trackingUnit: string;
  monthlyTrackingValues: number[];
  monthlyChecklistValues: boolean[];
}

function todayText() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMonthlyNumbers(value: string | null): number[] {
  if (!value) return Array(12).fill(0);
  try {
    const parsed = JSON.parse(value);
    return Array.from({ length: 12 }, (_, index) => numberValue(parsed?.[index]));
  } catch {
    return Array(12).fill(0);
  }
}

function parseMonthlyChecklist(value: string | null): boolean[] {
  if (!value) return Array(12).fill(false);
  try {
    const parsed = JSON.parse(value);
    return Array.from({ length: 12 }, (_, index) => Boolean(parsed?.[index]));
  } catch {
    return Array(12).fill(false);
  }
}

function calculateFormProgress(form: ActivityForm): number {
  const start = form.trackingStartValue;
  const target = form.trackingTargetValue;
  const calculate = (current: number) => {
    if (target === start) return current >= target ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round(((current - start) / (target - start)) * 100)));
  };
  if (form.trackingType === "mensual_checklist") {
    return Math.round((form.monthlyChecklistValues.filter(Boolean).length / 12) * 100);
  }
  if (form.trackingType === "mensual_sumatoria") {
    return calculate(form.monthlyTrackingValues.reduce((total, value) => total + value, 0));
  }
  if (form.trackingType === "mensual_promedio") {
    const registered = form.monthlyTrackingValues.filter(value => value !== 0);
    const average = registered.length
      ? registered.reduce((total, value) => total + value, 0) / registered.length
      : 0;
    return calculate(average);
  }
  return calculate(form.trackingCurrentValue);
}

function emptyForm(): ActivityForm {
  const today = todayText();
  return {
    requirement: "",
    description: "",
    responsible: "",
    observations: "",
    scheduleType: "once",
    dueDate: today,
    scheduleStartDate: today,
    scheduleEndDate: "",
    scheduleWeekday: new Date(`${today}T12:00:00`).getDay(),
    scheduleDayOfMonth: new Date(`${today}T12:00:00`).getDate(),
    trackingType: "puntual",
    trackingStartValue: 0,
    trackingTargetValue: 100,
    trackingCurrentValue: 0,
    trackingUnit: "%",
    monthlyTrackingValues: Array(12).fill(0),
    monthlyChecklistValues: Array(12).fill(false),
  };
}

function formFromActivity(activity: Activity): ActivityForm {
  const fallbackDate = activity.scheduleStartDate || activity.dueDate || todayText();
  const fallbackDateValue = new Date(`${fallbackDate}T12:00:00`);
  return {
    requirement: activity.requirement,
    description: activity.description || "",
    responsible: activity.responsible || "",
    observations: activity.observations || "",
    scheduleType: activity.scheduleType || "once",
    dueDate: activity.dueDate || fallbackDate,
    scheduleStartDate: activity.scheduleStartDate || fallbackDate,
    scheduleEndDate: activity.scheduleEndDate || "",
    scheduleWeekday: activity.scheduleWeekday ?? fallbackDateValue.getDay(),
    scheduleDayOfMonth: activity.scheduleDayOfMonth ?? fallbackDateValue.getDate(),
    trackingType: activity.trackingType || "puntual",
    trackingStartValue: numberValue(activity.trackingStartValue),
    trackingTargetValue: numberValue(activity.trackingTargetValue, 100),
    trackingCurrentValue: numberValue(activity.trackingCurrentValue, activity.progress),
    trackingUnit: activity.trackingUnit || "%",
    monthlyTrackingValues: parseMonthlyNumbers(activity.monthlyTrackingValues),
    monthlyChecklistValues: parseMonthlyChecklist(activity.monthlyChecklistValues),
  };
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function progressClass(progress: number) {
  if (progress >= 80) return "bg-green-500";
  if (progress >= 50) return "bg-yellow-400";
  return "bg-red-400";
}

function progressTextClass(progress: number) {
  if (progress >= 80) return "text-green-700";
  if (progress >= 50) return "text-yellow-700";
  return "text-red-700";
}

function TrackingInputs({
  form,
  setForm,
}: {
  form: ActivityForm;
  setForm: (form: ActivityForm) => void;
}) {
  const updateMonthlyValue = (index: number, value: number) => {
    const monthlyTrackingValues = [...form.monthlyTrackingValues];
    monthlyTrackingValues[index] = value;
    setForm({ ...form, monthlyTrackingValues });
  };
  const toggleMonthlyChecklist = (index: number) => {
    const monthlyChecklistValues = [...form.monthlyChecklistValues];
    monthlyChecklistValues[index] = !monthlyChecklistValues[index];
    setForm({ ...form, monthlyChecklistValues });
  };

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de seguimiento</label>
        <select
          value={form.trackingType}
          onChange={event => setForm({ ...form, trackingType: event.target.value as TrackingType })}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(TRACKING_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Punto de partida</label>
          <Input type="number" value={form.trackingStartValue} onChange={event => setForm({ ...form, trackingStartValue: numberValue(event.target.value) })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Meta</label>
          <Input type="number" value={form.trackingTargetValue} onChange={event => setForm({ ...form, trackingTargetValue: numberValue(event.target.value, 100) })} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Unidad de medida</label>
          <Input value={form.trackingUnit} onChange={event => setForm({ ...form, trackingUnit: event.target.value })} placeholder="%, visitas, unidades…" />
        </div>
        {form.trackingType === "puntual" && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Avance actual</label>
            <Input type="number" value={form.trackingCurrentValue} onChange={event => setForm({ ...form, trackingCurrentValue: numberValue(event.target.value) })} />
          </div>
        )}
      </div>

      {(form.trackingType === "mensual_sumatoria" || form.trackingType === "mensual_promedio") && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">Valores mensuales</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12 gap-2">
            {MONTHS.map((month, index) => (
              <label key={month} className="text-center text-xs text-slate-600">
                <span className="mb-1 block font-semibold">{month}</span>
                <Input className="h-8 px-1 text-center" type="number" value={form.monthlyTrackingValues[index]} onChange={event => updateMonthlyValue(index, numberValue(event.target.value))} />
              </label>
            ))}
          </div>
        </div>
      )}

      {form.trackingType === "mensual_checklist" && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">Lista de verificación mensual</p>
          <div className="flex flex-wrap gap-2">
            {MONTHS.map((month, index) => {
              const selected = form.monthlyChecklistValues[index];
              return (
                <button
                  type="button"
                  key={month}
                  onClick={() => toggleMonthlyChecklist(index)}
                  className={`h-10 w-12 rounded border text-xs font-semibold transition-colors ${selected ? "border-green-600 bg-green-500 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-green-400"}`}
                >
                  {selected ? "✓ " : ""}{month}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 rounded bg-white p-3 text-sm">
        <span className="font-semibold text-gray-700">Avance calculado</span>
        <span className={`text-lg font-bold ${progressTextClass(calculateFormProgress(form))}`}>{calculateFormProgress(form)}%</span>
      </div>
    </div>
  );
}

function ScheduleInputs({
  form,
  setForm,
}: {
  form: ActivityForm;
  setForm: (form: ActivityForm) => void;
}) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Programación</label>
        <select
          value={form.scheduleType}
          onChange={event => setForm({ ...form, scheduleType: event.target.value as ScheduleType })}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="once">Una vez (fecha puntual)</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </select>
      </div>

      {form.scheduleType === "once" ? (
        <div className="max-w-sm">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de la actividad *</label>
          <Input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value, scheduleStartDate: event.target.value })} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Programar desde *</label>
              <Input type="date" value={form.scheduleStartDate} onChange={event => setForm({ ...form, scheduleStartDate: event.target.value, dueDate: event.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Programar hasta *</label>
              <Input type="date" value={form.scheduleEndDate} onChange={event => setForm({ ...form, scheduleEndDate: event.target.value })} />
            </div>
          </div>
          {form.scheduleType === "weekly" ? (
            <div className="max-w-sm">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Día de la semana</label>
              <select value={form.scheduleWeekday} onChange={event => setForm({ ...form, scheduleWeekday: numberValue(event.target.value) })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                {WEEKDAYS.map((weekday, index) => <option key={weekday} value={index}>{weekday}</option>)}
              </select>
            </div>
          ) : (
            <div className="max-w-sm">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Día de cada mes</label>
              <Input type="number" min="1" max="31" value={form.scheduleDayOfMonth} onChange={event => setForm({ ...form, scheduleDayOfMonth: Math.min(31, Math.max(1, numberValue(event.target.value, 1))) })} />
            </div>
          )}
        </>
      )}
      <p className="text-xs text-indigo-700">La programación alimenta el Cronograma consolidado. El Tipo de seguimiento mide el avance de la actividad.</p>
    </div>
  );
}

export default function ProcessCompliances() {
  const [, navigate] = useLocation();
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const queryProcessId = searchParams.get("processId");
  const queryCompanyId = searchParams.get("companyId");
  const selectedProcessId = queryProcessId || localStorage.getItem("selectedProcessId");
  const processId = selectedProcessId ? Number.parseInt(selectedProcessId, 10) : 0;
  const backUrl = queryProcessId
    ? `/process-characterization?processId=${queryProcessId}${queryCompanyId ? `&companyId=${queryCompanyId}` : ""}`
    : "/process-characterization";

  const [activities, setActivities] = useState<Activity[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [lastFormSnapshot, setLastFormSnapshot] = useState("");

  const { data: activitiesData, isLoading } = trpc.processCompliances.list.useQuery(
    { processId },
    { enabled: processId > 0 }
  );
  const createMutation = trpc.processCompliances.create.useMutation();
  const updateMutation = trpc.processCompliances.update.useMutation();
  const deleteMutation = trpc.processCompliances.delete.useMutation();
  const occurrenceMutation = trpc.processCompliances.setOccurrenceCompleted.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (activitiesData) setActivities(activitiesData as unknown as Activity[]);
  }, [activitiesData]);

  const summary = useMemo(() => {
    const total = activities.length;
    const average = total
      ? Math.round(activities.reduce((sum, activity) => sum + activity.progress, 0) / total)
      : 0;
    const completed = activities.filter(activity => activity.progress >= 100).length;
    return { total, average, completed };
  }, [activities]);

  const buildPayload = () => ({
    processId,
    requirement: form.requirement.trim(),
    description: form.description.trim() || undefined,
    responsible: form.responsible.trim() || undefined,
    observations: form.observations.trim() || undefined,
    scheduleType: form.scheduleType,
    dueDate: form.dueDate || "",
    scheduleStartDate: form.scheduleStartDate || "",
    scheduleEndDate: form.scheduleEndDate || "",
    scheduleWeekday: form.scheduleType === "weekly" ? form.scheduleWeekday : null,
    scheduleDayOfMonth: form.scheduleType === "monthly" ? form.scheduleDayOfMonth : null,
    trackingType: form.trackingType,
    trackingStartValue: form.trackingStartValue,
    trackingTargetValue: form.trackingTargetValue,
    trackingCurrentValue: form.trackingCurrentValue,
    trackingUnit: form.trackingUnit.trim() || "%",
    monthlyTrackingValues: form.monthlyTrackingValues,
    monthlyChecklistValues: form.monthlyChecklistValues,
  });

  const validateForm = () => {
    if (!form.requirement.trim()) {
      toast.error("Escriba el nombre de la actividad.");
      return false;
    }
    if (form.scheduleType === "once" && !form.dueDate) {
      toast.error("Defina la fecha de la actividad.");
      return false;
    }
    if (form.scheduleType !== "once" && (!form.scheduleStartDate || !form.scheduleEndDate)) {
      toast.error("Defina las fechas inicial y final de la programación.");
      return false;
    }
    return true;
  };

  const refreshActivities = async () => {
    await utils.processCompliances.list.invalidate({ processId });
  };

  const addActivity = async () => {
    if (!validateForm()) return;
    try {
      await createMutation.mutateAsync(buildPayload());
      toast.success("Actividad agregada correctamente");
      setForm(emptyForm());
      setLastFormSnapshot("");
      await refreshActivities();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo agregar la actividad.");
    }
  };

  const saveActivity = async (silent = false) => {
    if (!editingId || !validateForm()) return;
    try {
      await updateMutation.mutateAsync({ id: editingId, ...buildPayload() });
      setLastFormSnapshot(JSON.stringify(form));
      if (!silent) toast.success("Actividad actualizada correctamente");
      await refreshActivities();
    } catch (error: any) {
      if (!silent) toast.error(error?.message || "No se pudo actualizar la actividad.");
    }
  };

  useEffect(() => {
    if (!editingId || !form.requirement.trim()) return;
    const snapshot = JSON.stringify(form);
    if (snapshot === lastFormSnapshot) return;
    const timer = window.setTimeout(() => void saveActivity(true), 1400);
    return () => window.clearTimeout(timer);
  }, [form, editingId, lastFormSnapshot]);

  const editActivity = (activity: Activity) => {
    const nextForm = formFromActivity(activity);
    setForm(nextForm);
    setLastFormSnapshot(JSON.stringify(nextForm));
    setEditingId(activity.id);
    setExpandedId(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const deleteActivity = async (activity: Activity) => {
    if (!confirm(`¿Eliminar la actividad “${activity.requirement}”? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteMutation.mutateAsync({ id: activity.id });
      toast.success("Actividad eliminada correctamente");
      if (editingId === activity.id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await refreshActivities();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo eliminar la actividad.");
    }
  };

  const toggleOccurrence = async (activity: Activity, occurrence: ActivityOccurrence) => {
    try {
      await occurrenceMutation.mutateAsync({
        id: activity.id,
        occurrenceDate: occurrence.date,
        completed: !occurrence.completed,
      });
      await refreshActivities();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar la ocurrencia.");
    }
  };

  if (!processId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6 flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="pt-6 text-center"><p className="text-gray-600 mb-4">Seleccione un proceso antes de gestionar actividades.</p><Button onClick={() => navigate("/process-characterization")}>Volver</Button></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-bold text-gray-900">Actividades del proceso</h1>
              <ActivePlanningCycleBadge companyId={Number(queryCompanyId || localStorage.getItem("selectedCompanyId"))} />
            </div>
            <Button variant="outline" onClick={() => navigate(backUrl)}>← Volver</Button>
          </div>
          <p className="max-w-3xl text-sm text-slate-600">Planifique las actividades diarias, semanales o mensuales del proceso. Cada programación se refleja automáticamente en el Cronograma consolidado.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <Card className="bg-white border-l-4 border-l-green-500"><CardContent className="pt-5"><p className="text-sm text-gray-600">Total de actividades</p><p className="mt-1 text-3xl font-bold text-green-600">{summary.total}</p></CardContent></Card>
            <Card className="bg-white border-l-4 border-l-blue-500"><CardContent className="pt-5"><p className="text-sm text-gray-600">% promedio de avance</p><p className="mt-1 text-3xl font-bold text-blue-600">{summary.average}%</p></CardContent></Card>
            <Card className="bg-white border-l-4 border-l-emerald-500"><CardContent className="pt-5"><p className="text-sm text-gray-600">Actividades completadas</p><p className="mt-1 text-3xl font-bold text-emerald-600">{summary.completed}</p></CardContent></Card>
          </div>
        </div>

        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-blue-700" /><h2 className="text-2xl font-bold text-gray-900">Actividades registradas</h2></div>
          {isLoading ? <Card><CardContent className="py-8 text-center text-gray-500">Cargando actividades…</CardContent></Card> : activities.length === 0 ? (
            <Card className="bg-white"><CardContent className="py-10 text-center text-gray-500"><CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" /><p>No hay actividades registradas aún.</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {activities.map(activity => {
                const expanded = expandedId === activity.id;
                const shownOccurrences = activity.occurrences.slice(0, 24);
                return (
                  <Card key={activity.id} className="bg-white overflow-hidden">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : activity.id)} className="w-full p-5 text-left hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{activity.requirement}</h3>
                            <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{activity.scheduleSummary}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span>Seguimiento: {activity.trackingSummary}</span>
                            {activity.responsible && <span>Responsable: {activity.responsible}</span>}
                            {activity.occurrenceTotal > 1 && <span>{activity.occurrenceCompleted} de {activity.occurrenceTotal} ocurrencias registradas</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-24"><div className="mb-1 flex justify-between text-xs font-semibold"><span>Avance</span><span className={progressTextClass(activity.progress)}>{activity.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className={`h-full ${progressClass(activity.progress)}`} style={{ width: `${activity.progress}%` }} /></div></div>
                          <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                    </button>
                    {expanded && (
                      <CardContent className="border-t pt-5 space-y-5">
                        {activity.description && <div><p className="text-sm font-semibold text-slate-700">Descripción de la actividad</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{activity.description}</p></div>}
                        {activity.observations && <div><p className="text-sm font-semibold text-slate-700">Observaciones</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{activity.observations}</p></div>}
                        <div className="rounded-lg border border-sky-100 bg-sky-50 p-4"><p className="text-sm font-semibold text-sky-900">Tipo de seguimiento: {activity.trackingSummary}</p><p className="mt-1 text-sm text-sky-800">Avance calculado: <strong>{activity.progress}%</strong>{activity.trackingUnit ? ` · Unidad: ${activity.trackingUnit}` : ""}</p></div>
                        {activity.evaluationMode === "vigencia" && activity.validUntil && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Dato histórico de vigencia: {activity.validFrom ? `desde ${formatDate(activity.validFrom)} ` : ""}hasta {formatDate(activity.validUntil)}.</div>}
                        {shownOccurrences.length > 0 && <div><p className="mb-2 text-sm font-semibold text-slate-700">Programación</p><div className="flex flex-wrap gap-2">{shownOccurrences.map(occurrence => <button type="button" key={occurrence.date} onClick={() => void toggleOccurrence(activity, occurrence)} disabled={occurrenceMutation.isPending} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${occurrence.completed ? "border-green-600 bg-green-500 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-green-400"}`} title="Marcar o desmarcar como realizada">{occurrence.completed ? "✓ " : ""}{formatDate(occurrence.date)}</button>)}</div>{activity.occurrenceTotal > shownOccurrences.length && <p className="mt-2 text-xs text-slate-500">Se muestran las primeras 24 ocurrencias; el Cronograma consolidado conserva toda la programación.</p>}</div>}
                        <div className="flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" size="sm" onClick={() => editActivity(activity)}><Pencil className="mr-1 h-4 w-4" />Editar</Button><Button variant="destructive" size="sm" onClick={() => void deleteActivity(activity)}><Trash2 className="mr-1 h-4 w-4" />Eliminar</Button></div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <Card className="mb-8 bg-white" id="activity-form">
          <CardHeader className="border-b bg-gradient-to-r from-green-50 to-blue-50"><CardTitle>{editingId ? "Editar actividad" : "Nueva actividad"}</CardTitle></CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Actividad *</label><Textarea value={form.requirement} onChange={event => setForm({ ...form, requirement: event.target.value })} placeholder="Nombre o título de la actividad" className="min-h-[80px]" /></div>
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Descripción de la actividad</label><Textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Describe qué se debe realizar" className="min-h-[80px]" /></div>
            <div className="max-w-xl"><label className="mb-2 block text-sm font-semibold text-gray-700">Responsable</label><Input value={form.responsible} onChange={event => setForm({ ...form, responsible: event.target.value })} placeholder="Nombre del responsable" /></div>
            <ScheduleInputs form={form} setForm={setForm} />
            <TrackingInputs form={form} setForm={setForm} />
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Observaciones</label><Textarea value={form.observations} onChange={event => setForm({ ...form, observations: event.target.value })} placeholder="Agrega observaciones si lo requieres" className="min-h-[80px]" /></div>
            <div className="flex flex-wrap gap-2 pt-2">
              {editingId ? <><Button onClick={() => void saveActivity(false)} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">{updateMutation.isPending ? "Actualizando…" : "Actualizar actividad"}</Button><Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm()); setLastFormSnapshot(""); }}>Cancelar</Button><span className="self-center text-xs text-slate-500">Los cambios se guardan automáticamente mientras edita.</span></> : <Button onClick={() => void addActivity()} disabled={createMutation.isPending} className="bg-green-600 hover:bg-green-700"><Plus className="mr-1 h-4 w-4" />{createMutation.isPending ? "Agregando…" : "Agregar actividad"}</Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
