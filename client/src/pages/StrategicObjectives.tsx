import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useSearch } from "wouter";
import { Plus, Trash2, AlertCircle, Edit2, Download, Loader2 } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { getAxisBackPathForRole } from "@/lib/sessionScope";
import { exportStrategicObjectivesToPDF } from "@/lib/exportStrategicObjectivesToPDF";

const MAX_OBJECTIVES = 20;

export default function StrategicObjectives() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  
  // Check if this is being accessed by a manager (use localStorage as source of truth)
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null;
  
  const [companyId, setCompanyIdState] = useState<number | null>(() => {
    // If Process Leader, use their company ID from session
    if (isProcessLeader && processLeaderSession?.companyId) {
      return processLeaderSession.companyId;
    }
    // For managers, use managerCompanyId; otherwise use selectedCompanyId
    if (isManagerAccess) {
      const managerId = localStorage.getItem('managerCompanyId');
      return managerId ? parseInt(managerId) : null;
    }
    return getCompanyIdFromLocationOrStorage();
  });
  const [companyName] = useState(() => processLeaderSession?.companyName || localStorage.getItem("selectedCompanyName") || "Empresa");
  
  // Update companyId when process leader session changes
  useEffect(() => {
    if (isProcessLeader && processLeaderSession?.companyId) {
      setCompanyIdState(processLeaderSession.companyId);
    }
  }, [isProcessLeader, processLeaderSession?.companyId]);
  
  // Show loading if companyId is not set yet
  if (!companyId) {
    if (isProcessLeader === null || (isProcessLeader && !processLeaderSession?.companyId)) {
      return (
        <DashboardLayout>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-slate-600">
                <Loader2 size={20} className="animate-spin" />
                <p>Cargando sesión...</p>
              </div>
            </CardContent>
          </Card>
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <AlertCircle size={20} />
              <p>Por favor, selecciona una empresa primero desde el Dashboard</p>
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation("/company")}
            >
              Ir a Gestión de Empresas
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }
  
  // Back button handler
  const handleBack = () => {
    setLocation(getAxisBackPathForRole());
  };
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    target: "",
    responsible: "",
    deadline: "",
  });

  // Fetch objectives from database
  const { data: objectives = [], isLoading, refetch } = trpc.strategicObjectives.list.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId !== null }
  );

  // Create objective mutation
  const createMutation = trpc.strategicObjectives.create.useMutation({
    onSuccess: () => {
      toast.success("Objetivo agregado exitosamente");
      setFormData({ name: "", description: "", target: "", responsible: "", deadline: "" });
      setShowForm(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al agregar el objetivo");
    },
  });

  // Delete objective mutation
  const deleteMutation = trpc.strategicObjectives.delete.useMutation({
    onSuccess: () => {
      toast.success("Objetivo eliminado");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el objetivo");
    },
  });

  const handleAddObjective = async () => {
    if (!formData.name.trim()) {
      toast.error("Por favor ingresa un nombre para el objetivo");
      return;
    }

    if (objectives.length >= MAX_OBJECTIVES && !editingId) {
      toast.error(`Máximo ${MAX_OBJECTIVES} objetivos permitidos`);
      return;
    }

    if (!companyId) return;

    if (editingId) {
      // For now, delete and recreate (no update endpoint)
      await deleteMutation.mutateAsync({ objectiveId: editingId });
      await createMutation.mutateAsync({
        companyId,
        name: formData.name,
        description: formData.description,
        target: formData.target,
        responsible: formData.responsible,
        deadline: formData.deadline,
        orderIndex: objectives.length - 1,
      });
      setEditingId(null);
    } else {
      await createMutation.mutateAsync({
        companyId,
        name: formData.name,
        description: formData.description,
        target: formData.target,
        responsible: formData.responsible,
        deadline: formData.deadline,
        orderIndex: objectives.length,
      });
    }
  };

  const handleEditObjective = (objective: any) => {
    setFormData({
      name: objective.name,
      description: objective.description || "",
      target: objective.target || "",
      responsible: objective.responsible || "",
      deadline: objective.deadline || "",
    });
    setEditingId(objective.id);
    setShowForm(true);
  };

  const handleDeleteObjective = async (objectiveId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este objetivo?")) {
      await deleteMutation.mutateAsync({ objectiveId });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: "", description: "", target: "", responsible: "", deadline: "" });
  };

  if (!companyId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <AlertCircle size={20} />
              <p>Por favor, selecciona una empresa primero desde el Dashboard</p>
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation("/company")}
            >
              Ir a Gestión de Empresas
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Objetivos Estratégicos</h1>
            <p className="text-slate-600 mt-2">
              Define los objetivos estratégicos de <strong>{companyName}</strong> (máximo {MAX_OBJECTIVES})
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                try {
                  exportStrategicObjectivesToPDF(objectives);
                  toast.success("PDF descargado exitosamente");
                } catch (error) {
                  toast.error("Error al descargar el PDF");
                }
              }}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download size={16} />
              EXPORTAR OBJETIVOS
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation(`/strategic-objectives-documents?companyId=${companyId}`)}
            >
              📄 Documentos
            </Button>
            <Button
              variant="outline"
              onClick={handleBack}
            >
              ← Volver
            </Button>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <Card className="border-2 border-blue-300 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-lg">
                {editingId ? "Editar Objetivo" : "Agregar Nuevo Objetivo"}
              </CardTitle>
              <CardDescription>
                Ingresa los detalles del objetivo estratégico
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nombre del Objetivo *</label>
                <Input
                  placeholder="Ej: Aumentar participación de mercado..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Descripción</label>
                <Textarea
                  placeholder="Describe el objetivo en detalle..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Meta/Target</label>
                  <Input
                    placeholder="Ej: 25% de crecimiento"
                    value={formData.target}
                    onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Responsable</label>
                  <Input
                    placeholder="Nombre del responsable"
                    value={formData.responsible}
                    onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Fecha Límite</label>
                <Input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddObjective}
                  disabled={createMutation.isPending || deleteMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {editingId ? "Actualizar Objetivo" : "Agregar Objetivo"}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Button */}
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            disabled={objectives.length >= MAX_OBJECTIVES}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Plus size={20} />
            Agregar Nuevo Objetivo
          </Button>
        )}

        {/* Objectives List */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-4">Objetivos ({objectives.length}/{MAX_OBJECTIVES})</h2>
            {isLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-slate-600">Cargando objetivos...</p>
                </CardContent>
              </Card>
            ) : objectives.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-slate-500">
                    <p>No hay objetivos estratégicos agregados aún.</p>
                    <p className="text-sm mt-2">Agrega objetivos para definir la dirección estratégica de tu empresa.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {objectives.map((objective) => (
                  <Card key={objective.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{objective.name}</CardTitle>
                          {objective.description && (
                            <CardDescription className="mt-2">
                              {objective.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 text-sm">
                        {objective.target && (
                          <div>
                            <p className="font-semibold text-slate-600">Meta</p>
                            <p>{objective.target}</p>
                          </div>
                        )}
                        {objective.responsible && (
                          <div>
                            <p className="font-semibold text-slate-600">Responsable</p>
                            <p>{objective.responsible}</p>
                          </div>
                        )}
                        {objective.deadline && (
                          <div>
                            <p className="font-semibold text-slate-600">Fecha Límite</p>
                            <p>{new Date(objective.deadline).toLocaleDateString()}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditObjective(objective)}
                          className="flex-1"
                          disabled={deleteMutation.isPending || createMutation.isPending}
                        >
                          <Edit2 size={16} />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteObjective(objective.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900">Consejos para Definir Objetivos Estratégicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-blue-800">
            <p>
              • Los objetivos deben ser SMART: Específicos, Medibles, Alcanzables, Relevantes y con Tiempo definido
            </p>
            <p>
              • Alinea los objetivos con la visión y misión de la empresa
            </p>
            <p>
              • Define responsables claros para cada objetivo
            </p>
            <p>
              • Establece fechas límite realistas
            </p>
          </CardContent>
        </Card>


      </div>
    </DashboardLayout>
  );
}
