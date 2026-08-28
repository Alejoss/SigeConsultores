import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronUp, ExternalLink, FileText, Link2, Upload } from "lucide-react";
import { ProcessLinkDialog } from "@/components/ProcessLinkDialog";
import { SourceEvidenceButton } from "@/components/SourceEvidenceButton";

const MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

function parseMonths(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map(Number)
    .filter(n => n >= 1 && n <= 12);
}

function serializeMonths(months: number[]): string {
  return months.sort((a, b) => a - b).join(",");
}

function calcPercentageMonths(planned: number[], completed: number[]): number {
  if (planned.length === 0) return 0;
  const fulfilled = completed.filter(m => planned.includes(m)).length;
  return Math.round((fulfilled / planned.length) * 100);
}

/** Calcula el % de cumplimiento para modo vigencia y devuelve también el estado */
function calcVigencia(validUntil: string | null | undefined): {
  pct: number;
  status: "vigente" | "por_vencer" | "vencido" | "sin_fecha";
  daysLeft: number;
} {
  if (!validUntil) return { pct: 0, status: "sin_fecha", daysLeft: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const until = new Date(validUntil);
  until.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil(
    (until.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysLeft < 0) return { pct: 0, status: "vencido", daysLeft };
  if (daysLeft <= 30) return { pct: 100, status: "por_vencer", daysLeft };
  return { pct: 100, status: "vigente", daysLeft };
}

function VigenciaBadge({
  status,
  daysLeft,
}: {
  status: string;
  daysLeft: number;
}) {
  if (status === "vigente")
    return (
      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300">
        ✓ Vigente
      </span>
    );
  if (status === "por_vencer")
    return (
      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-300">
        ⚠ Por vencer ({daysLeft}d)
      </span>
    );
  if (status === "vencido")
    return (
      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-300">
        ✗ Vencido
      </span>
    );
  return (
    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-300">
      Sin fecha
    </span>
  );
}

function MonthGrid({
  label,
  selected,
  onChange,
  colorClass,
}: {
  label: string;
  selected: number[];
  onChange: (months: number[]) => void;
  colorClass: string;
}) {
  const toggle = (month: number) => {
    if (selected.includes(month)) {
      onChange(selected.filter(m => m !== month));
    } else {
      onChange([...selected, month]);
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {MONTHS.map((name, i) => {
          const month = i + 1;
          const isSelected = selected.includes(month);
          return (
            <button
              key={month}
              type="button"
              onClick={() => toggle(month)}
              translate="no"
              className={`w-9 h-9 rounded text-xs font-semibold border transition-colors
                ${
                  isSelected
                    ? `${colorClass} text-white border-transparent`
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Compliance {
  id: number;
  companyId: number;
  requirement: string;
  description: string | null;
  obligationType:
    | "Legal"
    | "Reglamentaria"
    | "Concesion"
    | "Sistema de Gestion"
    | "Otros";
  otherObligationType: string | null;
  responsible: string | null;
  completed: "SI" | "NO";
  plannedMonths: string | null;
  completedMonths: string | null;
  observations: string | null;
  evaluationMode: "meses" | "vigencia";
  validFrom: string | null;
  validUntil: string | null;
  evidencePdfUrl: string | null;
  evidencePdfName: string | null;
  evidencePdfKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  requirement: string;
  description: string;
  obligationType:
    | "Legal"
    | "Reglamentaria"
    | "Concesion"
    | "Sistema de Gestion"
    | "Otros"
    | "";
  otherObligationType: string;
  responsible: string;
  plannedMonths: number[];
  completedMonths: number[];
  observations: string;
  evaluationMode: "meses" | "vigencia";
  validFrom: string;
  validUntil: string;
}

export default function Compliances() {
  const [, navigate] = useLocation();

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const queryCompanyId = searchParams.get("companyId");
  const storedCompanyId =
    localStorage.getItem("managerCompanyId") ||
    localStorage.getItem("selectedCompanyId");
  const companyId = queryCompanyId
    ? parseInt(queryCompanyId)
    : storedCompanyId
      ? parseInt(storedCompanyId)
      : 0;

  // Siempre incluir companyId en la URL de retorno para mantener el contexto
  const effectiveCompanyId = queryCompanyId || storedCompanyId;
  const backUrl = `/audits-inspections${effectiveCompanyId ? `?companyId=${effectiveCompanyId}` : ""}`;

  const [compliances, setCompliances] = useState<Compliance[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>({
    requirement: "",
    description: "",
    obligationType: "",
    otherObligationType: "",
    responsible: "",
    plannedMonths: [],
    completedMonths: [],
    observations: "",
    evaluationMode: "meses",
    validFrom: "",
    validUntil: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<Compliance | null>(
    null
  );
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [linkCompliance, setLinkCompliance] = useState<Compliance | null>(null);

  const { data: compliancesData, isLoading } =
    trpc.companyCompliances.list.useQuery(
      { companyId },
      { enabled: companyId > 0 }
    );

  const createMutation = trpc.companyCompliances.create.useMutation();
  const updateMutation = trpc.companyCompliances.update.useMutation();
  const deleteMutation = trpc.companyCompliances.delete.useMutation();
  const uploadEvidenceMutation =
    trpc.companyCompliances.uploadEvidencePdf.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (compliancesData) {
      setCompliances(compliancesData as Compliance[]);
    }
  }, [compliancesData]);

  // Autosave con debouncing
  useEffect(() => {
    if (!editingId || !formData.requirement) return;
    const timer = setTimeout(() => {
      handleUpdateCompliance(editingId);
    }, 1500);
    return () => clearTimeout(timer);
  }, [formData, editingId]);

  /** Calcula el % de una obligación independientemente del modo */
  function getCompliancePct(c: Compliance): number {
    if (c.evaluationMode === "vigencia") {
      return calcVigencia(c.validUntil).pct;
    }
    const planned = parseMonths(c.plannedMonths);
    const completed = parseMonths(c.completedMonths);
    return calcPercentageMonths(planned, completed);
  }

  const { totalCompliances, averageCompliance } = useMemo(() => {
    const total = compliances.length;
    if (total === 0) return { totalCompliances: 0, averageCompliance: 0 };
    const sum = compliances.reduce((acc, c) => acc + getCompliancePct(c), 0);
    return {
      totalCompliances: total,
      averageCompliance: Math.round(sum / total),
    };
  }, [compliances]);

  const uploadEvidencePdf = async (complianceId: number, file: File) => {
    if (
      file.type !== "application/pdf" ||
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      throw new Error("Selecciona únicamente un archivo PDF.");
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      throw new Error("El PDF debe tener un tamaño máximo de 10 MB.");
    }
    const fileData = Array.from(new Uint8Array(await file.arrayBuffer()));
    await uploadEvidenceMutation.mutateAsync({
      companyId,
      complianceId,
      fileName: file.name,
      fileData,
      mimeType: "application/pdf",
    });
    await utils.companyCompliances.list.invalidate({ companyId });
  };

  const handleEvidenceFileSelected = async (file: File | null) => {
    if (!file) return;
    try {
      if (editingId) {
        await uploadEvidencePdf(editingId, file);
        setEvidenceFile(null);
        toast.success("PDF de respaldo actualizado.");
      } else {
        if (
          file.type !== "application/pdf" ||
          !file.name.toLowerCase().endsWith(".pdf")
        )
          throw new Error("Selecciona únicamente un archivo PDF.");
        if (file.size === 0 || file.size > 10 * 1024 * 1024)
          throw new Error("El PDF debe tener un tamaño máximo de 10 MB.");
        setEvidenceFile(file);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el PDF de respaldo."
      );
    }
  };

  const handleAddCompliance = async () => {
    if (!formData.requirement || !formData.obligationType) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        companyId,
        requirement: formData.requirement,
        description: formData.description || undefined,
        obligationType: formData.obligationType as any,
        otherObligationType: formData.otherObligationType || undefined,
        responsible: formData.responsible || undefined,
        plannedMonths: serializeMonths(formData.plannedMonths) || undefined,
        completedMonths: serializeMonths(formData.completedMonths) || undefined,
        observations: formData.observations || undefined,
        evaluationMode: formData.evaluationMode,
        validFrom: formData.validFrom || undefined,
        validUntil: formData.validUntil || undefined,
      });
      if (evidenceFile && created.id)
        await uploadEvidencePdf(created.id, evidenceFile);
      toast.success(
        evidenceFile
          ? "Obligación y PDF de respaldo creados exitosamente"
          : "Obligación creada exitosamente"
      );
      resetForm();
      await utils.companyCompliances.list.invalidate({ companyId });
    } catch {
      toast.error("Error al crear la obligación");
    }
  };

  const dateInputValue = (value: unknown) => {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))
      return value.slice(0, 10);
    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime())
      ? ""
      : parsed.toISOString().slice(0, 10);
  };

  const buildComplianceUpdate = (id: number) => ({
    id,
    requirement: formData.requirement,
    description: formData.description || undefined,
    obligationType: formData.obligationType as any,
    otherObligationType: formData.otherObligationType || undefined,
    responsible: formData.responsible || undefined,
    plannedMonths: serializeMonths(formData.plannedMonths) || undefined,
    completedMonths: serializeMonths(formData.completedMonths) || undefined,
    observations: formData.observations || undefined,
    evaluationMode: formData.evaluationMode,
    // Al editar un Cumplimiento ya vinculado, las fechas sólo se transmiten
    // cuando el usuario las cambia realmente. La renovación se mantiene bajo
    // control del proceso responsable desde Compromisos vinculados.
    ...(formData.validFrom !== dateInputValue(editingOriginal?.validFrom) && {
      validFrom: formData.validFrom || null,
    }),
    ...(formData.validUntil !== dateInputValue(editingOriginal?.validUntil) && {
      validUntil: formData.validUntil || null,
    }),
  });

  const handleUpdateCompliance = async (id: number) => {
    if (!formData.requirement || !formData.obligationType) return;
    try {
      await updateMutation.mutateAsync(buildComplianceUpdate(id));
      await utils.companyCompliances.list.invalidate({ companyId });
    } catch {
      // silencioso en autosave
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !formData.requirement || !formData.obligationType) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }
    try {
      await updateMutation.mutateAsync(buildComplianceUpdate(editingId));
      toast.success("Obligación actualizada exitosamente");
      resetForm();
      setEditingId(null);
      await utils.companyCompliances.list.invalidate({ companyId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible actualizar la obligación."
      );
    }
  };

  const handleDeleteCompliance = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta obligación?"))
      return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Obligación eliminada exitosamente");
      await utils.companyCompliances.list.invalidate({ companyId });
    } catch {
      toast.error("Error al eliminar la obligación");
    }
  };

  const handleEditCompliance = (compliance: Compliance) => {
    setFormData({
      requirement: compliance.requirement,
      description: compliance.description || "",
      obligationType: compliance.obligationType,
      otherObligationType: compliance.otherObligationType || "",
      responsible: compliance.responsible || "",
      plannedMonths: parseMonths(compliance.plannedMonths),
      completedMonths: parseMonths(compliance.completedMonths),
      observations: compliance.observations || "",
      evaluationMode: compliance.evaluationMode ?? "meses",
      validFrom: dateInputValue(compliance.validFrom),
      validUntil: dateInputValue(compliance.validUntil),
    });
    setEditingOriginal(compliance);
    setEditingId(compliance.id);
    setEvidenceFile(null);
    setExpandedId(null);
  };

  const resetForm = () => {
    setFormData({
      requirement: "",
      description: "",
      obligationType: "",
      otherObligationType: "",
      responsible: "",
      plannedMonths: [],
      completedMonths: [],
      observations: "",
      evaluationMode: "meses",
      validFrom: "",
      validUntil: "",
    });
    setEvidenceFile(null);
    setEditingOriginal(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-bold text-gray-900">Cumplimientos</h1>
            <Button variant="outline" onClick={() => navigate(backUrl)}>
              ← Volver
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <Card className="bg-white border-l-4 border-l-green-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">
                  Total de Obligaciones
                </div>
                <div className="text-3xl font-bold text-green-600">
                  {totalCompliances}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">
                  % Promedio de Cumplimiento
                </div>
                <div className="text-3xl font-bold text-blue-600">
                  {averageCompliance}%
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* OBLIGACIONES REGISTRADAS */}
        <div className="space-y-4 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Obligaciones Registradas
          </h2>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              Cargando obligaciones...
            </div>
          ) : compliances.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="pt-6 text-center text-gray-500">
                No hay obligaciones registradas aún
              </CardContent>
            </Card>
          ) : (
            compliances.map(compliance => {
              const mode = compliance.evaluationMode ?? "meses";
              const planned = parseMonths(compliance.plannedMonths);
              const completed = parseMonths(compliance.completedMonths);
              const pctMeses = calcPercentageMonths(planned, completed);
              const vigInfo = calcVigencia(compliance.validUntil);
              const pct = mode === "vigencia" ? vigInfo.pct : pctMeses;

              return (
                <Card key={compliance.id} className="bg-white">
                  <div
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                    onClick={() =>
                      setExpandedId(
                        expandedId === compliance.id ? null : compliance.id
                      )
                    }
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">
                        {compliance.requirement}
                      </h3>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600 items-center">
                        <span className="px-2 py-1 bg-gray-100 rounded">
                          {compliance.obligationType}
                        </span>
                        {/* Badge de modo */}
                        {mode === "vigencia" ? (
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-xs font-medium border border-indigo-200">
                            Por Vigencia
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium border border-blue-200">
                            Por Meses
                          </span>
                        )}
                        {/* Badge de estado vigencia */}
                        {mode === "vigencia" && (
                          <VigenciaBadge
                            status={vigInfo.status}
                            daysLeft={vigInfo.daysLeft}
                          />
                        )}
                        {/* Barra de progreso */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="w-28 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct >= 80
                                  ? "bg-green-500"
                                  : pct >= 50
                                    ? "bg-yellow-400"
                                    : "bg-red-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span
                            className={`font-semibold ${
                              pct >= 80
                                ? "text-green-700"
                                : pct >= 50
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }`}
                          >
                            {pct}%
                          </span>
                          {compliance.evidencePdfUrl && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={event => {
                                event.stopPropagation();
                                window.open(
                                  compliance.evidencePdfUrl!,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Ver respaldo
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronUp
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        expandedId === compliance.id ? "rotate-180" : ""
                      }`}
                    />
                  </div>

                  {expandedId === compliance.id && (
                    <CardContent className="pt-0 pb-6 border-t">
                      <div className="space-y-4 mt-4">
                        {compliance.description && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">
                              Descripción
                            </label>
                            <p className="text-gray-600 whitespace-pre-wrap">
                              {compliance.description}
                            </p>
                          </div>
                        )}
                        {compliance.obligationType === "Otros" &&
                          compliance.otherObligationType && (
                            <div>
                              <label className="text-sm font-semibold text-gray-700">
                                Tipo Específico
                              </label>
                              <p className="text-gray-600">
                                {compliance.otherObligationType}
                              </p>
                            </div>
                          )}
                        {compliance.responsible && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">
                              Responsable
                            </label>
                            <p className="text-gray-600">
                              {compliance.responsible}
                            </p>
                          </div>
                        )}

                        {/* Modo de evaluación */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-700">
                            Modo de Evaluación:
                          </span>
                          {mode === "vigencia" ? (
                            <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-semibold border border-indigo-200">
                              Acciones por Vigencia
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-semibold border border-blue-200">
                              Acciones por Meses
                            </span>
                          )}
                        </div>

                        {/* Vista según modo */}
                        {mode === "meses" ? (
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-semibold text-gray-600 mb-1">
                                Planificado
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {MONTHS.map((name, i) => {
                                  const month = i + 1;
                                  const isPlanned = planned.includes(month);
                                  return (
                                    <div
                                      key={month}
                                      className={`w-9 h-9 rounded text-xs font-semibold border flex items-center justify-center
                                        ${isPlanned ? "bg-blue-500 text-white border-transparent" : "bg-gray-50 text-gray-400 border-gray-200"}`}
                                    >
                                      {name}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-600 mb-1">
                                Cumplimiento
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {MONTHS.map((name, i) => {
                                  const month = i + 1;
                                  const isDone = completed.includes(month);
                                  const wasPlanned = planned.includes(month);
                                  return (
                                    <div
                                      key={month}
                                      className={`w-9 h-9 rounded text-xs font-semibold border flex items-center justify-center
                                        ${
                                          isDone && wasPlanned
                                            ? "bg-green-500 text-white border-transparent"
                                            : isDone && !wasPlanned
                                              ? "bg-yellow-400 text-white border-transparent"
                                              : "bg-gray-50 text-gray-400 border-gray-200"
                                        }`}
                                    >
                                      {name}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Vista vigencia */
                          <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              {compliance.validFrom && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-600 mb-1">
                                    Vigente desde
                                  </p>
                                  <p className="text-sm text-gray-800 font-medium">
                                    {new Date(
                                      compliance.validFrom
                                    ).toLocaleDateString("es-EC", {
                                      day: "2-digit",
                                      month: "long",
                                      year: "numeric",
                                    })}
                                  </p>
                                </div>
                              )}
                              {compliance.validUntil && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-600 mb-1">
                                    Vigente hasta
                                  </p>
                                  <p className="text-sm text-gray-800 font-medium">
                                    {new Date(
                                      compliance.validUntil
                                    ).toLocaleDateString("es-EC", {
                                      day: "2-digit",
                                      month: "long",
                                      year: "numeric",
                                    })}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <VigenciaBadge
                                status={vigInfo.status}
                                daysLeft={vigInfo.daysLeft}
                              />
                              {vigInfo.status === "vigente" && (
                                <span className="text-xs text-gray-500">
                                  Vence en {vigInfo.daysLeft} días
                                </span>
                              )}
                              {vigInfo.status === "por_vencer" && (
                                <span className="text-xs text-yellow-700 font-medium">
                                  ¡Renovar pronto!
                                </span>
                              )}
                              {vigInfo.status === "vencido" && (
                                <span className="text-xs text-red-700 font-medium">
                                  Venció hace {Math.abs(vigInfo.daysLeft)} días
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-teal-900">
                              Asignar responsabilidad a un proceso
                            </p>
                            <p className="text-xs text-teal-700">
                              Seleccione uno, varios o todos los procesos que
                              deben atender este cumplimiento.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-teal-400 bg-white font-semibold text-teal-900 hover:bg-teal-100"
                            onClick={() => setLinkCompliance(compliance)}
                          >
                            <Link2 className="mr-1 h-4 w-4" />
                            Vincular a procesos
                          </Button>
                        </div>

                        {/* % Cumplimiento */}
                        <div>
                          <label className="text-sm font-semibold text-gray-700">
                            % Cumplimiento
                          </label>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 80
                                    ? "bg-green-500"
                                    : pct >= 50
                                      ? "bg-yellow-400"
                                      : "bg-red-400"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span
                              className={`text-lg font-bold min-w-[3rem] text-right ${
                                pct >= 80
                                  ? "text-green-700"
                                  : pct >= 50
                                    ? "text-yellow-600"
                                    : "text-red-600"
                              }`}
                            >
                              {pct}%
                            </span>
                          </div>
                          {mode === "meses" && planned.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {
                                completed.filter(m => planned.includes(m))
                                  .length
                              }{" "}
                              de {planned.length} meses planificados cumplidos
                            </p>
                          )}
                          {mode === "vigencia" && (
                            <p className="text-xs text-gray-500 mt-1">
                              {vigInfo.status === "vigente" ||
                              vigInfo.status === "por_vencer"
                                ? "Documento vigente — 100% de cumplimiento"
                                : vigInfo.status === "vencido"
                                  ? "Documento vencido — 0% de cumplimiento"
                                  : "Sin fecha de vigencia registrada"}
                            </p>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-700">
                              Respaldo documental
                            </p>
                            <SourceEvidenceButton
                              companyId={companyId}
                              sourceType="company_compliance"
                              sourceId={compliance.id}
                            />
                          </div>
                          {compliance.evidencePdfUrl ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <FileText className="h-4 w-4 text-red-600" />
                              <span className="max-w-xs truncate text-sm text-slate-600">
                                {compliance.evidencePdfName || "Respaldo PDF"}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() =>
                                  window.open(
                                    compliance.evidencePdfUrl!,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Ver respaldo
                              </Button>
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-slate-500">
                              No se ha cargado un PDF de respaldo.
                            </p>
                          )}
                        </div>

                        {compliance.observations && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">
                              Observaciones
                            </label>
                            <p className="text-gray-600 whitespace-pre-wrap">
                              {compliance.observations}
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCompliance(compliance)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              handleDeleteCompliance(compliance.id)
                            }
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>

        {linkCompliance && (
          <ProcessLinkDialog
            companyId={companyId}
            sourceType="company_compliance"
            sourceId={linkCompliance.id}
            title={linkCompliance.requirement}
            onClose={() => setLinkCompliance(null)}
            onLinked={() =>
              utils.companyCompliances.list.invalidate({ companyId })
            }
          />
        )}

        {/* FORMULARIO NUEVA / EDITAR OBLIGACIÓN */}
        <Card className="mb-8 bg-white">
          <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 border-b">
            <CardTitle>
              {editingId ? "Editar Obligación" : "Nueva Obligación"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Obligación *
              </label>
              <Textarea
                value={formData.requirement}
                onChange={e =>
                  setFormData({ ...formData, requirement: e.target.value })
                }
                placeholder="Nombre o título de la obligación"
                className="min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Descripción de la obligación
              </label>
              <Textarea
                value={formData.description}
                onChange={e =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe a qué se refiere esta obligación"
                className="min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tipo de Obligación *
              </label>
              <select
                value={formData.obligationType}
                onChange={e =>
                  setFormData({
                    ...formData,
                    obligationType: e.target.value as any,
                  })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>
                  Selecciona el tipo de obligación
                </option>
                <option value="Legal">Legal</option>
                <option value="Reglamentaria">Reglamentaria</option>
                <option value="Concesion">Concesión</option>
                <option value="Sistema de Gestion">Sistema de Gestión</option>
                <option value="Otros">Otros</option>
              </select>
            </div>

            {formData.obligationType === "Otros" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Especifica el tipo de obligación
                </label>
                <Input
                  value={formData.otherObligationType}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      otherObligationType: e.target.value,
                    })
                  }
                  placeholder="Describe el tipo de obligación"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Responsable
              </label>
              <Input
                value={formData.responsible}
                onChange={e =>
                  setFormData({ ...formData, responsible: e.target.value })
                }
                placeholder="Nombre del responsable"
              />
            </div>

            {/* Selector de modo de evaluación */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Modo de Evaluación
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, evaluationMode: "meses" })
                  }
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-semibold transition-colors ${
                    formData.evaluationMode === "meses"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  📅 Acciones por Meses
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, evaluationMode: "vigencia" })
                  }
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-semibold transition-colors ${
                    formData.evaluationMode === "vigencia"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                  }`}
                >
                  🗓 Acciones por Vigencia
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formData.evaluationMode === "meses"
                  ? "Ideal para obligaciones recurrentes (reportes mensuales, inspecciones periódicas, etc.)"
                  : "Ideal para permisos, licencias o documentos con fecha de vencimiento (Permiso IATA, nombramientos, etc.)"}
              </p>
            </div>

            {/* Contenido según modo */}
            {formData.evaluationMode === "meses" ? (
              <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
                <MonthGrid
                  label="Planificado — marca los meses en que planificas cumplir"
                  selected={formData.plannedMonths}
                  onChange={months =>
                    setFormData({ ...formData, plannedMonths: months })
                  }
                  colorClass="bg-blue-500"
                />
                <MonthGrid
                  label="Cumplimiento — marca los meses en que efectivamente cumpliste"
                  selected={formData.completedMonths}
                  onChange={months =>
                    setFormData({ ...formData, completedMonths: months })
                  }
                  colorClass="bg-green-500"
                />
                {formData.plannedMonths.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">
                      % Cumplimiento
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            calcPercentageMonths(
                              formData.plannedMonths,
                              formData.completedMonths
                            ) >= 80
                              ? "bg-green-500"
                              : calcPercentageMonths(
                                    formData.plannedMonths,
                                    formData.completedMonths
                                  ) >= 50
                                ? "bg-yellow-400"
                                : "bg-red-400"
                          }`}
                          style={{
                            width: `${calcPercentageMonths(formData.plannedMonths, formData.completedMonths)}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`text-lg font-bold min-w-[3rem] text-right ${
                          calcPercentageMonths(
                            formData.plannedMonths,
                            formData.completedMonths
                          ) >= 80
                            ? "text-green-700"
                            : calcPercentageMonths(
                                  formData.plannedMonths,
                                  formData.completedMonths
                                ) >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {calcPercentageMonths(
                          formData.plannedMonths,
                          formData.completedMonths
                        )}
                        %
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {
                        formData.completedMonths.filter(m =>
                          formData.plannedMonths.includes(m)
                        ).length
                      }{" "}
                      de {formData.plannedMonths.length} meses planificados
                      cumplidos
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Modo vigencia */
              <div className="border border-indigo-200 rounded-lg p-4 space-y-4 bg-indigo-50">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Vigente desde
                    </label>
                    <Input
                      type="date"
                      value={formData.validFrom}
                      onChange={e =>
                        setFormData({ ...formData, validFrom: e.target.value })
                      }
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Vigente hasta *
                    </label>
                    <Input
                      type="date"
                      value={formData.validUntil}
                      onChange={e =>
                        setFormData({ ...formData, validUntil: e.target.value })
                      }
                      className="bg-white"
                    />
                  </div>
                </div>
                {formData.validUntil &&
                  (() => {
                    const v = calcVigencia(formData.validUntil);
                    return (
                      <div className="flex items-center gap-3">
                        <VigenciaBadge
                          status={v.status}
                          daysLeft={v.daysLeft}
                        />
                        <span className="text-sm font-bold">
                          {v.pct}% de cumplimiento
                        </span>
                        {v.status === "vigente" && (
                          <span className="text-xs text-gray-500">
                            Vence en {v.daysLeft} días
                          </span>
                        )}
                        {v.status === "por_vencer" && (
                          <span className="text-xs text-yellow-700 font-semibold">
                            ¡Renovar pronto!
                          </span>
                        )}
                        {v.status === "vencido" && (
                          <span className="text-xs text-red-700 font-semibold">
                            Venció hace {Math.abs(v.daysLeft)} días
                          </span>
                        )}
                      </div>
                    );
                  })()}
              </div>
            )}

            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
              <label className="block text-sm font-semibold text-blue-950 mb-1">
                PDF de respaldo{" "}
                <span className="font-normal text-blue-700">(opcional)</span>
              </label>
              <p className="mb-3 text-xs text-slate-600">
                Adjunte el documento que demuestra el cumplimiento. Se aceptan
                únicamente archivos PDF de hasta 10 MB.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="max-w-md cursor-pointer bg-white"
                  disabled={uploadEvidenceMutation.isPending}
                  onChange={event => {
                    void handleEvidenceFileSelected(
                      event.target.files?.[0] || null
                    );
                    event.currentTarget.value = "";
                  }}
                />
                {evidenceFile && (
                  <span className="flex items-center gap-1 text-sm font-medium text-blue-800">
                    <FileText className="h-4 w-4" />
                    {evidenceFile.name}
                  </span>
                )}
                {!evidenceFile &&
                  editingId &&
                  compliances.find(compliance => compliance.id === editingId)
                    ?.evidencePdfUrl && (
                    <span className="flex items-center gap-1 text-sm text-slate-600">
                      <FileText className="h-4 w-4 text-red-600" />
                      Actual:{" "}
                      {compliances.find(
                        compliance => compliance.id === editingId
                      )?.evidencePdfName || "PDF de respaldo"}
                    </span>
                  )}
              </div>
              {editingId && (
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <Upload className="h-3.5 w-3.5" />
                  Al seleccionar un PDF, el respaldo actual se reemplaza
                  automáticamente.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Observaciones
              </label>
              <Textarea
                value={formData.observations}
                onChange={e =>
                  setFormData({ ...formData, observations: e.target.value })
                }
                placeholder="Agrega observaciones si lo requieres"
                className="min-h-[80px]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              {editingId ? (
                <>
                  <Button
                    onClick={handleSaveEdit}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Actualizar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setEditingId(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleAddCompliance}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Agregar Obligación
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
