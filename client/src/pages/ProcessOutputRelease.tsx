import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";

type MapOutput = {
  id?: number | string;
  sourceOutputKey?: string;
  salidas?: string;
  entregables?: string;
  doc?: string;
};
type MapSubprocess = { id?: number | string; subproceso?: string };
type OutputPeriod = {
  id: number;
  status: "pending" | "released" | "exception";
  scheduledDate: string | Date;
  releasedAt: string | Date | null;
  observations: string | null;
  evidenceCount: number;
};
type OutputControl = {
  id: number;
  sourceOutputKey: string;
  sourceSubprocessName: string | null;
  output: string;
  deliverable: string;
  documentation: string | null;
  sourceStillInMap: boolean;
  acceptanceCriteria: string | null;
  verificationMethod: string | null;
  verificationDetail: string | null;
  frequency: "por_evento" | "diaria" | "semanal" | "mensual" | "trimestral" | "anual" | "otra";
  frequencyDetail: string | null;
  isActive: boolean;
  revision: number;
  archivedAt: string | Date | null;
  periods: OutputPeriod[];
};

type ControlDraft = {
  sourceSubprocessName: string;
  acceptanceCriteria: string;
  verificationMethod: string | null;
  verificationDetail: string;
  frequency: OutputControl["frequency"];
  frequencyDetail: string;
  isActive: boolean;
  initialScheduledDate: string;
  revision: number;
};

const VERIFICATION_LABELS: Record<string, string> = {
  revision_documental: "Revisión documental",
  muestreo: "Muestreo",
  revision_datos: "Revisión de datos o registro",
  confirmacion_cliente: "Confirmación de cliente/usuario",
  otra: "Otra",
};
const FREQUENCY_LABELS: Record<OutputControl["frequency"], string> = {
  por_evento: "Por evento o entrega",
  diaria: "Diaria",
  semanal: "Semanal",
  mensual: "Mensual",
  trimestral: "Trimestral",
  anual: "Anual",
  otra: "Otra",
};

function dateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function outputKey(output: MapOutput, index: number) {
  return output.sourceOutputKey?.trim() || `legacy:${output.id ?? index + 1}`;
}

function controlDraft(control: OutputControl): ControlDraft {
  return {
    sourceSubprocessName: control.sourceSubprocessName || "",
    acceptanceCriteria: control.acceptanceCriteria || "",
    verificationMethod: control.verificationMethod,
    verificationDetail: control.verificationDetail || "",
    frequency: control.frequency,
    frequencyDetail: control.frequencyDetail || "",
    isActive: control.isActive,
    initialScheduledDate: dateInput(control.periods[0]?.scheduledDate),
    revision: control.revision,
  };
}

function statusLabel(status: OutputPeriod["status"]) {
  if (status === "released") return "Liberada";
  if (status === "exception") return "Con observación";
  return "Pendiente";
}

function statusClass(status: OutputPeriod["status"]) {
  if (status === "released") return "bg-green-100 text-green-700";
  if (status === "exception") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function OutputControlCard({
  control,
  processId,
  subprocesses,
  onRefresh,
  onOpenEvidence,
  onUploadEvidence,
}: {
  control: OutputControl;
  processId: number;
  subprocesses: MapSubprocess[];
  onRefresh: () => void;
  onOpenEvidence: (period: OutputPeriod) => void;
  onUploadEvidence: (period: OutputPeriod) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState<ControlDraft>(() => controlDraft(control));
  const saveTimerRef = useRef<number | null>(null);
  const pendingDraftRef = useRef<ControlDraft | null>(null);
  const draftRef = useRef(draft);
  const revisionRef = useRef(control.revision);
  const savingRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "waiting" | "saving">("idle");
  const update = trpc.processOutputRelease.upsert.useMutation();
  const updatePeriod = trpc.processOutputRelease.updatePeriod.useMutation({
    onSuccess: onRefresh,
    onError: error => toast.error(error.message),
  });
  const archive = trpc.processOutputRelease.archive.useMutation({
    onSuccess: () => {
      toast.success("Salida retirada del control sin borrar su historial");
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    const next = controlDraft(control);
    draftRef.current = next;
    revisionRef.current = control.revision;
    pendingDraftRef.current = null;
    setDraft(next);
  }, [control.id]);
  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    },
    []
  );

  const flushPendingDraft = async () => {
    if (savingRef.current) return;
    const snapshot = pendingDraftRef.current;
    if (!snapshot) {
      setSaveState("idle");
      return;
    }
    pendingDraftRef.current = null;
    savingRef.current = true;
    setSaveState("saving");
    const shouldRefreshSchedule =
      snapshot.isActive !== control.isActive ||
      (snapshot.isActive && Boolean(snapshot.initialScheduledDate) && !control.periods.length);
    try {
      const result = await update.mutateAsync({
        processId,
        sourceOutputKey: control.sourceOutputKey,
        sourceSubprocessName: snapshot.sourceSubprocessName || undefined,
        acceptanceCriteria: snapshot.acceptanceCriteria || undefined,
        verificationMethod: snapshot.verificationMethod as any,
        verificationDetail: snapshot.verificationDetail || undefined,
        frequency: snapshot.frequency,
        frequencyDetail: snapshot.frequencyDetail || undefined,
        isActive: snapshot.isActive,
        initialScheduledDate: snapshot.initialScheduledDate || undefined,
        expectedRevision: revisionRef.current,
      });
      revisionRef.current = result.revision;
      draftRef.current = { ...draftRef.current, revision: result.revision };
      setDraft(current => ({ ...current, revision: result.revision }));
      if (shouldRefreshSchedule) onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    } finally {
      savingRef.current = false;
      if (pendingDraftRef.current) {
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null;
          void flushPendingDraft();
        }, 0);
      } else {
        setSaveState("idle");
      }
    }
  };

  const persist = (next: ControlDraft, immediately = false) => {
    pendingDraftRef.current = next;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSaveState("waiting");
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushPendingDraft();
    }, immediately ? 0 : 1_400);
  };
  const patch = (values: Partial<ControlDraft>, immediately = false) => {
    const next = { ...draftRef.current, ...values };
    draftRef.current = next;
    setDraft(next);
    persist(next, immediately);
  };
  const updatePeriodStatus = (period: OutputPeriod, status: OutputPeriod["status"], observations?: string) => {
    updatePeriod.mutate({ periodId: period.id, status, observations: observations ?? period.observations ?? undefined });
  };

  return (
    <Card
      id={`output-control-${control.id}`}
      className={`overflow-hidden border ${!control.sourceStillInMap ? "border-amber-300" : control.isActive ? "border-indigo-200" : "border-slate-200"}`}
    >
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-slate-50 px-5 py-4">
          <button type="button" onClick={() => setExpanded(value => !value)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
            <ChevronDown className={`mt-0.5 h-5 w-5 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${control.isActive ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-700"}`}>
                  {control.isActive ? "Control activo" : "Borrador"}
                </span>
                {control.sourceSubprocessName && <span className="text-xs font-semibold text-slate-500">{control.sourceSubprocessName}</span>}
              </div>
              <h2 className="font-semibold text-slate-800">{control.output}</h2>
              <p className="mt-1 text-sm text-slate-600">Entregable: {control.deliverable}</p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            {saveState === "waiting" && <span className="text-xs text-slate-500">Cambios pendientes…</span>}
            {saveState === "saving" && <span className="text-xs text-blue-600">Guardando…</span>}
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={archive.isPending}
              onClick={() => {
                if (confirm("¿Retirar esta salida del control? Se conservará su historial de liberaciones.")) archive.mutate({ id: control.id });
              }}
            >
              <Archive className="mr-1 h-4 w-4" /> Retirar
            </Button>
          </div>
        </div>

        {!control.sourceStillInMap && (
          <div className="flex gap-2 border-y border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Esta salida ya no está en el Mapa de Subprocesos. Su historial se conserva, pero conviene retirarla o volver a definirla en el mapa.
          </div>
        )}

        {expanded && (
          <div className="space-y-5 p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Subproceso relacionado</label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.sourceSubprocessName} onChange={event => patch({ sourceSubprocessName: event.target.value }, true)}>
                  <option value="">No especificado</option>
                  {subprocesses.map((row, index) => {
                    const label = row.subproceso?.trim() || `Subproceso ${index + 1}`;
                    return <option key={`${row.id ?? index}-${label}`} value={label}>{label}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Método de verificación</label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.verificationMethod || ""} onChange={event => patch({ verificationMethod: event.target.value || null }, true)}>
                  <option value="">Seleccione cómo se verificará</option>
                  {Object.entries(VERIFICATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Criterios de aceptación</label>
                <Textarea value={draft.acceptanceCriteria} placeholder="¿Qué debe cumplir esta salida para ser liberada?" className="min-h-20" onChange={event => patch({ acceptanceCriteria: event.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Frecuencia de control</label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.frequency} onChange={event => patch({ frequency: event.target.value as OutputControl["frequency"] }, true)}>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{control.periods.length ? "Fecha programada" : "Primera fecha programada"}</label>
                <Input type="date" value={draft.initialScheduledDate} disabled={control.periods.length > 0} onChange={event => patch({ initialScheduledDate: event.target.value }, true)} />
              </div>
              {(draft.frequency === "otra" || draft.verificationMethod === "otra") && (
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Detalle del método o frecuencia</label>
                  <Input value={draft.frequency === "otra" ? draft.frequencyDetail : draft.verificationDetail} onChange={event => patch(draft.frequency === "otra" ? { frequencyDetail: event.target.value } : { verificationDetail: event.target.value })} placeholder="Explique brevemente" />
                </div>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={event => {
                  if (event.target.checked && (!draft.acceptanceCriteria.trim() || !draft.verificationMethod)) {
                    toast.error("Defina los criterios de aceptación y el método de verificación antes de activar el control.");
                    return;
                  }
                  patch({ isActive: event.target.checked }, true);
                }}
              />
              Activar esta salida crítica en el Cronograma Consolidado e Indicadores
            </label>
            <p className="text-xs text-slate-500">Mientras escribe, ISGE espera una breve pausa y guarda el texto automáticamente sin mover el cursor. Para activar, defina al menos los criterios y el método de verificación. La evidencia al liberar es opcional.</p>

            {control.documentation && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <FileText className="mr-2 inline h-4 w-4 text-slate-500" />
                <span className="font-semibold text-slate-700">Documentos que normalmente respaldan esta salida:</span> {control.documentation}
                <p className="mt-1 text-xs text-slate-500">Es una guía tomada del Mapa de Subprocesos para saber qué revisar. No se adjunta ni se exige automáticamente; la evidencia de cada liberación sigue siendo opcional.</p>
              </div>
            )}

            <div className="border-t pt-4">
              <h3 className="font-semibold text-slate-800">Liberaciones programadas</h3>
              {!control.periods.length ? (
                <p className="mt-2 text-sm text-slate-500">Indique una primera fecha y active el control para programar la liberación.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {control.periods.map(period => (
                    <div id={`output-period-${period.id}`} key={period.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(period.status)}`}>{statusLabel(period.status)}</span>
                            <span className="text-sm font-semibold text-slate-700">Fecha programada: {new Date(`${dateInput(period.scheduledDate)}T12:00:00`).toLocaleDateString("es-EC")}</span>
                          </div>
                          {period.releasedAt && <p className="mt-1 text-xs text-slate-500">Registrada el {new Date(period.releasedAt).toLocaleString("es-EC")}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => onUploadEvidence(period)}><Upload className="mr-1 h-4 w-4" /> Evidencia opcional</Button>
                          <Button size="sm" variant="outline" onClick={() => onOpenEvidence(period)}>Evidencias ({period.evidenceCount})</Button>
                          {period.status !== "released" && <Button size="sm" className="bg-green-700 hover:bg-green-800" disabled={updatePeriod.isPending} onClick={() => updatePeriodStatus(period, "released")}><CheckCircle2 className="mr-1 h-4 w-4" /> Liberar salida</Button>}
                          {period.status !== "exception" && <Button size="sm" variant="outline" className="border-amber-300 text-amber-800" disabled={updatePeriod.isPending} onClick={() => updatePeriodStatus(period, "exception")}><AlertTriangle className="mr-1 h-4 w-4" /> Con observación</Button>}
                        </div>
                      </div>
                      <Textarea className="mt-3 min-h-16 text-sm" defaultValue={period.observations || ""} placeholder="Observaciones de la verificación o liberación" onBlur={event => updatePeriodStatus(period, period.status, event.target.value)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProcessOutputRelease() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { session: processLeaderSession, isLoading: processLeaderLoading } = useProcessLeaderAuth();
  const { managerCompanyId, isManagerLogin, isLoading: managerLoading } = useManagerAuth();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const urlProcessId = Number(params.get("processId"));
  const urlCompanyId = Number(params.get("companyId"));
  const processId = processLeaderSession?.processId || (urlProcessId > 0 ? urlProcessId : Number(localStorage.getItem("selectedProcessId")) || 0);
  const companyId = processLeaderSession?.companyId || (isManagerLogin ? managerCompanyId : null) || (urlCompanyId > 0 ? urlCompanyId : Number(localStorage.getItem("selectedCompanyId")) || 0);
  const focusControlId = Number(params.get("focusControlId"));
  const focusPeriodId = Number(params.get("focusPeriodId"));
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusedRef = useRef<number | null>(null);
  const [evidencePeriod, setEvidencePeriod] = useState<OutputPeriod | null>(null);
  const [uploadingPeriodId, setUploadingPeriodId] = useState<number | null>(null);

  const mapQuery = trpc.subprocessMap.get.useQuery({ processId }, { enabled: processId > 0 });
  const controlsQuery = trpc.processOutputRelease.list.useQuery({ processId }, { enabled: processId > 0, refetchOnWindowFocus: false });
  const evidenceQuery = trpc.processOutputRelease.listEvidence.useQuery(
    { periodId: evidencePeriod?.id || 0 },
    { enabled: Boolean(evidencePeriod?.id) }
  );
  const utils = trpc.useUtils();
  const createControl = trpc.processOutputRelease.upsert.useMutation({
    onSuccess: () => {
      toast.success("Salida crítica añadida. Complete la configuración; se guardará automáticamente.");
      controlsQuery.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const deleteEvidence = trpc.processOutputRelease.deleteEvidence.useMutation({
    onSuccess: () => evidenceQuery.refetch(),
    onError: error => toast.error(error.message),
  });

  const mapData = mapQuery.data as { salida?: string | null; subprocesos?: string | null } | null | undefined;
  const outputs = useMemo(() => {
    try {
      const rows = JSON.parse(mapData?.salida || "[]");
      return Array.isArray(rows) ? rows as MapOutput[] : [];
    } catch { return []; }
  }, [mapData?.salida]);
  const subprocesses = useMemo(() => {
    try {
      const rows = JSON.parse(mapData?.subprocesos || "[]");
      return Array.isArray(rows) ? rows as MapSubprocess[] : [];
    } catch { return []; }
  }, [mapData?.subprocesos]);
  const controls = (controlsQuery.data?.controls || []) as OutputControl[];
  const configuredKeys = new Set(controls.map(control => control.sourceOutputKey));

  useEffect(() => {
    if (!focusControlId || focusedRef.current === focusControlId || !controls.length) return;
    if (!controls.some(control => control.id === focusControlId)) return;
    focusedRef.current = focusControlId;
    window.setTimeout(() => {
      const target = document.getElementById(`output-period-${focusPeriodId}`) || document.getElementById(`output-control-${focusControlId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [controls, focusControlId, focusPeriodId]);

  const markCritical = (output: MapOutput, index: number) => {
    createControl.mutate({
      processId,
      sourceOutputKey: outputKey(output, index),
      frequency: "por_evento",
      isActive: false,
    });
  };

  const uploadEvidence = async (period: OutputPeriod, file: File) => {
    if (!companyId) return;
    setUploadingPeriodId(period.id);
    const loading = toast.loading("Subiendo evidencia...");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("companyId", String(companyId));
      form.append("periodId", String(period.id));
      const response = await fetch("/api/upload/output-release-evidence", { method: "POST", body: form, credentials: "include" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || "No se pudo subir la evidencia");
      toast.success("Evidencia subida correctamente", { id: loading });
      controlsQuery.refetch();
      if (evidencePeriod?.id === period.id) evidenceQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la evidencia", { id: loading });
    } finally {
      setUploadingPeriodId(null);
      if (fileInputRefs.current[period.id]) fileInputRefs.current[period.id]!.value = "";
    }
  };

  const backPath = `/process-characterization?processId=${processId}${companyId ? `&companyId=${companyId}` : ""}`;
  if (processLeaderLoading || managerLoading || controlsQuery.isLoading || mapQuery.isLoading) {
    return <DashboardLayout><div className="flex items-center justify-center gap-2 py-16 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Cargando control de salidas...</div></DashboardLayout>;
  }
  if (!processId || !companyId) {
    return <DashboardLayout><div className="py-16 text-center text-slate-600">Seleccione un proceso para controlar sus salidas.</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="sm" onClick={() => setLocation(backPath)}><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Control y liberación de salidas</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Seleccione sólo las salidas críticas del Mapa de Subprocesos. Así el proceso controla y libera lo importante sin repetir su planificación, OTG, reuniones ni actividades actuales.</p>
            </div>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold uppercase text-indigo-700">Salidas críticas activas</p>
            <p className="text-2xl font-bold text-indigo-800">{controlsQuery.data?.summary.scheduledControls ?? 0}</p>
          </div>
        </div>

        <section className="mb-7 rounded-xl border border-sky-200 bg-sky-50 p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800"><Plus className="h-5 w-5 text-sky-700" /> Seleccionar salidas críticas</h2>
          <p className="mt-1 text-sm text-slate-600">Las salidas, entregables y documentos proceden del Mapa de Subprocesos. Al elegir una, su texto no se duplica: el control siempre conserva el vínculo con el mapa.</p>
          {!outputs.filter(output => output.salidas?.trim() || output.entregables?.trim()).length ? (
            <p className="mt-4 rounded-lg border border-dashed border-sky-300 bg-white px-4 py-5 text-sm text-slate-500">Aún no hay salidas o entregables definidos en el Mapa de Subprocesos. Regístrelos allí primero.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {outputs.map((output, index) => {
                const key = outputKey(output, index);
                const configured = configuredKeys.has(key);
                if (!output.salidas?.trim() && !output.entregables?.trim()) return null;
                return (
                  <div key={key} className="rounded-lg border border-sky-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-800">{output.salidas?.trim() || "Salida sin nombre"}</h3>
                    <p className="mt-1 text-sm text-slate-600">Entregable: {output.entregables?.trim() || "Sin entregable definido"}</p>
                    <Button size="sm" className="mt-3 bg-sky-700 hover:bg-sky-800" disabled={configured || createControl.isPending} onClick={() => markCritical(output, index)}>
                      {configured ? <><CheckCircle2 className="mr-1 h-4 w-4" /> Ya está en control</> : <><Plus className="mr-1 h-4 w-4" /> Controlar esta salida</>}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div>
            <h2 className="font-bold text-slate-800">Salidas bajo control</h2>
            <p className="mt-1 text-sm text-slate-500">Configure el criterio una sola vez y registre la liberación de cada período. Todos los cambios se guardan automáticamente.</p>
          </div>
          {!controls.length ? (
            <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-slate-500">Seleccione una salida crítica arriba para iniciar un control ligero y trazable.</CardContent></Card>
          ) : controls.map(control => (
            <div key={control.id} className={control.id === focusControlId ? "rounded-xl ring-2 ring-indigo-500 ring-offset-2" : undefined}>
              {control.periods.map(period => <input key={period.id} ref={element => { fileInputRefs.current[period.id] = element; }} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={event => { const file = event.target.files?.[0]; if (file) uploadEvidence(period, file); }} />)}
              <OutputControlCard control={control} processId={processId} subprocesses={subprocesses} onRefresh={() => controlsQuery.refetch()} onOpenEvidence={setEvidencePeriod} onUploadEvidence={period => fileInputRefs.current[period.id]?.click()} />
            </div>
          ))}
        </section>

        {uploadingPeriodId && <div className="fixed bottom-5 right-5 rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">Subiendo evidencia…</div>}
        {evidencePeriod && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => setEvidencePeriod(null)}>
            <Card className="max-h-[80vh] w-full max-w-lg overflow-auto" onMouseDown={event => event.stopPropagation()}>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-slate-800">Evidencias</h2><p className="text-xs text-slate-500">La evidencia es opcional para liberar una salida.</p></div><Button size="sm" variant="ghost" onClick={() => setEvidencePeriod(null)}>Cerrar</Button></div>
                {evidenceQuery.isLoading ? <div className="py-8 text-center text-sm text-slate-500">Cargando…</div> : !(evidenceQuery.data || []).length ? <div className="py-8 text-center text-sm text-slate-500">No hay evidencias adjuntas.</div> : <div className="space-y-2">{(evidenceQuery.data || []).map((file: any) => <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><a href={file.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-blue-700 hover:underline">{file.fileName}</a><Button size="sm" variant="ghost" className="text-red-600" disabled={deleteEvidence.isPending} onClick={() => { if (confirm("¿Eliminar esta evidencia?")) deleteEvidence.mutate({ id: file.id }); }}>Eliminar</Button></div>)}</div>}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
