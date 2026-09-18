import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  FileDown,
  FilePlus2,
  Link2,
  Loader2,
  Mail,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";

type ResponsibleType =
  | "same_process_employee"
  | "same_process_owner"
  | "other_process";
type AgreementStatus = "pending" | "completed" | "cancelled";
type CommunicationStatus = "not_requested" | "pending" | "sent" | "failed";
type ProcessOption = { id: number; name: string; processType: string };
type LinkedCommitmentSummary = {
  id: number;
  processId: number;
  processName: string;
  status: "pending" | "completed";
  evidenceCount: number;
};
type MeetingAgreement = {
  id: number;
  description: string;
  responsibleType: ResponsibleType;
  responsibleName: string | null;
  responsibleEmail: string | null;
  targetProcessId: number | null;
  targetProcessName: string | null;
  dueDate: string | Date | null;
  status: AgreementStatus;
  notes: string | null;
  communicationStatus: CommunicationStatus;
  communicationError: string | null;
  localEvidenceCount: number;
  linkedCommitment: LinkedCommitmentSummary | null;
};
type Meeting = {
  id: number;
  meetingTypeId: number;
  meetingDate: string | Date;
  objective: string;
  participants: string | null;
  locationOrMedium: string | null;
  notes: string | null;
  minutesText: string | null;
  status: "active" | "annulled";
  annulmentReason: string | null;
  agreementCount: number;
  completedAgreementCount: number;
  completionPercentage: number | null;
  fileCount: number;
  agreements: MeetingAgreement[];
};
type MeetingType = {
  id: number;
  name: string;
  description: string | null;
  isArchived: boolean;
  meetings: Meeting[];
};
type MeetingFile = {
  id: number;
  fileName: string;
  fileUrl: string;
  uploadedAt: string | Date;
};
type EvidenceFile = MeetingFile;

const RESPONSIBLE_OPTIONS: Array<{ value: ResponsibleType; label: string }> = [
  { value: "same_process_employee", label: "Empleado de este proceso" },
  { value: "same_process_owner", label: "Dueño de este proceso" },
  { value: "other_process", label: "Otro proceso" },
];

function dateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function responsibleLabel(agreement: MeetingAgreement) {
  if (agreement.responsibleName?.trim()) return agreement.responsibleName;
  if (agreement.responsibleType === "same_process_owner") return "Dueño del proceso";
  if (agreement.responsibleType === "same_process_employee")
    return "Empleado de este proceso";
  return agreement.targetProcessName || "Otro proceso";
}

function agreementState(agreement: MeetingAgreement) {
  if (agreement.status === "cancelled")
    return { label: "Cancelado", className: "bg-slate-200 text-slate-700" };
  if (agreement.status === "completed")
    return { label: "Cumplido", className: "bg-green-100 text-green-800" };
  return { label: "Pendiente", className: "bg-amber-100 text-amber-800" };
}

function copyText(text: string, successMessage: string) {
  if (!text.trim()) {
    toast.error("Primero genere o registre el acta.");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(successMessage))
    .catch(() => toast.error("No fue posible copiar el texto."));
}

function MeetingFiles({
  companyId,
  meeting,
  onRefresh,
  disabled = false,
}: {
  companyId: number;
  meeting: Meeting;
  onRefresh: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const filesQuery = trpc.meetings.listMeetingFiles.useQuery(
    { companyId, meetingId: meeting.id },
    { refetchOnWindowFocus: false }
  );
  const deleteFile = trpc.meetings.deleteMeetingFile.useMutation({
    onSuccess: () => {
      filesQuery.refetch();
      onRefresh();
      toast.success("Archivo eliminado");
    },
    onError: error => toast.error(error.message),
  });

  const upload = async (file: File) => {
    setUploading(true);
    const notice = toast.loading("Subiendo archivo de reunión...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", String(companyId));
      formData.append("meetingId", String(meeting.id));
      const response = await fetch("/api/upload/meeting-file", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok)
        throw new Error(result?.error || "No fue posible subir el archivo.");
      await filesQuery.refetch();
      onRefresh();
      toast.success("Archivo de reunión subido", { id: notice });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No fue posible subir el archivo.",
        { id: notice }
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const files = (filesQuery.data || []) as MeetingFile[];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-slate-800">Archivos de respaldo</h4>
          <p className="text-xs text-slate-500">
            PDF, imágenes, Word o Excel; máximo 50 MB por archivo.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading || disabled}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-1 h-4 w-4" />}
          Subir archivo
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {filesQuery.isLoading ? (
          <p className="text-sm text-slate-500">Cargando archivos...</p>
        ) : files.length ? (
          files.map(file => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
            >
              <a
                href={file.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm font-medium text-blue-700 hover:underline"
              >
                <Paperclip className="mr-1 inline h-4 w-4" />
                {file.fileName}
              </a>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-red-600"
                disabled={disabled}
                onClick={() => {
                  if (confirm(`¿Eliminar el archivo «${file.fileName}»?`))
                    deleteFile.mutate({ id: file.id, companyId });
                }}
                aria-label="Eliminar archivo"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
            No hay archivos adjuntos todavía.
          </p>
        )}
      </div>
      {disabled && (
        <p className="mt-3 text-xs text-slate-500">
          La reunión está anulada; los archivos se conservan, pero no se pueden modificar.
        </p>
      )}
    </section>
  );
}

function LocalEvidence({
  companyId,
  agreement,
  onRefresh,
}: {
  companyId: number;
  agreement: MeetingAgreement;
  onRefresh: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const evidenceQuery = trpc.meetings.listAgreementEvidence.useQuery(
    { companyId, agreementId: agreement.id },
    { refetchOnWindowFocus: false }
  );
  const deleteEvidence = trpc.meetings.deleteAgreementEvidence.useMutation({
    onSuccess: () => {
      evidenceQuery.refetch();
      onRefresh();
      toast.success("Evidencia eliminada");
    },
    onError: error => toast.error(error.message),
  });

  const upload = async (file: File) => {
    setUploading(true);
    const notice = toast.loading("Subiendo evidencia local...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", String(companyId));
      formData.append("agreementId", String(agreement.id));
      const response = await fetch("/api/upload/meeting-agreement-evidence", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok)
        throw new Error(result?.error || "No fue posible subir la evidencia.");
      await evidenceQuery.refetch();
      onRefresh();
      toast.success("Evidencia local subida", { id: notice });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No fue posible subir la evidencia.",
        { id: notice }
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const evidence = (evidenceQuery.data || []) as EvidenceFile[];
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">Evidencias locales</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="mr-1 h-3.5 w-3.5" />}
          Subir evidencia
        </Button>
      </div>
      <div className="mt-2 space-y-1.5">
        {evidence.map(file => (
          <div key={file.id} className="flex items-center justify-between gap-2 text-xs">
            <a
              href={file.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-blue-700 hover:underline"
            >
              <Paperclip className="mr-1 inline h-3.5 w-3.5" />
              {file.fileName}
            </a>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 text-red-600"
              onClick={() => {
                if (confirm(`¿Eliminar la evidencia «${file.fileName}»?`))
                  deleteEvidence.mutate({ id: file.id, companyId });
              }}
              aria-label="Eliminar evidencia"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {!evidenceQuery.isLoading && !evidence.length && (
          <p className="text-xs text-slate-500">No hay evidencias locales.</p>
        )}
      </div>
    </div>
  );
}

function AgreementRow({
  companyId,
  agreement,
  processes,
  onRefresh,
}: {
  companyId: number;
  agreement: MeetingAgreement;
  processes: ProcessOption[];
  onRefresh: () => void;
}) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({
    description: agreement.description,
    responsibleName: agreement.responsibleName || "",
    responsibleEmail: agreement.responsibleEmail || "",
    dueDate: dateInput(agreement.dueDate),
    notes: agreement.notes || "",
  });
  const [assignment, setAssignment] = useState({
    responsibleType: agreement.responsibleType,
    targetProcessId: agreement.targetProcessId ? String(agreement.targetProcessId) : "",
  });
  const update = trpc.meetings.updateAgreement.useMutation({
    onSuccess: onRefresh,
    onError: error => toast.error(error.message),
  });
  const changeAssignment = trpc.meetings.changeAgreementAssignment.useMutation({
    onSuccess: () => {
      onRefresh();
      toast.success("Responsabilidad actualizada");
    },
    onError: error => toast.error(error.message),
  });
  const updateStatus = trpc.meetings.updateLocalAgreementStatus.useMutation({
    onSuccess: () => {
      onRefresh();
      toast.success("Estado del acuerdo actualizado");
    },
    onError: error => toast.error(error.message),
  });
  const cancel = trpc.meetings.cancelAgreement.useMutation({
    onSuccess: () => {
      onRefresh();
      toast.success("Acuerdo cancelado y conservado en el historial");
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.meetings.deleteEmptyAgreement.useMutation({
    onSuccess: () => {
      onRefresh();
      toast.success("Acuerdo eliminado");
    },
    onError: error => toast.error(error.message),
  });
  const sendEmail = trpc.meetings.sendAgreementEmail.useMutation({
    onSuccess: result => {
      onRefresh();
      result.success ? toast.success(result.message) : toast.error(result.message);
    },
    onError: error => toast.error(error.message),
  });
  const state = agreementState(agreement);
  const isLinked = Boolean(agreement.linkedCommitment);
  const isClosed = agreement.status === "cancelled";

  const save = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (isClosed) return;
    update.mutate({
      id: agreement.id,
      companyId,
      description: next.description,
      responsibleName: next.responsibleName,
      responsibleEmail: next.responsibleEmail,
      dueDate: next.dueDate,
      notes: next.notes,
    });
  };

  return (
    <div className={`rounded-lg border ${isClosed ? "border-slate-300 bg-slate-50 opacity-80" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded(current => !current)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${state.className}`}>
              {state.label}
            </span>
            {isLinked && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                Vinculado a {agreement.linkedCommitment?.processName}
              </span>
            )}
            {agreement.communicationStatus === "sent" && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Correo confirmado
              </span>
            )}
            {agreement.communicationStatus === "failed" && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                Correo no confirmado
              </span>
            )}
          </div>
          <p className="mt-1 font-semibold text-slate-800">{agreement.description}</p>
          <p className="mt-1 text-xs text-slate-500">
            Responsable: {responsibleLabel(agreement)} · Fecha tope: {dateInput(agreement.dueDate) || "Sin fecha"}
          </p>
        </button>
        <Button size="icon" variant="ghost" onClick={() => setExpanded(current => !current)}>
          <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Button>
      </div>
      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Acuerdo o pendiente</label>
              <Textarea
                value={draft.description}
                disabled={isClosed}
                onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                onBlur={() => save({})}
                className="min-h-20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre de responsable</label>
              <Input
                value={draft.responsibleName}
                disabled={isClosed}
                onChange={event => setDraft(current => ({ ...current, responsibleName: event.target.value }))}
                onBlur={() => save({})}
                placeholder="Nombre visible en el acta"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Correo (si no tiene acceso)</label>
              <Input
                type="email"
                value={draft.responsibleEmail}
                disabled={isClosed}
                onChange={event => setDraft(current => ({ ...current, responsibleEmail: event.target.value }))}
                onBlur={() => save({})}
                placeholder="correo@empresa.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Fecha tope</label>
              <Input
                type="date"
                value={draft.dueDate}
                disabled={isClosed}
                onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))}
                onBlur={() => save({})}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Tipo de responsable</label>
              <select
                value={assignment.responsibleType}
                disabled={isClosed}
                onChange={event =>
                  setAssignment(current => ({
                    ...current,
                    responsibleType: event.target.value as ResponsibleType,
                  }))
                }
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {RESPONSIBLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {assignment.responsibleType === "other_process" && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Proceso responsable</label>
                <select
                  value={assignment.targetProcessId}
                  disabled={isClosed}
                  onChange={event =>
                    setAssignment(current => ({ ...current, targetProcessId: event.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">Seleccione un proceso</option>
                  {processes.map(process => (
                    <option key={process.id} value={process.id}>
                      {process.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Notas</label>
              <Textarea
                value={draft.notes}
                disabled={isClosed}
                onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
                onBlur={() => save({})}
                placeholder="Avances, observaciones o aclaraciones"
              />
            </div>
          </div>

          {!isClosed && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-800"
                disabled={changeAssignment.isPending}
                onClick={() => {
                  const requiresTarget = assignment.responsibleType === "other_process";
                  if (requiresTarget && !assignment.targetProcessId) {
                    toast.error("Seleccione el proceso responsable.");
                    return;
                  }
                  if (
                    confirm(
                      assignment.responsibleType === "same_process_employee"
                        ? "¿Confirmar que este acuerdo se controlará localmente, sin vincularlo al Cronograma?"
                        : "¿Confirmar la responsabilidad? Se creará o mantendrá un compromiso vinculado en el proceso responsable."
                    )
                  ) {
                    changeAssignment.mutate({
                      id: agreement.id,
                      companyId,
                      responsibleType: assignment.responsibleType,
                      responsibleName: draft.responsibleName,
                      responsibleEmail: draft.responsibleEmail,
                      targetProcessId: requiresTarget ? Number(assignment.targetProcessId) : null,
                    });
                  }
                }}
              >
                <Link2 className="mr-1 h-4 w-4" />
                Confirmar responsabilidad
              </Button>
              {isLinked ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setLocation(
                      `/linked-commitments?companyId=${companyId}&processId=${agreement.linkedCommitment?.processId}`
                    )
                  }
                >
                  <CalendarDays className="mr-1 h-4 w-4" />
                  Gestionar en Compromisos vinculados
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateStatus.mutate({
                      id: agreement.id,
                      companyId,
                      status: agreement.status === "completed" ? "pending" : "completed",
                    })
                  }
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  {agreement.status === "completed" ? "Marcar pendiente" : "Marcar cumplido"}
                </Button>
              )}
              {draft.responsibleEmail && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-300 text-emerald-800"
                  disabled={sendEmail.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `¿Solicitar el envío verificable del acta y este compromiso a ${draft.responsibleEmail}? La plataforma solo lo marcará como enviado si Amazon SES lo confirma.`
                      )
                    )
                      sendEmail.mutate({ companyId, agreementId: agreement.id });
                  }}
                >
                  {sendEmail.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />}
                  Enviar acta y compromiso
                </Button>
              )}
              {!isLinked && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700 hover:bg-red-50"
                  onClick={() => {
                    const action = agreement.localEvidenceCount ? "cancelar" : "eliminar";
                    if (
                      confirm(
                        action === "cancelar"
                          ? "Este acuerdo tiene evidencias. ¿Desea cancelarlo y mantener el historial?"
                          : "¿Eliminar este acuerdo vacío?"
                      )
                    ) {
                      if (action === "cancelar") cancel.mutate({ id: agreement.id, companyId });
                      else remove.mutate({ id: agreement.id, companyId });
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {agreement.localEvidenceCount ? "Cancelar acuerdo" : "Eliminar acuerdo"}
                </Button>
              )}
            </div>
          )}
          {agreement.communicationError && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {agreement.communicationError}
            </p>
          )}
          {!isLinked && !isClosed && (
            <LocalEvidence companyId={companyId} agreement={agreement} onRefresh={onRefresh} />
          )}
          {isLinked && (
            <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              El estado y las evidencias de este acuerdo se administran desde Compromisos vinculados del proceso responsable y regresan automáticamente a esta reunión. Para preservar el historial, no se elimina desde aquí.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NewAgreementForm({
  companyId,
  meetingId,
  processes,
  onClose,
  onRefresh,
}: {
  companyId: number;
  meetingId: number;
  processes: ProcessOption[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState({
    description: "",
    responsibleType: "same_process_employee" as ResponsibleType,
    responsibleName: "",
    responsibleEmail: "",
    targetProcessId: "",
    dueDate: "",
    notes: "",
  });
  const create = trpc.meetings.createAgreement.useMutation({
    onSuccess: result => {
      onRefresh();
      onClose();
      toast.success(
        result.linkedCommitmentId
          ? "Acuerdo creado y vinculado al Cronograma del proceso responsable"
          : "Acuerdo creado para control local"
      );
    },
    onError: error => toast.error(error.message),
  });
  const submit = () => {
    if (!draft.description.trim()) {
      toast.error("Describa el acuerdo o pendiente.");
      return;
    }
    if (draft.responsibleType === "other_process" && !draft.targetProcessId) {
      toast.error("Seleccione el proceso responsable.");
      return;
    }
    const needsLink = draft.responsibleType !== "same_process_employee";
    const prompt = needsLink
      ? "¿Crear el acuerdo y vincularlo al proceso responsable? Este aparecerá en Compromisos vinculados y Cronograma consolidado."
      : "¿Crear el acuerdo para control local? No se enviará ningún correo automáticamente.";
    if (!confirm(prompt)) return;
    create.mutate({
      companyId,
      meetingId,
      description: draft.description,
      responsibleType: draft.responsibleType,
      responsibleName: draft.responsibleName,
      responsibleEmail: draft.responsibleEmail,
      targetProcessId:
        draft.responsibleType === "other_process" ? Number(draft.targetProcessId) : null,
      dueDate: draft.dueDate,
      notes: draft.notes,
    });
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-semibold text-blue-950">Nuevo acuerdo o pendiente</h4>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Textarea
          className="min-h-20 md:col-span-2"
          value={draft.description}
          onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
          placeholder="Describa el acuerdo o pendiente *"
        />
        <select
          value={draft.responsibleType}
          onChange={event =>
            setDraft(current => ({
              ...current,
              responsibleType: event.target.value as ResponsibleType,
              targetProcessId: "",
            }))
          }
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          {RESPONSIBLE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <Input
          type="date"
          value={draft.dueDate}
          onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))}
        />
        {draft.responsibleType === "other_process" && (
          <select
            value={draft.targetProcessId}
            onChange={event => setDraft(current => ({ ...current, targetProcessId: event.target.value }))}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm md:col-span-2"
          >
            <option value="">Seleccione el proceso responsable *</option>
            {processes.map(process => (
              <option key={process.id} value={process.id}>{process.name}</option>
            ))}
          </select>
        )}
        <Input
          value={draft.responsibleName}
          onChange={event => setDraft(current => ({ ...current, responsibleName: event.target.value }))}
          placeholder="Nombre del responsable (opcional)"
        />
        <Input
          type="email"
          value={draft.responsibleEmail}
          onChange={event => setDraft(current => ({ ...current, responsibleEmail: event.target.value }))}
          placeholder="Correo si no tiene acceso (opcional)"
        />
        <Textarea
          className="md:col-span-2"
          value={draft.notes}
          onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
          placeholder="Notas u observaciones (opcional)"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button disabled={create.isPending} onClick={submit}>
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Crear acuerdo
        </Button>
      </div>
    </div>
  );
}

function MeetingDetail({
  companyId,
  meeting,
  processes,
  onRefresh,
}: {
  companyId: number;
  meeting: Meeting;
  processes: ProcessOption[];
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState({
    meetingDate: dateInput(meeting.meetingDate),
    objective: meeting.objective,
    participants: meeting.participants || "",
    locationOrMedium: meeting.locationOrMedium || "",
    notes: meeting.notes || "",
  });
  const [minutesText, setMinutesText] = useState(meeting.minutesText || "");
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const update = trpc.meetings.updateMeeting.useMutation({
    onSuccess: onRefresh,
    onError: error => toast.error(error.message),
  });
  const generateMinutes = trpc.meetings.generateMinutes.useMutation({
    onSuccess: result => {
      setMinutesText(result.minutesText);
      onRefresh();
      toast.success("Acta preparada y guardada");
    },
    onError: error => toast.error(error.message),
  });
  const annul = trpc.meetings.annulMeeting.useMutation({
    onSuccess: () => {
      onRefresh();
      toast.success("Reunión anulada; el historial se conserva");
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.meetings.deleteEmptyMeeting.useMutation({
    onSuccess: () => {
      onRefresh();
      toast.success("Reunión vacía eliminada");
    },
    onError: error => toast.error(error.message),
  });
  const isAnnulled = meeting.status === "annulled";

  const save = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (isAnnulled) return;
    update.mutate({ id: meeting.id, companyId, ...next });
  };
  const exportMinutes = async () => {
    try {
      const result = await generateMinutes.mutateAsync({
        companyId,
        meetingId: meeting.id,
        save: !isAnnulled,
      });
      const blob = new Blob([result.minutesText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `acta-reunion-${dateInput(meeting.meetingDate) || meeting.id}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Acta descargada. Los archivos de respaldo se descargan desde su lista.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo exportar el acta.");
    }
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-5 py-5">
      {isAnnulled && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong>Reunión anulada.</strong> {meeting.annulmentReason || "Sin motivo registrado."} El historial se conserva, pero no se incluye en los indicadores activos.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Fecha *</label>
          <Input
            type="date"
            disabled={isAnnulled}
            value={draft.meetingDate}
            onChange={event => setDraft(current => ({ ...current, meetingDate: event.target.value }))}
            onBlur={() => save({})}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Lugar o medio</label>
          <Input
            disabled={isAnnulled}
            value={draft.locationOrMedium}
            onChange={event => setDraft(current => ({ ...current, locationOrMedium: event.target.value }))}
            onBlur={() => save({})}
            placeholder="Presencial, Zoom, Teams, Meet..."
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Objetivo *</label>
          <Textarea
            disabled={isAnnulled}
            value={draft.objective}
            onChange={event => setDraft(current => ({ ...current, objective: event.target.value }))}
            onBlur={() => save({})}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Participantes</label>
          <Textarea
            disabled={isAnnulled}
            value={draft.participants}
            onChange={event => setDraft(current => ({ ...current, participants: event.target.value }))}
            onBlur={() => save({})}
            placeholder="Nombres o lista de participantes"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Notas</label>
          <Textarea
            disabled={isAnnulled}
            value={draft.notes}
            onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
            onBlur={() => save({})}
            placeholder="Observaciones de la reunión"
          />
        </div>
      </div>
      {!isAnnulled && (
        <p className="mt-2 text-right text-xs text-slate-500">Los cambios se guardan automáticamente al salir de cada campo.</p>
      )}

      <section className="mt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-semibold text-slate-800">Acuerdos y pendientes</h4>
            <p className="text-xs text-slate-500">
              Los acuerdos vinculados se administran desde el proceso responsable.
            </p>
          </div>
          {!isAnnulled && (
            <Button size="sm" onClick={() => setShowAgreementForm(current => !current)}>
              <Plus className="mr-1 h-4 w-4" />
              Añadir acuerdo
            </Button>
          )}
        </div>
        {showAgreementForm && (
          <div className="mb-3">
            <NewAgreementForm
              companyId={companyId}
              meetingId={meeting.id}
              processes={processes}
              onClose={() => setShowAgreementForm(false)}
              onRefresh={onRefresh}
            />
          </div>
        )}
        <div className="space-y-3">
          {meeting.agreements.length ? (
            meeting.agreements.map(agreement => (
              <AgreementRow
                key={agreement.id}
                companyId={companyId}
                agreement={agreement}
                processes={processes}
                onRefresh={onRefresh}
              />
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-500">
              No hay acuerdos registrados todavía.
            </p>
          )}
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-slate-800">Acta de reunión</h4>
              <p className="text-xs text-slate-500">Se agrupa por responsable y puede copiarse o descargarse.</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={generateMinutes.isPending || isAnnulled}
                onClick={() => generateMinutes.mutate({ companyId, meetingId: meeting.id, save: true })}
              >
                {generateMinutes.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                Preparar acta
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyText(minutesText, "Acta copiada al portapapeles") }>
                <ClipboardCopy className="mr-1 h-4 w-4" />
                Copiar texto
              </Button>
            </div>
          </div>
          <Textarea
            className="mt-3 min-h-48 bg-slate-50 text-sm"
            disabled={isAnnulled}
            value={minutesText}
            onChange={event => setMinutesText(event.target.value)}
            onBlur={() =>
              update.mutate({ id: meeting.id, companyId, minutesText })
            }
            placeholder="Presione «Preparar acta» para generar un texto basado en la reunión y sus acuerdos."
          />
          {!isAnnulled && <p className="mt-1 text-xs text-slate-500">También puede editar el texto; se guarda automáticamente al salir del campo.</p>}
        </div>
        <MeetingFiles
          companyId={companyId}
          meeting={meeting}
          onRefresh={onRefresh}
          disabled={isAnnulled}
        />
      </section>

      <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4">
        <Button size="sm" variant="outline" onClick={exportMinutes}>
          <FileDown className="mr-1 h-4 w-4" />
          Exportar acta
        </Button>
        {!isAnnulled && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-800"
              onClick={() => {
                const reason = prompt("Indique el motivo de la anulación. El historial y los compromisos vinculados se conservarán.");
                if (reason?.trim() && confirm("¿Anular esta reunión? Esta acción conserva la información histórica.")) {
                  annul.mutate({ id: meeting.id, companyId, reason: reason.trim() });
                }
              }}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Anular reunión
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-700 hover:bg-red-50"
              onClick={() => {
                if (confirm("¿Eliminar esta reunión? Solo se eliminará si está totalmente vacía."))
                  remove.mutate({ id: meeting.id, companyId });
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Eliminar si está vacía
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewMeetingForm({
  companyId,
  processId,
  meetingTypeId,
  onClose,
  onRefresh,
}: {
  companyId: number;
  processId: number;
  meetingTypeId: number;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState({
    meetingDate: new Date().toISOString().slice(0, 10),
    objective: "",
    participants: "",
    locationOrMedium: "",
    notes: "",
  });
  const create = trpc.meetings.createMeeting.useMutation({
    onSuccess: () => {
      onClose();
      onRefresh();
      toast.success("Reunión creada; los demás campos se guardan automáticamente.");
    },
    onError: error => toast.error(error.message),
  });
  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold text-blue-950">Nueva reunión</h4>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          type="date"
          value={draft.meetingDate}
          onChange={event => setDraft(current => ({ ...current, meetingDate: event.target.value }))}
        />
        <Input
          value={draft.locationOrMedium}
          onChange={event => setDraft(current => ({ ...current, locationOrMedium: event.target.value }))}
          placeholder="Lugar o medio (opcional)"
        />
        <Textarea
          className="md:col-span-2"
          value={draft.objective}
          onChange={event => setDraft(current => ({ ...current, objective: event.target.value }))}
          placeholder="Objetivo de la reunión *"
        />
        <Textarea
          value={draft.participants}
          onChange={event => setDraft(current => ({ ...current, participants: event.target.value }))}
          placeholder="Participantes (opcional)"
        />
        <Textarea
          value={draft.notes}
          onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
          placeholder="Notas (opcional)"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          disabled={!draft.meetingDate || !draft.objective.trim() || create.isPending}
          onClick={() => create.mutate({ companyId, processId, meetingTypeId, ...draft })}
        >
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Crear reunión
        </Button>
      </div>
    </div>
  );
}

function MeetingTypeCard({
  companyId,
  processId,
  meetingType,
  processes,
  onRefresh,
}: {
  companyId: number;
  processId: number;
  meetingType: MeetingType;
  processes: ProcessOption[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [typeDraft, setTypeDraft] = useState({
    name: meetingType.name,
    description: meetingType.description || "",
  });
  const [expandedMeeting, setExpandedMeeting] = useState<number | null>(null);
  const updateType = trpc.meetings.updateType.useMutation({
    onSuccess: onRefresh,
    onError: error => toast.error(error.message),
  });
  const deleteType = trpc.meetings.deleteEmptyType.useMutation({
    onSuccess: () => {
      onRefresh();
      toast.success("Tipo de reunión eliminado");
    },
    onError: error => toast.error(error.message),
  });
  const activeMeetings = meetingType.meetings.filter(meeting => meeting.status === "active");
  const activeAgreementCount = activeMeetings.reduce((sum, meeting) => sum + meeting.agreementCount, 0);
  const completeAgreementCount = activeMeetings.reduce((sum, meeting) => sum + meeting.completedAgreementCount, 0);

  return (
    <Card className={meetingType.isArchived ? "border-slate-300 bg-slate-50 opacity-80" : "border-sky-200"}>
      <CardContent className="p-0">
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-sky-50/50"
          onClick={() => setOpen(current => !current)}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800">{meetingType.name}</h3>
              {meetingType.isArchived && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Archivado</span>}
            </div>
            {meetingType.description && <p className="mt-1 text-sm text-slate-500">{meetingType.description}</p>}
          </div>
          <div className="flex items-center gap-4 text-center text-xs text-slate-600">
            <span><strong className="block text-base text-slate-800">{activeMeetings.length}</strong>reuniones</span>
            <span><strong className="block text-base text-slate-800">{completeAgreementCount}/{activeAgreementCount}</strong>acuerdos</span>
            <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </button>
        {open && (
          <div className="border-t border-slate-200 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={typeDraft.name}
                disabled={meetingType.isArchived}
                onChange={event => setTypeDraft(current => ({ ...current, name: event.target.value }))}
                onBlur={() => {
                  if (typeDraft.name.trim())
                    updateType.mutate({ id: meetingType.id, companyId, name: typeDraft.name, description: typeDraft.description });
                }}
              />
              <Input
                value={typeDraft.description}
                disabled={meetingType.isArchived}
                onChange={event => setTypeDraft(current => ({ ...current, description: event.target.value }))}
                onBlur={() => updateType.mutate({ id: meetingType.id, companyId, description: typeDraft.description })}
                placeholder="Descripción del tipo (opcional)"
              />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              <p className="text-xs text-slate-500">El nombre y la descripción se guardan automáticamente al salir del campo.</p>
              <div className="flex flex-wrap gap-2">
                {!meetingType.isArchived && (
                  <Button size="sm" onClick={() => setShowNewMeeting(current => !current)}>
                    <Plus className="mr-1 h-4 w-4" />Nueva reunión
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateType.mutate({ id: meetingType.id, companyId, isArchived: !meetingType.isArchived })
                  }
                >
                  {meetingType.isArchived ? "Reactivar" : "Archivar tipo"}
                </Button>
                {!meetingType.meetings.length && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-700 hover:bg-red-50"
                    onClick={() => {
                      if (confirm(`¿Eliminar el tipo «${meetingType.name}»?`)) deleteType.mutate({ id: meetingType.id, companyId });
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />Eliminar tipo
                  </Button>
                )}
              </div>
            </div>
            {showNewMeeting && (
              <div className="mt-4">
                <NewMeetingForm
                  companyId={companyId}
                  processId={processId}
                  meetingTypeId={meetingType.id}
                  onClose={() => setShowNewMeeting(false)}
                  onRefresh={onRefresh}
                />
              </div>
            )}
            <div className="mt-4 space-y-3">
              {meetingType.meetings.length ? (
                meetingType.meetings.map(meeting => (
                  <div key={meeting.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50"
                      onClick={() => setExpandedMeeting(current => current === meeting.id ? null : meeting.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">{dateInput(meeting.meetingDate)}</span>
                          {meeting.status === "annulled" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Anulada</span>}
                        </div>
                        <p className="mt-1 truncate font-semibold text-slate-800">{meeting.objective}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <div className="text-center text-xs text-slate-500">
                          <strong className="block text-lg text-slate-800">
                            {meeting.completionPercentage === null ? "—" : `${meeting.completionPercentage}%`}
                          </strong>
                          cumplimiento
                        </div>
                        <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${expandedMeeting === meeting.id ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    {expandedMeeting === meeting.id && (
                      <MeetingDetail
                        companyId={companyId}
                        meeting={meeting}
                        processes={processes}
                        onRefresh={onRefresh}
                      />
                    )}
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                  Aún no hay reuniones de este tipo.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProcessMeetings() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, isLoading: processLeaderLoading } = useProcessLeaderAuth();
  const { isManagerLogin, managerCompanyId, isLoading: managerLoading } = useManagerAuth();
  const url = useMemo(() => new URLSearchParams(window.location.search), []);
  const companyFromUrl = Number(url.get("companyId"));
  const processFromUrl = Number(url.get("processId"));
  const companyId = processLeaderSession?.companyId || (isManagerLogin ? managerCompanyId : null) || (companyFromUrl > 0 ? companyFromUrl : null);
  const processId = processLeaderSession?.processId || (processFromUrl > 0 ? processFromUrl : null);
  const [showNewType, setShowNewType] = useState(false);
  const [typeDraft, setTypeDraft] = useState({ name: "", description: "" });

  const meetingsQuery = trpc.meetings.list.useQuery(
    { companyId: companyId || 0, processId: processId || 0, includeAnnulled: true },
    { enabled: Boolean(companyId && processId), refetchOnWindowFocus: false }
  );
  const processesQuery = trpc.meetings.listAvailableProcesses.useQuery(
    { companyId: companyId || 0, processId: processId || 0 },
    { enabled: Boolean(companyId && processId), refetchOnWindowFocus: false }
  );
  const createType = trpc.meetings.createType.useMutation({
    onSuccess: () => {
      setTypeDraft({ name: "", description: "" });
      setShowNewType(false);
      meetingsQuery.refetch();
      toast.success("Tipo de reunión creado");
    },
    onError: error => toast.error(error.message),
  });

  const meetingTypes = (meetingsQuery.data || []) as MeetingType[];
  const processes = (processesQuery.data || []) as ProcessOption[];
  const activeMeetings = meetingTypes.flatMap(type => type.meetings).filter(meeting => meeting.status === "active");
  const agreements = activeMeetings.flatMap(meeting => meeting.agreements).filter(agreement => agreement.status !== "cancelled");
  const completed = agreements.filter(agreement => agreement.status === "completed").length;
  const backPath = processId
    ? `/process-characterization?processId=${processId}${companyId ? `&companyId=${companyId}` : ""}`
    : "/process-map";

  if (processLeaderLoading || managerLoading || meetingsQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando reuniones...
        </div>
      </DashboardLayout>
    );
  }
  if (!companyId || !processId) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl py-16 text-center text-slate-600">
          Seleccione un proceso desde el Mapa de Procesos para administrar sus reuniones.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="sm" onClick={() => setLocation(backPath)}>
              <ArrowLeft className="mr-1 h-4 w-4" />Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Reuniones</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Registre reuniones manuales del proceso, acuerdos, actas y responsabilidades. Los acuerdos vinculados usan el Cronograma consolidado existente; no se crea una agenda paralela.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-center">
            <div><strong className="block text-lg text-sky-950">{activeMeetings.length}</strong><span className="text-xs text-sky-800">reuniones</span></div>
            <div><strong className="block text-lg text-sky-950">{agreements.length}</strong><span className="text-xs text-sky-800">acuerdos</span></div>
            <div><strong className="block text-lg text-sky-950">{completed}/{agreements.length || 0}</strong><span className="text-xs text-sky-800">cumplidos</span></div>
          </div>
        </div>

        <Card className="mb-6 border-sky-200 bg-sky-50/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="max-w-3xl text-sm text-sky-950">
              <strong>Comunicación responsable:</strong> el acta se puede copiar siempre. El correo solo se envía tras una acción explícita y se marcará como enviado únicamente si Amazon SES confirma su aceptación.
            </p>
            <Button onClick={() => setShowNewType(current => !current)}>
              <Plus className="mr-1 h-4 w-4" />Nuevo tipo de reunión
            </Button>
          </CardContent>
        </Card>

        {showNewType && (
          <Card className="mb-5 border-blue-200 bg-blue-50">
            <CardHeader><CardTitle className="text-base">Nuevo tipo de reunión</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  value={typeDraft.name}
                  onChange={event => setTypeDraft(current => ({ ...current, name: event.target.value }))}
                  placeholder="Ej.: Staff, Área, Extraordinaria u Ocasional *"
                />
                <Input
                  value={typeDraft.description}
                  onChange={event => setTypeDraft(current => ({ ...current, description: event.target.value }))}
                  placeholder="Descripción opcional"
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNewType(false)}>Cancelar</Button>
                <Button
                  disabled={!typeDraft.name.trim() || createType.isPending}
                  onClick={() => createType.mutate({ companyId, processId, ...typeDraft })}
                >
                  {createType.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear tipo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {meetingTypes.length ? (
            meetingTypes.map(meetingType => (
              <MeetingTypeCard
                key={meetingType.id}
                companyId={companyId}
                processId={processId}
                meetingType={meetingType}
                processes={processes}
                onRefresh={() => meetingsQuery.refetch()}
              />
            ))
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <CalendarDays className="mx-auto mb-3 h-9 w-9 text-sky-600" />
                <h2 className="font-bold text-slate-800">Aún no hay tipos de reunión</h2>
                <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
                  Cree un tipo como Staff, Área, Extraordinaria u Ocasional. Después podrá registrar reuniones en filas compactas con su avance visible.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}
