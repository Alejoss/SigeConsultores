import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronUp, Download } from "lucide-react";
import * as XLSX from "xlsx";

interface Training {
  id: number;
  processId: number;
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

export default function ProcessTrainings() {
  const [, navigate] = useLocation();
  const selectedProcessId = localStorage.getItem("selectedProcessId");
  const processId = selectedProcessId ? parseInt(selectedProcessId) : 0;
  
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>({
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
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: trainingsData, isLoading } = trpc.processTrainings.list.useQuery(
    { processId },
    { enabled: processId > 0 }
  );

  const createMutation = trpc.processTrainings.create.useMutation();
  const updateMutation = trpc.processTrainings.update.useMutation();
  const deleteMutation = trpc.processTrainings.delete.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (trainingsData) {
      setTrainings(trainingsData as Training[]);
    }
  }, [trainingsData]);

  const handleAddTraining = async () => {
    if (!formData.name || !formData.type) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }

    try {
      await createMutation.mutateAsync({
        processId,
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
        attendancePercentage: formData.actualAttendees && formData.plannedAttendees 
          ? (parseInt(formData.actualAttendees) / parseInt(formData.plannedAttendees)) * 100
          : undefined,
      });

      toast.success("Capacitación creada exitosamente");
      resetForm();
      await utils.processTrainings.list.invalidate({ processId });
    } catch (error) {
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
        attendancePercentage: formData.actualAttendees && formData.plannedAttendees 
          ? (parseInt(formData.actualAttendees) / parseInt(formData.plannedAttendees)) * 100
          : undefined,
      });

      toast.success("Capacitación actualizada exitosamente");
      resetForm();
      setEditingId(null);
      await utils.processTrainings.list.invalidate({ processId });
    } catch (error) {
      toast.error("Error al actualizar la capacitación");
    }
  };

  const handleDeleteTraining = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta capacitación?")) return;

    try {
      await deleteMutation.mutateAsync({ trainingId: id });
      toast.success("Capacitación eliminada exitosamente");
      await utils.processTrainings.list.invalidate({ processId });
    } catch (error) {
      toast.error("Error al eliminar la capacitación");
    }
  };

  const handleEditTraining = (training: Training) => {
    setFormData({
      name: training.name,
      objective: training.objective || "",
      type: training.type,
      audience: training.audience || "",
      plannedAttendees: training.plannedAttendees ? training.plannedAttendees.toString() : "",
      modality: training.modality,
      responsible: training.responsible || "",
      completed: training.completed || "",
      plannedDate: training.plannedDate ? (typeof training.plannedDate === 'string' ? training.plannedDate : new Date(training.plannedDate).toISOString().split("T")[0]) : "",
      conductedDate: training.conductedDate ? (typeof training.conductedDate === 'string' ? training.conductedDate : new Date(training.conductedDate).toISOString().split("T")[0]) : "",
      actualAttendees: training.actualAttendees ? training.actualAttendees.toString() : "",
    });
    setEditingId(training.id);
    setExpandedId(null);
  };

  const resetForm = () => {
    setFormData({
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
    });
  };

  const totalTrainings = trainings.length;
  const conductedTrainings = trainings.filter(t => t.completed === "SI" || t.conductedDate).length;
  const percentageConducted = totalTrainings > 0 ? Math.round((conductedTrainings / totalTrainings) * 100) : 0;
  // Calculate % Asistencia only for conducted trainings
  const trainingsWithConducted = trainings.filter(t => t.completed === "SI" || t.conductedDate);
  const percentageAttendance = trainingsWithConducted.length > 0 ? Math.round(trainingsWithConducted.reduce((sum, t) => sum + t.attendancePercentage, 0) / trainingsWithConducted.length) : 0;

  const exportToExcel = () => {
    const data = trainings.map(t => ({
      "Capacitación": t.name,
      "Tipo": t.type,
      "Modalidad": t.modality,
      "Objetivo": t.objective,
      "Destinatario": t.audience,
      "Asistentes Previstos": t.plannedAttendees,
      "Fecha Planificada": t.plannedDate ? (typeof t.plannedDate === 'string' ? t.plannedDate : new Date(t.plannedDate).toLocaleDateString("es-ES")) : "",
      "Fecha Impartida": t.conductedDate ? (typeof t.conductedDate === 'string' ? t.conductedDate : new Date(t.conductedDate).toLocaleDateString("es-ES")) : "",
      "Asistentes Reales": t.actualAttendees,
      "% Asistencia": `${Math.round(t.attendancePercentage)}%`,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Capacitaciones");
    XLSX.writeFile(workbook, "capacitaciones_proceso.xlsx");
    toast.success("Archivo exportado exitosamente");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-bold text-gray-900">Capacitaciones del Proceso</h1>
            <Button 
              variant="outline"
              onClick={() => navigate("/process-characterization")}
            >
              ← Volver
            </Button>
          </div>

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
                <div className="text-3xl font-bold text-blue-600">{percentageConducted}%</div>
              </CardContent>
            </Card>
            <Card className="bg-white border-l-4 border-l-green-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">% Asistencia</div>
                <div className="text-3xl font-bold text-green-600">{percentageAttendance}%</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CAPACITACIONES REGISTRADAS - ARRIBA */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Capacitaciones Registradas</h2>
            <Button
              onClick={exportToExcel}
              variant="outline"
              className="flex gap-2"
            >
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
            trainings.map((training) => (
              <Card key={training.id} className="bg-white">
                <div
                  className="p-6 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                  onClick={() => setExpandedId(expandedId === training.id ? null : training.id)}
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-2">{training.name}</h3>
                    <div className="flex gap-4 text-sm text-gray-600">
                      <span className="px-2 py-1 bg-gray-100 rounded">{training.type}</span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">{training.modality}</span>
                      {training.conductedDate && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded">Impartida</span>
                      )}
                    </div>
                  </div>
                  <ChevronUp
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedId === training.id ? "rotate-180" : ""
                    }`}
                  />
                </div>

                {expandedId === training.id && (
                  <CardContent className="pt-0 pb-6 border-t">
                    <div className="space-y-4 mt-4">
                      {training.objective && (
                        <div>
                          <label className="text-sm font-semibold text-gray-700">Objetivo</label>
                          <p className="text-gray-600 whitespace-pre-wrap">{training.objective}</p>
                        </div>
                      )}

                      {training.audience && (
                        <div>
                          <label className="text-sm font-semibold text-gray-700">Destinatario</label>
                          <p className="text-gray-600">{training.audience}</p>
                        </div>
                      )}

                      <div>
                        <label className="text-sm font-semibold text-gray-700">Asistentes Previstos</label>
                        <p className="text-gray-600">{training.plannedAttendees}</p>
                      </div>

                      {training.plannedDate && (
                        <div>
                          <label className="text-sm font-semibold text-gray-700">Fecha Planificada</label>
                          <p className="text-gray-600">
                            {typeof training.plannedDate === 'string' ? new Date(training.plannedDate).toLocaleDateString("es-ES") : training.plannedDate.toLocaleDateString("es-ES")}
                          </p>
                        </div>
                      )}

                      {training.responsible && (
                        <div>
                          <label className="text-sm font-semibold text-gray-700">Responsable</label>
                          <p className="text-gray-600">{training.responsible}</p>
                        </div>
                      )}

                      {training.completed && (
                        <div>
                          <label className="text-sm font-semibold text-gray-700">Capacitacion Impartida</label>
                          <p className={`font-semibold text-sm ${training.completed === 'SI' ? 'text-green-600' : 'text-red-600'}`}>
                            {training.completed === 'SI' ? 'Sí' : 'No'}
                          </p>
                        </div>
                      )}

                      {training.conductedDate && (
                        <div>
                          <label className="text-sm font-semibold text-gray-700">Fecha Impartida</label>
                          <p className="text-gray-600">
                            {typeof training.conductedDate === 'string' ? new Date(training.conductedDate).toLocaleDateString("es-ES") : training.conductedDate.toLocaleDateString("es-ES")}
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="text-sm font-semibold text-gray-700">Asistentes Reales</label>
                        <p className="text-gray-600">{training.actualAttendees}</p>
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-gray-700">% Asistencia</label>
                        <div className={`px-3 py-2 rounded font-semibold text-sm text-center border ${
                          training.attendancePercentage >= 80
                            ? "bg-green-100 text-green-700 border-green-300"
                            : training.attendancePercentage >= 60
                            ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                            : "bg-red-100 text-red-700 border-red-300"
                        }`}>
                          {Math.round(training.attendancePercentage)}%
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTraining(training)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteTraining(training.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>

        {/* NUEVA CAPACITACIÓN - EN EL MEDIO */}
        <Card className="mb-8 bg-white">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 border-b">
            <CardTitle>{editingId ? "Editar Capacitación" : "Nueva Capacitación"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Capacitación *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre de la capacitación"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Objetivo</label>
              <Textarea
                value={formData.objective}
                onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                placeholder="Describe el objetivo de la capacitación"
                className="min-h-[100px]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo *</label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo de capacitación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mandatoria">Mandatoria</SelectItem>
                  <SelectItem value="Reglamentaria">Reglamentaria</SelectItem>
                  <SelectItem value="Sugerida">Sugerida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Destinatario</label>
              <Input
                value={formData.audience}
                onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                placeholder="Ejemplo: todo el personal, personal de mantenimiento, etc."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Número de Asistentes Previstos</label>
              <Input
                type="number"
                value={formData.plannedAttendees}
                onChange={(e) => setFormData({ ...formData, plannedAttendees: e.target.value })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Modalidad</label>
              <Select
                value={formData.modality}
                onValueChange={(value) => setFormData({ ...formData, modality: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona la modalidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Presencial">Presencial</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Externa">Externa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Responsable</label>
              <Input
                value={formData.responsible}
                onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                placeholder="Nombre del responsable de la capacitación"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha Planificada</label>
              <Input
                type="date"
                value={formData.plannedDate}
                onChange={(e) => setFormData({ ...formData, plannedDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Capacitación Impartida</label>
              <Select
                value={formData.completed}
                onValueChange={(value) => setFormData({ ...formData, completed: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="¿Fue impartida?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SI">Sí</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha en la que se Impartió</label>
              <Input
                type="date"
                value={formData.conductedDate}
                onChange={(e) => setFormData({ ...formData, conductedDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Número de Asistentes</label>
              <Input
                type="number"
                value={formData.actualAttendees}
                onChange={(e) => setFormData({ ...formData, actualAttendees: e.target.value })}
                placeholder="0"
              />
            </div>

            <div className="flex gap-2 pt-4">
              {editingId ? (
                <>
                  <Button
                    onClick={() => handleUpdateTraining(editingId)}
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
                  onClick={handleAddTraining}
                  className="bg-purple-600 hover:bg-purple-700"
                >
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
