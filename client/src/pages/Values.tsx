
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useSearch } from "wouter";
import { Plus, Trash2, AlertCircle, Edit2, Download, Loader2 } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { getAxisBackPath } from "@/lib/sessionScope";
import { exportValuesToPDF } from "@/lib/exportValuesToPDF";

const MAX_VALUES = 15;

export default function Values() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  
  // Check if this is being accessed by a manager
  const urlParams = new URLSearchParams(search);
  const isManagerAccess = urlParams.get('isManager') === 'true';
  const [companyId, setCompanyIdState] = useState<number | null>(() => {
    // If Process Leader, use their company ID from session
    if (isProcessLeader && processLeaderSession?.companyId) {
      return processLeaderSession.companyId;
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
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }
  
  // Back button handler
  const handleBack = () => {
    setLocation(isProcessLeader ? "/process-leader-dashboard" : ((isManagerAccess || isManagerLogin) ? getAxisBackPath("/manager-dashboard") : "/dashboard"));
  };
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    value: "",
    description: "",
  });

  // Fetch values from database
  const { data: values = [], isLoading, refetch } = trpc.companyValues.list.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId !== null }
  );

  // Create value mutation
  const createMutation = trpc.companyValues.add.useMutation({
    onSuccess: () => {
      toast.success("Valor agregado exitosamente");
      setFormData({ value: "", description: "" });
      setShowForm(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al agregar el valor");
    },
  });

  // Delete value mutation
  const deleteMutation = trpc.companyValues.delete.useMutation({
    onSuccess: () => {
      toast.success("Valor eliminado");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el valor");
    },
  });

  const handleAddValue = async () => {
    if (!formData.value.trim()) {
      toast.error("Por favor ingresa un nombre para el valor");
      return;
    }

    if (values.length >= MAX_VALUES && !editingId) {
      toast.error(`Máximo ${MAX_VALUES} valores permitidos`);
      return;
    }

    if (!companyId) return;

    if (editingId) {
      // Eliminar el valor anterior y agregar el nuevo
      await deleteMutation.mutateAsync({ valueId: editingId });
      await createMutation.mutateAsync({
        companyId,
        value: formData.value,
        description: formData.description || undefined,
        orderIndex: values.length - 1,
      });
      setEditingId(null);
    } else {
      await createMutation.mutateAsync({
        companyId,
        value: formData.value,
        description: formData.description || undefined,
        orderIndex: values.length,
      });
    }
  };

  const handleEditValue = (value: any) => {
    setFormData({ 
      value: value.value,
      description: value.description || "",
    });
    setEditingId(value.id);
    setShowForm(true);
  };

  const handleDeleteValue = async (valueId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este valor?")) {
      await deleteMutation.mutateAsync({ valueId });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ value: "", description: "" });
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
            <h1 className="text-3xl font-bold">Valores Empresariales</h1>
            <p className="text-slate-600 mt-2">
              Establece los valores que guían <strong>{companyName}</strong> (máximo {MAX_VALUES})
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                try {
                  exportValuesToPDF(values, companyName);
                  toast.success("PDF descargado exitosamente");
                } catch (error) {
                  toast.error("Error al descargar el PDF");
                }
              }}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download size={16} />
              EXPORTAR VALORES
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation(`/values-documents?companyId=${companyId}`)}
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
                {editingId ? "Editar Valor" : "Agregar Nuevo Valor"}
              </CardTitle>
              <CardDescription>
                Ingresa el nombre del valor y su descripción
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nombre del Valor *</label>
                <Input
                  placeholder="Ej: Integridad, Innovación, Responsabilidad..."
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Descripción del Valor</label>
                <Textarea
                  placeholder="Describe qué significa este valor para tu empresa..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddValue}
                  disabled={createMutation.isPending || deleteMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {editingId ? "Actualizar Valor" : "Agregar Valor"}
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
            disabled={values.length >= MAX_VALUES}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Plus size={20} />
            Agregar Nuevo Valor
          </Button>
        )}

        {/* Values List */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-4">Valores ({values.length}/{MAX_VALUES})</h2>
            {isLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-slate-600">Cargando valores...</p>
                </CardContent>
              </Card>
            ) : values.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-slate-500">
                    <p>No hay valores agregados aún.</p>
                    <p className="text-sm mt-2">Agrega valores para definir la cultura de tu empresa.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {values.map((value: any) => (
                  <Card key={value.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{value.value}</CardTitle>
                          {value.description && (
                            <CardDescription className="mt-2 text-sm">
                              {value.description}
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
                          onClick={() => handleEditValue(value)}
                          className="flex-1"
                          disabled={deleteMutation.isPending || createMutation.isPending}
                        >
                          <Edit2 size={16} />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteValue(value.id)}
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
            <CardTitle className="text-lg text-blue-900">Consejos para Definir Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-blue-800">
            <p>
              • Los valores deben reflejar la cultura y principios de tu empresa
            </p>
            <p>
              • Sé específico y evita términos muy genéricos
            </p>
            <p>
              • Máximo {MAX_VALUES} valores permitidos
            </p>
          </CardContent>
        </Card>


      </div>
    </DashboardLayout>
  );
}
