import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Save, AlertCircle, Download, Check } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { exportFODAToPDF } from "@/lib/exportFODAToPDF";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { ActivePlanningCycleBadge } from "@/components/ActivePlanningCycleBadge";

type FODAType = 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';

interface FODAElement {
  id: number;
  type: FODAType;
  subprocess: string;
  policyObjective: string;
  selectedObjectiveContent: string;
  statement: string;
  description: string;
}

export default function ProcessFODA() {
  const [, setLocation] = useLocation();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null || isManagerLogin;
  const [processId, setProcessId] = useState<number | null>(null);
  const [processName, setProcessName] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingDataRef = useRef(false);

  const [elements, setElements] = useState<FODAElement[]>([
    { id: 1, type: 'Fortaleza', subprocess: '', policyObjective: '', selectedObjectiveContent: '', statement: '', description: '' },
  ]);

  const [subprocesses, setSubprocesses] = useState<string[]>([]);
  const [policyObjectives, setPolicyObjectives] = useState<string[]>([]);

  // Load process ID and name from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    const storedName = localStorage.getItem("selectedProcessName");
    if (stored) {
      setProcessId(parseInt(stored));
      setProcessName(storedName || "Proceso");
    }
  }, []);

  // Fetch FODA data from database
  const { data: fodaData, isLoading, refetch } = trpc.processFODA.get.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );

  // Fetch subprocess map to get subprocesses
  const { data: subprocessMapData } = trpc.subprocessMap.get.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );

  // Fetch policy objectives from database
  const [policyId, setPolicyIdState] = useState<number | null>(null);
  
  useEffect(() => {
    const stored = localStorage.getItem('selectedPolicyId');
    if (stored) {
      setPolicyIdState(parseInt(stored));
    }
  }, []);

  const { data: policyObjectivesData } = trpc.policyObjectives.list.useQuery(
    { policyId: policyId || 0 },
    { enabled: policyId !== null }
  );

  // Load policy objectives from tRPC
  useEffect(() => {
    if (policyObjectivesData && Array.isArray(policyObjectivesData)) {
      const objectives = policyObjectivesData.map((obj: any) => obj.objective).filter((o: string) => o && o.trim());
      setPolicyObjectives(objectives);
    }
  }, [policyObjectivesData]);

  // Parse subprocesses from subprocess map
  useEffect(() => {
    if (subprocessMapData?.subprocesos) {
      try {
        const parsed = JSON.parse(subprocessMapData.subprocesos);
        const subs = parsed.map((item: any) => item.subproceso).filter((s: string) => s && s.trim());
        setSubprocesses(Array.from(new Set(subs)));
      } catch (error) {
        console.error("Error parsing subprocesses:", error);
      }
    }
  }, [subprocessMapData]);



  // Load FODA data from database
  useEffect(() => {
    if (fodaData && fodaData.strengths) {
      isLoadingDataRef.current = true;
      try {
        const strengths = JSON.parse(fodaData.strengths || '[]');
        const opportunities = JSON.parse(fodaData.opportunities || '[]');
        const weaknesses = JSON.parse(fodaData.weaknesses || '[]');
        const threats = JSON.parse(fodaData.threats || '[]');
        
        const loaded = [
          ...strengths.map((s: any, i: number) => ({ ...s, id: i + 1, type: 'Fortaleza' as FODAType })),
          ...opportunities.map((o: any, i: number) => ({ ...o, id: strengths.length + i + 1, type: 'Oportunidad' as FODAType })),
          ...weaknesses.map((w: any, i: number) => ({ ...w, id: strengths.length + opportunities.length + i + 1, type: 'Debilidad' as FODAType })),
          ...threats.map((t: any, i: number) => ({ ...t, id: strengths.length + opportunities.length + weaknesses.length + i + 1, type: 'Amenaza' as FODAType })),
        ];
        
        if (loaded.length > 0) {
          setElements(loaded);
          setTimeout(() => { isLoadingDataRef.current = false; }, 100);
        } else {
          isLoadingDataRef.current = false;
        }
      } catch (error) {
        console.error("Error loading FODA data:", error);
        isLoadingDataRef.current = false;
      }
    }
  }, [fodaData]);

  // Autosave: trigger on elements change (skip during initial data load)
  useEffect(() => {
    if (isLoadingDataRef.current || !processId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      setIsSaving(true);
      updateMutation.mutate({
        processId,
        strengths: JSON.stringify(elements.filter(e => e.type === 'Fortaleza')),
        opportunities: JSON.stringify(elements.filter(e => e.type === 'Oportunidad')),
        weaknesses: JSON.stringify(elements.filter(e => e.type === 'Debilidad')),
        threats: JSON.stringify(elements.filter(e => e.type === 'Amenaza')),
      });
    }, 1500);
  }, [elements]);

  // Update FODA mutation
  const updateMutation = trpc.processFODA.upsert.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      setLastSaved(new Date());
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar el análisis");
    },
  });

  const handleSave = async () => {
    if (!processId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsSaving(true);
    await updateMutation.mutateAsync({
      processId,
      strengths: JSON.stringify(elements.filter(e => e.type === 'Fortaleza')),
      opportunities: JSON.stringify(elements.filter(e => e.type === 'Oportunidad')),
      weaknesses: JSON.stringify(elements.filter(e => e.type === 'Debilidad')),
      threats: JSON.stringify(elements.filter(e => e.type === 'Amenaza')),
    });
  };

  const addElement = (type: FODAType) => {
    const newId = Math.max(...elements.map(e => e.id), 0) + 1;
    setElements([...elements, { id: newId, type, subprocess: '', policyObjective: '', selectedObjectiveContent: '', statement: '', description: '' }]);
  };

  const deleteElement = (id: number) => {
    setElements(elements.filter(e => e.id !== id));
  };

  const updateElement = (id: number, field: keyof FODAElement, value: string) => {
    setElements(elements.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleObjectiveChange = (elementId: number, selectedObjective: string) => {
    // Find the full objective data
    const fullObjective = policyObjectivesData?.find((obj: any) => obj.objective === selectedObjective);
    const content = fullObjective ? `${fullObjective.objective}\n\n${fullObjective.description || ''}` : '';
    
    setElements(elements.map(e => e.id === elementId ? { ...e, policyObjective: selectedObjective, selectedObjectiveContent: content } : e));
  };

  if (!processId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <AlertCircle size={20} />
              <p>Por favor, selecciona un proceso primero</p>
            </div>
            <Button
              className="w-full mt-4"
               onClick={() => setLocation("/process-characterization")}
            >
              Ir a Caracterización de Procesos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fortalezas = elements.filter(e => e.type === 'Fortaleza') || [];
  const oportunidades = elements.filter(e => e.type === 'Oportunidad') || [];
  const debilidades = elements.filter(e => e.type === 'Debilidad') || [];
  const amenazas = elements.filter(e => e.type === 'Amenaza') || [];

  const renderFODACard = (title: string, type: FODAType, items: FODAElement[], bgColor: string, borderColor: string, buttonText: string) => (
    <Card className={`border-2 ${borderColor}`}>
      <CardHeader className={bgColor}>
        <CardTitle className={borderColor.replace('border-', 'text-')}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {items.map((element) => (
          <div key={element.id} className="border rounded-lg p-3 space-y-2 bg-slate-50">
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Subproceso</label>
                  <select
                    value={element.subprocess}
                    onChange={(e) => updateElement(element.id, 'subprocess', e.target.value)}
                    className="w-full text-xs border rounded p-2 min-h-8"
                  >
                    <option value="">Seleccionar subproceso...</option>
                    {subprocesses.map((sub, idx) => (
                      <option key={idx} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Objetivo de la Política</label>
                  <select
                    value={element.policyObjective}
                    onChange={(e) => handleObjectiveChange(element.id, e.target.value)}
                    className="w-full text-xs border rounded p-2 min-h-8"
                  >
                    <option value="">Seleccionar objetivo...</option>
                    {policyObjectives.map((obj, idx) => (
                      <option key={idx} value={obj}>{obj}</option>
                    ))}
                  </select>
                </div>

                {element.selectedObjectiveContent && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Objetivo Seleccionado</label>
                    <Textarea
                      value={element.selectedObjectiveContent}
                      readOnly
                      className="text-sm min-h-[100px] bg-blue-50 border-blue-300"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-600">Enunciado</label>
                  <Textarea
                    value={element.statement}
                    onChange={(e) => updateElement(element.id, 'statement', e.target.value)}
                    placeholder="Define brevemente esta fortaleza/oportunidad/debilidad/amenaza..."
                    className="text-sm min-h-[60px]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Descripción (Justificación)</label>
                  <Textarea
                    value={element.description}
                    onChange={(e) => updateElement(element.id, 'description', e.target.value)}
                    placeholder="Justifica y describe detalladamente el hallazgo..."
                    className="text-sm min-h-[100px]"
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteElement(element.id)}
                className="text-red-600 hover:text-red-700 h-fit mt-6"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => addElement(type)}
          className="w-full gap-2"
        >
          <Plus size={14} />
          {buttonText}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-6 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold text-blue-900">ANÁLISIS FODA</h1><ActivePlanningCycleBadge companyId={Number(localStorage.getItem("selectedCompanyId"))} /></div>
          <p className="text-slate-600 mt-2">Proceso: <strong>{processName}</strong></p>
        </div>
        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="text-xs text-slate-500">Guardando...</span>
          )}
          {!isSaving && lastSaved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check size={12} /> Guardado a las {lastSaved.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            <Save size={16} />
            Guardar Análisis FODA
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

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Cargando análisis FODA...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderFODACard('Fortalezas', 'Fortaleza', fortalezas, 'bg-green-50', 'border-green-500', 'Agregar Fortaleza')}
            {renderFODACard('Oportunidades', 'Oportunidad', oportunidades, 'bg-blue-50', 'border-blue-500', 'Agregar Oportunidad')}
            {renderFODACard('Debilidades', 'Debilidad', debilidades, 'bg-orange-50', 'border-orange-500', 'Agregar Debilidad')}
            {renderFODACard('Amenazas', 'Amenaza', amenazas, 'bg-red-50', 'border-red-500', 'Agregar Amenaza')}
          </div>

          {/* Export Button */}
          <div className="flex gap-2 mt-6">
            <Button
              onClick={() => {
                const success = exportFODAToPDF(elements, processName);
                if (success) {
                  toast.success('PDF exportado exitosamente');
                } else {
                  toast.error('Error al exportar el PDF');
                }
              }}
              className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
              size="lg"
            >
              <Download size={20} />
              Exportar a PDF
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
