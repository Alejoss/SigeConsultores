import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ProcessTraceability = {
  processId: number;
  processName: string;
  status: "covered" | "pending" | "not_applicable";
  foda: Array<{
    type: string;
    subprocess: string;
    statement: string;
    linkSource: "id" | "legacy_text";
  }>;
  otg: Array<{
    id: string;
    name: string;
    progress: number | null;
    linkSource: "id" | "legacy_text";
  }>;
  ote: Array<{
    id: number;
    name: string;
    progress: number | null;
    linkSource: "id" | "legacy_text";
  }>;
  otgProgress: number | null;
  oteProgress: number | null;
  kpi: number | null;
  notApplicable: {
    justification: string;
    confirmedByName: string | null;
    confirmedByEmail: string | null;
    confirmedAt: Date | string | null;
  } | null;
};

type ObjectiveTraceability = {
  objectiveId: number;
  summary: {
    totalProcesses: number;
    applicableProcesses: number;
    notApplicableProcesses: number;
    coveredProcesses: number;
    pendingProcesses: number;
    coveragePercentage: number;
    processesWithKpi: number;
    kpi: number | null;
    otgProgress: number | null;
    oteProgress: number | null;
  };
  processes: ProcessTraceability[];
};

type Props = {
  companyId: number;
  data?: ObjectiveTraceability;
  canManageCompany: boolean;
  onChanged: () => void;
};

function percentage(value: number | null): string {
  return value === null ? "Sin medición" : `${value}%`;
}

function sourceLabel(source: "id" | "legacy_text"): string {
  return source === "legacy_text"
    ? "vínculo histórico por texto"
    : "vínculo registrado";
}

export function PolicyObjectiveTraceability({
  companyId,
  data,
  canManageCompany,
  onChanged,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingProcessId, setEditingProcessId] = useState<number | null>(null);
  const [justification, setJustification] = useState("");

  const applicabilityMutation =
    trpc.policyObjectives.setProcessApplicability.useMutation({
      onSuccess: (_, variables) => {
        toast.success(
          variables.action === "not_applicable"
            ? "Se registró la justificación de no aplicación."
            : "El proceso vuelve a estar pendiente de análisis."
        );
        setEditingProcessId(null);
        setJustification("");
        onChanged();
      },
      onError: error =>
        toast.error(error.message || "No se pudo actualizar la aplicabilidad."),
    });

  if (!data) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Preparando la trazabilidad del objetivo…
      </div>
    );
  }

  const { summary } = data;
  const saveNotApplicable = (processId: number) => {
    const cleanReason = justification.trim();
    if (!cleanReason) {
      toast.error(
        "Indica la justificación de no aplicación para conservar la evidencia de auditoría."
      );
      return;
    }
    applicabilityMutation.mutate({
      companyId,
      policyObjectiveId: data.objectiveId,
      processId,
      action: "not_applicable",
      justification: cleanReason,
    });
  };

  return (
    <section
      className="mt-5 rounded-xl border border-sky-200 bg-sky-50/60 p-4"
      aria-label="Aterrizamiento y cumplimiento del objetivo"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sky-950">
            <GitBranch size={18} />
            <h3 className="font-semibold">Aterrizamiento y cumplimiento</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            La cobertura indica en cuántos procesos aplicables existe evidencia
            FODA, OTG u OTE. El KPI solo promedia procesos que ya tienen una
            medición definida.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded(current => !current)}
          className="shrink-0 bg-white"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? "Ocultar detalle" : "Ver trazabilidad"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-sky-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Cobertura
          </p>
          <p className="mt-1 text-2xl font-bold text-sky-700">
            {summary.coveragePercentage}%
          </p>
          <p className="text-xs text-slate-500">
            {summary.coveredProcesses} de {summary.applicableProcesses} procesos
            aplicables
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            KPI integrado
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {percentage(summary.kpi)}
          </p>
          <p className="text-xs text-slate-500">
            {summary.processesWithKpi} procesos con medición
          </p>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ruta OTG
          </p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">
            {percentage(summary.otgProgress)}
          </p>
          <p className="text-xs text-slate-500">Promedio de procesos medidos</p>
        </div>
        <div className="rounded-lg border border-violet-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ruta OTE
          </p>
          <p className="mt-1 text-2xl font-bold text-violet-700">
            {percentage(summary.oteProgress)}
          </p>
          <p className="text-xs text-slate-500">Promedio de procesos medidos</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>
          {summary.pendingProcesses} procesos pendientes de considerar
        </span>
        <span>
          {summary.notApplicableProcesses} procesos no aplicables con
          justificación
        </span>
        <span>{summary.totalProcesses} procesos registrados en la empresa</span>
      </div>

      {expanded && (
        <div className="mt-5 space-y-3 border-t border-sky-200 pt-4">
          {data.processes.map(process => {
            const status =
              process.status === "covered"
                ? {
                    label: "Aterrizado",
                    className:
                      "bg-emerald-100 text-emerald-800 border-emerald-200",
                    icon: CheckCircle2,
                  }
                : process.status === "not_applicable"
                  ? {
                      label: "No aplica",
                      className: "bg-slate-100 text-slate-700 border-slate-200",
                      icon: Ban,
                    }
                  : {
                      label: "Pendiente de considerar",
                      className: "bg-amber-100 text-amber-900 border-amber-200",
                      icon: AlertTriangle,
                    };
            const StatusIcon = status.icon;
            const isEditing = editingProcessId === process.processId;
            return (
              <div
                key={process.processId}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-900">
                        {process.processName}
                      </h4>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
                      >
                        <StatusIcon size={13} /> {status.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                        FODA: {process.foda.length}
                      </span>
                      <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700">
                        OTG: {process.otg.length} ·{" "}
                        {percentage(process.otgProgress)}
                      </span>
                      <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">
                        OTE: {process.ote.length} ·{" "}
                        {percentage(process.oteProgress)}
                      </span>
                      <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                        KPI proceso: {percentage(process.kpi)}
                      </span>
                    </div>
                  </div>
                  {canManageCompany &&
                    process.status === "pending" &&
                    !isEditing && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingProcessId(process.processId);
                          setJustification("");
                        }}
                      >
                        <Ban size={15} /> Marcar no aplica
                      </Button>
                    )}
                  {canManageCompany && process.status === "not_applicable" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={applicabilityMutation.isPending}
                      onClick={() =>
                        applicabilityMutation.mutate({
                          companyId,
                          policyObjectiveId: data.objectiveId,
                          processId: process.processId,
                          action: "reconsider",
                        })
                      }
                    >
                      Volver a considerar
                    </Button>
                  )}
                </div>

                {process.notApplicable && (
                  <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    <p>
                      <strong>Justificación:</strong>{" "}
                      {process.notApplicable.justification}
                    </p>
                    {(process.notApplicable.confirmedByName ||
                      process.notApplicable.confirmedByEmail) && (
                      <p className="mt-1 text-xs text-slate-500">
                        Confirmado por{" "}
                        {process.notApplicable.confirmedByName ||
                          process.notApplicable.confirmedByEmail}
                      </p>
                    )}
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                    <label className="text-sm font-medium text-amber-950">
                      Justificación de no aplicación
                    </label>
                    <Textarea
                      className="mt-2 bg-white"
                      rows={3}
                      value={justification}
                      onChange={event => setJustification(event.target.value)}
                      placeholder="Explique por qué este objetivo no aplica a este proceso. Esta justificación quedará visible para auditoría."
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={applicabilityMutation.isPending}
                        onClick={() => saveNotApplicable(process.processId)}
                      >
                        Confirmar no aplica
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingProcessId(null);
                          setJustification("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {(process.foda.length > 0 ||
                  process.otg.length > 0 ||
                  process.ote.length > 0) && (
                  <div className="mt-3 grid gap-3 text-sm lg:grid-cols-3">
                    <div>
                      <p className="font-medium text-slate-700">FODA</p>
                      {process.foda.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Sin evidencia FODA.
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-slate-600">
                          {process.foda.map((item, index) => (
                            <li key={`${item.statement}-${index}`}>
                              • {item.type}: {item.statement || "Sin enunciado"}{" "}
                              <span className="text-slate-400">
                                ({sourceLabel(item.linkSource)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">OTG</p>
                      {process.otg.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Sin OTG relacionado.
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-slate-600">
                          {process.otg.map((item, index) => (
                            <li key={`${item.id}-${index}`}>
                              • {item.name}: {percentage(item.progress)}{" "}
                              <span className="text-slate-400">
                                ({sourceLabel(item.linkSource)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">OTE</p>
                      {process.ote.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Sin OTE relacionado.
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-slate-600">
                          {process.ote.map(item => (
                            <li key={item.id}>
                              • {item.name}: {percentage(item.progress)}{" "}
                              <span className="text-slate-400">
                                ({sourceLabel(item.linkSource)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default PolicyObjectiveTraceability;
