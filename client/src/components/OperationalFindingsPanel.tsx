import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCheck, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProcessLinkDialog } from "@/components/ProcessLinkDialog";
import { SourceEvidenceButton } from "@/components/SourceEvidenceButton";
import { trpc } from "@/lib/trpc";

type SourceType = "audit" | "inspection";
type LinkedSourceType = "audit_finding" | "inspection_finding";
type Classification =
  | "major_nc"
  | "minor_nc"
  | "observation"
  | "improvement_opportunity";

type Finding = {
  id: number;
  classification: Classification;
  finding: string;
  closureTask: string;
  referenceResponsible: string | null;
  targetDate: Date | string | null;
  completed: boolean;
};

const classificationOptions: Array<{ value: Classification; label: string; tone: string }> = [
  { value: "major_nc", label: "No conformidad mayor", tone: "border-red-200 bg-red-50 text-red-800" },
  { value: "minor_nc", label: "No conformidad menor", tone: "border-orange-200 bg-orange-50 text-orange-800" },
  { value: "observation", label: "Observación", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  { value: "improvement_opportunity", label: "Oportunidad de mejora", tone: "border-blue-200 bg-blue-50 text-blue-800" },
];

function dateInputValue(value: Date | string | null) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function FindingCard({
  companyId,
  sourceType,
  value,
  onChanged,
}: {
  companyId: number;
  sourceType: SourceType;
  value: Finding;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    classification: value.classification,
    finding: value.finding,
    closureTask: value.closureTask,
    referenceResponsible: value.referenceResponsible || "",
    targetDate: dateInputValue(value.targetDate),
    completed: Boolean(value.completed),
  }));
  const [linkDialog, setLinkDialog] = useState(false);
  const utils = trpc.useUtils();
  const linkedSourceType: LinkedSourceType = sourceType === "audit" ? "audit_finding" : "inspection_finding";
  const progress = trpc.linkedCommitments.listSourceProgress.useQuery({
    companyId,
    sourceType: linkedSourceType,
    sourceId: value.id,
  });
  const update = trpc.operationalFindings.update.useMutation({
    onSuccess: () => {
      utils.operationalFindings.list.invalidate();
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.operationalFindings.delete.useMutation({
    onSuccess: () => {
      toast.success("Hallazgo eliminado");
      onChanged();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    setDraft({
      classification: value.classification,
      finding: value.finding,
      closureTask: value.closureTask,
      referenceResponsible: value.referenceResponsible || "",
      targetDate: dateInputValue(value.targetDate),
      completed: Boolean(value.completed),
    });
  }, [value]);

  const classification = classificationOptions.find(option => option.value === draft.classification)!;
  const isInspection = sourceType === "inspection";
  const hasLinks = (progress.data?.total || 0) > 0;
  const change = <K extends keyof typeof draft>(field: K, next: (typeof draft)[K]) => {
    setDraft(current => ({ ...current, [field]: next }));
    window.setTimeout(() => {
      update.mutate({
        id: value.id,
        companyId,
        [field]: field === "referenceResponsible" ? (next || null) : next,
      } as Parameters<typeof update.mutate>[0]);
    }, 350);
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {isInspection ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            Hallazgo
          </span>
        ) : (
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classification.tone}`}>
            {classification.label}
          </span>
        )}
        {hasLinks && (
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
            Procesos: {progress.data?.fulfilled || 0} de {progress.data?.total || 0} cumplidos
          </span>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {!isInspection && (
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Clasificación
            <select
              value={draft.classification}
              onChange={event => change("classification", event.target.value as Classification)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {classificationOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        )}
        <label className={`grid gap-1 text-sm font-medium text-slate-700 ${isInspection ? "lg:col-span-2" : ""}`}>
          Fecha objetivo de cierre
          <Input type="date" value={draft.targetDate} onChange={event => change("targetDate", event.target.value)} />
        </label>
      </div>
      <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
        Texto del hallazgo
        <Textarea value={draft.finding} onChange={event => change("finding", event.target.value)} rows={3} placeholder="Describa el hallazgo identificado" />
      </label>
      <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
        Tarea para cerrar el hallazgo
        <Textarea value={draft.closureTask} onChange={event => change("closureTask", event.target.value)} rows={2} placeholder="Defina la acción correctiva o de mejora" />
      </label>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Responsable de referencia <span className="font-normal text-slate-400">(opcional)</span>
          <Input value={draft.referenceResponsible} onChange={event => change("referenceResponsible", event.target.value)} placeholder="Nombre o cargo" />
        </label>
        <div className={`flex min-h-10 items-center rounded-md border px-3 text-sm font-medium ${hasLinks ? "border-teal-200 bg-teal-50 text-teal-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {hasLinks
            ? `Cierre: ${progress.data?.fulfilled || 0} de ${progress.data?.total || 0}`
            : "Pendiente de vincular"}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="border-teal-300 text-teal-800 hover:bg-teal-50" onClick={() => setLinkDialog(true)}>
            <Link2 className="mr-1 h-4 w-4" /> Vincular
          </Button>
          {hasLinks && (
            <SourceEvidenceButton
              companyId={companyId}
              sourceType={linkedSourceType}
              sourceId={value.id}
              compact
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => {
              if (confirm("¿Eliminar este hallazgo? Si tiene procesos vinculados, también se retirará esa responsabilidad de cada proceso y sus evidencias asociadas.")) remove.mutate({ id: value.id, companyId });
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className={`mt-2 text-xs ${hasLinks ? "text-teal-800" : "text-amber-800"}`}>
        {hasLinks
          ? "El cierre se confirma desde el proceso responsable vinculado y actualiza automáticamente el indicador."
          : "Para cerrar este hallazgo, seleccione Vincular y asígnelo al proceso responsable."}
      </p>
      {linkDialog && (
        <ProcessLinkDialog
          companyId={companyId}
          sourceType={linkedSourceType}
          sourceId={value.id}
          title={draft.closureTask || "Cierre de hallazgo"}
          onClose={() => setLinkDialog(false)}
          onLinked={onChanged}
        />
      )}
    </article>
  );
}

export function OperationalFindingsPanel({
  companyId,
  sourceType,
  sourceId,
  title = "Gestionar hallazgos",
  onSummaryChanged,
}: {
  companyId: number;
  sourceType: SourceType;
  sourceId: number;
  title?: string;
  onSummaryChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newFinding, setNewFinding] = useState({
    classification: "observation" as Classification,
    finding: "",
    closureTask: "",
    referenceResponsible: "",
    targetDate: "",
  });
  const { data = [], isLoading, refetch } = trpc.operationalFindings.list.useQuery(
    { companyId, sourceType, sourceId },
    { enabled: expanded }
  );
  const create = trpc.operationalFindings.create.useMutation({
    onSuccess: () => {
      toast.success("Hallazgo agregado");
      setNewFinding({ classification: "observation", finding: "", closureTask: "", referenceResponsible: "", targetDate: "" });
      setShowNew(false);
      refetch();
      onSummaryChanged();
    },
    onError: error => toast.error(error.message),
  });
  const isInspection = sourceType === "inspection";
  const plural = data.length === 1 ? "hallazgo operativo" : "hallazgos operativos";
  const canCreate = newFinding.finding.trim().length > 0 && newFinding.closureTask.trim().length > 0;
  const entries = useMemo(() => data as Finding[], [data]);

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{expanded ? `${entries.length} ${plural}` : "Detalle, tareas de cierre y responsables por proceso"}</p>
        </div>
        <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100" onClick={() => setExpanded(value => !value)}>
          <ClipboardCheck className="mr-1 h-4 w-4" />
          {expanded ? "Ocultar hallazgos" : title}
          {expanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
        </Button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando hallazgos...</div>
          ) : entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-blue-200 bg-white px-3 py-4 text-sm text-slate-500">Aún no hay hallazgos operativos. Los conteos históricos de la cabecera se conservarán cuando agregue el primero.</p>
          ) : (
            entries.map(finding => <FindingCard key={finding.id} companyId={companyId} sourceType={sourceType} value={finding} onChanged={() => { refetch(); onSummaryChanged(); }} />)
          )}
          {showNew ? (
            <div className="rounded-xl border border-dashed border-blue-300 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Nuevo hallazgo</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {!isInspection && (
                  <label className="grid gap-1 text-sm font-medium text-slate-700">Clasificación
                    <select value={newFinding.classification} onChange={event => setNewFinding(current => ({ ...current, classification: event.target.value as Classification }))} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                      {classificationOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                )}
                <label className={`grid gap-1 text-sm font-medium text-slate-700 ${isInspection ? "lg:col-span-2" : ""}`}>Fecha objetivo
                  <Input type="date" value={newFinding.targetDate} onChange={event => setNewFinding(current => ({ ...current, targetDate: event.target.value }))} />
                </label>
              </div>
              <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Texto del hallazgo
                <Textarea value={newFinding.finding} onChange={event => setNewFinding(current => ({ ...current, finding: event.target.value }))} rows={3} />
              </label>
              <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Tarea para cierre
                <Textarea value={newFinding.closureTask} onChange={event => setNewFinding(current => ({ ...current, closureTask: event.target.value }))} rows={2} />
              </label>
              <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Responsable de referencia <span className="font-normal text-slate-400">(opcional)</span>
                <Input value={newFinding.referenceResponsible} onChange={event => setNewFinding(current => ({ ...current, referenceResponsible: event.target.value }))} />
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancelar</Button>
                <Button size="sm" disabled={!canCreate || create.isPending} onClick={() => create.mutate({ companyId, sourceType, sourceId, ...newFinding })}>
                  {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Crear hallazgo
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="border-dashed border-blue-300 text-blue-700 hover:bg-blue-100" onClick={() => setShowNew(true)}>
              <Plus className="mr-1 h-4 w-4" /> Agregar hallazgo operativo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
