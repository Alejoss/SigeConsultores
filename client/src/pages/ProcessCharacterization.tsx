import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { ArrowLeft } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import ProceduresCharacterization from "./ProceduresCharacterization";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useRef } from "react";
import { toast } from "sonner";

interface ProcessData {
  macroProcess: string;
  responsible: string;
  participants: string;
  objective: string;
  scope: string;
  resources: string;
}

const CHARACTERIZATION_MODULES = [
  { id: "participantes", label: "Participantes", icon: "👥" },
  { id: "recursos", label: "Recursos", icon: "📦" },
  { id: "subprocesos", label: "Mapa de\nSubprocesos", icon: "📊" },
  { id: "criticidad", label: "Matriz de\nPartes Interesadas", icon: "⚠️" },
  { id: "foda", label: "FODA", icon: "🎯" },
  { id: "matriz", label: "Matriz", icon: "📋" },
  { id: "objetivos", label: "Objetivos\nTácticos", icon: "🎪" },
  { id: "cumplimientos", label: "Cumplimientos", icon: "✅" },
  { id: "capacitaciones", label: "Capacitaciones", icon: "📚" },
  { id: "procedimientos", label: "Procedimientos", icon: "📄" },
  { id: "cronograma", label: "Cronograma\nConsolidado", icon: "📅" },
  { id: "indicadores", label: "Indicadores", icon: "📈" },
];

export default function ProcessCharacterization() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null || isManagerLogin;
  const isProcessLeader = processLeaderSession !== null;
  const [processId, setProcessId] = useState<number | null>(null);
  
  // Get companyId and processId from localStorage for back button
  const companyId = localStorage.getItem('selectedCompanyId');
  const selectedProcessId = localStorage.getItem('selectedProcessId');
  const [processName, setProcessName] = useState("");
  const [macroProcessName, setMacroProcessName] = useState("");
  const [macroProcessEditable, setMacroProcessEditable] = useState("");
  const [activeModule, setActiveModule] = useState("datos");
  const [data, setData] = useState<ProcessData>({
    macroProcess: "",
    responsible: "",
    participants: "",
    objective: "",
    scope: "",
    resources: "",
  });
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>("");

  // selectedProcessId is already declared above
  
  // Check if user is a Process Owner and get their assigned processes
  const userProcessOwnersQuery = trpc.hierarchicalAccess.processOwners.getByUser.useQuery(
    { userId: user?.id || 0 },
    { enabled: !!user?.id }
  );
  
  // Fetch process details
  const { data: processDetails, isLoading: processLoading } = trpc.processMap.get.useQuery(
    { processId: selectedProcessId ? parseInt(selectedProcessId) : 0 },
    { enabled: !!selectedProcessId }
  );

  // Fetch characterization data
  const { data: characterization, isLoading: charLoading } = trpc.processCharacterization.getByProcessId.useQuery(
    { processId: selectedProcessId ? parseInt(selectedProcessId) : 0 },
    { enabled: !!selectedProcessId }
  );

  // Update mutation
  const updateMutation = trpc.processCharacterization.update.useMutation({
    onSuccess: (result) => {
      // Update local state directly instead of invalidating to avoid race conditions
      if (result) {
        setData({
          macroProcess: result.macroProcess || "",
          responsible: result.responsible || "",
          participants: result.participants || "",
          objective: result.objective || "",
          scope: result.scope || "",
          resources: result.resources || "",
        });
      }
    },
  });

  useEffect(() => {
    if (selectedProcessId) {
      const processIdNum = parseInt(selectedProcessId);
      
      // Check if user is a Process Owner
      if (userProcessOwnersQuery.data && userProcessOwnersQuery.data.length > 0) {
        const assignedProcessIds = userProcessOwnersQuery.data.map(po => po.processId);
        
          // If user is a Process Owner but doesn't have access to this process, redirect
          if (!assignedProcessIds.includes(processIdNum)) {
            console.warn('[ProcessCharacterization] User does not have access to this process');
            if (isProcessLeader) {
              setLocation("/process-leader-dashboard");
            } else {
              setLocation(isManagerAccess ? "/manager-dashboard" : "/process-map");
            }
            return;
          }
      }
      
      setProcessId(processIdNum);
    }
  }, [selectedProcessId, userProcessOwnersQuery.data, setLocation]);

  // Auto-fill process name from processDetails
  useEffect(() => {
    if (processDetails) {
      setProcessName(processDetails.name || "");
      setMacroProcessName(processDetails.macroProcess || "");
    }
  }, [processDetails]);

  // Load characterization data - this takes priority over processDetails
  useEffect(() => {
    if (characterization) {
      const newData = {
        macroProcess: characterization.macroProcess || "",
        responsible: characterization.responsible || "",
        participants: characterization.participants || "",
        objective: characterization.objective || "",
        scope: characterization.scope || "",
        resources: characterization.resources || "",
      };
      setData(newData);
      // Use characterization's macroProcess if it exists, otherwise use processDetails
      setMacroProcessEditable(characterization.macroProcess || processDetails?.macroProcess || "");
      lastSavedDataRef.current = JSON.stringify(newData);
    } else if (processDetails) {
      // Only auto-fill from processDetails if no characterization data exists
      setMacroProcessEditable(processDetails.macroProcess || "");
    }
  }, [characterization, processDetails]);

  // Auto-save data cuando hay cambios reales
  useEffect(() => {
    if (!processId) return;

    const currentData = {
      macroProcess: macroProcessEditable,
      responsible: data.responsible,
      participants: data.participants,
      objective: data.objective,
      scope: data.scope,
      resources: data.resources,
    };
    
    const currentDataStr = JSON.stringify(currentData);
    
    // Si no hay cambios, no hacer nada
    if (currentDataStr === lastSavedDataRef.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      setIsAutoSaving(true);
      try {
        await updateMutation.mutateAsync({
          processId,
          macroProcess: macroProcessEditable,
          responsible: data.responsible,
          participants: data.participants,
          objective: data.objective,
          scope: data.scope,
          resources: data.resources,
        });
        lastSavedDataRef.current = currentDataStr;
        setLastSaved(new Date());
        console.log('Datos Generales guardados automáticamente');
      } catch (error) {
        console.error('Error auto-saving:', error);
      } finally {
        setIsAutoSaving(false);
      }
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [data, macroProcessEditable, processId]);

  const handleSave = async () => {
    if (!processId) return;
    
    try {
      const dataToSave = {
        processId,
        macroProcess: macroProcessEditable,
        responsible: data.responsible,
        participants: data.participants,
        objective: data.objective,
        scope: data.scope,
        resources: data.resources,
      };
      
      await updateMutation.mutateAsync(dataToSave);
      lastSavedDataRef.current = JSON.stringify(dataToSave);
      toast.success("✓ Datos Generales guardados exitosamente");
      setMacroProcessName(macroProcessEditable);
      setLastSaved(new Date());
    } catch (error) {
      console.error("Error saving characterization:", error);
      toast.error("✗ Error al guardar los datos");
    }
  };

  const handleModuleClick = (moduleId: string) => {
    const routes: { [key: string]: string } = {
      "subprocesos": "/subprocess-map",
      "criticidad": "/process-stakeholder-criticality",
      "foda": "/process-foda",
      "matriz": "/process-risk-matrix",
      "objetivos": "/process-tactical-objectives",
      "cumplimientos": "/process-compliances",
      "capacitaciones": "/process-trainings",
      "cronograma": "/consolidated-schedule",
      "indicadores": "/process-indicators",
      "participantes": "/process-participants",
      "recursos": "/process-resources",
    };
    
    if (routes[moduleId]) {
      setLocation(routes[moduleId]);
    } else {
      setActiveModule(moduleId);
    }
  };

  // Check if user has access to the process
  const hasAccessError = selectedProcessId && userProcessOwnersQuery.data && 
    userProcessOwnersQuery.data.length > 0 && 
    !userProcessOwnersQuery.data.some(po => po.processId === parseInt(selectedProcessId));
  
  if (!processId || hasAccessError) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">
              {hasAccessError 
                ? "No tienes acceso a este proceso. Por favor, selecciona uno de tus procesos asignados."
                : "Por favor, selecciona un proceso primero desde el Mapa de Procesos"}
            </p>
            <Button
              className="w-full mt-4"
                onClick={() => setLocation(isProcessLeader ? "/process-map" : (isManagerAccess ? "/manager-dashboard" : "/process-map"))}
             >
                Volver al Mapa de Procesos
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  if (processLoading || charLoading) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Cargando...</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 bg-white min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-blue-900">CARACTERIZACIÓN DE PROCESOS</h1>
          {activeModule !== "procedimientos" && (
            <Button
              variant="outline"
              onClick={() => {
                // Process leader always goes back to process map
                if (isProcessLeader) {
                  const url = companyId && selectedProcessId 
                    ? `/process-map?companyId=${companyId}&processId=${selectedProcessId}`
                    : "/process-map";
                  setLocation(url);
                } else if (isManagerAccess) {
                  setLocation("/manager-dashboard");
                } else {
                  const url = companyId && selectedProcessId 
                    ? `/process-map?companyId=${companyId}&processId=${selectedProcessId}`
                    : "/process-map";
                  setLocation(url);
                }
              }}
              className="gap-2"
            >
              <ArrowLeft size={16} />
              VOLVER
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Módulos */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">PROCESO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="font-semibold text-sm text-blue-900">{processName}</p>
                </div>

                <div className="border-t pt-4 mt-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3">MÓDULOS DE CARACTERIZACIÓN</p>
                  <div className="grid grid-cols-2 gap-2">
                    {CHARACTERIZATION_MODULES.map((module) => (
                      <Button
                        key={module.id}
                        variant={activeModule === module.id ? "default" : "outline"}
                        size="sm"
                        className="h-auto py-2 text-xs text-center whitespace-pre-line"
                        onClick={() => handleModuleClick(module.id)}
                      >
                        <div className="text-center">
                          <p className="text-lg">{module.icon}</p>
                          <p className="text-xs font-semibold leading-tight">{module.label}</p>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeModule === "datos" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>DATOS GENERALES</CardTitle>
                    <div className="text-xs text-slate-500">
                      {isAutoSaving && <span className="text-blue-600">⏳ Guardando...</span>}
                      {lastSaved && !isAutoSaving && <span className="text-green-600">✓ Guardado {lastSaved.toLocaleTimeString()}</span>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <tbody>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3 w-1/3">PROCESO:</td>
                          <td className="border border-slate-300 p-3 font-semibold text-blue-900">{processName}</td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">MACRO PROCESO:</td>
                          <td className="border border-slate-300 p-3">
                            <Input
                              value={macroProcessEditable}
                              onChange={(e) => setMacroProcessEditable(e.target.value)}
                              placeholder="Ingresa el macro proceso"
                              className="border-0 p-0 font-semibold text-blue-900"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">RESPONSABLE DEL PROCESO:</td>
                          <td className="border border-slate-300 p-3">
                            <Input
                              value={data.responsible}
                              onChange={(e) => setData({ ...data, responsible: e.target.value })}
                              className="border-0 p-0"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">OBJETIVO DEL PROCESO:</td>
                          <td className="border border-slate-300 p-3">
                            <Textarea
                              value={data.objective}
                              onChange={(e) => setData({ ...data, objective: e.target.value })}
                              className="border-0 p-0 min-h-24 resize-none"
                              placeholder="Ingresa el objetivo del proceso"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 bg-blue-50 font-bold p-3">ALCANCE:</td>
                          <td className="border border-slate-300 p-3">
                            <Textarea
                              value={data.scope}
                              onChange={(e) => setData({ ...data, scope: e.target.value })}
                              className="border-0 p-0 min-h-24 resize-none"
                              placeholder="Ingresa el alcance del proceso"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="mt-6 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {updateMutation.isPending ? "Guardando..." : "Guardar Datos Generales"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {activeModule === "procedimientos" && processId && (
              <ProceduresCharacterization 
                processId={processId}
                processName={processName}
                onVolver={() => setActiveModule("datos")}
              />
            )}

            {activeModule !== "datos" && activeModule !== "procedimientos" && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-slate-600">
                    Módulo de {CHARACTERIZATION_MODULES.find(m => m.id === activeModule)?.label} en desarrollo
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
