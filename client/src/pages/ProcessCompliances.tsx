import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronUp } from "lucide-react";

interface Compliance {
  id: number;
  processId: number;
  requirement: string;
  obligationType: "Legal" | "Reglamentaria" | "Concesion" | "Sistema de Gestion" | "Otros";
  otherObligationType: string | null;
  dueDate: Date | null;
  responsible: string | null;
  completed: "SI" | "NO";
  observations: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  requirement: string;
  obligationType: "Legal" | "Reglamentaria" | "Concesion" | "Sistema de Gestion" | "Otros" | "";
  otherObligationType: string;
  dueDate: string;
  responsible: string;
  completed: "SI" | "NO";
  observations: string;
}

export default function ProcessCompliances() {
  const [, navigate] = useLocation();
  const selectedProcessId = localStorage.getItem("selectedProcessId");
  const processId = selectedProcessId ? parseInt(selectedProcessId) : 0;
  
  const [compliances, setCompliances] = useState<Compliance[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>({
    requirement: "",
    obligationType: "",
    otherObligationType: "",
    dueDate: "",
    responsible: "",
    completed: "NO",
    observations: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: compliancesData, isLoading } = trpc.processCompliances.list.useQuery(
    { processId },
    { enabled: processId > 0 }
  );

  const createMutation = trpc.processCompliances.create.useMutation();
  const updateMutation = trpc.processCompliances.update.useMutation();
  const deleteMutation = trpc.processCompliances.delete.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (compliancesData) {
      setCompliances(compliancesData as Compliance[]);
    }
  }, [compliancesData]);

  // Guardado automático con debouncing para cambios en el formulario
  useEffect(() => {
    if (!editingId || !formData.requirement) return;

    const timer = setTimeout(() => {
      handleUpdateCompliance(editingId);
    }, 1500);

    return () => clearTimeout(timer);
  }, [formData, editingId]);


  const calculateDaysRemaining = (dueDate: string): { days: number; isOverdue: boolean } => {
    if (!dueDate) return { days: 0, isOverdue: false };
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { days: Math.abs(diffDays), isOverdue: diffDays < 0 };
  };

  const handleAddCompliance = async () => {
    if (!formData.requirement || !formData.obligationType) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }

    try {
      await createMutation.mutateAsync({
        processId,
        requirement: formData.requirement,
        obligationType: formData.obligationType as any,
        otherObligationType: formData.otherObligationType || undefined,
        dueDate: formData.dueDate || undefined,
        responsible: formData.responsible || undefined,
        completed: formData.completed,
        observations: formData.observations || undefined,
      });

      toast.success("Obligación creada exitosamente");
      resetForm();
      await utils.processCompliances.list.invalidate({ processId });
    } catch (error) {
      toast.error("Error al crear la obligación");
    }
  };

  const handleUpdateCompliance = async (id: number) => {
    if (!formData.requirement || !formData.obligationType) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id,
        requirement: formData.requirement,
        obligationType: formData.obligationType as any,
        otherObligationType: formData.otherObligationType || undefined,
        dueDate: formData.dueDate || undefined,
        responsible: formData.responsible || undefined,
        completed: formData.completed,
        observations: formData.observations || undefined,
      });

      toast.success("Obligación actualizada exitosamente");
      resetForm();
      setEditingId(null);
      await utils.processCompliances.list.invalidate({ processId });
    } catch (error) {
      toast.error("Error al actualizar la obligación");
    }
  };

  const handleDeleteCompliance = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta obligación?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Obligación eliminada exitosamente");
      await utils.processCompliances.list.invalidate({ processId });
    } catch (error) {
      toast.error("Error al eliminar la obligación");
    }
  };

  const handleEditCompliance = (compliance: Compliance) => {
    setFormData({
      requirement: compliance.requirement,
      obligationType: compliance.obligationType,
      otherObligationType: compliance.otherObligationType || "",
      dueDate: compliance.dueDate ? (typeof compliance.dueDate === 'string' ? compliance.dueDate : new Date(compliance.dueDate).toISOString().split("T")[0]) : "",
      responsible: compliance.responsible || "",
      completed: compliance.completed,
      observations: compliance.observations || "",
    });
    setEditingId(compliance.id);
    setExpandedId(null);
  };

  const resetForm = () => {
    setFormData({
      requirement: "",
      obligationType: "",
      otherObligationType: "",
      dueDate: "",
      responsible: "",
      completed: "NO",
      observations: "",
    });
  };

  const totalCompliances = compliances.length;
  const completedCompliances = compliances.filter(c => c.completed === "SI").length;
  const averageCompliance = totalCompliances > 0 ? Math.round((completedCompliances / totalCompliances) * 100) : 0;

  const { days: daysRemaining, isOverdue } = formData.dueDate
    ? calculateDaysRemaining(formData.dueDate)
    : { days: 0, isOverdue: false };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-bold text-gray-900">Cumplimientos del Proceso</h1>
            <Button 
              variant="outline"
              onClick={() => navigate("/process-characterization")}
            >
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

        {/* OBLIGACIONES REGISTRADAS - ARRIBA */}
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
              const { days, isOverdue: overdue } = calculateDaysRemaining(
                compliance.dueDate ? new Date(compliance.dueDate).toISOString().split("T")[0] : ""
              );
              
              return (
                <Card key={compliance.id} className="bg-white">
                  <div
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                    onClick={() => setExpandedId(expandedId === compliance.id ? null : compliance.id)}
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">{compliance.requirement}</h3>
                      <div className="flex gap-4 text-sm text-gray-600">
                        <span className="px-2 py-1 bg-gray-100 rounded">{compliance.obligationType}</span>
                        <span className={`px-2 py-1 rounded font-semibold ${
                          compliance.completed === "SI"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {compliance.completed === "SI" ? "Cumplido" : "No Cumplido"}
                        </span>
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

                        <div>
                          <label className="text-sm font-semibold text-gray-700">Cumplido</label>
                          <div className={`px-3 py-2 rounded font-semibold text-sm text-center border ${
                            compliance.completed === "SI"
                              ? "bg-green-100 text-green-700 border-green-300"
                              : "bg-red-100 text-red-700 border-red-300"
                          }`}>
                            {compliance.completed === "SI" ? "SI" : "NO"}
                          </div>
                        </div>

                        {compliance.dueDate && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">Plazo</label>
                            <div className={`px-3 py-2 rounded font-semibold text-sm text-center border ${
                              overdue
                                ? "bg-red-100 text-red-700 border-red-300"
                                : "bg-green-100 text-green-700 border-green-300"
                            }`}>
                              {overdue ? `Te pasaste ${days} días` : `Faltan ${days} días`}
                            </div>
                          </div>
                        )}

                        {compliance.dueDate && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">Fecha Límite</label>
                            <p className="text-gray-600">
                              {typeof compliance.dueDate === 'string' ? new Date(compliance.dueDate).toLocaleDateString("es-ES") : compliance.dueDate.toLocaleDateString("es-ES")}
                            </p>
                          </div>
                        )}

                        {compliance.observations && (
                          <div>
                            <label className="text-sm font-semibold text-gray-700">Observaciones</label>
                            <p className="text-gray-600 whitespace-pre-wrap">{compliance.observations}</p>
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
                            onClick={() => handleDeleteCompliance(compliance.id)}
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

        {/* NUEVA OBLIGACIÓN - EN EL MEDIO */}
        <Card className="mb-8 bg-white">
          <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 border-b">
            <CardTitle>{editingId ? "Editar Obligación" : "Nueva Obligación"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Obligación *</label>
              <Textarea
                value={formData.requirement}
                onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
                placeholder="Describe la obligación que deseas llevar control"
                className="min-h-[100px]"
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

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha Límite del Cumplimiento</label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>

            {formData.dueDate && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Plazo</label>
                <div className={`px-4 py-3 rounded-lg font-semibold text-center ${
                  isOverdue 
                    ? "bg-red-100 text-red-700 border border-red-300" 
                    : "bg-green-100 text-green-700 border border-green-300"
                }`}>
                  {isOverdue 
                    ? `Te pasaste ${daysRemaining} días` 
                    : `Te faltan ${daysRemaining} días`}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cumplido</label>
              <div className={`px-4 py-3 rounded-lg font-semibold text-center border ${
                formData.completed === "SI"
                  ? "bg-green-100 text-green-700 border-green-300"
                  : "bg-red-100 text-red-700 border-red-300"
              }`}>
                {formData.completed}
              </div>
              <select
                value={formData.completed}
                onChange={(e) => setFormData({ ...formData, completed: e.target.value as "SI" | "NO" })}
                className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
              <Textarea
                value={formData.observations}
                onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                placeholder="Agrega observaciones si lo requieres"
                className="min-h-[100px]"
              />
            </div>

            <div className="flex gap-2 pt-4">
              {editingId ? (
                <>
                  <Button
                    onClick={() => handleUpdateCompliance(editingId)}
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
