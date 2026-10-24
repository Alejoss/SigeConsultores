import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CirclePlus,
  FileCheck2,
  Flag,
  Lightbulb,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { getAxisBackPathForRole } from "@/lib/sessionScope";
import { useCompanyManagementPermission } from "@/hooks/useCompanyManagementPermission";

type ChangeStatus =
  | "draft"
  | "under_evaluation"
  | "approved"
  | "in_execution"
  | "implemented_pending_verification"
  | "closed"
  | "cancelled";

type ImpactCategory =
  | "quality"
  | "environment"
  | "occupational_health_safety"
  | "legal_compliance"
  | "resources_infrastructure"
  | "technology"
  | "competence_training"
  | "information_documentation"
  | "risks_opportunities"
  | "management_systems"
  | "basc_control_security"
  | "other";

const STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "Borrador",
  under_evaluation: "En evaluación",
  approved: "Aprobado",
  in_execution: "En ejecución",
  implemented_pending_verification: "Pendiente de verificación",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

const STATUS_STYLES: Record<ChangeStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  under_evaluation: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-blue-50 text-blue-800 border-blue-200",
  in_execution: "bg-indigo-50 text-indigo-800 border-indigo-200",
  implemented_pending_verification: "bg-violet-50 text-violet-800 border-violet-200",
  closed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-50 text-rose-800 border-rose-200",
};

const STATUS_GUIDANCE: Record<ChangeStatus, { meaning: string; nextStep: string }> = {
  draft: {
    meaning: "El cambio está siendo preparado. Todavía no existe una autorización para ejecutarlo.",
    nextStep: "Complete el alcance, impactos, acciones e indicador. Luego el Gerente o Coordinador lo envía a evaluación.",
  },
  under_evaluation: {
    meaning: "Gerencia está revisando el impacto, los responsables, los recursos y las condiciones del cambio.",
    nextStep: "Gerencia puede aprobar el plan o cancelar el expediente con su fundamento.",
  },
  approved: {
    meaning: "Gerencia autorizó el cambio y sus condiciones. El plan ya puede comenzar.",
    nextStep: "El responsable o Coordinador debe iniciar la ejecución y dar seguimiento a las acciones.",
  },
  in_execution: {
    meaning: "Los procesos responsables están ejecutando las acciones y cargando sus evidencias.",
    nextStep: "Cuando todas las acciones estén resueltas, solicite la verificación de efectividad.",
  },
  implemented_pending_verification: {
    meaning: "Las acciones se declararon terminadas; falta comprobar con evidencia e indicador si el cambio dio resultado.",
    nextStep: "Registre la verificación. Gerencia podrá cerrar sólo cuando las acciones, indicador y verificación estén completos.",
  },
  closed: {
    meaning: "Gerencia verificó el resultado y autorizó formalmente el cierre del cambio.",
    nextStep: "El expediente permanece como registro histórico consultable.",
  },
  cancelled: {
    meaning: "Gerencia decidió no continuar el cambio y dejó registrada la razón de esa decisión.",
    nextStep: "El expediente permanece como registro histórico consultable.",
  },
};

const ORIGINS = [
  ["strategy", "Estrategia / objetivos"],
  ["audit", "Auditoría, inspección o hallazgo"],
  ["risk_opportunity", "Riesgo u oportunidad"],
  ["legal_requirement", "Requisito legal o normativo"],
  ["client", "Cliente o parte interesada"],
  ["technology", "Tecnología o infraestructura"],
  ["internal_improvement", "Mejora interna"],
  ["other", "Otro origen"],
] as const;

const IMPACTS: Array<[ImpactCategory, string]> = [
  ["quality", "Calidad"],
  ["environment", "Ambiental"],
  ["occupational_health_safety", "Seguridad y salud ocupacional"],
  ["legal_compliance", "Legal y cumplimiento"],
  ["resources_infrastructure", "Recursos e infraestructura"],
  ["technology", "Tecnología"],
  ["competence_training", "Competencia y capacitación"],
  ["information_documentation", "Información y documentación"],
  ["risks_opportunities", "Riesgos y oportunidades"],
  ["management_systems", "Sistemas de gestión"],
  ["basc_control_security", "Control y seguridad BASC"],
  ["other", "Otro impacto"],
];

function dateText(value: unknown) {
  if (!value) return "Sin fecha";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.slice(0, 10).split("-").reverse().join("/");
}

function blankChangeForm() {
  return {
    title: "",
    description: "",
    reason: "",
    objective: "",
    expectedResult: "",
    origin: "internal_improvement" as (typeof ORIGINS)[number][0],
    originDetail: "",
    impactLevel: "medium" as "low" | "medium" | "high",
    responsibleSelection: "",
    responsibleName: "",
    targetCompletionDate: "",
  };
}

export default function ChangeManagement() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const [companyId, setCompanyId] = useState<number | null>(() => {
    if (processLeaderSession?.companyId) return processLeaderSession.companyId;
    const managerId = localStorage.getItem("managerCompanyId");
    return managerId ? Number(managerId) : getCompanyIdFromLocationOrStorage();
  });
  const [companyName] = useState(
    () => processLeaderSession?.companyName || localStorage.getItem("selectedCompanyName") || "Empresa"
  );
  const [newOpen, setNewOpen] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState(blankChangeForm);
  const [suggestion, setSuggestion] = useState({ title: "", rationale: "" });
  const [action, setAction] = useState({ action: "", responsibleProcessId: "", responsibleName: "", responsibleEmail: "", plannedDate: "", resourceRequired: "", trainingRequired: "", documentToUpdate: "", evidenceExpected: "" });
  const [impact, setImpact] = useState({ category: "quality" as ImpactCategory, impactLevel: "medium" as "low" | "medium" | "high", notes: "" });
  const [scope, setScope] = useState({ linkType: "process" as "process" | "strategic_objective" | "subprocess" | "risk_opportunity" | "stakeholder" | "indicator" | "custom_measure", referenceId: "", title: "" });
  const [indicator, setIndicator] = useState({ indicatorId: "", name: "", unit: "", baselineValue: "", targetValue: "", achievedValue: "", measurementDate: "" });
  const [verification, setVerification] = useState({ result: "pending" as "pending" | "effective" | "partially_effective" | "not_effective", notes: "", date: "" });
  const [verificationDirty, setVerificationDirty] = useState(false);
  const { canManageCompany, isChecking } = useCompanyManagementPermission(companyId);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (processLeaderSession?.companyId) setCompanyId(processLeaderSession.companyId);
  }, [processLeaderSession?.companyId]);

  const changesQuery = trpc.changeManagement.list.useQuery(
    { companyId: companyId || 0 },
    { enabled: Boolean(companyId) }
  );
  const optionsQuery = trpc.changeManagement.getReferenceOptions.useQuery(
    { companyId: companyId || 0 },
    { enabled: Boolean(companyId) }
  );
  const suggestionsQuery = trpc.changeManagement.listSuggestions.useQuery(
    { companyId: companyId || 0 },
    { enabled: Boolean(companyId && (isManagerLogin || (!processLeaderSession && !isChecking))) }
  );

  const refetch = async () => {
    await Promise.all([
      utils.changeManagement.list.invalidate(),
      utils.changeManagement.listSuggestions.invalidate(),
    ]);
  };

  const createMutation = trpc.changeManagement.create.useMutation({
    onSuccess: async () => {
      toast.success("Se creó el expediente de cambio.");
      setForm(blankChangeForm());
      setNewOpen(false);
      await refetch();
    },
    onError: error => toast.error(error.message || "No se pudo crear el cambio."),
  });
  const suggestMutation = trpc.changeManagement.suggest.useMutation({
    onSuccess: () => {
      toast.success("La sugerencia fue enviada a Gerencia para evaluación.");
      setSuggestion({ title: "", rationale: "" });
      setSuggestionOpen(false);
    },
    onError: error => toast.error(error.message || "No se pudo enviar la sugerencia."),
  });
  const reviewSuggestionMutation = trpc.changeManagement.reviewSuggestion.useMutation({
    onSuccess: async result => {
      toast.success(result.changeId ? "Se abrió un expediente de cambio desde la sugerencia." : "La sugerencia fue archivada.");
      await refetch();
      if (result.changeId) setDetailId(result.changeId);
    },
    onError: error => toast.error(error.message || "No se pudo revisar la sugerencia."),
  });
  const transitionMutation = trpc.changeManagement.transition.useMutation({
    onSuccess: async () => {
      toast.success("El estado del cambio fue actualizado.");
      await refetch();
    },
    onError: error => toast.error(error.message || "No se pudo cambiar el estado."),
  });
  const actionMutation = trpc.changeManagement.createAction.useMutation({
    onSuccess: async () => {
      toast.success("La acción fue agregada y, si se asignó a un proceso, ya aparece en sus compromisos vinculados.");
      setAction({ action: "", responsibleProcessId: "", responsibleName: "", responsibleEmail: "", plannedDate: "", resourceRequired: "", trainingRequired: "", documentToUpdate: "", evidenceExpected: "" });
      await refetch();
    },
    onError: error => toast.error(error.message || "No se pudo agregar la acción."),
  });
  const impactMutation = trpc.changeManagement.upsertImpacts.useMutation({
    onSuccess: async () => {
      toast.success("Impacto registrado.");
      setImpact({ category: "quality", impactLevel: "medium", notes: "" });
      await refetch();
    },
    onError: error => toast.error(error.message || "No se pudo registrar el impacto."),
  });
  const scopeMutation = trpc.changeManagement.addScopeLinks.useMutation({
    onSuccess: async () => {
      toast.success("Referencia añadida al alcance del cambio.");
      setScope({ linkType: "process", referenceId: "", title: "" });
      await refetch();
    },
    onError: error => toast.error(error.message || "No se pudo añadir la referencia."),
  });
  const indicatorMutation = trpc.changeManagement.addIndicator.useMutation({
    onSuccess: async () => {
      toast.success("Indicador de resultado registrado.");
      setIndicator({ indicatorId: "", name: "", unit: "", baselineValue: "", targetValue: "", achievedValue: "", measurementDate: "" });
      await refetch();
    },
    onError: error => toast.error(error.message || "No se pudo registrar el indicador."),
  });
  const updateMutation = trpc.changeManagement.update.useMutation({
    onSuccess: async () => {
      setVerificationDirty(false);
      await refetch();
    },
    onError: error => {
      setVerificationDirty(false);
      toast.error(error.message || "No se pudo guardar la verificación.");
    },
  });

  const changes = changesQuery.data || [];
  const selectedChange = useMemo(
    () => changes.find(change => change.id === detailId) || null,
    [changes, detailId]
  );
  const isCorporateDecisionMaker = isManagerLogin || user?.role === "admin";
  const isAssignedResponsible = Boolean(
    selectedChange && processLeaderSession && (
      selectedChange.responsibleProcessId === processLeaderSession.processId ||
      selectedChange.responsibleAccountId === processLeaderSession.processLeaderId
    )
  );
  const canManageCorporateChange = canManageCompany;
  const canManageExecution = canManageCompany || isAssignedResponsible;
  const closureRequirements = selectedChange
    ? {
        actions: selectedChange.actions.every(action => action.status === "completed"),
        indicator: selectedChange.indicators.some(indicator => Boolean(indicator.achievedValue) && Boolean(indicator.measurementDate)),
        verification: selectedChange.verificationResult !== "pending" && Boolean(selectedChange.verificationNotes?.trim()),
      }
    : null;

  useEffect(() => {
    if (!selectedChange) return;
    setVerificationDirty(false);
    setVerification({
      result: selectedChange.verificationResult || "pending",
      notes: selectedChange.verificationNotes || "",
      date: selectedChange.verificationDate ? String(selectedChange.verificationDate).slice(0, 10) : "",
    });
  }, [selectedChange?.id, selectedChange?.verificationResult, selectedChange?.verificationNotes, selectedChange?.verificationDate]);

  useEffect(() => {
    if (
      !verificationDirty ||
      updateMutation.isPending ||
      !companyId ||
      !selectedChange ||
      verification.result === "pending" ||
      !verification.notes.trim()
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      updateMutation.mutate({
        companyId,
        id: selectedChange.id,
        verificationResult: verification.result,
        verificationNotes: verification.notes,
        verificationDate: verification.date || undefined,
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [companyId, selectedChange?.id, updateMutation.isPending, verification, verificationDirty]);
  const referenceItems = useMemo(() => {
    const data = optionsQuery.data;
    if (!data) return [] as Array<{ id: number; label: string }>;
    if (scope.linkType === "process") return data.processes.map(item => ({ id: item.id, label: item.name }));
    if (scope.linkType === "strategic_objective") return data.strategicObjectives.map(item => ({ id: item.id, label: item.objective }));
    if (scope.linkType === "subprocess") return data.subprocesses.map(item => ({ id: item.id, label: item.name }));
    if (scope.linkType === "risk_opportunity") return data.risks.map(item => ({ id: item.id, label: item.description }));
    if (scope.linkType === "stakeholder") return data.stakeholders.map(item => ({ id: item.id, label: item.name }));
    if (scope.linkType === "indicator") return data.indicators.map(item => ({ id: item.id, label: item.name }));
    return [];
  }, [optionsQuery.data, scope.linkType]);

  const handleCreate = () => {
    if (!companyId || !form.title.trim()) {
      toast.error("Indica al menos el título del cambio.");
      return;
    }
    createMutation.mutate({
      companyId,
      ...form,
      targetCompletionDate: form.targetCompletionDate || undefined,
      description: form.description || undefined,
      reason: form.reason || undefined,
      objective: form.objective || undefined,
      expectedResult: form.expectedResult || undefined,
      originDetail: form.originDetail || undefined,
      responsibleProcessId: form.responsibleSelection.startsWith("process:")
        ? Number(form.responsibleSelection.slice("process:".length))
        : undefined,
      responsibleName: form.responsibleSelection === "other" && form.responsibleName.trim()
        ? form.responsibleName.trim()
        : undefined,
    });
  };

  const handleSuggestion = () => {
    if (!companyId || !suggestion.title.trim() || !suggestion.rationale.trim()) {
      toast.error("Indica el cambio sugerido y su justificación.");
      return;
    }
    suggestMutation.mutate({ companyId, ...suggestion });
  };

  const move = (status: ChangeStatus) => {
    if (!companyId || !selectedChange) return;
    const notePrompt = status === "approved"
      ? "Registra la decisión de Gerencia y las condiciones de aprobación:"
      : status === "closed"
        ? "Registra la conclusión gerencial para autorizar el cierre:"
        : status === "cancelled"
          ? "Indica el motivo de la cancelación:"
          : null;
    const note = notePrompt ? window.prompt(notePrompt) || "" : undefined;
    if (notePrompt && !note) return;
    transitionMutation.mutate({ companyId, id: selectedChange.id, status, note });
  };

  const addAction = () => {
    if (!companyId || !selectedChange || !action.action.trim() || !action.responsibleProcessId) {
      toast.error("Describe la acción y selecciona el proceso responsable.");
      return;
    }
    actionMutation.mutate({
      companyId,
      changeId: selectedChange.id,
      action: action.action.trim(),
      responsibleProcessId: Number(action.responsibleProcessId),
      responsibleName: action.responsibleName || undefined,
      responsibleEmail: action.responsibleEmail || undefined,
      plannedDate: action.plannedDate || undefined,
      resourceRequired: action.resourceRequired || undefined,
      trainingRequired: action.trainingRequired || undefined,
      documentToUpdate: action.documentToUpdate || undefined,
      evidenceExpected: action.evidenceExpected || undefined,
    });
  };

  const addImpact = () => {
    if (!companyId || !selectedChange) return;
    impactMutation.mutate({ companyId, changeId: selectedChange.id, impacts: [impact] });
  };

  const addScope = () => {
    if (!companyId || !selectedChange) return;
    if (scope.linkType === "custom_measure" && !scope.title.trim()) {
      toast.error("Describe la medida propia que deseas evaluar.");
      return;
    }
    if (scope.linkType !== "custom_measure" && !scope.referenceId) {
      toast.error("Selecciona un elemento para vincular.");
      return;
    }
    scopeMutation.mutate({
      companyId,
      changeId: selectedChange.id,
      links: [{
        linkType: scope.linkType,
        referenceId: scope.referenceId ? Number(scope.referenceId) : undefined,
        title: scope.title || undefined,
      }],
    });
  };

  const addIndicator = () => {
    if (!companyId || !selectedChange || !indicator.name.trim()) {
      toast.error("Indica el nombre del indicador de resultado.");
      return;
    }
    const reference = optionsQuery.data?.indicators.find(item => item.id === Number(indicator.indicatorId));
    indicatorMutation.mutate({
      companyId,
      changeId: selectedChange.id,
      indicatorId: indicator.indicatorId ? Number(indicator.indicatorId) : undefined,
      processId: reference?.processId || undefined,
      name: indicator.name,
      unit: indicator.unit || undefined,
      baselineValue: indicator.baselineValue || undefined,
      targetValue: indicator.targetValue || undefined,
      achievedValue: indicator.achievedValue || undefined,
      measurementDate: indicator.measurementDate || undefined,
    });
  };

  if (!companyId) {
    return <DashboardLayout><Card><CardContent className="pt-6 text-slate-600">Selecciona una empresa antes de gestionar sus cambios.</CardContent></Card></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 pb-10">
        <div className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><ClipboardList size={27} /></div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-slate-900">Gestión de Cambios</h1><Badge variant="outline" className="border-sky-200 bg-white text-sky-700">{companyName}</Badge></div>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">Planifica cambios de forma controlada, asigna acciones a los procesos, revisa evidencias y deja el cierre aprobado por Gerencia.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLocation(getAxisBackPathForRole())}><ArrowLeft size={16} className="mr-2" />Volver</Button>
            {canManageCompany ? <Button onClick={() => setNewOpen(true)}><CirclePlus size={17} className="mr-2" />Nuevo cambio</Button> : <Button variant="outline" onClick={() => setSuggestionOpen(true)}><Lightbulb size={17} className="mr-2" />Sugerir cambio</Button>}
          </div>
        </div>

        {!isChecking && !canManageCompany && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <strong>Consulta y participación.</strong> Puede revisar los cambios de su empresa y sugerir uno nuevo. Si Gerencia le asigna un expediente como responsable, podrá impulsar sus acciones y preparar la verificación, sin aprobar ni cerrar por sí solo.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            ["Expedientes", changes.length, "text-sky-700"],
            ["En ejecución", changes.filter(item => item.status === "in_execution").length, "text-indigo-700"],
            ["Pendientes de verificación", changes.filter(item => item.status === "implemented_pending_verification").length, "text-violet-700"],
            ["Cerrados", changes.filter(item => item.status === "closed").length, "text-emerald-700"],
          ].map(([label, total, style]) => <Card key={String(label)}><CardContent className="flex items-center justify-between py-4"><span className="text-sm text-slate-600">{label}</span><span className={`text-2xl font-bold ${style}`}>{total}</span></CardContent></Card>)}
        </div>

        {isCorporateDecisionMaker && suggestionsQuery.data && suggestionsQuery.data.filter(item => item.status === "pending").length > 0 && (
          <Card className="border-amber-200 bg-amber-50/40"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base text-amber-900"><Lightbulb size={18} />Sugerencias pendientes de los Jefes de Proceso</CardTitle><CardDescription>Estas sugerencias quedan visibles para que Gerencia las trate en la reunión correspondiente antes de abrir un expediente formal.</CardDescription></CardHeader><CardContent className="space-y-2">{suggestionsQuery.data.filter(item => item.status === "pending").map(item => <div className="rounded-lg border border-amber-200 bg-white p-3" key={item.id}><p className="font-medium text-slate-800">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.rationale}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Sugerido por {item.suggestedByName || "Jefe de Proceso"} · {dateText(item.createdAt)}</p><div className="flex gap-2"><Button size="sm" variant="outline" className="text-rose-700" onClick={() => reviewSuggestionMutation.mutate({ companyId, id: item.id, decision: "dismissed" })}>Archivar</Button><Button size="sm" onClick={() => reviewSuggestionMutation.mutate({ companyId, id: item.id, decision: "accepted" })}><CirclePlus size={14} className="mr-1" />Abrir expediente</Button></div></div></div>)}</CardContent></Card>
        )}

        {changesQuery.isLoading ? <Card><CardContent className="flex items-center gap-3 py-10 text-slate-600"><Loader2 className="animate-spin" />Cargando los expedientes de cambio…</CardContent></Card> : changes.length === 0 ? <Card className="border-dashed"><CardContent className="py-12 text-center"><ClipboardList className="mx-auto mb-3 text-slate-400" size={40} /><p className="font-medium text-slate-700">Aún no hay cambios registrados.</p><p className="mt-1 text-sm text-slate-500">Los Jefes pueden sugerirlos y Gerencia o un Coordinador autorizado puede preparar el expediente.</p></CardContent></Card> : <div className="space-y-3">{changes.map(change => {
          const isExpanded = expanded === change.id;
          const pct = change.actionProgress.total ? Math.round((change.actionProgress.completed / change.actionProgress.total) * 100) : 0;
          return <Card key={change.id} className="overflow-hidden"><CardContent className="p-0"><button className="flex w-full items-start gap-4 p-5 text-left hover:bg-slate-50" onClick={() => setExpanded(isExpanded ? null : change.id)}><div className="mt-0.5 rounded-lg bg-sky-50 p-2 text-sky-700"><Flag size={20} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{change.title}</h2><Badge variant="outline" className={STATUS_STYLES[change.status as ChangeStatus]}>{STATUS_LABELS[change.status as ChangeStatus]}</Badge><Badge variant="outline" className="border-slate-200 text-slate-600">Impacto {change.impactLevel === "high" ? "alto" : change.impactLevel === "medium" ? "medio" : "bajo"}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-slate-600">{change.description || change.reason || "Sin descripción adicional."}</p><div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500"><span>{change.responsibleProcessId ? "Proceso responsable" : "Responsable"}: {change.responsibleName || "Por asignar"}</span><span>Meta: {dateText(change.targetCompletionDate)}</span><span>{change.actionProgress.completed}/{change.actionProgress.total} acciones completadas ({pct}%)</span></div></div>{isExpanded ? <ChevronUp className="mt-1 text-slate-400" /> : <ChevronDown className="mt-1 text-slate-400" />}</button>{isExpanded && <div className="border-t bg-slate-50/40 p-5"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setDetailId(change.id)}><FileCheck2 size={15} className="mr-2" />Abrir expediente</Button></div></div>}</CardContent></Card>;
        })}</div>}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-0 sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader className="sticky top-0 z-20 border-b bg-white px-6 py-5 pr-14 shadow-sm">
            <DialogTitle>Nuevo expediente de cambio</DialogTitle>
            <DialogDescription>Este registro queda en borrador hasta que Gerencia lo evalúe y apruebe.</DialogDescription>
          </DialogHeader>
          <div className="mx-auto grid w-full max-w-6xl gap-5 p-6 md:grid-cols-2">
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium">Nombre del cambio *</span><Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ej.: Implementar control digital de entregas" /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium">Descripción del cambio</span><Textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Qué se modificará y qué áreas están involucradas." /></label>
            <label className="space-y-1"><span className="text-sm font-medium">Origen</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.origin} onChange={event => setForm({ ...form, origin: event.target.value as typeof form.origin })}>{ORIGINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1"><span className="text-sm font-medium">Nivel de impacto</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.impactLevel} onChange={event => setForm({ ...form, impactLevel: event.target.value as typeof form.impactLevel })}><option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option></select></label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm font-medium">Proceso responsable de dar seguimiento</span>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.responsibleSelection} onChange={event => setForm({ ...form, responsibleSelection: event.target.value, responsibleName: event.target.value === "other" ? form.responsibleName : "" })}>
                <option value="">Asignar después</option>
                <optgroup label="Procesos de la empresa">
                  {optionsQuery.data?.processes.map(process => <option key={process.id} value={`process:${process.id}`}>{process.name}</option>)}
                </optgroup>
                <option value="other">Otro: escribir cargo o nombre</option>
              </select>
              <p className="text-xs text-slate-500">Al seleccionar un proceso, su responsable podrá impulsar las acciones que se le vinculen.</p>
            </label>
            {form.responsibleSelection === "other" && <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium">Cargo o nombre del responsable externo</span><Input value={form.responsibleName} onChange={event => setForm({ ...form, responsibleName: event.target.value })} placeholder="Ej.: Jefe de Talento Humano o proveedor externo" /></label>}
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium">Motivo / necesidad</span><Textarea value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} placeholder="Por qué se propone este cambio." /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium">Objetivo esperado</span><Textarea value={form.objective} onChange={event => setForm({ ...form, objective: event.target.value })} placeholder="Qué resultado desea alcanzar la empresa." /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium">Resultado verificable</span><Textarea value={form.expectedResult} onChange={event => setForm({ ...form, expectedResult: event.target.value })} placeholder="Cómo se comprobará que el cambio funcionó." /></label>
            <label className="space-y-1"><span className="text-sm font-medium">Fecha meta</span><Input type="date" value={form.targetCompletionDate} onChange={event => setForm({ ...form, targetCompletionDate: event.target.value })} /></label>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(15,23,42,0.05)]"><Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button><Button disabled={createMutation.isPending} onClick={handleCreate}>{createMutation.isPending && <Loader2 className="mr-2 animate-spin" size={16} />}Crear borrador</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={suggestionOpen} onOpenChange={setSuggestionOpen}><DialogContent><DialogHeader><DialogTitle>Sugerir un cambio a Gerencia</DialogTitle><DialogDescription>Tu sugerencia no modifica nada. Gerencia la revisará y, si la acepta, abrirá el expediente y convocará la reunión necesaria.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><label className="space-y-1"><span className="text-sm font-medium">Cambio sugerido *</span><Input value={suggestion.title} onChange={event => setSuggestion({ ...suggestion, title: event.target.value })} /></label><label className="space-y-1"><span className="text-sm font-medium">Problema, oportunidad o razón *</span><Textarea value={suggestion.rationale} onChange={event => setSuggestion({ ...suggestion, rationale: event.target.value })} /></label></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSuggestionOpen(false)}>Cancelar</Button><Button disabled={suggestMutation.isPending} onClick={handleSuggestion}><Send size={16} className="mr-2" />Enviar sugerencia</Button></div></DialogContent></Dialog>

      <Dialog
        open={Boolean(selectedChange)}
        onOpenChange={open => !open && setDetailId(null)}
      >
        <DialogContent className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-0 sm:max-w-[calc(100vw-2rem)]">
          {selectedChange && (
            <>
              <DialogHeader className="sticky top-0 z-20 border-b bg-white px-6 py-5 pr-14 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <DialogTitle>{selectedChange.title}</DialogTitle>
                  <Badge
                    variant="outline"
                    className={STATUS_STYLES[selectedChange.status as ChangeStatus]}
                  >
                    {STATUS_LABELS[selectedChange.status as ChangeStatus]}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDetailId(null)}
                  >
                    Salir
                  </Button>
                </div>
                <DialogDescription>
                  Expediente #{selectedChange.id} · creado el {dateText(selectedChange.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 p-6 xl:grid-cols-4">
                <div className="space-y-5 xl:col-span-3">
                  <section className="rounded-xl border bg-white p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
                      <Target size={18} className="text-sky-700" />
                      Fundamento y resultado esperado
                    </h3>
                    <div className="space-y-3 text-sm">
                      <p><span className="font-medium">Motivo:</span> {selectedChange.reason || "No registrado"}</p>
                      <p><span className="font-medium">Objetivo:</span> {selectedChange.objective || "No registrado"}</p>
                      <p><span className="font-medium">Resultado verificable:</span> {selectedChange.expectedResult || "No registrado"}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                        <UsersRound size={18} className="text-sky-700" />
                        Acciones y compromisos
                      </h3>
                      <span className="text-xs text-slate-500">
                        Las acciones asignadas a un proceso aparecen automáticamente en sus Compromisos vinculados.
                      </span>
                    </div>
                    <div className="space-y-2">
                      {selectedChange.actions.length === 0 ? (
                        <p className="text-sm text-slate-500">Aún no hay acciones planificadas.</p>
                      ) : selectedChange.actions.map(item => (
                        <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-medium text-slate-800">{item.action}</p>
                            <Badge
                              variant="outline"
                              className={item.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}
                            >
                              {item.status === "completed" ? "Completada" : "Pendiente"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            Responsable: {optionsQuery.data?.processes.find(process => process.id === item.responsibleProcessId)?.name || item.responsibleName || "Sin asignar"}
                            {item.responsibleEmail ? ` · ${item.responsibleEmail}` : ""}
                            {` · Fecha: ${dateText(item.plannedDate)}`}
                          </p>
                          {(item.resourceRequired || item.trainingRequired || item.documentToUpdate || item.evidenceExpected) && (
                            <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                              {item.resourceRequired && <p>Recursos: {item.resourceRequired}</p>}
                              {item.trainingRequired && <p>Capacitación: {item.trainingRequired}</p>}
                              {item.documentToUpdate && <p>Documento a actualizar: {item.documentToUpdate}</p>}
                              {item.evidenceExpected && <p>Evidencia esperada: {item.evidenceExpected}</p>}
                            </div>
                          )}
                          {item.linkProgress.total > 0 && (
                            <p className="mt-2 text-xs text-sky-700">
                              Compromisos vinculados completados: {item.linkProgress.completed}/{item.linkProgress.total}. El proceso responsable registra allí el avance y la evidencia.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    {canManageExecution && selectedChange.status !== "closed" && selectedChange.status !== "cancelled" && (
                      <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                        <Input value={action.action} onChange={event => setAction({ ...action, action: event.target.value })} placeholder="Acción a realizar *" />
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={action.responsibleProcessId} onChange={event => setAction({ ...action, responsibleProcessId: event.target.value })}>
                          <option value="">Seleccionar proceso responsable *</option>
                          {optionsQuery.data?.processes.map(process => <option key={process.id} value={process.id}>{process.name}</option>)}
                        </select>
                        <Input value={action.responsibleName} onChange={event => setAction({ ...action, responsibleName: event.target.value })} placeholder="Responsable sin acceso (opcional)" />
                        <Input type="email" value={action.responsibleEmail} onChange={event => setAction({ ...action, responsibleEmail: event.target.value })} placeholder="Correo del responsable (opcional)" />
                        <Input type="date" value={action.plannedDate} onChange={event => setAction({ ...action, plannedDate: event.target.value })} />
                        <Input value={action.evidenceExpected} onChange={event => setAction({ ...action, evidenceExpected: event.target.value })} placeholder="Evidencia esperada" />
                        <Input value={action.resourceRequired} onChange={event => setAction({ ...action, resourceRequired: event.target.value })} placeholder="Recursos requeridos (opcional)" />
                        <Input value={action.trainingRequired} onChange={event => setAction({ ...action, trainingRequired: event.target.value })} placeholder="Capacitación requerida (opcional)" />
                        <Input className="sm:col-span-2" value={action.documentToUpdate} onChange={event => setAction({ ...action, documentToUpdate: event.target.value })} placeholder="Documento o registro que se actualizará (opcional)" />
                        <Button className="sm:col-span-2" size="sm" onClick={addAction} disabled={actionMutation.isPending}>
                          <Plus size={15} className="mr-2" />Agregar acción
                        </Button>
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border bg-white p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
                      <ShieldCheck size={18} className="text-sky-700" />
                      Evaluación de impactos
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedChange.impacts.map(item => (
                        <Badge key={item.id} variant="outline" className="border-slate-200 text-slate-700">
                          {IMPACTS.find(([value]) => value === item.category)?.[1] || item.category}: {item.impactLevel === "high" ? "alto" : item.impactLevel === "medium" ? "medio" : "bajo"}
                        </Badge>
                      ))}
                    </div>
                    {canManageCorporateChange && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={impact.category} onChange={event => setImpact({ ...impact, category: event.target.value as ImpactCategory })}>
                          {IMPACTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={impact.impactLevel} onChange={event => setImpact({ ...impact, impactLevel: event.target.value as typeof impact.impactLevel })}>
                          <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                        </select>
                        <Button size="sm" variant="outline" onClick={addImpact}>Registrar impacto</Button>
                        <Textarea className="sm:col-span-3" value={impact.notes} onChange={event => setImpact({ ...impact, notes: event.target.value })} placeholder="Explicación o controles necesarios (opcional)" />
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border bg-white p-4">
                    <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
                      <Target size={18} className="text-sky-700" />
                      Indicador de resultado
                    </h3>
                    <p className="mb-3 text-xs text-slate-500">Permite comprobar objetivamente si el cambio consiguió el resultado previsto.</p>
                    <div className="space-y-2">
                      {selectedChange.indicators.length === 0 ? <p className="text-sm text-slate-500">Aún no se ha definido un indicador.</p> : selectedChange.indicators.map(item => (
                        <div className="rounded-lg border border-slate-200 p-3 text-sm" key={item.id}>
                          <p className="font-medium text-slate-800">{item.name}</p>
                          <p className="mt-1 text-slate-600">Línea base: {item.baselineValue || "—"} {item.unit || ""} · Meta: {item.targetValue || "—"} {item.unit || ""} · Resultado: {item.achievedValue || "—"} {item.unit || ""}</p>
                          {item.measurementDate && <p className="mt-1 text-xs text-slate-500">Medido el {dateText(item.measurementDate)}</p>}
                        </div>
                      ))}
                    </div>
                    {canManageCorporateChange && selectedChange.status !== "closed" && selectedChange.status !== "cancelled" && (
                      <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={indicator.indicatorId} onChange={event => {
                          const selected = optionsQuery.data?.indicators.find(item => item.id === Number(event.target.value));
                          setIndicator({ ...indicator, indicatorId: event.target.value, name: selected?.name || indicator.name, unit: selected?.unit || indicator.unit });
                        }}>
                          <option value="">Usar indicador existente (opcional)</option>
                          {optionsQuery.data?.indicators.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <Input value={indicator.name} onChange={event => setIndicator({ ...indicator, name: event.target.value })} placeholder="Nombre del indicador *" />
                        <Input value={indicator.unit} onChange={event => setIndicator({ ...indicator, unit: event.target.value })} placeholder="Unidad de medida" />
                        <Input value={indicator.baselineValue} onChange={event => setIndicator({ ...indicator, baselineValue: event.target.value })} placeholder="Línea base" />
                        <Input value={indicator.targetValue} onChange={event => setIndicator({ ...indicator, targetValue: event.target.value })} placeholder="Meta" />
                        <Input value={indicator.achievedValue} onChange={event => setIndicator({ ...indicator, achievedValue: event.target.value })} placeholder="Resultado alcanzado" />
                        <Input type="date" value={indicator.measurementDate} onChange={event => setIndicator({ ...indicator, measurementDate: event.target.value })} />
                        <Button size="sm" variant="outline" onClick={addIndicator} disabled={indicatorMutation.isPending}>Registrar indicador</Button>
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border bg-white p-4">
                    <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
                      <CheckCircle2 size={18} className="text-sky-700" />
                      Verificación de efectividad
                    </h3>
                    <p className="mb-3 text-xs text-slate-500">El responsable prepara esta evidencia; Gerencia revisa y autoriza el cierre final.</p>
                    {selectedChange.verificationResult !== "pending" && <p className="mb-3 text-sm text-slate-700">Resultado registrado: <strong>{selectedChange.verificationResult === "effective" ? "Efectivo" : selectedChange.verificationResult === "partially_effective" ? "Parcialmente efectivo" : "No efectivo"}</strong>{selectedChange.verificationDate ? ` · ${dateText(selectedChange.verificationDate)}` : ""}</p>}
                    {selectedChange.verificationNotes && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{selectedChange.verificationNotes}</p>}
                    {canManageExecution && selectedChange.status !== "closed" && selectedChange.status !== "cancelled" && (
                      <div className="grid gap-2 rounded-lg bg-slate-50 p-3">
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={verification.result} onChange={event => {
                          setVerification({ ...verification, result: event.target.value as typeof verification.result });
                          setVerificationDirty(true);
                        }}>
                          <option value="pending">Pendiente de verificar</option>
                          <option value="effective">Efectivo</option>
                          <option value="partially_effective">Parcialmente efectivo</option>
                          <option value="not_effective">No efectivo</option>
                        </select>
                        <Input type="date" value={verification.date} onChange={event => {
                          setVerification({ ...verification, date: event.target.value });
                          setVerificationDirty(true);
                        }} />
                        <Textarea value={verification.notes} onChange={event => {
                          setVerification({ ...verification, notes: event.target.value });
                          setVerificationDirty(true);
                        }} placeholder="Evidencia, resultado de la medición y conclusión de efectividad" />
                        <p className="text-xs text-slate-500">{updateMutation.isPending ? "Guardando verificación…" : verificationDirty ? "La verificación se guardará automáticamente…" : "Los cambios se guardan automáticamente al terminar de escribir."}</p>
                      </div>
                    )}
                  </section>
                </div>

                <aside className="space-y-4">
                  <section className="rounded-xl border bg-sky-50/40 p-4">
                    <h3 className="font-semibold text-slate-800">Alcance vinculado</h3>
                    <div className="mt-3 space-y-2">
                      {selectedChange.scope.length === 0 ? <p className="text-sm text-slate-500">Sin referencias todavía.</p> : selectedChange.scope.map(item => (
                        <div key={item.id} className="rounded-md bg-white p-2 text-sm"><p className="font-medium text-slate-700">{item.titleSnapshot}</p><p className="text-xs text-slate-500">{item.linkType.replaceAll("_", " ")}</p></div>
                      ))}
                    </div>
                    {canManageCorporateChange && (
                      <div className="mt-3 space-y-2">
                        <select className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={scope.linkType} onChange={event => setScope({ linkType: event.target.value as typeof scope.linkType, referenceId: "", title: "" })}>
                          <option value="process">Proceso</option><option value="subprocess">Subproceso</option><option value="strategic_objective">Objetivo estratégico</option><option value="risk_opportunity">Riesgo u oportunidad</option><option value="stakeholder">Parte interesada</option><option value="indicator">Indicador</option><option value="custom_measure">Medida propia</option>
                        </select>
                        {scope.linkType === "custom_measure" ? <Input value={scope.title} onChange={event => setScope({ ...scope, title: event.target.value })} placeholder="Nombre de la medida" /> : <select className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={scope.referenceId} onChange={event => setScope({ ...scope, referenceId: event.target.value })}><option value="">Seleccionar…</option>{referenceItems.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
                        <Button className="w-full" size="sm" variant="outline" onClick={addScope}>Vincular referencia</Button>
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border p-4">
                    <h3 className="font-semibold text-slate-800">Historial del expediente</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">Esta bitácora no se llena manualmente: ISGE 360 registra automáticamente quién creó o actualizó el expediente, los impactos, acciones, evidencias y decisiones. Sirve como respaldo de trazabilidad.</p>
                    <div className="mt-3 space-y-3">
                      {selectedChange.events.length === 0 ? <p className="text-sm text-slate-500">Sin eventos registrados.</p> : selectedChange.events.map(item => <div className="border-l-2 border-sky-200 pl-3" key={item.id}><p className="text-sm text-slate-700">{item.detail}</p><p className="mt-0.5 text-xs text-slate-500">{item.actorName || "ISGE 360"} · {dateText(item.createdAt)}</p></div>)}
                    </div>
                  </section>

                  <section className="rounded-xl border p-4">
                    <h3 className="font-semibold text-slate-800">Etapa actual y siguiente paso</h3>
                    <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3">
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={STATUS_STYLES[selectedChange.status as ChangeStatus]}>{STATUS_LABELS[selectedChange.status as ChangeStatus]}</Badge><span className="text-sm font-medium text-slate-800">Estado actual</span></div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">{STATUS_GUIDANCE[selectedChange.status as ChangeStatus].meaning}</p>
                      <p className="mt-2 text-xs leading-relaxed text-sky-900"><strong>Siguiente paso:</strong> {STATUS_GUIDANCE[selectedChange.status as ChangeStatus].nextStep}</p>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">Gerencia aprueba, cancela y cierra. El responsable del proceso o Coordinador prepara y ejecuta el plan, pero no toma esas decisiones.</p>
                    {selectedChange.status !== "closed" && selectedChange.status !== "cancelled" && (
                      <div className="mt-3 grid gap-2">
                        {selectedChange.status === "draft" && canManageCompany && <Button size="sm" variant="outline" onClick={() => move("under_evaluation")}>Enviar a evaluación de Gerencia</Button>}
                        {selectedChange.status === "under_evaluation" && isCorporateDecisionMaker && <Button size="sm" onClick={() => move("approved")}><CheckCircle2 size={15} className="mr-2" />Aprobar e iniciar el plan</Button>}
                        {selectedChange.status === "approved" && canManageExecution && <Button size="sm" variant="outline" onClick={() => move("in_execution")}>Marcar inicio de ejecución</Button>}
                        {selectedChange.status === "in_execution" && canManageExecution && <Button size="sm" variant="outline" onClick={() => move("implemented_pending_verification")}>Solicitar verificación de efectividad</Button>}
                        {selectedChange.status === "implemented_pending_verification" && isCorporateDecisionMaker && <Button size="sm" disabled={Boolean(closureRequirements && (!closureRequirements.actions || !closureRequirements.indicator || !closureRequirements.verification))} onClick={() => move("closed")}><CheckCircle2 size={15} className="mr-2" />Aprobar el cierre definitivo</Button>}
                        {selectedChange.status === "implemented_pending_verification" && closureRequirements && (!closureRequirements.actions || !closureRequirements.indicator || !closureRequirements.verification) && <p className="text-xs text-amber-700">Para cerrar faltan: {!closureRequirements.actions ? "acciones cumplidas" : ""}{!closureRequirements.actions && (!closureRequirements.indicator || !closureRequirements.verification) ? ", " : ""}{!closureRequirements.indicator ? "indicador medido" : ""}{!closureRequirements.indicator && !closureRequirements.verification ? ", " : ""}{!closureRequirements.verification ? "verificación registrada" : ""}.</p>}
                        {isCorporateDecisionMaker && <Button size="sm" variant="ghost" className="text-rose-700 hover:text-rose-800" onClick={() => move("cancelled")}>Cancelar expediente</Button>}
                      </div>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
