import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2, MessageCircle, Upload, Eye } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { AIChatPanel } from "@/components/AIChatPanel";


// Función para auto-expandir textareas
const autoExpandTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return;
  // Resetear altura para calcular scrollHeight correctamente
  textarea.style.height = 'auto';
  // Usar scrollHeight con padding, mínimo 64px
  const scrollHeight = textarea.scrollHeight;
  const paddingTop = parseInt(window.getComputedStyle(textarea).paddingTop) || 0;
  const paddingBottom = parseInt(window.getComputedStyle(textarea).paddingBottom) || 0;
  const totalHeight = Math.max(scrollHeight + paddingTop + paddingBottom, 64);
  textarea.style.height = totalHeight + 'px';
};

const generateUniqueId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

interface StakeholderCriticality {
  id: string;  // Temporary UI ID
  dbId?: number;  // Database ID (if loaded from DB)
  name: string;
  internalExternal: string;
  clienteProveedor?: string;
  needsSolicita: string;
  needsEntrega: string;
  incidenceCriteria: string[];
  incidenceValue: number[];
  riskCriteria: string[];
  riskValue: string[];
  criticityScore: string | number;
  existingDefenses: string;
  actionToTake: string;
  observations: string;
  startDate: string;
  endDate: string;
  completed: "Si" | "No";
}

interface CriticalityData {
  processId: string;
  stakeholders: StakeholderCriticality[];
}

const incidenceCriteriaOptions = [
  "Impacto económico",
  "Frecuencia de interacción",
  "Personalización o recursos",
  "Influencia en procesos",
];

const riskCriteriaOptions = [
  "Riesgo de impago",
  "Riesgo reputacional",
  "Cumplimiento normativo",
  "Riesgos operacionales",
  "Riesgos de seguridad",
];

const getCriticalityInfo = (incidenceValues: number[], riskValues: string[]) => {
  // Matriz de criticidad: Incidencia × Riesgo (concatenación, no multiplicación)
  // Filas: Incidencia (3=Alto, 2=Medio, 1=Bajo)
  // Columnas: Riesgo (A=Alto, B=Medio, C=Bajo)
  // Resultado: Concatenación (ej: 3A, 2C, 1B)
  const criticalityMatrix: Record<string, { score: string; color: string; label: string }> = {
    "3A": { score: "3A", color: "bg-red-900", label: "3A = Crítico" },
    "3B": { score: "3B", color: "bg-red-500", label: "3B = Alto" },
    "3C": { score: "3C", color: "bg-yellow-400", label: "3C = Medio" },
    "2A": { score: "2A", color: "bg-red-500", label: "2A = Alto" },
    "2B": { score: "2B", color: "bg-orange-400", label: "2B = Medio-Alto" },
    "2C": { score: "2C", color: "bg-yellow-200", label: "2C = Bajo" },
    "1A": { score: "1A", color: "bg-yellow-400", label: "1A = Medio" },
    "1B": { score: "1B", color: "bg-yellow-200", label: "1B = Bajo" },
    "1C": { score: "1C", color: "bg-green-500", label: "1C = Muy Bajo" },
  };

  const maxIncidence = incidenceValues.length > 0 ? Math.max(...incidenceValues) : 0;
  const maxRiskIndex = riskValues.length > 0 ? Math.min(...riskValues.map(r => r.charCodeAt(0))) : "C".charCodeAt(0);
  const maxRisk = String.fromCharCode(maxRiskIndex);
  
  const key = `${maxIncidence}${maxRisk}`;
  const result = criticalityMatrix[key] || { score: "0", color: "bg-slate-300", label: "No clasificado" };

  return { score: result.score, color: result.color, label: result.label };
};

export default function ProcessStakeholderCriticality() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { session: processLeaderSession, isLoading: contextLoading } = useProcessLeaderAuth();
  const [data, setData] = useState<CriticalityData>({
    processId: "",
    stakeholders: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [processId, setProcessId] = useState<string>("");
  const [processName, setProcessName] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [excelFileName, setExcelFileName] = useState<string>("");
  const [excelUploadStatus, setExcelUploadStatus] = useState<'idle' | 'uploading' | 'saved' | 'error'>('idle');
  const excelInputRef = useRef<HTMLInputElement>(null);
  const uploadExcelMatrixMutation = trpc.processStakeholderCriticality.uploadExcelMatrix.useMutation();
  const { data: excelMatrixData, refetch: refetchExcelMatrix } = trpc.processStakeholderCriticality.getExcelMatrix.useQuery(
    { processId: processId ? parseInt(processId) : 0 },
    { enabled: !!processId }
  );
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aiQueryMutation = trpc.ai.query.useMutation();
  
  // Mutations for saving criticality data
  const getOrCreateStakeholderMutation = trpc.criticalityMatrix.getOrCreateStakeholder.useMutation();
  const upsertCriticalityMutation = trpc.criticalityMatrix.upsert.useMutation();
  
  // Query to load criticality data from database
  const { data: criticalityDataFromDb, isLoading: isLoadingCriticalityData } = trpc.criticalityMatrix.getWithStakeholders.useQuery(
    { processId: processId ? parseInt(processId) : 0 },
    { enabled: !!processId }
  );

  // Get companyId from localStorage
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");

  const handleAIQuery = async (query: string): Promise<string> => {
    try {
      const response = await aiQueryMutation.mutateAsync({
        companyId,
        moduleType: "Criticality",
        query,
        contextData: {
          moduleName: "Criticidad de Partes Interesadas",
          processName,
          description: "Usuario consultando sobre criticidad de stakeholders (asociados de negocio)",
          stakeholderCount: data.stakeholders.length,
        },
      });
      return response.response;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Error al consultar IA");
    }
  };

  useEffect(() => {
    // Wait for context to load first
    if (contextLoading) return;

    // Try to get processId from query params first, then Process Leader context, then localStorage
    let resolvedProcessId = "";
    let resolvedProcessName = "";

    // 1. Check query params (?processId=123)
    const queryParams = new URLSearchParams(searchParams);
    const queryProcessId = queryParams.get("processId");
    if (queryProcessId) {
      resolvedProcessId = queryProcessId;
      resolvedProcessName = queryParams.get("processName") || "";
      console.log("DEBUG: Using processId from query params:", resolvedProcessId);
    }
    // 2. Check Process Leader context
    else if (processLeaderSession?.processId) {
      resolvedProcessId = String(processLeaderSession.processId);
      resolvedProcessName = processLeaderSession.processName || "";
      console.log("DEBUG: Using processId from Process Leader context:", resolvedProcessId);
    }
    // 3. Check localStorage
    else {
      const storedProcessId = localStorage.getItem("selectedProcessId");
      const storedProcessName = localStorage.getItem("selectedProcessName");
      if (storedProcessId) {
        resolvedProcessId = storedProcessId;
        resolvedProcessName = storedProcessName || "";
        console.log("DEBUG: Using processId from localStorage:", resolvedProcessId);
      }
    }

    if (resolvedProcessId) {
      setProcessId(resolvedProcessId);
      setProcessName(resolvedProcessName);
      
      // AISLAMIENTO POR PROCESSID: Cargar criticalityData específica para este proceso
      const criticalityDataKey = `criticalityData_${resolvedProcessId}`;
      const storedCriticalityData = localStorage.getItem(criticalityDataKey);
      
      console.log("DEBUG: Loading criticality data for processId:", resolvedProcessId);
      
      if (storedCriticalityData) {
        try {
          const parsedData = JSON.parse(storedCriticalityData);
          console.log("DEBUG: Loaded criticality data:", parsedData);
          setData(parsedData);
        } catch (e) {
          console.error("Error parsing criticality data:", e);
        }
      } else {
        console.log("DEBUG: No criticality data found for processId:", resolvedProcessId);
        setData({
          processId: resolvedProcessId,
          stakeholders: [],
        });
      }
      setHasInitiallyLoaded(true);
    }
  }, [contextLoading, processLeaderSession, searchParams]);

  const { data: subprocessMapData, isLoading: isLoadingSubprocessMap, error: subprocessMapError } = trpc.subprocessMap.get.useQuery(
    { processId: processId ? parseInt(processId) : 0 },
    { enabled: !!processId }
  );

  useEffect(() => {
    console.log("DEBUG: subprocessMapData query state:", {
      processId: processId ? parseInt(processId) : 0,
      isLoading: isLoadingSubprocessMap,
      hasData: !!subprocessMapData,
      error: subprocessMapError,
      data: subprocessMapData
    });
  }, [subprocessMapData, isLoadingSubprocessMap, subprocessMapError, processId]);

  const hasLoadedStakeholders = useRef(false);
  const dataRef = useRef(data);
  
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Auto-load stakeholders when subprocess map and criticality data are ready
  useEffect(() => {
    if (!processId || !subprocessMapData) {
      console.log("DEBUG: Auto-load skipped - processId or subprocessMapData missing");
      return;
    }

    // Only load once per processId
    if (hasLoadedStakeholders.current) {
      console.log("DEBUG: Auto-load skipped - already loaded for this processId");
      return;
    }

    // Check if we already have stakeholders (from localStorage)
    if (data.stakeholders.length > 0) {
      console.log("DEBUG: Auto-load skipped - stakeholders already loaded from localStorage");
      hasLoadedStakeholders.current = true;
      return;
    }

    console.log("DEBUG: Auto-loading stakeholders from subprocess map");
    hasLoadedStakeholders.current = true;
    loadStakeholdersFromSubprocessMap();
  }, [processId, subprocessMapData, criticalityDataFromDb, data.stakeholders.length]);

  // Autosave con debounce de 1.5 segundos (solo después de carga inicial)
  useEffect(() => {
    // No autosave until initial load is complete
    if (!hasInitiallyLoaded) {
      console.log("DEBUG: Autosave skipped - initial load not complete");
      return;
    }

    // Limpiar timeout anterior
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Mostrar estado "guardando"
    setSaveStatus('saving');

    // Guardar después de 1.5 segundos sin cambios
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleSave();
      setSaveStatus('saved');
      // Limpiar estado después de 2 segundos
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [data, hasInitiallyLoaded]);
  
  const loadStakeholdersFromSubprocessMap = useCallback(() => {
    console.log("DEBUG: loadStakeholdersFromSubprocessMap called");
    console.log("DEBUG: processId:", processId);
    console.log("DEBUG: subprocessMapData:", subprocessMapData);
    
    if (!processId || !subprocessMapData) {
      console.log("DEBUG: Returning early - processId or subprocessMapData is missing");
      return;
    }

    try {
      let entrada = [];
      let subprocesos = [];
      
      if (typeof subprocessMapData.entrada === 'string') {
        entrada = subprocessMapData.entrada ? JSON.parse(subprocessMapData.entrada) : [];
      } else if (Array.isArray(subprocessMapData.entrada)) {
        entrada = subprocessMapData.entrada;
      }

      if (typeof subprocessMapData.subprocesos === 'string') {
        subprocesos = subprocessMapData.subprocesos ? JSON.parse(subprocessMapData.subprocesos) : [];
      } else if (Array.isArray(subprocessMapData.subprocesos)) {
        subprocesos = subprocessMapData.subprocesos;
      }

      console.log("DEBUG: entrada count:", entrada.length, "subprocesos count:", subprocesos.length);
      console.log("DEBUG: Full subprocesos data:", JSON.stringify(subprocesos, null, 2));

      // Crear mapa de subprocesos por nombre para acceder a sus acciones
      const subprocessActionsByName = new Map();
      let firstSubprocessActions = ""; // Guardar las acciones del primer subproceso como fallback
      
      subprocesos.forEach((s: any, index: number) => {
        const name = s.subproceso || s.name || s.nombre || "";
        if (name) {
          const actions = s.acciones || "";
          subprocessActionsByName.set(name, actions);
          if (index === 0) {
            firstSubprocessActions = actions;
          }
          console.log(`DEBUG: Subprocess "${name}" -> Actions: "${actions.substring(0, 50)}..."`);
        }
      });
      console.log("DEBUG: Final subprocess map keys:", Array.from(subprocessActionsByName.keys()));
      console.log("DEBUG: First subprocess actions:", firstSubprocessActions.substring(0, 100));

      // Create a map of saved criticality data by stakeholder name
      const criticalityByName = new Map();
      if (criticalityDataFromDb && Array.isArray(criticalityDataFromDb)) {
        criticalityDataFromDb.forEach((crit: any) => {
          if (crit.stakeholderName) {
            criticalityByName.set(crit.stakeholderName, crit);
            console.log(`DEBUG: Found saved criticality for stakeholder: ${crit.stakeholderName}`);
          }
        });
      }

      // Crear nuevos stakeholders SOLO de ENTRADA (Partes Interesadas)
      // SIN LÍMITE: Cargar TODAS las partes interesadas del Mapa de Subprocesos
      // Cada proceso puede tener diferente cantidad de partes interesadas
      const entradaLimitada = entrada;
      console.log(`DEBUG: Loading ALL entrada stakeholders: ${entradaLimitada.length} items`);
      console.log(`DEBUG: Entrada items: ${entradaLimitada.map((e: any) => e.partesInteresadas || e.name || e.nombre).join(", ")}`);
      
      const newStakeholdersFromEntrada = entradaLimitada.map((e: any) => {
        const name = e.partesInteresadas || e.name || e.nombre || "";
        const internalExternal = e.internoExterno || "Externo";
        const clienteProveedor = e.clienteProveedor || e.clienteProvedor || "";
        const needsSolicita = e.solicita || "";
        const needsEntrega = e.entrega || "";
        
        // Buscar las defensas existentes desde el subproceso relacionado
        let existingDefenses = "";
        
        // Primero intentar búsqueda por coincidencia de nombres
        subprocessActionsByName.forEach((actions: any, subprocessName: string) => {
          if (!existingDefenses && name && subprocessName && 
              (subprocessName.toLowerCase().includes(name.toLowerCase()) || 
               name.toLowerCase().includes(subprocessName.toLowerCase()))) {
            existingDefenses = actions as string;
            console.log(`DEBUG: Stakeholder "${name}" - MATCH with "${subprocessName}"`);
          }
        });
        
        // Si no hay coincidencia, usar las acciones del primer subproceso
        if (!existingDefenses && firstSubprocessActions) {
          existingDefenses = firstSubprocessActions;
          console.log(`DEBUG: Stakeholder "${name}" - Using first subprocess`);
        }
        
        console.log(`DEBUG: Stakeholder "${name}" - Final Defensas: "${existingDefenses.substring(0, 50)}..."`);
        
        // Check if there's saved criticality data for this stakeholder
        const savedCriticality = criticalityByName.get(name);
        console.log(`DEBUG: Stakeholder "${name}" - Saved criticality found:`, !!savedCriticality);
        
        // Parse incidence and risk from saved data
        let incidenceValue: number[] = [];
        let riskValue: string[] = [];
        let criticityScore: string | number = 0;
        let actionToTake = "";
        let observations = "";
        let startDate = "";
        let endDate = "";
        let completed: "Si" | "No" = "No";
        let dbId: number | undefined = undefined;
        
        if (savedCriticality) {
          // Preserve the database ID so we can update the existing record
          dbId = savedCriticality.id;
          console.log(`DEBUG: Stakeholder "${name}" - DB ID: ${dbId}`);
          
          // Parse incidence value (e.g., "1", "2", "3")
          if (savedCriticality.incidence) {
            incidenceValue = [parseInt(savedCriticality.incidence)];
          }
          // Parse risk value (e.g., "A", "B", "C")
          if (savedCriticality.risk) {
            riskValue = [savedCriticality.risk];
          }
          criticityScore = savedCriticality.criticality || 0;
          actionToTake = savedCriticality.actionToTake || "";
          observations = savedCriticality.observations || "";
          startDate = savedCriticality.startDate ? new Date(savedCriticality.startDate).toISOString().split('T')[0] : "";
          endDate = savedCriticality.endDate ? new Date(savedCriticality.endDate).toISOString().split('T')[0] : "";
          completed = savedCriticality.implementationStatus ? "Si" : "No";
          existingDefenses = savedCriticality.existingDefenses || existingDefenses;
        }
        
        // Siempre crear uno nuevo (reemplazar completamente los stakeholders)
        return {
          id: generateUniqueId(),
          dbId,  // Preserve database ID if it exists
          name,
          internalExternal,
          clienteProveedor,
          needsSolicita,
          needsEntrega,
          incidenceCriteria: [],
          incidenceValue,
          riskCriteria: [],
          riskValue,
          criticityScore,
          existingDefenses,
          actionToTake,
          observations,
          startDate,
          endDate,
          completed,
        };
      });

      // REEMPLAZAR COMPLETAMENTE: Solo usar los 6 stakeholders del Mapa de Subprocesos
      // No mantener stakeholders antiguos - esto asegura que solo carguen los 6 del Mapa
      const finalStakeholders = newStakeholdersFromEntrada;
      
      const newData = {
        ...dataRef.current,
        processId: processId || "",
        stakeholders: finalStakeholders,
      };

      setData(newData);
      // AISLAMIENTO POR PROCESSID: Guardar con clave específica para este proceso
      const criticalityDataKey = `criticalityData_${processId}`;
      localStorage.setItem(criticalityDataKey, JSON.stringify(newData));
      console.log("DEBUG: Stakeholders loaded and saved:", newData.stakeholders.length);
      console.log("DEBUG: Saving to localStorage key:", criticalityDataKey);
      console.log("DEBUG: Final saved stakeholder names:", newData.stakeholders.map((s: any) => s.name).join(", "));
    } catch (error) {
      console.error("Error loading stakeholders from subprocess map:", error);
    }
  }, [processId, subprocessMapData, criticalityDataFromDb]);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!processId) {
      alert('No hay proceso seleccionado. Por favor regresa y selecciona un proceso.');
      return;
    }
    const fileName = file.name;
    setExcelUploadStatus('uploading');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await uploadExcelMatrixMutation.mutateAsync({
        processId: parseInt(processId),
        fileName,
        fileData: Array.from(uint8Array),
        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      setExcelFileName(fileName);
      setExcelUploadStatus('saved');
      refetchExcelMatrix();
      setTimeout(() => setExcelUploadStatus('idle'), 3000);
    } catch (err) {
      console.error('[Excel] Error uploading file:', err);
      setExcelUploadStatus('error');
      alert('Error al subir el archivo. Por favor intenta de nuevo.');
      setTimeout(() => setExcelUploadStatus('idle'), 3000);
    }
    e.target.value = '';
  };

  const handleSave = async () => {
    if (isSaving) return; // Evitar múltiples guardados simultáneos
    setIsSaving(true);
    try {
      // AISLAMIENTO POR PROCESSID: Guardar con clave específica para este proceso
      const criticalityDataKey = `criticalityData_${processId}`;
      localStorage.setItem(criticalityDataKey, JSON.stringify(data));
      console.log("DEBUG: Autosave - Saved criticality data to localStorage key:", criticalityDataKey);
      
      // Save each stakeholder to the database
      for (const stakeholder of data.stakeholders) {
        if (!stakeholder.name) {
          console.warn("[handleSave] Skipping stakeholder with empty name");
          continue;
        }

        try {
          // Step 1: Get or create stakeholder
          console.log(`[handleSave] Getting or creating stakeholder: ${stakeholder.name}`);
          const stakeholderRecord = await getOrCreateStakeholderMutation.mutateAsync({
            processId: parseInt(processId),
            name: stakeholder.name,
            type: stakeholder.clienteProveedor ? (stakeholder.clienteProveedor.toLowerCase() as "cliente" | "proveedor") : undefined,
            isInternal: stakeholder.internalExternal === "Interno",
            orderIndex: 0,
          });

          if (!stakeholderRecord) {
            console.error(`[handleSave] Failed to get or create stakeholder: ${stakeholder.name}`);
            continue;
          }

          console.log(`[handleSave] Got stakeholder with ID: ${stakeholderRecord.id}`);

          // Step 2: Determine criticality score
          const criticityInfo = getCriticalityInfo(
            stakeholder.incidenceValue,
            stakeholder.riskValue
          );

          // Step 3: Save criticality matrix entry
          console.log(`[handleSave] Saving criticality matrix entry for stakeholder: ${stakeholder.name}`);
          
          const maxIncidence = stakeholder.incidenceValue.length > 0 ? Math.max(...stakeholder.incidenceValue) : 1;
          const maxRiskIndex = stakeholder.riskValue.length > 0 ? Math.min(...stakeholder.riskValue.map(r => r.charCodeAt(0))) : "C".charCodeAt(0);
          const maxRisk = String.fromCharCode(maxRiskIndex) as "A" | "B" | "C";

          await upsertCriticalityMutation.mutateAsync({
            id: stakeholder.dbId,  // Pass database ID if it exists
            processId: parseInt(processId),
            stakeholderId: stakeholderRecord.id,
            incidence: maxIncidence.toString() as "1" | "2" | "3",
            risk: maxRisk,
            criticality: criticityInfo.score,
            existingDefenses: stakeholder.existingDefenses || undefined,
            actionToTake: stakeholder.actionToTake || undefined,
            observations: stakeholder.observations || undefined,
            startDate: stakeholder.startDate || undefined,
            endDate: stakeholder.endDate || undefined,
            implementationStatus: stakeholder.completed === "Si",
          });

          console.log(`[handleSave] Successfully saved criticality entry for: ${stakeholder.name}`);
        } catch (error) {
          console.error(`[handleSave] Error saving stakeholder ${stakeholder.name}:`, error);
          throw error;
        }
      }
      
      // Also save to localStorage as backup
      console.log("Autosave - Data saved to database");
    } catch (error) {
      console.error("Autosave - Error saving data:", error);
      setSaveStatus('idle');
    } finally {
      setIsSaving(false);
    }
  };

  const addStakeholder = () => {
    const newStakeholder: StakeholderCriticality = {
      id: generateUniqueId(),
      name: "",
      internalExternal: "",
      clienteProveedor: "",
      needsSolicita: "",
      needsEntrega: "",
      incidenceCriteria: [],
      incidenceValue: [],
      riskCriteria: [],
      riskValue: [],
      criticityScore: 0,
      existingDefenses: "",
      actionToTake: "",
      observations: "",
      startDate: "",
      endDate: "",
      completed: "No",
    };
    const newData = { ...data };
    newData.stakeholders.push(newStakeholder);
    setData(newData);
    // Autosave se dispara automáticamente por el useEffect
  };

  const deleteStakeholder = (id: string) => {
    const newData = { ...data };
    newData.stakeholders = newData.stakeholders.filter((s) => s.id !== id);
    setData(newData);
    // Autosave se dispara automáticamente por el useEffect
  };

  const updateStakeholder = (id: string, field: string, value: any) => {
    const newData = { ...data };
    const stakeholder = newData.stakeholders.find(s => s.id === id);
    if (stakeholder) {
      (stakeholder as any)[field] = value;
      const criticityInfo = getCriticalityInfo(stakeholder.incidenceValue, stakeholder.riskValue);
      stakeholder.criticityScore = criticityInfo.score;
    }
    setData(newData);
    // AISLAMIENTO POR PROCESSID: Guardar con clave específica para este proceso
    const criticalityDataKey = `criticalityData_${processId}`;
    localStorage.setItem(criticalityDataKey, JSON.stringify(newData));
  };

  const toggleIncidenceValue = (id: string, value: number) => {
    const newData = {
      ...data,
      stakeholders: data.stakeholders.map(s => {
        if (s.id === id) {
          const index = s.incidenceValue.indexOf(value);
          const newIncidenceValue = index > -1
            ? s.incidenceValue.filter((_, i) => i !== index)
            : [...s.incidenceValue, value];
          newIncidenceValue.sort((a, b) => a - b);
          const criticityInfo = getCriticalityInfo(newIncidenceValue, s.riskValue);
          return {
            ...s,
            incidenceValue: newIncidenceValue,
            criticityScore: criticityInfo.score,
          };
        }
        return s;
      }),
    };
    setData(newData);
    // AISLAMIENTO POR PROCESSID: Guardar con clave específica para este proceso
    const criticalityDataKey = `criticalityData_${processId}`;
    localStorage.setItem(criticalityDataKey, JSON.stringify(newData));
  };

  const toggleRiskValue = (id: string, value: string) => {
    const newData = {
      ...data,
      stakeholders: data.stakeholders.map(s => {
        if (s.id === id) {
          const index = s.riskValue.indexOf(value);
          const newRiskValue = index > -1
            ? s.riskValue.filter((_, i) => i !== index)
            : [...s.riskValue, value];
          newRiskValue.sort();
          const criticityInfo = getCriticalityInfo(s.incidenceValue, newRiskValue);
          return {
            ...s,
            riskValue: newRiskValue,
            criticityScore: criticityInfo.score,
          };
        }
        return s;
      }),
    };
    setData(newData);
    // AISLAMIENTO POR PROCESSID: Guardar con clave específica para este proceso
    const criticalityDataKey = `criticalityData_${processId}`;
    localStorage.setItem(criticalityDataKey, JSON.stringify(newData));
  };

  const toggleIncidenceCriteria = (id: string, criteria: string) => {
    const newData = {
      ...data,
      stakeholders: data.stakeholders.map(s => {
        if (s.id === id) {
          const index = s.incidenceCriteria.indexOf(criteria);
          const newCriteria = index > -1
            ? s.incidenceCriteria.filter((_, i) => i !== index)
            : [...s.incidenceCriteria, criteria];
          return {
            ...s,
            incidenceCriteria: newCriteria,
          };
        }
        return s;
      }),
    };
    setData(newData);
    // AISLAMIENTO POR PROCESSID: Guardar con clave específica para este proceso
    const criticalityDataKey = `criticalityData_${processId}`;
    localStorage.setItem(criticalityDataKey, JSON.stringify(newData));
  };

  const toggleRiskCriteria = (id: string, criteria: string) => {
    const newData = {
      ...data,
      stakeholders: data.stakeholders.map(s => {
        if (s.id === id) {
          const index = s.riskCriteria.indexOf(criteria);
          const newCriteria = index > -1
            ? s.riskCriteria.filter((_, i) => i !== index)
            : [...s.riskCriteria, criteria];
          return {
            ...s,
            riskCriteria: newCriteria,
          };
        }
        return s;
      }),
    };
    setData(newData);
    // AISLAMIENTO POR PROCESSID: Guardar con clave específica para este proceso
    const criticalityDataKey = `criticalityData_${processId}`;
    localStorage.setItem(criticalityDataKey, JSON.stringify(newData));
  };

  const calculateCompletionPercentage = () => {
    if (data.stakeholders.length === 0) return 0;
    const completed = data.stakeholders.filter(s => s.completed === "Si").length;
    return Math.round((completed / data.stakeholders.length) * 100);
  };

  const exportToPDF = () => {
    try {
      // Crear tabla HTML para exportar
      let htmlContent = '<h1>GESTIÓN CON PARTES INTERESADAS</h1>';
      htmlContent += '<p>Fecha: ' + new Date().toLocaleDateString('es-ES') + '</p>';
      htmlContent += '<table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse;">';
      htmlContent += '<thead><tr style="background-color:#0066cc; color:white;">';
      htmlContent += '<th>Asociado</th><th>Incidencia</th><th>Riesgo</th><th>Criticidad</th><th>Acción</th><th>Fecha Fin</th>';
      htmlContent += '</tr></thead><tbody>';

      data.stakeholders.forEach(s => {
        const criticityInfo = getCriticalityInfo(s.incidenceValue, s.riskValue);
        htmlContent += '<tr>';
        htmlContent += '<td>' + (s.name || '') + '</td>';
        htmlContent += '<td>' + (s.incidenceCriteria.join(', ') || '') + '</td>';
        htmlContent += '<td>' + (s.riskCriteria.join(', ') || '') + '</td>';
        htmlContent += '<td>' + (criticityInfo.score || '') + '</td>';
        htmlContent += '<td>' + (s.actionToTake || '') + '</td>';
        htmlContent += '<td>' + (s.endDate || '') + '</td>';
        htmlContent += '</tr>';
      });

      htmlContent += '</tbody></table>';

      // Crear blob y descargar
      const element = document.createElement('a');
      const file = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      element.href = URL.createObjectURL(file);
      element.download = 'Criticidad_' + new Date().toISOString().split('T')[0] + '.html';
      document.body.appendChild(element);
      element.click();
      // Usar setTimeout para asegurar que el click se procese antes de remover
      setTimeout(() => {
        if (element.parentNode === document.body) {
          document.body.removeChild(element);
        }
        URL.revokeObjectURL(element.href);
      }, 100);
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  if (!processId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-slate-600">
            Por favor, selecciona un proceso desde el Mapa de Procesos
          </p>
          <Button
            className="w-full mt-4"
            onClick={() => setLocation("/process-map")}
          >
            Volver al Mapa de Procesos
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-white min-h-screen" translate="no">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">GESTIÓN CON PARTES INTERESADAS</h1>
          <p className="text-sm text-slate-600 mt-1">
            {saveStatus === 'saving' && '💾 Guardando cambios...'}
            {saveStatus === 'saved' && '✓ Cambios guardados'}
            {saveStatus === 'idle' && ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAIChat(!showAIChat)}
            className="flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            {showAIChat ? "Cerrar Asesor" : "Asesor IA"}
          </Button>
          <Button
            onClick={exportToPDF}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            Exportar HTML
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

      {/* AI Chat Panel */}
      {showAIChat && (
        <div className="fixed right-6 top-24 w-96 max-h-96 z-50">
          <AIChatPanel
            title="Asesor Partes Interesadas"
            placeholder="¿Qué quieres saber sobre criticidad?"
            onSendMessage={handleAIQuery}
            onClose={() => setShowAIChat(false)}
            maxHeight="h-96"
          />
        </div>
      )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proceso: {processName}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Fila superior: dos columnas */}
          <div className="mb-6 flex flex-wrap gap-4">
            {/* Columna izquierda: Nota interconexión + botón Cargar */}
            <div className="flex-1 min-w-[280px] p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col gap-3 justify-start">
              <p className="text-sm text-blue-900">
                <strong>Nota:</strong> Esta matriz está interconectada con el Mapa de Subprocesos. Puedes cargar automáticamente los asociados de negocio desde el Mapa de Subprocesos.
              </p>
              <Button
                onClick={loadStakeholdersFromSubprocessMap}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 w-fit"
                disabled={isLoadingSubprocessMap}
              >
                {isLoadingSubprocessMap ? "Cargando..." : "Cargar Partes Interesadas"}
              </Button>
            </div>

            {/* Columna derecha: Botones Excel + Nota */}
            <div className="flex-1 min-w-[280px] p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-2 justify-start">
              <input
                ref={excelInputRef}
                type="file"
                accept="*"
                style={{ display: 'none' }}
                onChange={handleExcelUpload}
              />
              <Button
                onClick={() => excelInputRef.current?.click()}
                disabled={excelUploadStatus === 'uploading'}
                className="bg-green-600 hover:bg-green-700 text-white gap-2 text-sm w-fit"
              >
                <Upload className="w-4 h-4" />
                {excelUploadStatus === 'uploading' ? 'Subiendo...' : 'Subir Matriz de criticidad de Asociados de negocio'}
              </Button>
              {excelUploadStatus === 'saved' && (
                <p className="text-xs text-green-600 font-medium">✓ Archivo guardado correctamente</p>
              )}
              {excelUploadStatus === 'error' && (
                <p className="text-xs text-red-600 font-medium">✗ Error al subir el archivo</p>
              )}
              <Button
                onClick={() => {
                  const url = excelMatrixData?.url;
                  if (url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = excelMatrixData?.fileName || 'matriz.xlsx';
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }
                }}
                variant="outline"
                className="gap-2 text-sm w-fit"
                disabled={!excelMatrixData?.url}
              >
                <Eye className="w-4 h-4" />
                Mostrar Matriz de Asociados de negocio
                {(excelMatrixData?.fileName || excelFileName) && (
                  <span className="text-xs text-slate-500 ml-1">({excelMatrixData?.fileName || excelFileName})</span>
                )}
              </Button>
              <p className="text-xs text-slate-500 italic">
                Para el área que aplica, la Matriz subida en Excel debe contener los criterios de criticidad de los Asociados de Negocio y detallar los mismos con su respectiva evaluación de criticidad.
              </p>
            </div>
          </div>


          <div className="mb-6 p-4 bg-slate-50 rounded-lg">
            <h3 className="font-bold mb-2">Porcentaje de Cumplimiento</h3>
            <div className="w-full bg-slate-200 rounded-full h-8 flex items-center justify-center">
              <div
                className="bg-blue-500 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold transition-all"
                style={{ width: `${calculateCompletionPercentage()}%` }}
              >
                {calculateCompletionPercentage()}%
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-2">{data.stakeholders.filter(s => s.completed === "Si").length} de {data.stakeholders.length} completados</p>
          </div>

          {/* Sección ASOCIADOS DE NEGOCIO eliminada según solicitud del usuario */}
          <div className="mb-8 overflow-x-auto" style={{display:'none'}}>
            <h3 className="text-lg font-bold text-blue-900 mb-4">ASOCIADOS DE NEGOCIO</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-green-500 text-white">
                  <th className="border border-slate-300 p-2 text-left">ASOCIADO</th>
                  <th className="border border-slate-300 p-2 text-left">INT/EXT</th>
                  <th className="border border-slate-300 p-2 text-left">CLIENTE/<br/>PROVEEDOR</th>
                  <th className="border border-slate-300 p-2 text-left">SOLICITA</th>
                  <th className="border border-slate-300 p-2 text-left">ENTREGA</th>
                  <th className="border border-slate-300 p-2 text-left">INCIDENCIA<br/>(Criterio)</th>
                  <th className="border border-slate-300 p-2 text-center">INCIDENCIA<br/>(Valor)</th>
                  <th className="border border-slate-300 p-2 text-left">RIESGO<br/>(Criterio)</th>
                  <th className="border border-slate-300 p-2 text-center">RIESGO<br/>(Valor)</th>
                  <th className="border border-slate-300 p-2 text-center">CRITICIDAD</th>
                  <th className="border border-slate-300 p-2 text-center">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {data.stakeholders.map((stakeholder) => {
                  const colorInfo = getCriticalityInfo(stakeholder.incidenceValue, stakeholder.riskValue);
                  return (
                    <tr key={stakeholder.id} className="hover:bg-slate-50">
                      <td className="border border-slate-300 p-2">
                        <Input
                          value={stakeholder.name}
                          onChange={(e) => updateStakeholder(stakeholder.id, "name", e.target.value)}
                          placeholder="Nombre"
                          className="text-xs"
                        />
                      </td>
                      <td className="border border-slate-300 p-2">
                        <select
                          value={stakeholder.internalExternal}
                          onChange={(e) => updateStakeholder(stakeholder.id, "internalExternal", e.target.value)}
                          className="w-full text-xs border rounded p-1"
                        >
                          <option value="">Seleccionar</option>
                          <option value="Interno">Interno</option>
                          <option value="Externo">Externo</option>
                        </select>
                      </td>
                      <td className="border border-slate-300 p-2">
                        <select
                          value={stakeholder.clienteProveedor || ""}
                          onChange={(e) => updateStakeholder(stakeholder.id, "clienteProveedor", e.target.value)}
                          className="w-full text-xs border rounded p-1"
                        >
                          <option value="">Seleccionar</option>
                          <option value="Cliente">Cliente</option>
                          <option value="Proveedor">Proveedor</option>
                        </select>
                      </td>
                      <td className="border border-slate-300 p-2">
                        <textarea
                          ref={(el) => {
                            if (el) {
                              setTimeout(() => autoExpandTextarea(el), 0);
                            }
                          }}
                          value={stakeholder.needsSolicita}
                          onChange={(e) => {
                            updateStakeholder(stakeholder.id, "needsSolicita", e.target.value);
                            autoExpandTextarea(e.target);
                          }}
                          onInput={(e) => autoExpandTextarea(e.currentTarget)}
                          placeholder="Solicita"
                          className="text-xs resize-none overflow-hidden w-full border border-slate-200 rounded p-1 font-sans"
                          style={{ minHeight: '64px', maxHeight: '300px' }}
                        />
                      </td>
                      <td className="border border-slate-300 p-2">
                        <textarea
                          ref={(el) => {
                            if (el) {
                              setTimeout(() => autoExpandTextarea(el), 0);
                            }
                          }}
                          value={stakeholder.needsEntrega}
                          onChange={(e) => {
                            updateStakeholder(stakeholder.id, "needsEntrega", e.target.value);
                            autoExpandTextarea(e.target);
                          }}
                          onInput={(e) => autoExpandTextarea(e.currentTarget)}
                          placeholder="Entrega"
                          className="text-xs resize-none overflow-hidden w-full border border-slate-200 rounded p-1 font-sans"
                          style={{ minHeight: '64px', maxHeight: '300px' }}
                        />
                      </td>
                      <td className="border border-slate-300 p-2">
                        <div className="space-y-1 min-h-16 flex flex-col justify-start">
                          {incidenceCriteriaOptions.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => toggleIncidenceCriteria(stakeholder.id, opt)}
                              className={`text-xs px-2 py-1 rounded text-left cursor-pointer transition ${
                                stakeholder.incidenceCriteria.includes(opt)
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {stakeholder.incidenceCriteria.includes(opt) && <span className="mr-1">✓</span>}
                              {opt}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="border border-slate-300 p-2">
                        <div className="space-y-1 min-h-16 flex flex-col justify-start">
                          {[1, 2, 3].map((val) => (
                            <button
                              key={val}
                              onClick={() => toggleIncidenceValue(stakeholder.id, val)}
                              className={`text-xs px-2 py-1 rounded cursor-pointer transition ${
                                stakeholder.incidenceValue.includes(val)
                                  ? 'bg-green-500 text-white'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {stakeholder.incidenceValue.includes(val) && <span className="mr-1">✓</span>}
                              {val}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="border border-slate-300 p-2">
                        <div className="space-y-1 min-h-16 flex flex-col justify-start">
                          {riskCriteriaOptions.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => toggleRiskCriteria(stakeholder.id, opt)}
                              className={`text-xs px-2 py-1 rounded text-left cursor-pointer transition ${
                                stakeholder.riskCriteria.includes(opt)
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {stakeholder.riskCriteria.includes(opt) && <span className="mr-1">✓</span>}
                              {opt}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="border border-slate-300 p-2">
                        <div className="space-y-1 min-h-16 flex flex-col justify-start">
                          {["C", "B", "A"].map((val) => (
                            <button
                              key={val}
                              onClick={() => toggleRiskValue(stakeholder.id, val)}
                              className={`text-xs px-2 py-1 rounded cursor-pointer transition ${
                                stakeholder.riskValue.includes(val)
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {stakeholder.riskValue.includes(val) && <span className="mr-1">✓</span>}
                              {val}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="border border-slate-300 p-2 text-center">
                        <div
                          className={`${colorInfo.color} text-white px-2 py-1 rounded text-center font-bold min-h-16 flex items-center justify-center`}
                        >
                          {stakeholder.criticityScore}
                        </div>
                      </td>
                      <td className="border border-slate-300 p-2 text-center">
                        <button
                          onClick={() => deleteStakeholder(stakeholder.id)}
                          className="text-red-600 hover:text-red-800 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mb-8 overflow-x-auto">
            <h3 className="text-lg font-bold text-blue-900 mb-4">MEJORA CONTINUA ENTRE PARTES INTERESADAS</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-green-500 text-white">
                  <th className="border border-slate-300 p-2 text-left">ASOCIADO</th>
                  <th className="border border-slate-300 p-2 text-left">NECESIDADES Y EXPECTATIVAS</th>
                  <th className="border border-slate-300 p-2 text-left">ACCIÓN A TOMAR</th>
                  <th className="border border-slate-300 p-2 text-left">OBSERVACIONES</th>
                  <th className="border border-slate-300 p-2 text-left">FECHA INICIO</th>
                  <th className="border border-slate-300 p-2 text-left">FECHA FIN</th>
                  <th className="border border-slate-300 p-2 text-left">REALIZADO</th>
                </tr>
              </thead>
              <tbody>
                {data.stakeholders.map((stakeholder) => (
                  <tr key={`actions-${stakeholder.id}`} className="hover:bg-slate-50">
                    <td className="border border-slate-300 p-2">{stakeholder.name}</td>
                    <td className="border border-slate-300 p-2">
                      <Textarea
                        value={stakeholder.existingDefenses}
                        onChange={(e) => updateStakeholder(stakeholder.id, "existingDefenses", e.target.value)}
                        placeholder="Necesidades y Expectativas"
                        className="text-xs min-h-12 resize-none"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Textarea
                        value={stakeholder.actionToTake}
                        onChange={(e) => updateStakeholder(stakeholder.id, "actionToTake", e.target.value)}
                        placeholder="Acción"
                        className="text-xs min-h-12 resize-none"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Textarea
                        value={stakeholder.observations}
                        onChange={(e) => updateStakeholder(stakeholder.id, "observations", e.target.value)}
                        placeholder="Observaciones"
                        className="text-xs min-h-12 resize-none"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Input
                        type="date"
                        value={stakeholder.startDate}
                        onChange={(e) => updateStakeholder(stakeholder.id, "startDate", e.target.value)}
                        className="text-xs"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Input
                        type="date"
                        value={stakeholder.endDate}
                        onChange={(e) => updateStakeholder(stakeholder.id, "endDate", e.target.value)}
                        className="text-xs"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <select
                        value={stakeholder.completed}
                        onChange={(e) => updateStakeholder(stakeholder.id, "completed", e.target.value)}
                        className="w-full text-xs border rounded p-1"
                      >
                        <option value="No">No</option>
                        <option value="Si">Si</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={addStakeholder}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              + Agregar Asociado
            </Button>
            <Button
              variant="outline"
              className="gap-2"
            >
              📥 Exportar a PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
