import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { Plus, Trash2, AlertCircle, Edit2, ArrowLeft, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { exportResourcesToPDF } from "@/lib/exportResourcesToPDF";
import { getAxisBackPathForRole } from "@/lib/sessionScope";

interface ResourceData {
  resourceName: string;
  resourceElements: string;
}

export default function ProcessResources() {
  const [, setLocation] = useLocation();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null || isManagerLogin;
  const [processId, setProcessId] = useState<number | null>(null);
  const [processName, setProcessName] = useState("Proceso");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingParticipantId, setEditingParticipantId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ResourceData>({
    resourceName: "",
    resourceElements: "",
  });
  const [participants, setParticipants] = useState<any[]>([]);
  const [expandedParticipants, setExpandedParticipants] = useState<Set<number>>(new Set());

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
  const { data: participantsList = [] } = trpc.processParticipants.list.useQuery(
    { processCharacterizationId: processId || 0 },
    { enabled: processId !== null }
  );

  // Update participants list when data changes
  useEffect(() => {
    if (participantsList && participantsList.length > 0) {
      setParticipants(participantsList);
    }
  }, [participantsList]);

  // Fetch resources from database
  const { data: resources = [], isLoading } = trpc.processResources.list.useQuery(
    { processCharacterizationId: processId || 0 },
    { enabled: processId !== null }
  );

  // Local copy of resources for optimistic updates — avoids refetch() which triggers
  // a full DashboardLayout re-render causing Radix portal removeChild/insertBefore errors
  const [localResources, setLocalResources] = useState<any[]>([]);

  useEffect(() => {
    setLocalResources(resources);
  }, [resources]);

  // Create resource mutation — optimistic update: no refetch, update local state directly
  const createMutation = trpc.processResources.create.useMutation({
    onSuccess: (data) => {
      toast.success("Recurso agregado exitosamente");
      if (data.resource) {
        setLocalResources((prev) => [...prev, data.resource]);
      }
      setFormData({ resourceName: "", resourceElements: "" });
      setEditingParticipantId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al agregar el recurso");
    },
  });

  // Update resource mutation — optimistic update: no refetch, update local state directly
  const updateMutation = trpc.processResources.update.useMutation({
    onSuccess: (data) => {
      toast.success("Recurso actualizado exitosamente");
      if (data.resource) {
        setLocalResources((prev) =>
          prev.map((r) => (r.id === data.resource!.id ? data.resource! : r))
        );
      }
      setFormData({ resourceName: "", resourceElements: "" });
      setEditingId(null);
      setEditingParticipantId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar el recurso");
    },
  });

  // Delete resource mutation — optimistic update: no refetch, remove from local state directly
  const deleteMutation = trpc.processResources.delete.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Recurso eliminado");
      setLocalResources((prev) => prev.filter((r) => r.id !== variables.id));
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el recurso");
    },
  });

  const handleAddResource = async (participantId: number) => {
    if (!formData.resourceName.trim()) {
      toast.error("Por favor ingresa el nombre del recurso");
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
        participantId: participantId,
        resourceName: formData.resourceName,
        resourceElements: formData.resourceElements,
      });
    } else {
      // Create new
      await createMutation.mutateAsync({
        processCharacterizationId: processId,
        participantId: participantId,
        resourceName: formData.resourceName,
        resourceElements: formData.resourceElements,
        orderIndex: localResources.length + 1,
      });
    }
  };

  const handleEdit = (resource: any) => {
    setEditingId(resource.id);
    setEditingParticipantId(resource.participantId);
    setFormData({
      resourceName: resource.resourceName || "",
      resourceElements: resource.resourceElements || "",
    });
  };

  const handleDelete = async (id: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar este recurso?")) {
      await deleteMutation.mutateAsync({ id });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingParticipantId(null);
    setFormData({ resourceName: "", resourceElements: "" });
  };

  const toggleParticipant = (participantId: number) => {
    const newExpanded = new Set(expandedParticipants);
    if (newExpanded.has(participantId)) {
      newExpanded.delete(participantId);
    } else {
      newExpanded.add(participantId);
    }
    setExpandedParticipants(newExpanded);
  };

  const getResourcesForParticipant = (participantId: number) => {
    return localResources.filter((r: any) => r.participantId === participantId);
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
               onClick={() => setLocation(getAxisBackPathForRole())}
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
            <p className="text-center text-slate-600">Cargando recursos...</p>
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
            <h1 className="text-3xl font-bold text-blue-900">RECURSOS DEL PROCESO</h1>
            <p className="text-slate-600 mt-1">Proceso: <span className="font-semibold">{processName}</span></p>
          </div>
          <div className="flex gap-2">
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                try {
                  const participantGroups = participants.map(p => ({
                    participant: p,
                    resources: getResourcesForParticipant(p.id)
                  }));
                  exportResourcesToPDF(participantGroups, processName);
                  toast.success("PDF descargado exitosamente");
                } catch (error) {
                  toast.error("Error al descargar el PDF");
                }
              }}
            >
              <Download size={16} />
              EXPORTAR RECURSOS
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/process-characterization")}
              className="gap-2"
            >
              <ArrowLeft size={16} />
              VOLVER
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Participants with Resources */}
          {participants.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 text-slate-600">
                  <AlertCircle size={20} />
                  <p>No hay participantes registrados. Por favor, agrega participantes primero.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            participants.map((participant: any) => {
              const participantResources = getResourcesForParticipant(participant.id);
              const isExpanded = expandedParticipants.has(participant.id);
              const isEditing = editingParticipantId === participant.id;

              return (
                <Card key={participant.id}>
                  <CardHeader 
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleParticipant(participant.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {isExpanded ? (
                          <ChevronUp size={20} className="text-slate-600" />
                        ) : (
                          <ChevronDown size={20} className="text-slate-600" />
                        )}
                        <div>
                          <CardTitle className="text-lg">{participant.position}</CardTitle>
                          <CardDescription>
                            {participantResources.length} recurso{participantResources.length !== 1 ? 's' : ''} registrado{participantResources.length !== 1 ? 's' : ''}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="border-t pt-6">
                      {/* Resources List for this Participant */}
                      {participantResources.length === 0 ? (
                        <p className="text-center text-slate-500 py-4 mb-6">No hay recursos registrados para este participante</p>
                      ) : (
                        <div className="space-y-4 mb-6">
                          {participantResources.map((resource: any) => (
                            <div key={resource.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                              {editingId === resource.id ? (
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-semibold mb-2">Nombre del Recurso *</label>
                                    <Input
                                      value={formData.resourceName}
                                      onChange={(e) => setFormData({ ...formData, resourceName: e.target.value })}
                                      placeholder="Ej: Recursos humanos, Equipos tecnológicos, Materiales"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-sm font-semibold mb-2">Elementos del Recurso</label>
                                    <Textarea
                                      value={formData.resourceElements}
                                      onChange={(e) => setFormData({ ...formData, resourceElements: e.target.value })}
                                      placeholder="Describe los elementos del recurso. Ejemplo:
• Equipo de diseño (senior, junior, coordinador, gráfico)
• Acceso a responsables de Producción, Marketing y Restauración"
                                      rows={4}
                                    />
                                  </div>

                                  <div className="flex gap-2 pt-4">
                                    <Button
                                      onClick={() => handleAddResource(participant.id)}
                                      disabled={updateMutation.isPending}
                                      className="bg-blue-600 hover:bg-blue-700"
                                    >
                                      Actualizar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={handleCancel}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-start justify-between mb-3">
                                    <div>
                                      <p className="text-sm text-slate-600 font-semibold">Nombre del Recurso:</p>
                                      <h4 className="text-base font-semibold text-slate-800 mb-2">{resource.resourceName}</h4>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEdit(resource)}
                                        className="gap-1"
                                      >
                                        <Edit2 size={14} />
                                        Editar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleDelete(resource.id)}
                                        className="gap-1"
                                      >
                                        <Trash2 size={14} />
                                        Eliminar
                                      </Button>
                                    </div>
                                  </div>

                                  {resource.resourceElements && (
                                    <div className="text-sm mt-3 pt-3 border-t border-slate-300">
                                      <p className="font-semibold text-slate-700 mb-2">Elementos del Recurso:</p>
                                      <p className="text-slate-600 whitespace-pre-wrap">{resource.resourceElements}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add New Resource Form */}
                      {isEditing && editingId === null ? (
                        <div className="border-t pt-6 space-y-4">
                          <h4 className="font-semibold text-slate-800">Agregar Nuevo Recurso</h4>
                          <div>
                            <label className="block text-sm font-semibold mb-2">Nombre del Recurso *</label>
                            <Input
                              value={formData.resourceName}
                              onChange={(e) => setFormData({ ...formData, resourceName: e.target.value })}
                              placeholder="Ej: Recursos humanos, Equipos tecnológicos, Materiales"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold mb-2">Elementos del Recurso</label>
                            <Textarea
                              value={formData.resourceElements}
                              onChange={(e) => setFormData({ ...formData, resourceElements: e.target.value })}
                              placeholder="Describe los elementos del recurso. Ejemplo:
• Equipo de diseño (senior, junior, coordinador, gráfico)
• Acceso a responsables de Producción, Marketing y Restauración"
                              rows={4}
                            />
                          </div>

                          <div className="flex gap-2 pt-4">
                            <Button
                              onClick={() => handleAddResource(participant.id)}
                              disabled={createMutation.isPending}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              Agregar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleCancel}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : editingId === null ? (
                        <Button 
                          onClick={() => {
                            setEditingParticipantId(participant.id);
                            setFormData({ resourceName: "", resourceElements: "" });
                          }}
                          className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus size={16} />
                          Agregar Recurso
                        </Button>
                      ) : null}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
