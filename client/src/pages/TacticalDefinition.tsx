import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, CheckCircle, AlertCircle, Loader, Download } from 'lucide-react';
import { toast } from "sonner";
import { exportTacticalObjectivesToPDF } from "@/lib/exportTacticalObjectivesToPDF";
import { parseStrategicObjectiveDescription } from "@/lib/parseStrategicObjective";
import { trpc } from "@/lib/trpc";
import { getCompanyIdFromSession, getProcessIdFromSession } from "@/lib/sessionScope";

interface TacticalObjectiveDefinition {
  id: string;
  dbId?: number;
  policyObjectiveId?: number | null;
  policyObjective: string;
  policyObjectiveDescription: string;
  strategicObjective: string;
  strategicObjectiveDescription: string;
  enunciation: string;
  explanation: string;
  ponderacion: number;
  puntoPartida: number;
  metaLlegada: number;
  unidadMedida: string;
  avanceMeta: number;
  responsible: string;
  isNew: boolean;
  isDirty?: boolean;
}

export default function TacticalDefinition() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [objectives, setObjectives] = useState<TacticalObjectiveDefinition[]>([]);
  const [strategicObjectives, setStrategicObjectives] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(false);
  // Ref para mantener siempre la referencia más reciente a objectives y evitar stale closure en autoSave
  const objectivesRef = useRef<TacticalObjectiveDefinition[]>([]);

  // Get utils for query invalidation (like SubprocessMap does)
  const utils = trpc.useUtils();

  // Fetch strategic objectives
  const { data: strategicObjectivesData } = trpc.strategicObjectives.list.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId !== null }
  );

  // Objetivos corporativos que se confrontan con los Objetivos Estratégicos.
  const { data: policyData } = trpc.policies.get.useQuery(
    { companyId: companyId || 0 },
    { enabled: companyId !== null }
  );
  const policyId = policyData?.id ?? null;
  const { data: policyObjectivesData = [] } = trpc.policyObjectives.list.useQuery(
    { policyId: policyId || 0 },
    { enabled: policyId !== null }
  );

  // Fetch tactical objectives
  const { data: tacticalObjectivesData } = trpc.processTacticalObjectives.list.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );

  // Create tactical objective mutation with cache invalidation
  const createMutation = trpc.processTacticalObjectives.create.useMutation({
    onSuccess: () => {
      // Invalidate cache to refetch fresh data (like SubprocessMap does)
      utils.processTacticalObjectives.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar el objetivo");
    },
  });

  // Update tactical objective mutation with cache invalidation
  const updateMutation = trpc.processTacticalObjectives.update.useMutation({
    onSuccess: () => {
      // Invalidate cache to refetch fresh data (like SubprocessMap does)
      utils.processTacticalObjectives.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar el objetivo");
    },
  });

  // Delete tactical objective mutation with cache invalidation
  const deleteMutation = trpc.processTacticalObjectives.delete.useMutation({
    onSuccess: () => {
      // Invalidate cache to refetch fresh data
      utils.processTacticalObjectives.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el objetivo");
    },
  });

  // Load initial data
  useEffect(() => {
    const pid = getProcessIdFromSession();
    const cid = getCompanyIdFromSession();
    if (pid) setProcessId(pid);
    if (cid) setCompanyId(cid);
  }, []);

  // Process strategic objectives data
  useEffect(() => {
    if (strategicObjectivesData) {
      setStrategicObjectives(strategicObjectivesData);
    }
  }, [strategicObjectivesData]);

  // Process tactical objectives data - ONLY on initial load
  useEffect(() => {
    if (tacticalObjectivesData && !initialLoadRef.current) {
      initialLoadRef.current = true;
      if (tacticalObjectivesData.length > 0) {
        const converted = tacticalObjectivesData.map((obj: any) => ({
          id: `db_${obj.id}`,
          dbId: obj.id,
          policyObjectiveId: obj.policyObjectiveId ?? undefined,
          policyObjective: obj.policyObjective || '',
          policyObjectiveDescription: obj.policyObjectiveDescription || '',
          strategicObjective: obj.strategicObjective || '',
          strategicObjectiveDescription: obj.strategicObjectiveDescription || '',
          enunciation: obj.name || '',
          explanation: obj.description || '',
          ponderacion: obj.ponderacion || 0,
          puntoPartida: obj.puntoPartida || 0,
          metaLlegada: obj.metaLlegada || 0,
          unidadMedida: obj.unidadMedida || '',
          avanceMeta: obj.avanceMeta || 0,
          responsible: obj.responsible || '',
          isNew: false,
          isDirty: false
        }));
        setObjectives(converted);
      }
    }
  }, [tacticalObjectivesData]);

  // Mantener objectivesRef sincronizado con el estado objectives
  // Esto permite que autoSave siempre use los valores más recientes sin stale closure
  useEffect(() => {
    objectivesRef.current = objectives;
  }, [objectives]);

  // Auto-save with debounce (like SubprocessMap does)
  // NOTE: Auto-save should NOT validate - only save dirty changes
  // Validation is only for manual save
  const autoSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSaveInternal();
    }, 2000); // 2 second debounce to allow more time for typing
  };

  const buildSavePayload = (obj: TacticalObjectiveDefinition) => ({
    name: obj.enunciation || 'Sin enunciado',
    description: obj.explanation || undefined,
    target: undefined,
    responsible: obj.responsible || undefined,
    deadline: undefined,
    policyObjectiveId: obj.policyObjectiveId,
    strategicObjective: obj.strategicObjective || undefined,
    strategicObjectiveDescription: obj.strategicObjectiveDescription || undefined,
    ponderacion: obj.ponderacion || 0,
    puntoPartida: obj.puntoPartida || 0,
    metaLlegada: obj.metaLlegada || 0,
    unidadMedida: obj.unidadMedida || '',
    completed: "NO" as const,
  });

  // Internal save logic
  const handleSaveInternal = async () => {
    if (!processId) return;

    // Usar objectivesRef.current para evitar el stale closure del debounce
    const dirtyObjectives = objectivesRef.current.filter(obj => obj.isDirty);
    
    if (dirtyObjectives.length === 0) {
      toast.info("No hay cambios para guardar", { duration: 2000 });
      return;
    }

    setSaving(true);
    const toastId = toast.loading('Guardando cambios...');

    try {
      for (const obj of dirtyObjectives) {
        const payload = buildSavePayload(obj);

        if (!obj.dbId) {
          // Create new objective (only once per row — dbId prevents duplicates)
          const result = await createMutation.mutateAsync({
            processId,
            ...payload,
          });
          const newDbId = result.id;
          if (!newDbId) {
            throw new Error("El servidor no devolvió el ID del objetivo creado");
          }
          setObjectives(prevObjs =>
            prevObjs.map(o =>
              o.id === obj.id
                ? { ...o, dbId: newDbId, isNew: false, isDirty: false, id: `db_${newDbId}` }
                : o
            )
          );
        } else {
          await updateMutation.mutateAsync({
            objectiveId: obj.dbId,
            ...payload,
          });
          setObjectives(prevObjs =>
            prevObjs.map(o =>
              o.id === obj.id ? { ...o, isDirty: false, isNew: false } : o
            )
          );
        }
      }

      setSaving(false);
      const now = new Date();
      setLastSaved(now.toLocaleTimeString('es-ES'));
      toast.dismiss(toastId);
      toast.success("✓ Guardado", { duration: 2000 });
    } catch (error) {
      console.error("Error saving objectives:", error);
      setSaving(false);
      toast.dismiss(toastId);
      toast.error("✗ Error al guardar", { duration: 3000 });
    }
  };

  const addObjective = () => {
    const newId = Math.max(...objectives.map(o => parseInt(o.id.replace('new_', '')) || 0), 0) + 1;
    const newObjective: TacticalObjectiveDefinition = {
      id: `new_${newId}`,
      policyObjectiveId: undefined,
      policyObjective: '',
      policyObjectiveDescription: '',
      strategicObjective: '',
      strategicObjectiveDescription: '',
      enunciation: '',
      explanation: '',
      ponderacion: 0,
      puntoPartida: 0,
      metaLlegada: 0,
      unidadMedida: '',
      avanceMeta: 0,
      responsible: '',
      isNew: true,
      isDirty: true
    };
    setObjectives([...objectives, newObjective]);
    // No auto-guardar filas vacías: evita duplicados en BD y pérdida de dbId
  };

  const deleteObjective = (id: string) => {
    const objective = objectives.find(o => o.id === id);
    if (!objective) return;

    if (objective.isNew) {
      // Just remove from state
      setObjectives(objectives.filter(o => o.id !== id));
    } else if (objective.dbId) {
      // Delete from database
      deleteMutation.mutate({ objectiveId: objective.dbId });
    }
  };

  const updateObjective = (id: string, field: keyof TacticalObjectiveDefinition, value: any) => {
    setObjectives(prevObjs =>
      prevObjs.map(obj =>
        obj.id === id
          ? { ...obj, [field]: value, isDirty: true }
          : obj
      )
    );
    autoSave();
  };

  const selectPolicyObjective = (id: string, value: string) => {
    const selected = policyObjectivesData.find(objective => objective.id === Number(value));
    setObjectives(prevObjs =>
      prevObjs.map(obj =>
        obj.id === id
          ? {
              ...obj,
              policyObjectiveId: selected?.id ?? null,
              policyObjective: selected?.objective ?? '',
              policyObjectiveDescription: selected?.description ?? '',
              isDirty: true,
            }
          : obj
      )
    );
    autoSave();
  };

  const handleExport = () => {
    if (objectives.length === 0) {
      toast.error("No hay objetivos para exportar");
      return;
    }
    exportTacticalObjectivesToPDF(objectives, (processId || 0).toString());
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4" translate="no">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLocation("/process-tactical-objectives")}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">OTE - DEFINICIÓN DE OBJETIVOS TÁCTICOS ESTRATÉGICOS</h1>
            {processId && <p className="text-sm text-gray-600 mt-1">Proceso: {processId}</p>}
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setLocation("/process-tactical-objectives")} 
              variant="outline" 
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              VOLVER
            </Button>
            <Button onClick={handleExport} variant="default" size="sm">
              <Download className="w-4 h-4 mr-2" />
              EXPORTAR OBJETIVOS
            </Button>
          </div>
        </div>

        {/* Status Messages */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Esperando cambios...</span>
            {saving && <Loader className="w-4 h-4 animate-spin" />}
            {lastSaved && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Guardado a las {lastSaved}
              </span>
            )}
          </div>
          
          {/* Ponderación Validator */}
          {(() => {
            const totalPonderacion = objectives.reduce((sum, obj) => sum + (obj.ponderacion || 0), 0);
            const isValid = totalPonderacion === 100;
            const isWarning = totalPonderacion > 0 && !isValid;
            
            return (
              <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md ${
                isValid 
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : isWarning
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}>
                <span className="font-medium">
                  {isValid ? '✓' : isWarning ? '✗' : '○'} Ponderación: {totalPonderacion}%
                </span>
                {isValid && <span>- Correcta</span>}
                {isWarning && <span>- {totalPonderacion > 100 ? 'Excede' : 'Falta'} {Math.abs(100 - totalPonderacion)}%</span>}
              </div>
            );
          })()}
        </div>

        {/* Add New Objective Button */}
        <div className="mb-6">
          <Button onClick={addObjective} variant="default">
            <Plus className="w-4 h-4 mr-2" />
            Agregar Objetivo Táctico
          </Button>
        </div>

        {/* Objectives List */}
        <div className="space-y-4">
          {objectives.length === 0 ? (
            <Card>
              <CardContent className="pt-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No hay objetivos tácticos definidos. Haz clic en "Agregar Objetivo Táctico" para comenzar.</p>
              </CardContent>
            </Card>
          ) : (
            objectives.map((obj, index) => (
              <Card key={obj.id} className={obj.isDirty ? 'border-yellow-400' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Objetivo Táctico #{index + 1}</CardTitle>
                    <Button
                      onClick={() => deleteObjective(obj.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Policy Objective */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Objetivo de la Política *
                    </label>
                    <select
                      value={obj.policyObjectiveId ?? ''}
                      onChange={(e) => selectPolicyObjective(obj.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecciona un Objetivo de la Política...</option>
                      {policyObjectivesData.map((policyObjective) => (
                        <option key={policyObjective.id} value={policyObjective.id}>{policyObjective.objective}</option>
                      ))}
                    </select>
                  </div>

                  {obj.policyObjectiveDescription && (
                    <div className="p-3 bg-sky-50 border border-sky-200 rounded-md">
                      <p className="text-sm text-sky-900">{obj.policyObjectiveDescription}</p>
                    </div>
                  )}

                  {/* Strategic Objective */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Objetivo Estratégico *
                    </label>
                    <select
                      value={obj.strategicObjective}
                      onChange={(e) => {
                        const selected = strategicObjectives.find(so => so.objective === e.target.value);
                        updateObjective(obj.id, 'strategicObjective', e.target.value);
                        if (selected) {
                          updateObjective(obj.id, 'strategicObjectiveDescription', selected.description || '');
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecciona un objetivo estratégico...</option>
                      {strategicObjectives.map((so) => (
                        <option key={so.id} value={so.objective}>{so.objective}</option>
                      ))}
                    </select>
                  </div>

                  {/* Strategic Objective Description */}
                  {obj.strategicObjectiveDescription && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-900">{obj.strategicObjectiveDescription}</p>
                    </div>
                  )}

                  {/* Enunciation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enunciado del Objetivo Táctico *
                    </label>
                    <Textarea
                      value={obj.enunciation}
                      onChange={(e) => updateObjective(obj.id, 'enunciation', e.target.value)}
                      placeholder="Define brevemente el OTE confrontando el Objetivo de la Política y el Objetivo Estratégico seleccionados..."
                      className="w-full"
                      rows={3}
                    />
                  </div>

                  {/* Explanation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Justificación del Objetivo
                    </label>
                    <Textarea
                      value={obj.explanation}
                      onChange={(e) => updateObjective(obj.id, 'explanation', e.target.value)}
                      placeholder="Explica brevemente por qué este objetivo es importante y cómo contribuye a los objetivos estratégicos..."
                      className="w-full"
                      rows={3}
                    />
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ponderación (%)
                      </label>
                      <Input
                        type="number"
                        value={obj.ponderacion}
                        onChange={(e) => updateObjective(obj.id, 'ponderacion', parseFloat(e.target.value) || 0)}
                        min="0"
                        max="100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Punto de Partida
                      </label>
                      <Input
                        type="number"
                        value={obj.puntoPartida}
                        onChange={(e) => updateObjective(obj.id, 'puntoPartida', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  {/* Meta and Unit */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Meta de Llegada
                      </label>
                      <Input
                        type="number"
                        value={obj.metaLlegada}
                        onChange={(e) => updateObjective(obj.id, 'metaLlegada', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Unidad de Medida
                      </label>
                      <Input
                        type="text"
                        value={obj.unidadMedida}
                        onChange={(e) => updateObjective(obj.id, 'unidadMedida', e.target.value)}
                        placeholder="Ej: %, unidades, horas"
                      />
                    </div>
                  </div>

                  {/* Responsible */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Responsable
                    </label>
                    <Input
                      type="text"
                      value={obj.responsible}
                      onChange={(e) => updateObjective(obj.id, 'responsible', e.target.value)}
                      placeholder="Nombre del responsable"
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>


      </div>
    </div>
  );
}
