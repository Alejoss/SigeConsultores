import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Download } from "lucide-react";
import * as XLSX from "xlsx";

interface Training {
  id: number;
  companyId: number;
  name: string;
  objective: string | null;
  type: "Mandatoria" | "Reglamentaria" | "Sugerida";
  audience: string | null;
  plannedAttendees: number;
  modality: "Presencial" | "Online" | "Externa";
  responsible: string | null;
  completed: "SI" | "NO" | null;
  plannedDate: Date | null;
  conductedDate: Date | null;
  actualAttendees: number;
  attendancePercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  name: string;
  objective: string;
  type: "Mandatoria" | "Reglamentaria" | "Sugerida" | "";
  audience: string;
  plannedAttendees: string;
  modality: "Presencial" | "Online" | "Externa" | "";
  responsible: string;
  completed: "SI" | "NO" | "";
  plannedDate: string;
  conductedDate: string;
  actualAttendees: string;
}

const emptyForm: FormData = {
  name: "",
  objective: "",
  type: "",
  audience: "",
  plannedAttendees: "",
  modality: "",
  responsible: "",
  completed: "",
  plannedDate: "",
  conductedDate: "",
  actualAttendees: "",
};

export default function Trainings() {
  const [, navigate] = useLocation();
  const companyId = typeof window !== "undefined"
    ? parseInt(localStorage.getItem("selectedCompanyId") || "0")
    : 0;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: trainingsData, isLoading } = trpc.companyTrainings.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const trainings = (trainingsData || []) as Training[];

  const createMutation = trpc.companyTrainings.create.useMutation();
  const updateMutation = trpc.companyTrainings.update.useMutation();
  const deleteMutation = trpc.companyTrainings.delete.useMutation();
  const utils = trpc.useUtils();

  const calcAttendancePercentage = (actual: string, planned: string) => {
    const a = parseInt(actual);
    const p = parseInt(planned);
    if (!a || !p || p === 0) return 0;
    return Math.round((a / p) * 100);
  };

  const handleAddTraining = async () => {
    if (!formData.name || !formData.type) {
      toast.error("Por favor completa los campos requeridos (Capacitación y Tipo)");
      return;
    }
    try {
      await createMutation.mutateAsync({
        companyId,
        name: formData.name,
        objective: formData.objective || undefined,
        type: formData.type as "Mandatoria" | "Reglamentaria" | "Sugerida",
        audience: formData.audience || undefined,
        plannedAttendees: formData.plannedAttendees ? parseInt(formData.plannedAttendees) : undefined,
        modality: formData.modality as "Presencial" | "Online" | "Externa" | undefined,
        responsible: formData.responsible || undefined,
        completed: formData.completed ? (formData.completed as "SI" | "NO") : undefined,
        plannedDate: formData.plannedDate || undefined,
        conductedDate: formData.conductedDate || undefined,
        actualAttendees: formData.actualAttendees ? parseInt(formData.actualAttendees) : undefined,
        attendancePercentage: calcAttendancePercentage(formData.actualAttendees, formData.plannedAttendees),
      });
      toast.success("Capacitación creada exitosamente");
      setFormData(emptyForm);
      await utils.companyTrainings.list.invalidate({ companyId });
    } catch {
      toast.error("Error al crear la capacitación");
    }
  };

  const handleUpdateTraining = async (id: number) => {
    if (!formData.name || !formData.type) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        trainingId: id,
        name: formData.name,
        objective: formData.objective || undefined,
        type: formData.type as "Mandatoria" | "Reglamentaria" | "Sugerida",
        audience: formData.audience || undefined,
        plannedAttendees: formData.plannedAttendees ? parseInt(formData.plannedAttendees) : undefined,
        modality: formData.modality as "Presencial" | "Online" | "Externa" | undefined,
        responsible: formData.responsible || undefined,
        completed: formData.completed ? (formData.completed as "SI" | "NO") : undefined,
        plannedDate: formData.plannedDate || undefined,
        conductedDate: formData.conductedDate || undefined,
        actualAttendees: formData.actualAttendees ? parseInt(formData.actualAttendees) : undefined,
        attendancePercentage: calcAttendancePercentage(formData.actualAttendees, formData.plannedAttendees),
      });
      toast.success("Capacitación actualizada exitosamente");
      setFormData(emptyForm);
      setEditingId(null);
      await utils.companyTrainings.list.invalidate({ companyId });
    } catch {
      toast.error("Error al actualizar la capacitación");
    }
  };

  const handleDeleteTraining = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta capacitación?")) return;
    try {
      await deleteMutation.mutateAsync({ trainingId: id });
      toast.success("Capacitación eliminada");
      await utils.companyTrainings.list.invalidate({ companyId });
    } catch {
      toast.error("Error al eliminar la capacitación");
    }
  };

  const handleEditTraining = (training: Training) => {
    const toDateStr = (d: Date | null | string) => {
      if (!d) return "";
      const dt = typeof d === "string" ? new Date(d) : d;
      return dt.toISOString().split("T")[0];
    };
    setFormData({
      name: training.name,
      objective: training.objective || "",
      type: training.type,
      audience: training.audience || "",
      plannedAttendees: training.plannedAttendees ? training.plannedAttendees.toString() : "",
      modality: training.modality,
      responsible: training.responsible || "",
      completed: training.completed || "",
      plannedDate: toDateStr(training.plannedDate),
      conductedDate: toDateStr(training.conductedDate),
      actualAttendees: training.actualAttendees ? training.actualAttendees.toString() : "",
    });
    setEditingId(training.id);
    setExpandedId(null);
  };

  const totalTrainings = trainings.length;
  const conductedTrainings = trainings.filter(t => t.completed === "SI").length;
  const percentageConducted = totalTrainings > 0 ? Math.round((conductedTrainings / totalTrainings) * 100) : 0;
  const trainingsWithAttendance = trainings.filter(t => t.attendancePercentage > 0);
  const percentageAttendance = trainingsWithAttendance.length > 0
    ? Math.round(trainingsWithAttendance.reduce((sum, t) => sum + t.attendancePercentage, 0) / trainingsWithAttendance.length)
    : 0;

  const exportToExcel = () => {
    const toDateStr = (d: Date | null | string) => {
      if (!d) return "";
      const dt = typeof d === "string" ? new Date(d) : d;
      return dt.toLocaleDateString("es-ES");
    };
    const data = trainings.map(t => ({
      "Capacitación": t.name,
      "Tipo": t.type,
      "Modalidad": t.modality,
      "Objetivo": t.objective || "",
      "Destinatario": t.audience || "",
      "Responsable": t.responsible || "",
      "Asistentes Previstos": t.plannedAttendees,
      "Fecha Planificada": toDateStr(t.plannedDate),
      "Impartida": t.completed || "",
      "Fecha Impartida": toDateStr(t.conductedDate),
      "Asistentes Reales": t.actualAttendees,
      "% Asistencia": `${Math.round(t.attendancePercentage)}%`,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Capacitaciones");
    XLSX.writeFile(workbook, "capacitaciones_empresa.xlsx");
    toast.success("Archivo exportado exitosamente");
  };

  const toDisplayDate = (d: Date | null | string) => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("es-ES");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Capacitaciones</h1>
          <Button variant="outline" onClick={() => navigate("/audits-inspections")}>
            ← Volver
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="bg-white border-l-4 border-l-purple-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Total de Capacitaciones</div>
              <div className="text-3xl font-bold text-purple-600">{totalTrainings}</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-l-4 border-l-blue-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">% Capacitaciones Impartidas</div>
              <div className="text-3xl font-bold text-blue-600">{percentageConducted} %</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-l-4 border-l-green-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">% Asistencia</div>
              <div className="text-3xl font-bold text-green-600">{percentageAttendance} %</div>
            </CardContent>
          </Card>
        </div>

        {/* Lista */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Capacitaciones Registradas</h2>
            <Button onClick={exportToExcel} variant="outline" className="flex gap-2">
              <Download className="w-4 h-4" />
              Exportar a Excel
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Cargando capacitaciones...</div>
          ) : trainings.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="pt-6 text-center text-gray-500">
                No hay capacitaciones registradas aún
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {trainings.map((training) => (
                <Card key={training.id} className="bg-white">
                  <div
                    className="p-5 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                    onClick={() => setExpandedId(expandedId === training.id ? null : training.id)}
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">{training.name}</h3>
                      <div className="flex gap-2 flex-wrap text-sm">
                        <span className="px-2 py-1 bg-gray-100 rounded">{training.type}</span>
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">{training.modality}</span>
                        {training.completed === "SI" && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">✓ Impartida</span>
                        )}
                        {training.completed === "NO" && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded">Pendiente</span>
                        )}
                      </div>
                    </div>
                    {expandedId === training.id
                      ? <ChevronUp className="w-5 h-5 text-gray-400" />
                      : <ChevronDown className="w-5 h-5 text-gray-400" />
                    }
                  </div>

                  {expandedId === training.id && (
                    <CardContent className="pt-0 pb-6 border-t">
                      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                        {training.objective && (
                          <div className="col-span-2">
                            <span className="font-semibold text-gray-700">Objetivo: </span>
                            <span className="text-gray-600">{training.objective}</span>
                          </div>
                        )}
                        {training.audience && (
                          <div>
                            <span className="font-semibold text-gray-700">Destinatario: </span>
                            <span className="text-gray-600">{training.audience}</span>
                          </div>
                        )}
                        {training.responsible && (
                          <div>
                            <span className="font-semibold text-gray-700">Responsable: </span>
                            <span className="text-gray-600">{training.responsible}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-gray-700">Asistentes Previstos: </span>
                          <span className="text-gray-600">{training.plannedAttendees}</span>
                        </div>
                        {training.plannedDate && (
                          <div>
                            <span className="font-semibold text-gray-700">Fecha Planificada: </span>
                            <span className="text-gray-600">{toDisplayDate(training.plannedDate)}</span>
                          </div>
                        )}
                        {training.conductedDate && (
                          <div>
                            <span className="font-semibold text-gray-700">Fecha Impartida: </span>
                            <span className="text-gray-600">{toDisplayDate(training.conductedDate)}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-gray-700">Asistentes Reales: </span>
                          <span className="text-gray-600">{training.actualAttendees}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">% Asistencia: </span>
                          <span className={`font-semibold ${
                            training.attendancePercentage >= 80 ? "text-green-600"
                            : training.attendancePercentage >= 60 ? "text-yellow-600"
                            : "text-red-600"
                          }`}>{Math.round(training.attendancePercentage)}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" onClick={() => handleEditTraining(training)}>
                          Editar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteTraining(training.id)}>
                          Eliminar
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Formulario */}
        <Card className="bg-white">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 border-b">
            <CardTitle>{editingId ? "Editar Capacitación" : "Nueva Capacitación"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Capacitación *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre de la capacitación"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Objetivo</label>
              <Textarea
                value={formData.objective}
                onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                placeholder="Describe el objetivo de la capacitación"
                className="min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo *</label>
              <NativeSelect
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as FormData["type"] })}
              >
                <option value="">Selecciona el tipo de capacitación</option>
                <option value="Mandatoria">Mandatoria</option>
                <option value="Reglamentaria">Reglamentaria</option>
                <option value="Sugerida">Sugerida</option>
              </NativeSelect>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Destinatario</label>
              <Input
                value={formData.audience}
                onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                placeholder="Ejemplo: todo el personal, personal de mantenimiento, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Número de Asistentes Previstos</label>
              <Input
                type="number"
                value={formData.plannedAttendees}
                onChange={(e) => setFormData({ ...formData, plannedAttendees: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Modalidad</label>
              <NativeSelect
                value={formData.modality}
                onChange={(e) => setFormData({ ...formData, modality: e.target.value as FormData["modality"] })}
              >
                <option value="">Selecciona la modalidad</option>
                <option value="Presencial">Presencial</option>
                <option value="Online">Online</option>
                <option value="Externa">Externa</option>
              </NativeSelect>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Responsable</label>
              <Input
                value={formData.responsible}
                onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                placeholder="Nombre del responsable de la capacitación"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Planificada</label>
              <Input
                type="date"
                value={formData.plannedDate}
                onChange={(e) => setFormData({ ...formData, plannedDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Capacitación Impartida</label>
              <NativeSelect
                value={formData.completed}
                onChange={(e) => setFormData({ ...formData, completed: e.target.value as FormData["completed"] })}
              >
                <option value="">¿Fue impartida?</option>
                <option value="SI">Sí</option>
                <option value="NO">No</option>
              </NativeSelect>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha en la que se Impartió</label>
              <Input
                type="date"
                value={formData.conductedDate}
                onChange={(e) => setFormData({ ...formData, conductedDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Número de Asistentes</label>
              <Input
                type="number"
                value={formData.actualAttendees}
                onChange={(e) => setFormData({ ...formData, actualAttendees: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="flex gap-2 pt-2">
              {editingId ? (
                <>
                  <Button onClick={() => handleUpdateTraining(editingId)} className="bg-blue-600 hover:bg-blue-700">
                    Actualizar
                  </Button>
                  <Button variant="outline" onClick={() => { setFormData(emptyForm); setEditingId(null); }}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button onClick={handleAddTraining} className="bg-purple-600 hover:bg-purple-700">
                  Agregar Capacitación
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
