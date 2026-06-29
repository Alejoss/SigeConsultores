import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2, MessageCircle, Upload, Eye, ClipboardList, BarChart3, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { AIChatPanel } from "@/components/AIChatPanel";


// Componente de tooltip informativo al hacer clic
function InfoTooltip({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs font-medium text-slate-700 underline decoration-dotted cursor-help hover:text-blue-700 transition-colors"
      >
        {title}
      </button>
      {open && (
        <>
          {/* Overlay para cerrar al hacer clic fuera */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-50 w-72 bg-white border border-blue-200 rounded-lg shadow-xl p-3 text-xs text-slate-700 leading-relaxed">
            <div className="flex items-start justify-between mb-1">
              <span className="font-bold text-blue-800 text-sm">{title}</span>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 ml-2 flex-shrink-0"><X className="w-3 h-3" /></button>
            </div>
            {children}
          </div>
        </>
      )}
    </span>
  );
}

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
  actionSource: string;
  surveyId?: number | null;
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
  // Pestaña activa: 'acciones' | 'encuestas'
  const [activeTab, setActiveTab] = useState<'acciones' | 'encuestas'>('acciones');
  // Estado para nueva encuesta en formulario
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [editingSurveyId, setEditingSurveyId] = useState<number | null>(null);
  const [surveyForm, setSurveyForm] = useState({
    surveyName: '',
    segment: 'Clientes' as 'Clientes' | 'Proveedores Externos' | 'Proveedores Internos' | 'Mixto',
    surveyDate: '',
    sentCount: 0,
    respondedCount: 0,
    nps: '' as string,
    csat: '' as string,
    avgRating: '',
    topStrengths: '',
    topWeaknesses: '',
    mainFindings: '',
  });
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

  // Queries y mutations para encuestas
  const { data: surveysFromDb, refetch: refetchSurveys } = trpc.stakeholderSurveys.list.useQuery(
    { processId: processId ? parseInt(processId) : 0 },
    { enabled: !!processId }
  );
  const createSurveyMutation = trpc.stakeholderSurveys.create.useMutation();
  const updateSurveyMutation = trpc.stakeholderSurveys.update.useMutation();
  const deleteSurveyMutation = trpc.stakeholderSurveys.delete.useMutation();

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
        
        const actionSource = savedCriticality?.actionSource || "Iniciativa propia";
        const surveyId = savedCriticality?.surveyId || null;

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
          actionSource,
          surveyId,
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
            actionSource: stakeholder.actionSource || "Iniciativa propia",
            surveyId: stakeholder.surveyId || null,
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
      actionSource: "Iniciativa propia",
      surveyId: null,
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

          {/* Pestañas: Acciones de Mejora | Encuestas */}
          <div className="flex gap-1 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('acciones')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'acciones'
                  ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Acciones de Mejora
            </button>
            <button
              onClick={() => setActiveTab('encuestas')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'encuestas'
                  ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Encuestas
              {surveysFromDb && surveysFromDb.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{surveysFromDb.length}</span>
              )}
            </button>
          </div>

          {/* PESTAÑA: Acciones de Mejora */}
          {activeTab === 'acciones' && (
          <>
          <div className="mb-8 overflow-x-auto">
            <h3 className="text-lg font-bold text-blue-900 mb-4">MEJORA CONTINUA ENTRE PARTES INTERESADAS</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-green-500 text-white">
                  <th className="border border-slate-300 p-2 text-left">ASOCIADO</th>
                  <th className="border border-slate-300 p-2 text-left">NECESIDADES Y EXPECTATIVAS</th>
                  <th className="border border-slate-300 p-2 text-left">ACCIÓN A TOMAR</th>
                  <th className="border border-slate-300 p-2 text-left">FUENTE</th>
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
                      {stakeholder.needsSolicita || stakeholder.needsEntrega ? (
                        <div className="text-xs space-y-1">
                          {stakeholder.needsSolicita && (
                            <div>
                              <span className="font-semibold text-green-700">Solicita: </span>
                              <span className="text-slate-700">{stakeholder.needsSolicita}</span>
                            </div>
                          )}
                          {stakeholder.needsEntrega && (
                            <div>
                              <span className="font-semibold text-blue-700">Entrega: </span>
                              <span className="text-slate-700">{stakeholder.needsEntrega}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sin datos del Mapa de Subprocesos</span>
                      )}
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
                      <select
                        value={stakeholder.actionSource || 'Iniciativa propia'}
                        onChange={(e) => updateStakeholder(stakeholder.id, "actionSource", e.target.value)}
                        className="w-full text-xs border rounded p-1 min-w-[140px]"
                      >
                        <option value="Iniciativa propia">Iniciativa propia</option>
                        <option value="Conversación interna">Conversación interna</option>
                        <option value="Conversación entre áreas">Conversación entre áreas</option>
                        <option value="Conversación con cliente/proveedor">Conversación con cliente/proveedor</option>
                        <option value="Conversación con gerencia">Conversación con gerencia</option>
                        <option value="Encuesta">Encuesta</option>
                      </select>
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
          </>
          )}

          {/* PESTAÑA: Encuestas */}
          {activeTab === 'encuestas' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-blue-900">REGISTRO DE ENCUESTAS</h3>
              <Button
                onClick={() => { setShowSurveyForm(true); setEditingSurveyId(null); setSurveyForm({ surveyName: '', segment: 'Clientes', surveyDate: '', sentCount: 0, respondedCount: 0, nps: '', csat: '', avgRating: '', topStrengths: '', topWeaknesses: '', mainFindings: '' }); }}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Nueva Encuesta
              </Button>
            </div>

            {/* Formulario de encuesta */}
            {showSurveyForm && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-blue-900">{editingSurveyId ? 'Editar Encuesta' : 'Nueva Encuesta'}</h4>
                  <button onClick={() => setShowSurveyForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nombre / Tipo de Encuesta</label>
                    <Input value={surveyForm.surveyName} onChange={(e) => setSurveyForm(f => ({...f, surveyName: e.target.value}))} placeholder="Ej: Encuesta de Satisfacción Anual 2026" className="text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Segmento</label>
                    <select value={surveyForm.segment} onChange={(e) => setSurveyForm(f => ({...f, segment: e.target.value as any}))} className="w-full text-xs border rounded p-2">
                      <option value="Clientes">Clientes</option>
                      <option value="Proveedores Externos">Proveedores Externos</option>
                      <option value="Proveedores Internos">Proveedores Internos</option>
                      <option value="Mixto">Mixto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de Aplicación</label>
                    <Input type="date" value={surveyForm.surveyDate} onChange={(e) => setSurveyForm(f => ({...f, surveyDate: e.target.value}))} className="text-xs" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Enviadas</label>
                      <Input type="number" value={surveyForm.sentCount} onChange={(e) => setSurveyForm(f => ({...f, sentCount: parseInt(e.target.value) || 0}))} className="text-xs" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Respondidas</label>
                      <Input type="number" value={surveyForm.respondedCount} onChange={(e) => setSurveyForm(f => ({...f, respondedCount: parseInt(e.target.value) || 0}))} className="text-xs" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block mb-1">
                        <InfoTooltip title="NPS (-100 a 100)">
                          <p className="mb-1"><strong>Net Promoter Score</strong> — mide la lealtad y probabilidad de recomendación.</p>
                          <p className="mb-1">Pregunta: <em>"¿Qué tan probable es que nos recomiendes?"</em> (escala 0-10)</p>
                          <p className="mb-1"><strong>Fórmula:</strong> % Promotores (9-10) − % Detractores (0-6)</p>
                          <p className="text-slate-500">Resultado de −100 a +100. Por encima de 50 es excelente.</p>
                        </InfoTooltip>
                      </label>
                      <Input type="number" value={surveyForm.nps} onChange={(e) => setSurveyForm(f => ({...f, nps: e.target.value}))} placeholder="Ej: 45" className="text-xs" />
                    </div>
                    <div className="flex-1">
                      <label className="block mb-1">
                        <InfoTooltip title="CSAT (%)">
                          <p className="mb-1"><strong>Customer Satisfaction Score</strong> — mide la satisfacción inmediata con el servicio.</p>
                          <p className="mb-1">Pregunta: <em>"¿Qué tan satisfecho estuviste con...?"</em> (escala 1-5 o 1-10)</p>
                          <p className="mb-1"><strong>Fórmula:</strong> (Respuestas positivas ÷ Total) × 100</p>
                          <p className="text-slate-500">Se expresa en %. Un CSAT ≥ 80% es considerado bueno.</p>
                        </InfoTooltip>
                      </label>
                      <Input type="number" value={surveyForm.csat} onChange={(e) => setSurveyForm(f => ({...f, csat: e.target.value}))} placeholder="Ej: 85" className="text-xs" />
                    </div>
                    <div className="flex-1">
                      <label className="block mb-1">
                        <InfoTooltip title="Calificación">
                          <p className="mb-1"><strong>Promedio general</strong> de todas las respuestas numéricas de la encuesta.</p>
                          <p className="mb-1">Se expresa sobre 5 (ej: 4.2/5) o sobre 10 (ej: 8.4/10).</p>
                          <p className="text-slate-500">Es el indicador más directo de la percepción general del encuestado.</p>
                        </InfoTooltip>
                      </label>
                      <Input value={surveyForm.avgRating} onChange={(e) => setSurveyForm(f => ({...f, avgRating: e.target.value}))} placeholder="Ej: 4.2/5" className="text-xs" />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Top Fortalezas mencionadas</label>
                    <Textarea value={surveyForm.topStrengths} onChange={(e) => setSurveyForm(f => ({...f, topStrengths: e.target.value}))} placeholder="¿Qué destacaron positivamente los encuestados?" className="text-xs min-h-12 resize-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Top Debilidades / Quejas</label>
                    <Textarea value={surveyForm.topWeaknesses} onChange={(e) => setSurveyForm(f => ({...f, topWeaknesses: e.target.value}))} placeholder="¿Qué criticaron o señalaron como área de mejora?" className="text-xs min-h-12 resize-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Principales Hallazgos / Conclusiones</label>
                    <Textarea value={surveyForm.mainFindings} onChange={(e) => setSurveyForm(f => ({...f, mainFindings: e.target.value}))} placeholder="Resumen ejecutivo de los hallazgos de la encuesta" className="text-xs min-h-12 resize-none" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={async () => {
                      try {
                        const payload = {
                          processId: parseInt(processId),
                          surveyName: surveyForm.surveyName,
                          segment: surveyForm.segment,
                          surveyDate: surveyForm.surveyDate,
                          sentCount: surveyForm.sentCount,
                          respondedCount: surveyForm.respondedCount,
                          nps: surveyForm.nps !== '' ? parseInt(surveyForm.nps as string) : null,
                          csat: surveyForm.csat !== '' ? parseInt(surveyForm.csat as string) : null,
                          avgRating: surveyForm.avgRating,
                          topStrengths: surveyForm.topStrengths,
                          topWeaknesses: surveyForm.topWeaknesses,
                          mainFindings: surveyForm.mainFindings,
                        };
                        if (editingSurveyId) {
                          await updateSurveyMutation.mutateAsync({ id: editingSurveyId, ...payload });
                        } else {
                          await createSurveyMutation.mutateAsync(payload);
                        }
                        await refetchSurveys();
                        setShowSurveyForm(false);
                      } catch (err) {
                        console.error('Error saving survey:', err);
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  >
                    {editingSurveyId ? 'Actualizar' : 'Guardar Encuesta'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowSurveyForm(false)} className="text-sm">Cancelar</Button>
                </div>
              </div>
            )}

            {/* Lista de encuestas */}
            {(!surveysFromDb || surveysFromDb.length === 0) && !showSurveyForm && (
              <div className="text-center py-12 text-slate-400">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay encuestas registradas.</p>
                <p className="text-xs mt-1">Haz clic en "Nueva Encuesta" para registrar la primera.</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {(surveysFromDb || []).map((survey: any) => {
                const participationPct = survey.sentCount > 0 ? Math.round((survey.respondedCount / survey.sentCount) * 100) : 0;
                const segmentColor: Record<string, string> = {
                  'Clientes': 'bg-blue-100 text-blue-700',
                  'Proveedores Externos': 'bg-orange-100 text-orange-700',
                  'Proveedores Internos': 'bg-purple-100 text-purple-700',
                  'Mixto': 'bg-teal-100 text-teal-700',
                };
                return (
                  <div key={survey.id} className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-800 text-sm">{survey.surveyName || 'Encuesta sin nombre'}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${segmentColor[survey.segment] || 'bg-slate-100 text-slate-600'}`}>{survey.segment}</span>
                          {survey.surveyDate && <span className="text-xs text-slate-500">{new Date(survey.surveyDate).toLocaleDateString('es-ES')}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingSurveyId(survey.id);
                            setSurveyForm({
                              surveyName: survey.surveyName || '',
                              segment: survey.segment || 'Clientes',
                              surveyDate: survey.surveyDate || '',
                              sentCount: survey.sentCount || 0,
                              respondedCount: survey.respondedCount || 0,
                              nps: survey.nps !== null && survey.nps !== undefined ? String(survey.nps) : '',
                              csat: survey.csat !== null && survey.csat !== undefined ? String(survey.csat) : '',
                              avgRating: survey.avgRating || '',
                              topStrengths: survey.topStrengths || '',
                              topWeaknesses: survey.topWeaknesses || '',
                              mainFindings: survey.mainFindings || '',
                            });
                            setShowSurveyForm(true);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                        >Editar</button>
                        <button
                          onClick={async () => {
                            if (confirm('¿Eliminar esta encuesta?')) {
                              await deleteSurveyMutation.mutateAsync({ id: survey.id });
                              await refetchSurveys();
                            }
                          }}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                        >Eliminar</button>
                      </div>
                    </div>

                    {/* KPIs de la encuesta */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <div className="bg-slate-50 rounded p-2 text-center">
                        <p className="text-xs text-slate-500">Participación</p>
                        <p className="font-bold text-slate-800 text-sm">{participationPct}%</p>
                        <p className="text-xs text-slate-400">{survey.respondedCount}/{survey.sentCount}</p>
                      </div>
                      {survey.nps !== null && survey.nps !== undefined && (
                        <div className={`rounded p-2 text-center ${survey.nps >= 50 ? 'bg-green-50' : survey.nps >= 0 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                          <InfoTooltip title="NPS">
                            <p className="mb-1"><strong>Net Promoter Score</strong> — lealtad y recomendación.</p>
                            <p className="mb-1"><strong>Fórmula:</strong> % Promotores (9-10) − % Detractores (0-6)</p>
                            <p className="text-slate-500">Rango: −90 a +100. Sobre 50 es excelente.</p>
                          </InfoTooltip>
                          <p className={`font-bold text-sm ${survey.nps >= 50 ? 'text-green-700' : survey.nps >= 0 ? 'text-yellow-700' : 'text-red-700'}`}>{survey.nps}</p>
                        </div>
                      )}
                      {survey.csat !== null && survey.csat !== undefined && (
                        <div className={`rounded p-2 text-center ${survey.csat >= 80 ? 'bg-green-50' : survey.csat >= 60 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                          <InfoTooltip title="CSAT">
                            <p className="mb-1"><strong>Customer Satisfaction Score</strong> — satisfacción inmediata.</p>
                            <p className="mb-1"><strong>Fórmula:</strong> (Respuestas positivas ÷ Total) × 100</p>
                            <p className="text-slate-500">Se expresa en %. Un CSAT ≥ 80% es bueno.</p>
                          </InfoTooltip>
                          <p className={`font-bold text-sm ${survey.csat >= 80 ? 'text-green-700' : survey.csat >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>{survey.csat}%</p>
                        </div>
                      )}
                      {survey.avgRating && (
                        <div className="bg-slate-50 rounded p-2 text-center">
                          <p className="text-xs text-slate-500">Calificación</p>
                          <p className="font-bold text-slate-800 text-sm">{survey.avgRating}</p>
                        </div>
                      )}
                    </div>

                    {/* Hallazgos */}
                    {(survey.topStrengths || survey.topWeaknesses || survey.mainFindings) && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        {survey.topStrengths && (
                          <div className="bg-green-50 border border-green-100 rounded p-2">
                            <p className="font-medium text-green-700 mb-1">Fortalezas</p>
                            <p className="text-slate-600">{survey.topStrengths}</p>
                          </div>
                        )}
                        {survey.topWeaknesses && (
                          <div className="bg-red-50 border border-red-100 rounded p-2">
                            <p className="font-medium text-red-700 mb-1">Debilidades</p>
                            <p className="text-slate-600">{survey.topWeaknesses}</p>
                          </div>
                        )}
                        {survey.mainFindings && (
                          <div className="bg-blue-50 border border-blue-100 rounded p-2">
                            <p className="font-medium text-blue-700 mb-1">Hallazgos</p>
                            <p className="text-slate-600">{survey.mainFindings}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Botón crear acción desde encuesta */}
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setActiveTab('acciones');
                          // Preseleccionar la fuente como Encuesta en el primer stakeholder sin acción
                          const firstEmpty = data.stakeholders.find(s => !s.actionToTake);
                          if (firstEmpty) {
                            updateStakeholder(firstEmpty.id, 'actionSource', 'Encuesta');
                            updateStakeholder(firstEmpty.id, 'surveyId', survey.id);
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Crear acción de mejora desde esta encuesta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
