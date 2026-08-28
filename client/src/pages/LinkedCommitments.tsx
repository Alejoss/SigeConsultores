import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Eye,
  FilePlus2,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
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

type CommitmentKind = "action" | "vigency" | "own";
type CommitmentStatus = "pending" | "completed";
type SourceType =
  | "checklist_action"
  | "checklist_vigency"
  | "program_action"
  | "company_compliance"
  | "own";
type LinkedCommitment = {
  id: number;
  processId: number;
  sourceType: SourceType;
  kind: CommitmentKind;
  title: string;
  description: string | null;
  dueDate: string | Date | null;
  referenceResponsible: string | null;
  status: CommitmentStatus;
  completedAt: string | Date | null;
  renewedValidFrom: string | Date | null;
  renewedValidUntil: string | Date | null;
  notes: string | null;
  evidenceCount: number;
  sourceProgress: { total: number; fulfilled: number } | null;
};

const SOURCE_LABEL: Record<SourceType, string> = {
  checklist_action: "Sistema de Gestión · Acción",
  checklist_vigency: "Sistema de Gestión · Vigencia",
  program_action: "Programa · Acción",
  company_compliance: "Cumplimiento empresarial",
  own: "Planificación propia",
};

function asDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function CommitmentCard({
  commitment,
  companyId,
  onRefresh,
  onViewEvidence,
  onUploadEvidence,
}: {
  commitment: LinkedCommitment;
  companyId: number;
  onRefresh: () => void;
  onViewEvidence: (commitment: LinkedCommitment) => void;
  onUploadEvidence: (commitment: LinkedCommitment) => void;
}) {
  const update = trpc.linkedCommitments.updateProgress.useMutation({
    onSuccess: onRefresh,
    onError: error => toast.error(error.message),
  });
  const remove = trpc.linkedCommitments.delete.useMutation({
    onSuccess: () => {
      toast.success("Actividad propia eliminada");
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });
  const isOwn = commitment.sourceType === "own";
  const isVigency = commitment.kind === "vigency";
  const statusLabel =
    commitment.status === "completed"
      ? isVigency
        ? "Vigencia renovada"
        : "Cumplido"
      : "Pendiente";

  const save = (values: Record<string, string | CommitmentStatus>) => {
    update.mutate({ id: commitment.id, companyId, ...values });
  };

  return (
    <Card
      className={`overflow-hidden border ${commitment.status === "completed" ? "border-green-200" : "border-slate-200"}`}
    >
      <CardContent className="p-0">
        <div
          className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${commitment.status === "completed" ? "bg-green-50" : "bg-slate-50"}`}
        >
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${isOwn ? "border-violet-200 bg-violet-100 text-violet-800" : "border-blue-200 bg-blue-100 text-blue-800"}`}
              >
                {SOURCE_LABEL[commitment.sourceType]}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${commitment.status === "completed" ? "bg-green-200 text-green-800" : "bg-amber-100 text-amber-800"}`}
              >
                {statusLabel}
              </span>
            </div>
            <h3 className="font-semibold text-slate-800">{commitment.title}</h3>
            {commitment.description && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                {commitment.description}
              </p>
            )}
          </div>
          {commitment.sourceProgress && (
            <div className="shrink-0 rounded-md border border-teal-200 bg-white px-3 py-2 text-center text-xs text-teal-800">
              <strong className="block text-sm">
                {commitment.sourceProgress.fulfilled} de{" "}
                {commitment.sourceProgress.total}
              </strong>
              procesos cumplidos
            </div>
          )}
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Fecha objetivo
            </label>
            <Input
              type="date"
              defaultValue={asDateInput(commitment.dueDate)}
              onBlur={event => save({ dueDate: event.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Referencia de origen
            </label>
            <Input
              value={
                commitment.referenceResponsible ||
                "Sin responsable de referencia"
              }
              readOnly
              className="bg-slate-50 text-slate-500"
            />
          </div>
          {isVigency && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Vigencia renovada desde
                </label>
                <Input
                  type="date"
                  defaultValue={asDateInput(commitment.renewedValidFrom)}
                  onBlur={event =>
                    save({ renewedValidFrom: event.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Vigencia renovada hasta
                </label>
                <Input
                  type="date"
                  defaultValue={asDateInput(commitment.renewedValidUntil)}
                  onBlur={event =>
                    save({ renewedValidUntil: event.target.value })
                  }
                />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Notas del proceso
            </label>
            <Textarea
              defaultValue={commitment.notes || ""}
              placeholder="Observaciones, avance o explicación para el origen"
              onBlur={event => save({ notes: event.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-5 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={commitment.status === "completed"}
              onChange={event =>
                save({ status: event.target.checked ? "completed" : "pending" })
              }
            />
            {isVigency ? "Confirmar vigencia renovada" : "Marcar cumplido"}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-800"
              onClick={() => onUploadEvidence(commitment)}
            >
              <FilePlus2 size={14} className="mr-1" />
              Subir evidencia
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewEvidence(commitment)}
            >
              <Eye size={14} className="mr-1" />
              Evidencias ({commitment.evidenceCount})
            </Button>
            {isOwn && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm("¿Eliminar esta actividad propia?"))
                    remove.mutate({ id: commitment.id, companyId });
                }}
              >
                <Trash2 size={14} className="mr-1" />
                Eliminar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LinkedCommitments() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, isLoading: processLeaderLoading } =
    useProcessLeaderAuth();
  const {
    isManagerLogin,
    managerCompanyId,
    isLoading: managerLoading,
  } = useManagerAuth();
  const url = useMemo(() => new URLSearchParams(window.location.search), []);
  const companyFromUrl = Number(url.get("companyId"));
  const processFromUrl = Number(url.get("processId"));
  const companyId =
    processLeaderSession?.companyId ||
    (isManagerLogin ? managerCompanyId : null) ||
    (companyFromUrl > 0 ? companyFromUrl : null);
  const processId =
    processLeaderSession?.processId ||
    (processFromUrl > 0 ? processFromUrl : null);
  const evidenceInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [showOwnForm, setShowOwnForm] = useState(false);
  const [ownDraft, setOwnDraft] = useState({
    title: "",
    description: "",
    dueDate: "",
  });
  const [evidenceTarget, setEvidenceTarget] = useState<LinkedCommitment | null>(
    null
  );
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);

  const commitmentsQuery = trpc.linkedCommitments.listByProcess.useQuery(
    { companyId: companyId || 0, processId: processId || 0 },
    { enabled: Boolean(companyId && processId), refetchOnWindowFocus: false }
  );
  const evidenceQuery = trpc.linkedCommitments.listEvidence.useQuery(
    { id: evidenceTarget?.id || 0, companyId: companyId || 0 },
    { enabled: Boolean(evidenceTarget && companyId) }
  );
  const createOwn = trpc.linkedCommitments.createOwn.useMutation({
    onSuccess: () => {
      setOwnDraft({ title: "", description: "", dueDate: "" });
      setShowOwnForm(false);
      commitmentsQuery.refetch();
      toast.success("Actividad agregada a la planificación del proceso");
    },
    onError: error => toast.error(error.message),
  });
  const deleteEvidence = trpc.linkedCommitments.deleteEvidence.useMutation({
    onSuccess: () => evidenceQuery.refetch(),
    onError: error => toast.error(error.message),
  });

  const commitments = (commitmentsQuery.data || []) as LinkedCommitment[];
  const received = commitments.filter(item => item.sourceType !== "own");
  const own = commitments.filter(item => item.sourceType === "own");

  const uploadEvidence = async (commitment: LinkedCommitment, file: File) => {
    if (!companyId) return;
    setUploadingFor(commitment.id);
    const loadingToast = toast.loading("Subiendo evidencia...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", String(companyId));
      formData.append("linkedCommitmentId", String(commitment.id));
      const response = await fetch("/api/upload/linked-commitment-evidence", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok)
        throw new Error(result?.error || "No fue posible subir la evidencia");
      toast.success("Evidencia subida correctamente", { id: loadingToast });
      commitmentsQuery.refetch();
      if (evidenceTarget?.id === commitment.id) evidenceQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible subir la evidencia",
        { id: loadingToast }
      );
    } finally {
      setUploadingFor(null);
      const element = evidenceInputRefs.current[commitment.id];
      if (element) element.value = "";
    }
  };

  const backPath = processId
    ? `/process-characterization?processId=${processId}${companyId ? `&companyId=${companyId}` : ""}`
    : "/process-map";

  if (processLeaderLoading || managerLoading || commitmentsQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando compromisos vinculados...
        </div>
      </DashboardLayout>
    );
  }
  if (!companyId || !processId) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl py-16 text-center text-slate-600">
          Seleccione un proceso desde el Mapa de Procesos para administrar sus
          compromisos.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(backPath)}
            >
              <ArrowLeft size={16} className="mr-1" />
              Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Compromisos vinculados
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Controle las responsabilidades recibidas de los Sistemas de
                Gestión y la planificación propia del proceso.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold uppercase text-teal-700">
              Pendientes
            </p>
            <p className="text-2xl font-bold text-teal-800">
              {commitments.filter(item => item.status === "pending").length}
            </p>
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-700" />
            <div>
              <h2 className="font-bold text-slate-800">
                Recibidos desde la empresa
              </h2>
              <p className="text-sm text-slate-500">
                Al cerrar una acción, el origen se actualiza sólo cuando todos
                los procesos vinculados han cumplido.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {received.length ? (
              received.map(item => (
                <div key={item.id}>
                  <input
                    ref={element => {
                      evidenceInputRefs.current[item.id] = element;
                    }}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) uploadEvidence(item, file);
                    }}
                  />
                  <CommitmentCard
                    commitment={item}
                    companyId={companyId}
                    onRefresh={() => commitmentsQuery.refetch()}
                    onViewEvidence={setEvidenceTarget}
                    onUploadEvidence={target =>
                      evidenceInputRefs.current[target.id]?.click()
                    }
                  />
                </div>
              ))
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-slate-500">
                  Aún no hay responsabilidades vinculadas a este proceso.
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        <section className="mt-8 border-t pt-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-violet-700" />
              <div>
                <h2 className="font-bold text-slate-800">
                  Planificación propia
                </h2>
                <p className="text-sm text-slate-500">
                  Actividades del proceso que también aparecen en Cronograma
                  Consolidado.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-violet-700 hover:bg-violet-800"
              onClick={() => setShowOwnForm(current => !current)}
            >
              <Plus size={15} className="mr-1" />
              Añadir actividad
            </Button>
          </div>
          {showOwnForm && (
            <Card className="mb-4 border-violet-200 bg-violet-50">
              <CardContent className="p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={ownDraft.title}
                    onChange={event =>
                      setOwnDraft(current => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Actividad a planificar *"
                  />
                  <Input
                    type="date"
                    value={ownDraft.dueDate}
                    onChange={event =>
                      setOwnDraft(current => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                  <Textarea
                    className="md:col-span-2"
                    value={ownDraft.description}
                    onChange={event =>
                      setOwnDraft(current => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Detalle u observaciones (opcional)"
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOwnForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-violet-700 hover:bg-violet-800"
                    disabled={!ownDraft.title.trim() || createOwn.isPending}
                    onClick={() =>
                      createOwn.mutate({ companyId, processId, ...ownDraft })
                    }
                  >
                    {createOwn.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Agregar a planificación
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="space-y-4">
            {own.length ? (
              own.map(item => (
                <div key={item.id}>
                  <input
                    ref={element => {
                      evidenceInputRefs.current[item.id] = element;
                    }}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) uploadEvidence(item, file);
                    }}
                  />
                  <CommitmentCard
                    commitment={item}
                    companyId={companyId}
                    onRefresh={() => commitmentsQuery.refetch()}
                    onViewEvidence={setEvidenceTarget}
                    onUploadEvidence={target =>
                      evidenceInputRefs.current[target.id]?.click()
                    }
                  />
                </div>
              ))
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-slate-500">
                  No hay actividades propias planificadas todavía.
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {uploadingFor && (
          <div className="fixed bottom-4 right-4 z-40 rounded-lg bg-slate-800 px-4 py-3 text-sm text-white">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Subiendo evidencia...
          </div>
        )}
        {evidenceTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-xl shadow-xl">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-slate-800">Evidencias</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {evidenceTarget.title}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEvidenceTarget(null)}
                  >
                    Cerrar
                  </Button>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
                  {evidenceQuery.isLoading ? (
                    <p className="py-6 text-center text-sm text-slate-500">
                      Cargando evidencias...
                    </p>
                  ) : !(evidenceQuery.data || []).length ? (
                    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-slate-500">
                      No hay evidencias adjuntas todavía.
                    </p>
                  ) : (
                    (evidenceQuery.data || []).map(evidence => (
                      <div
                        key={evidence.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                      >
                        <a
                          href={evidence.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate text-sm font-medium text-blue-700 hover:underline"
                        >
                          <Paperclip className="mr-1 inline h-4 w-4" />
                          {evidence.fileName}
                        </a>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-red-600"
                          onClick={() => {
                            if (confirm("¿Eliminar esta evidencia?"))
                              deleteEvidence.mutate({
                                id: evidence.id,
                                companyId,
                              });
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
