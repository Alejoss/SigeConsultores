import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { Plus, Trash2, AlertCircle, Edit2, ArrowLeft, Download } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { exportParticipantsToPDF } from "@/lib/exportParticipantsToPDF";

export default function ProcessParticipants() {
  const [, setLocation] = useLocation();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null || isManagerLogin;
  const [processId, setProcessId] = useState<number | null>(null);
  const [processName, setProcessName] = useState("Proceso");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    position: "",
    objective: "",
    responsibility: "",
    authority: "",
  });

  // Get processId from localStorage
  useEffect(() => {
    const selectedProcessId = localStorage.getItem("selectedProcessId");
    const selectedProcessName = localStorage.getItem("selectedProcessName");
    if (selectedProcessId) {
      setProcessId(parseInt(selectedProcessId));
    }
    if (selectedProcessName) {
      setProcessName(selectedProcessName);
    }
  }, []);

  // Fetch participants from database
  const { data: participants = [], isLoading, refetch } = trpc.processParticipants.list.useQuery(
    { processCharacterizationId: processId || 0 },
    { enabled: processId !== null }
  );

  // Create participant mutation
  const createMutation = trpc.processParticipants.create.useMutation({
    onSuccess: () => {
      toast.success("Participante agregado exitosamente");
      setFormData({ position: "", objective: "", responsibility: "", authority: "" });
      setShowForm(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al agregar el participante");
    },
  });

  // Update participant mutation
  const updateMutation = trpc.processParticipants.update.useMutation({
    onSuccess: () => {
      toast.success("Participante actualizado exitosamente");
      setFormData({ position: "", objective: "", responsibility: "", authority: "" });
      setEditingId(null);
      setShowForm(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar el participante");
    },
  });

  // Delete participant mutation
  const deleteMutation = trpc.processParticipants.delete.useMutation({
    onSuccess: () => {
      toast.success("Participante eliminado");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el participante");
    },
  });

  const handleAddParticipant = async () => {
    if (!formData.position.trim()) {
      toast.error("Por favor ingresa el cargo del participante");
      return;
    }

    if (!processId) {
      toast.error("Por favor selecciona un proceso primero");
      return;
    }

    if (editingId) {
      // Update existing
      await updateMutation.mutateAsync({
        id: editingId,
        ...formData,
      });
    } else {
      // Create new
      await createMutation.mutateAsync({
        processCharacterizationId: processId,
        ...formData,
        orderIndex: participants.length + 1,
      });
    }
  };

  const handleEdit = (participant: any) => {
    setEditingId(participant.id);
    setFormData({
      position: participant.position || "",
      objective: participant.objective || "",
      responsibility: participant.responsibility || "",
      authority: participant.authority || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este participante?")) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ position: "", objective: "", responsibility: "", authority: "" });
  };

  if (!processId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <AlertCircle size={20} />
              <p>Por favor, selecciona un proceso primero desde el Mapa de Procesos</p>
            </div>
            <Button
              className="w-full mt-4"
               onClick={() => setLocation(isProcessLeader ? "/process-leader-dashboard" : (isManagerAccess ? "/manager-dashboard" : "/process-map"))}
            >
              Volver al Mapa de Procesos
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Cargando participantes...</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 bg-white min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">PARTICIPANTES DEL PROCESO</h1>
            <p className="text-slate-600 mt-1">Proceso: <span className="font-semibold">{processName}</span></p>
          </div>
          <Button
            variant="outline"
            onClick={() => setLocation("/process-characterization")}
            className="gap-2"
          >
            <ArrowLeft size={16} />
            VOLVER
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Form Card */}
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? "Editar Participante" : "Agregar Nuevo Participante"}</CardTitle>
              <CardDescription>
                Ingresa los detalles del cargo, objetivo, responsabilidades y autoridad
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!showForm ? (
                <Button onClick={() => setShowForm(true)} className="gap-2">
                  <Plus size={16} />
                  Agregar Participante
                </Button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Nombre del Cargo *</label>
                    <Input
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Ej: Gerente de Operaciones"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">Objetivo del Cargo</label>
                    <Textarea
                      value={formData.objective}
                      onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                      placeholder="Describe el objetivo principal del cargo"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">Responsabilidades</label>
                    <Textarea
                      value={formData.responsibility}
                      onChange={(e) => setFormData({ ...formData, responsibility: e.target.value })}
                      placeholder="Lista las responsabilidades principales"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">Autoridad</label>
                    <Textarea
                      value={formData.authority}
                      onChange={(e) => setFormData({ ...formData, authority: e.target.value })}
                      placeholder="Describe la autoridad del cargo"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleAddParticipant}
                      disabled={createMutation.isPending || updateMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {editingId ? "Actualizar" : "Agregar"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Export Button */}
          {participants.length > 0 && (
            <div className="flex justify-end mb-4">
              <Button
                onClick={() => {
                  const exportData = participants.map((p: any) => ({
                    id: p.id,
                    nombre: p.position || '',
                    cargo: p.position || '',
                    objetivo: p.objective || '',
                    responsabilidad: p.responsibility || '',
                    autoridad: p.authority || ''
                  }));
                  exportParticipantsToPDF(exportData, processName);
                  toast.success('PDF exportado correctamente');
                }}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <Download size={16} />
                Exportar a PDF
              </Button>
            </div>
          )}

          {/* Participants List */}
          <Card>
            <CardHeader>
              <CardTitle>Participantes Registrados ({participants.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {participants.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No hay participantes registrados aún</p>
              ) : (
                <div className="space-y-4">
                  {participants.map((participant: any) => (
                    <div key={participant.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-semibold text-blue-900">{participant.position}</h3>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(participant)}
                            className="gap-1"
                          >
                            <Edit2 size={14} />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(participant.id)}
                            className="gap-1"
                          >
                            <Trash2 size={14} />
                            Eliminar
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        {participant.objective && (
                          <div>
                            <p className="font-semibold text-slate-700">Objetivo:</p>
                            <p className="text-slate-600">{participant.objective}</p>
                          </div>
                        )}
                        {participant.responsibility && (
                          <div>
                            <p className="font-semibold text-slate-700">Responsabilidades:</p>
                            <p className="text-slate-600">{participant.responsibility}</p>
                          </div>
                        )}
                        {participant.authority && (
                          <div>
                            <p className="font-semibold text-slate-700">Autoridad:</p>
                            <p className="text-slate-600">{participant.authority}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
