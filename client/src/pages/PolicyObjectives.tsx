import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { Plus, Trash2, AlertCircle, Edit2, Download } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { exportPolicyObjectivesToPDF } from "@/lib/exportPolicyObjectivesToPDF";

export default function PolicyObjectives() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [policyId] = useState<number | null>(() => {
    const stored = localStorage.getItem("selectedPolicyId");
    return stored ? parseInt(stored) : null;
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    objective: "",
    description: "",
  });

  // Fetch objectives from database
  const { data: objectives = [], isLoading, refetch } = trpc.policyObjectives.list.useQuery(
    { policyId: policyId || 0 },
    { enabled: policyId !== null }
  );

  // Create objective mutation
  const createMutation = trpc.policyObjectives.create.useMutation({
    onSuccess: () => {
      toast.success("Objetivo agregado exitosamente");
      setFormData({ objective: "", description: "" });
      setShowForm(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al agregar el objetivo");
    },
  });

  // Update objective mutation
  const updateMutation = trpc.policyObjectives.update.useMutation({
    onSuccess: () => {
      toast.success("Objetivo actualizado exitosamente");
      setFormData({ objective: "", description: "" });
      setEditingId(null);
      setShowForm(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar el objetivo");
    },
  });

  // Delete objective mutation
  const deleteMutation = trpc.policyObjectives.delete.useMutation({
    onSuccess: () => {
      toast.success("Objetivo eliminado");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el objetivo");
    },
  });

  const handleAddObjective = async () => {
    if (!formData.objective.trim()) {
      toast.error("Por favor ingresa el objetivo");
      return;
    }

    if (!policyId) return;

    if (editingId) {
      await updateMutation.mutateAsync({
        id: editingId,
        objective: formData.objective,
        description: formData.description || undefined,
      });
    } else {
      await createMutation.mutateAsync({
        policyId,
        objective: formData.objective,
        description: formData.description || undefined,
        orderIndex: objectives.length,
      });
    }
  };

  const handleEditObjective = (objective: any) => {
    setFormData({
      objective: objective.objective,
      description: objective.description || "",
    });
    setEditingId(objective.id);
    setShowForm(true);
  };

  const handleDeleteObjective = async (objectiveId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este objetivo?")) {
      await deleteMutation.mutateAsync({ id: objectiveId });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ objective: "", description: "" });
  };

  if (!policyId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <AlertCircle size={20} />
              <p>Por favor, selecciona una política primero desde el módulo de Política</p>
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => setLocation("/policy")}
            >
              Ir a Política
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
            <h1 className="text-3xl font-bold">Objetivos de la Política</h1>
            <p className="text-slate-600 mt-2">
              Define los objetivos específicos de tu Política del Sistema Integrado de Gestión
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                try {
                  exportPolicyObjectivesToPDF(objectives);
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
              onClick={() => setLocation("/policy")}
            >
              ← Volver a la Política
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
                Ingresa el objetivo y su descripción detallada
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Objetivo (Corto) *</label>
                <Input
                  placeholder="Ej: Mejorar la calidad de procesos..."
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Descripción Detallada</label>
                <Textarea
                  placeholder="Describe en detalle qué significa este objetivo y cómo se alineará con la política..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={5}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddObjective}
                  disabled={createMutation.isPending || updateMutation.isPending || deleteMutation.isPending}
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
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Plus size={20} />
            Agregar Nuevo Objetivo
          </Button>
        )}

        {/* Objectives List */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-4">Objetivos ({objectives.length})</h2>
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
                    <p>No hay objetivos agregados aún.</p>
                    <p className="text-sm mt-2">Agrega objetivos para definir el propósito de tu política.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {objectives.map((objective: any, index: number) => (
                  <Card key={objective.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                              {index + 1}
                            </span>
                            <CardTitle className="text-lg">{objective.objective}</CardTitle>
                          </div>
                          {objective.description && (
                            <CardDescription className="mt-2 text-sm whitespace-pre-wrap">
                              {objective.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditObjective(objective)}
                          className="flex-1"
                          disabled={deleteMutation.isPending || createMutation.isPending || updateMutation.isPending}
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
            <CardTitle className="text-lg text-blue-900">Consejos para Definir Objetivos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-blue-800">
            <p>
              • Los objetivos deben ser específicos y medibles
            </p>
            <p>
              • Deben alinearse con la política general de la empresa
            </p>
            <p>
              • Incluye tanto el objetivo corto como una descripción detallada
            </p>
          </CardContent>
        </Card>


      </div>
    </DashboardLayout>
  );
}
