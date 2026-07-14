import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronUp } from "lucide-react";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

function parseMonths(value: string | null | undefined): number[] {
  if (!value) return [];
  return value.split(",").map(Number).filter((n) => n >= 1 && n <= 12);
}

function serializeMonths(months: number[]): string {
  return months.sort((a, b) => a - b).join(",");
}

function calcPercentage(planned: number[], completed: number[]): number {
  if (planned.length === 0) return 0;
  const fulfilled = completed.filter((m) => planned.includes(m)).length;
  return Math.round((fulfilled / planned.length) * 100);
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
      onChange(selected.filter((m) => m !== month));
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
                ${isSelected
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
  obligationType: "Legal" | "Reglamentaria" | "Concesion" | "Sistema de Gestion" | "Otros";
  otherObligationType: string | null;
  responsible: string | null;
  completed: "SI" | "NO";
  plannedMonths: string | null;
  completedMonths: string | null;
  observations: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  requirement: string;
  description: string;
  obligationType: "Legal" | "Reglamentaria" | "Concesion" | "Sistema de Gestion" | "Otros" | "";
  otherObligationType: string;
  responsible: string;
  plannedMonths: number[];
  completedMonths: number[];
  observations: string;
}

export default function Compliances() {
  const [, navigate] = useLocation();

  // Resolve companyId: query params take priority over localStorage
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const queryCompanyId = searchParams.get("companyId");
  const storedCompanyId = localStorage.getItem("managerCompanyId") || localStorage.getItem("selectedCompanyId");
  const companyId = queryCompanyId ? parseInt(queryCompanyId) : storedCompanyId ? parseInt(storedCompanyId) : 0;

  // Back URL: return to audits-inspections (Sistema de Gestión hub)
  const backUrl = `/audits-inspections${queryCompanyId ? `?companyId=${queryCompanyId}` : ""}`;

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
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: compliancesData, isLoading } = trpc.companyCompliances.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const createMutation = trpc.companyCompliances.create.useMutation();
  const updateMutation = trpc.companyCompliances.update.useMutation();
  const deleteMutation = trpc.companyCompliances.delete.useMutation();
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

  const { totalCompliances, averageCompliance } = useMemo(() => {
    const total = compliances.length;
    if (total === 0) return { totalCompliances: 0, averageCompliance: 0 };
    const sum = compliances.reduce((acc, c) => {
      const planned = parseMonths(c.plannedMonths);
      const completed = parseMonths(c.completedMonths);
      return acc + calcPercentage(planned, completed);
    }, 0);
    return { totalCompliances: total, averageCompliance: Math.round(sum / total) };
  }, [compliances]);

  const handleAddCompliance = async () => {
    if (!formData.requirement || !formData.obligationType) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }
    try {
      await createMutation.mutateAsync({
        companyId,
        requirement: formData.requirement,
        description: formData.description || undefined,
        obligationType: formData.obligationType as any,
        otherObligationType: formData.otherObligationType || undefined,
        responsible: formData.responsible || undefined,
        plannedMonths: serializeMonths(formData.plannedMonths) || undefined,
        completedMonths: serializeMonths(formData.completedMonths) || undefined,
        observations: formData.observations || undefined,
      });
      toast.success("Obligación creada exitosamente");
      resetForm();
      await utils.companyCompliances.list.invalidate({ companyId });
    } catch {
      toast.error("Error al crear la obligación");
    }
  };

  const handleUpdateCompliance = async (id: number) => {
    if (!formData.requirement || !formData.obligationType) return;
    try {
      await updateMutation.mutateAsync({
        id,
        requirement: formData.requirement,
        description: formData.description || undefined,
        obligationType: formData.obligationType as any,
        otherObligationType: formData.otherObligationType || undefined,
        responsible: formData.responsible || undefined,
        plannedMonths: serializeMonths(formData.plannedMonths) || undefined,
        completedMonths: serializeMonths(formData.completedMonths) || undefined,
        observations: formData.observations || undefined,
      });
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
      await updateMutation.mutateAsync({
        id: editingId,
        requirement: formData.requirement,
        description: formData.description || undefined,
        obligationType: formData.obligationType as any,
        otherObligationType: formData.otherObligationType || undefined,
        responsible: formData.responsible || undefined,
        plannedMonths: serializeMonths(formData.plannedMonths) || undefined,
        completedMonths: serializeMonths(formData.completedMonths) || undefined,
        observations: formData.observations || undefined,
      });
      toast.success("Obligación actualizada exitosamente");
      resetForm();
      setEditingId(null);
      await utils.companyCompliances.list.invalidate({ companyId });
    } catch {
      toast.error("Error al actualizar la obligación");
    }
  };

  const handleDeleteCompliance = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta obligación?")) return;
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
    });
    setEditingId(compliance.id);
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
    });
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
                <div className="text-sm text-gray-600 mb-1">Total de Obligaciones</div>
                <div className="text-3xl font-bold text-green-600">{totalCompliances}</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">% Promedio de Cumplimiento</div>
                <div className="text-3xl font-bold text-blue-600">{averageCompliance}%</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* OBLIGACIONES REGISTRADAS */}
        <div className="space-y-4 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Obligaciones Registradas</h2>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Cargando obligaciones...</div>
          ) : compliances.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="pt-6 text-center text-gray-500">
                No hay obligaciones registradas aún
              </CardContent>
            </Card>
          ) : (
            compliances.map((compliance) => {
              const planned = parseMonths(compliance.plannedMonths);
              const completed = parseMonths(compliance.completedMonths);
              const pct = calcPercentage(planned, completed);

              return (
                <Card key={compliance.id} className="bg-white">
                  <div
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                    onClick={() => setExpandedId(expandedId === compliance.id ? null : compliance.id)}
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">{compliance.requirement}</h3>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600 items-center">
                        <span className="px-2 py-1 bg-gray-100 rounded">{compliance.obligationType}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-28 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`font-semibold ${
                            pct >= 80 ? "text-green-700" : pct >= 50 ? "text-yellow-600" : "text-red-600"
                          }`}>
                            {pct}%
                          </span>
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
                            <label className="text-sm font-semibold text-gray-700">Descripción</label>
                            <p className="text-gray-600 whitespace-pre-wrap">{compliance.description}</p>
                          </div>
                        )}
                        {compliance.obligationType === "Otros" && compliance.otherObligationType && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">Tipo Específico</label>
                            <p className="text-gray-600">{compliance.otherObligationType}</p>
                          </div>
                        )}
                        {compliance.responsible && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">Responsable</label>
                            <p className="text-gray-600">{compliance.responsible}</p>
                          </div>
                        )}

                        {/* Cuadritos de meses - solo lectura */}
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-gray-600 mb-1">Planificado</p>
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
                            <p className="text-xs font-semibold text-gray-600 mb-1">Cumplimiento</p>
                            <div className="flex flex-wrap gap-1">
                              {MONTHS.map((name, i) => {
                                const month = i + 1;
                                const isDone = completed.includes(month);
                                const wasPlanned = planned.includes(month);
                                return (
                                  <div
                                    key={month}
                                    className={`w-9 h-9 rounded text-xs font-semibold border flex items-center justify-center
                                      ${isDone && wasPlanned
                                        ? "bg-green-500 text-white border-transparent"
                                        : isDone && !wasPlanned
                                        ? "bg-yellow-400 text-white border-transparent"
                                        : "bg-gray-50 text-gray-400 border-gray-200"}`}
                                  >
                                    {name}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* % Cumplimiento */}
                        <div>
                          <label className="text-sm font-semibold text-gray-700">% Cumplimiento</label>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-400"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-lg font-bold min-w-[3rem] text-right ${
                              pct >= 80 ? "text-green-700" : pct >= 50 ? "text-yellow-600" : "text-red-600"
                            }`}>
                              {pct}%
                            </span>
                          </div>
                          {planned.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {completed.filter((m) => planned.includes(m)).length} de {planned.length} meses planificados cumplidos
                            </p>
                          )}
                        </div>

                        {compliance.observations && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">Observaciones</label>
                            <p className="text-gray-600 whitespace-pre-wrap">{compliance.observations}</p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-4">
                          <Button variant="outline" size="sm" onClick={() => handleEditCompliance(compliance)}>
                            Editar
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteCompliance(compliance.id)}>
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

        {/* FORMULARIO NUEVA / EDITAR OBLIGACIÓN */}
        <Card className="mb-8 bg-white">
          <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 border-b">
            <CardTitle>{editingId ? "Editar Obligación" : "Nueva Obligación"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Obligación *</label>
              <Textarea
                value={formData.requirement}
                onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
                placeholder="Nombre o título de la obligación"
                className="min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción de la obligación</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe a qué se refiere esta obligación"
                className="min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Obligación *</label>
              <select
                value={formData.obligationType}
                onChange={(e) => setFormData({ ...formData, obligationType: e.target.value as any })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Selecciona el tipo de obligación</option>
                <option value="Legal">Legal</option>
                <option value="Reglamentaria">Reglamentaria</option>
                <option value="Concesion">Concesión</option>
                <option value="Sistema de Gestion">Sistema de Gestión</option>
                <option value="Otros">Otros</option>
              </select>
            </div>

            {formData.obligationType === "Otros" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Especifica el tipo de obligación</label>
                <Input
                  value={formData.otherObligationType}
                  onChange={(e) => setFormData({ ...formData, otherObligationType: e.target.value })}
                  placeholder="Describe el tipo de obligación"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Responsable</label>
              <Input
                value={formData.responsible}
                onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                placeholder="Nombre del responsable"
              />
            </div>

            <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
              <MonthGrid
                label="Planificado — marca los meses en que planificas cumplir"
                selected={formData.plannedMonths}
                onChange={(months) => setFormData({ ...formData, plannedMonths: months })}
                colorClass="bg-blue-500"
              />
              <MonthGrid
                label="Cumplimiento — marca los meses en que efectivamente cumpliste"
                selected={formData.completedMonths}
                onChange={(months) => setFormData({ ...formData, completedMonths: months })}
                colorClass="bg-green-500"
              />

              {formData.plannedMonths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">% Cumplimiento</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          calcPercentage(formData.plannedMonths, formData.completedMonths) >= 80
                            ? "bg-green-500"
                            : calcPercentage(formData.plannedMonths, formData.completedMonths) >= 50
                            ? "bg-yellow-400"
                            : "bg-red-400"
                        }`}
                        style={{ width: `${calcPercentage(formData.plannedMonths, formData.completedMonths)}%` }}
                      />
                    </div>
                    <span className={`text-lg font-bold min-w-[3rem] text-right ${
                      calcPercentage(formData.plannedMonths, formData.completedMonths) >= 80
                        ? "text-green-700"
                        : calcPercentage(formData.plannedMonths, formData.completedMonths) >= 50
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}>
                      {calcPercentage(formData.plannedMonths, formData.completedMonths)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.completedMonths.filter((m) => formData.plannedMonths.includes(m)).length} de {formData.plannedMonths.length} meses planificados cumplidos
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
              <Textarea
                value={formData.observations}
                onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                placeholder="Agrega observaciones si lo requieres"
                className="min-h-[80px]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              {editingId ? (
                <>
                  <Button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700">
                    Actualizar
                  </Button>
                  <Button variant="outline" onClick={() => { resetForm(); setEditingId(null); }}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button onClick={handleAddCompliance} className="bg-green-600 hover:bg-green-700">
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
