import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, ChevronDown, Download } from 'lucide-react';
import { toast } from "sonner";
import { exportTacticalObjectivesToPDF } from "@/lib/exportTacticalObjectivesToPDF";
import { trpc } from "@/lib/trpc";
import { getProcessIdFromSession, getSessionScope } from "@/lib/sessionScope";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Tipos de seguimiento disponibles ────────────────────────────────────────
// 'puntual'            → un valor directo; % = (condicionActual - ci) / (meta - ci) * 100
// 'mensual_sumatoria'  → 12 celdas mensuales; condicionActual = suma de valores; % = (suma - ci) / (meta - ci) * 100
// 'mensual_promedio'   → 12 celdas mensuales; condicionActual = promedio de valores ingresados
// 'mensual_checklist'  → 12 celdas con ✓/vacío; condicionActual = meses cumplidos; % = cumplidos/12*100
type TrackingType = 'puntual' | 'mensual_sumatoria' | 'mensual_promedio' | 'mensual_checklist';

interface Task {
  id: string;
  description: string;
  responsible: string;
  date: string;
  percentageCompleted: number;
  weighting: number;
  taskType?: 'puntual' | 'mensual';
  monthlyProgress?: boolean[];
}

interface ResultKey {
  id: string;
  description: string;
  responsible: string;
  startDate: string;
  endDate: string;
  implementationDate: string;
  observation: string;
  tasks: Task[];
  number?: number;
  ponderacion?: number;
  condicionInicial?: number;
  meta?: number;
  condicionActual?: number;
  porcentajeAlcanzado?: number;
  ooTrackingType?: TrackingType;
  ooMonthlyValues?: number[];      // 12 valores numéricos (mensual_sumatoria / mensual_promedio)
  ooChecklistValues?: boolean[];   // 12 booleanos (mensual_checklist)
}

interface TacticalPlanning {
  id: string;
  objectiveId: number;
  objectiveName: string;
  objectiveEnunciation: string;
  objectiveExplanation: string;
  objectiveResponsible: string;
  category: string;
  goal: string | number;
  resultKeys: ResultKey[];
  expanded: boolean;
  ponderacion?: number;
  puntoPartida?: number;
  metaLlegada?: number;
  unidadMedida?: string;
  avanceMeta?: number;
  porcentajeMetaAlcanzado?: number;
  trackingType?: TrackingType;
  monthlyValues?: number[];
  checklistValues?: boolean[];
}

const CATEGORIES = ['Finanzas', 'Cliente', 'Procesos Internos', 'Aprendizaje', 'Crecimiento'];
const MONTHS = ['Ene','Feb','Mar','Abr','Mayo','Jun','Jul','Agos','Sep','Oct','Nov','Dic'];

/**
 * Input numérico sin estado local — usa ref para el DOM.
 * Actualiza el padre en onChange (tiempo real) y en onBlur (normalización).
 */
function NumericInput({ value, onChange, className, placeholder }: {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocused = useRef(false);

  // Sincronizar el valor del DOM cuando cambia externamente (solo si no está en foco)
  useEffect(() => {
    if (inputRef.current && !isFocused.current) {
      inputRef.current.value = String(value);
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="number"
      step="0.01"
      defaultValue={value}
      placeholder={placeholder}
      className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`}
      onFocus={() => { isFocused.current = true; }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== '' && raw !== '-' && !raw.endsWith('.')) {
          const parsed = parseFloat(raw);
          if (!isNaN(parsed)) onChange(parsed);
        }
      }}
      onBlur={() => {
        isFocused.current = false;
        const raw = inputRef.current?.value || '';
        const parsed = parseFloat(raw);
        const num = isNaN(parsed) ? 0 : parsed;
        if (inputRef.current) inputRef.current.value = String(num);
        onChange(num);
      }}
    />
  );
}

const AutoExpandingTextarea = ({ value, onChange, placeholder, className = "" }: any) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.max(40, textareaRef.current.scrollHeight) + 'px';
    }
  }, [value]);
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none overflow-hidden ${className}`}
    />
  );
};

// ─── Helpers de cálculo ───────────────────────────────────────────────────────

/** Calcula el % alcanzado dado condición inicial, meta y condición actual */
function calcPct(ci: number, meta: number, ca: number): number {
  if (meta === ci) return 0;
  const p = ((ca - ci) / (meta - ci)) * 100;
  return Math.max(-100, Math.min(100, p));
}

/** Dado un ResultKey, devuelve { condicionActual, porcentajeAlcanzado } según su tipo de seguimiento */
function calcOOMetrics(rk: ResultKey): { condicionActual: number; porcentajeAlcanzado: number } {
  const ci = rk.condicionInicial || 0;
  const meta = rk.meta || 0;
  const type = rk.ooTrackingType || 'puntual';

  if (type === 'puntual') {
    const ca = rk.condicionActual || 0;
    return { condicionActual: ca, porcentajeAlcanzado: calcPct(ci, meta, ca) };
  }

  if (type === 'mensual_sumatoria') {
    const vals = rk.ooMonthlyValues || Array(12).fill(0);
    const suma = vals.reduce((s, v) => s + (v || 0), 0);
    return { condicionActual: suma, porcentajeAlcanzado: calcPct(ci, meta, suma) };
  }

  if (type === 'mensual_promedio') {
    const vals = rk.ooMonthlyValues || Array(12).fill(0);
    const nonZero = vals.filter(v => v !== 0);
    const promedio = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
    return { condicionActual: promedio, porcentajeAlcanzado: calcPct(ci, meta, promedio) };
  }

  if (type === 'mensual_checklist') {
    const vals = rk.ooChecklistValues || Array(12).fill(false);
    const cumplidos = vals.filter(Boolean).length;
    const pct = Math.round((cumplidos / 12) * 100);
    return { condicionActual: cumplidos, porcentajeAlcanzado: pct };
  }

  return { condicionActual: rk.condicionActual || 0, porcentajeAlcanzado: rk.porcentajeAlcanzado || 0 };
}

/** Dado un TacticalPlanning, devuelve { avanceMeta, porcentajeMetaAlcanzado } según su tipo de seguimiento */
function calcOTMetrics(p: TacticalPlanning): { avanceMeta: number; porcentajeMetaAlcanzado: number } {
  const pp = p.puntoPartida || 0;
  const meta = p.metaLlegada || 0;
  const type = p.trackingType || 'puntual';

  if (type === 'puntual') {
    const am = p.avanceMeta || 0;
    return { avanceMeta: am, porcentajeMetaAlcanzado: calcPct(pp, meta, am) };
  }

  if (type === 'mensual_sumatoria') {
    const vals = p.monthlyValues || Array(12).fill(0);
    const suma = vals.reduce((s, v) => s + (v || 0), 0);
    return { avanceMeta: suma, porcentajeMetaAlcanzado: calcPct(pp, meta, suma) };
  }

  if (type === 'mensual_promedio') {
    const vals = p.monthlyValues || Array(12).fill(0);
    const nonZero = vals.filter(v => v !== 0);
    const promedio = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
    return { avanceMeta: promedio, porcentajeMetaAlcanzado: calcPct(pp, meta, promedio) };
  }

  if (type === 'mensual_checklist') {
    const vals = p.checklistValues || Array(12).fill(false);
    const cumplidos = vals.filter(Boolean).length;
    const pct = Math.round((cumplidos / 12) * 100);
    return { avanceMeta: cumplidos, porcentajeMetaAlcanzado: pct };
  }

  return { avanceMeta: p.avanceMeta || 0, porcentajeMetaAlcanzado: p.porcentajeMetaAlcanzado || 0 };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TacticalPlanning() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [processId, setProcessId] = useState<number | null>(null);
  const [plannings, setPlannings] = useState<TacticalPlanning[]>([]);
  const [saving, setSaving] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const planningsRef = useRef<TacticalPlanning[]>([]);
  const processIdRef = useRef<number | null>(null);
  const pendingSaveRef = useRef(false); // indica si hay cambios pendientes de guardar
  const initialLoadDoneRef = useRef(false); // indica si la carga inicial ya terminó

  const savePlanningMutation = trpc.processTacticalObjectives.savePlanning.useMutation({
    onError: (error: any) => {
      console.error('Error saving to database:', error);
      toast.error(error.message || "Error al guardar la planificación");
    },
  });

  const { data: tacticalObjectivesData } = trpc.processTacticalObjectives.list.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );

  const { data: planningDataFromDB } = trpc.processTacticalObjectives.loadPlanningData.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null, staleTime: 0, gcTime: 0 }
  );

  useEffect(() => {
    const pid = getProcessIdFromSession();
    if (pid) setProcessId(pid);
  }, []);

  useEffect(() => {
    if (!tacticalObjectivesData || tacticalObjectivesData.length === 0) return;
    if (planningDataFromDB === undefined) return;

    // Si ya cargamos, no sobrescribir el estado local con refetches en background
    // (evita que el refetch deshaga los cambios del usuario mientras edita)
    if (hasLoadedRef.current) return;

    hasLoadedRef.current = true;

    if (planningDataFromDB && planningDataFromDB.length > 0) {
      setPlannings(planningDataFromDB);
    } else {
      const newPlannings: TacticalPlanning[] = tacticalObjectivesData.map((obj: any) => {
        const ponderacion = typeof obj.ponderacion === 'string' ? parseFloat(obj.ponderacion) : (obj.ponderacion || 0);
        const puntoPartida = typeof obj.puntoPartida === 'string' ? parseFloat(obj.puntoPartida) : (obj.puntoPartida || 0);
        const metaLlegada = typeof obj.metaLlegada === 'string' ? parseFloat(obj.metaLlegada) : (obj.metaLlegada || 0);
        const avanceMeta = typeof obj.avanceMeta === 'string' ? parseFloat(obj.avanceMeta) : (obj.avanceMeta || 0);
        let porcentajeMetaAlcanzado = 0;
        if (metaLlegada !== puntoPartida) {
          porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
          porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
        }
        return {
          id: `planning_${obj.id}`,
          objectiveId: obj.id,
          objectiveName: obj.name || '',
          objectiveEnunciation: obj.name || '',
          objectiveExplanation: obj.description || '',
          objectiveResponsible: obj.responsible || '',
          category: '',
          goal: '',
          resultKeys: [],
          expanded: false,
          ponderacion,
          puntoPartida,
          metaLlegada,
          unidadMedida: obj.unidadMedida || '',
          avanceMeta,
          porcentajeMetaAlcanzado,
        };
      });
      setPlannings(newPlannings);
    }
    // Marcar que la carga inicial terminó (en el siguiente tick para que el useEffect de plannings se ejecute primero)
    setTimeout(() => { initialLoadDoneRef.current = true; pendingSaveRef.current = false; }, 50);
  }, [tacticalObjectivesData, planningDataFromDB]);

  useEffect(() => {
    planningsRef.current = plannings;
    // Solo marcar como pendiente si la carga inicial ya terminó (cambios del usuario, no carga inicial)
    if (plannings.length > 0 && initialLoadDoneRef.current) pendingSaveRef.current = true;
  }, [plannings]);

  useEffect(() => {
    processIdRef.current = processId;
  }, [processId]);

  // Auto-save con debounce
  useEffect(() => {
    if (plannings.length === 0 || !processId) return;
    // No guardar durante la carga inicial (evita guardado innecesario al montar el componente)
    if (!initialLoadDoneRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    // Capturar el estado actual en el closure para que el timeout use siempre los datos más recientes
    const currentPlannings = plannings;
    const currentProcessId = processId;
    saveTimeoutRef.current = setTimeout(async () => {
      pendingSaveRef.current = false;
      if (savingRef.current || !currentProcessId) return;
      if (currentPlannings.length === 0) return;
      try {
        // Recalcular avanceMeta antes de guardar para asegurar que sea correcto
        const planningsToSave = currentPlannings.map(p => {
          const metrics = calcOTMetrics(p);
          return { ...p, avanceMeta: metrics.avanceMeta, porcentajeMetaAlcanzado: metrics.porcentajeMetaAlcanzado };
        });
        localStorage.setItem(`tactical_planning_${currentProcessId}`, JSON.stringify(planningsToSave));
        savingRef.current = true;
        setSaving(true);
        const savePromises = planningsToSave.map(planning =>
          savePlanningMutation.mutateAsync({
            objectiveId: planning.objectiveId,
            category: planning.category,
            goal: typeof planning.goal === 'string' ? planning.goal : String(planning.goal || ''),
            resultKeys: planning.resultKeys,
            ponderacion: planning.ponderacion || 0,
            puntoPartida: planning.puntoPartida || 0,
            metaLlegada: planning.metaLlegada || 0,
            unidadMedida: planning.unidadMedida || '',
            avanceMeta: planning.avanceMeta || 0,
            trackingType: (planning.trackingType || 'puntual') as any,
            monthlyValues: Array(12).fill(0).map((_, i) => Number((planning.monthlyValues || [])[i] || 0)),
            checklistValues: Array(12).fill(false).map((_, i) => Boolean((planning.checklistValues || [])[i] || false)),
          })
        );
        const results = await Promise.allSettled(savePromises);
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
          toast.error(`Error al guardar ${failures.length} objetivo(s)`);
        } else {
          setLastSaveTime(new Date().toLocaleTimeString());
        }
      } catch (error) {
        toast.error("Error al guardar la planificación");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }, 800);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [plannings, processId]);

  // Guardar al desmontar el componente si hay cambios pendientes
  useEffect(() => {
    return () => {
      if (!pendingSaveRef.current) return;
      const currentPlannings = planningsRef.current;
      const currentProcessId = processIdRef.current;
      if (!currentProcessId || currentPlannings.length === 0) return;
      // Cancelar el timeout pendiente
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      // Guardar en localStorage de forma síncrona (fetch async no garantizado al desmontar)
      try {
        const planningsToSave = currentPlannings.map(p => {
          const metrics = calcOTMetrics(p);
          return { ...p, avanceMeta: metrics.avanceMeta, porcentajeMetaAlcanzado: metrics.porcentajeMetaAlcanzado };
        });
        localStorage.setItem(`tactical_planning_${currentProcessId}`, JSON.stringify(planningsToSave));
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // ─── Mutaciones de estado ───────────────────────────────────────────────────

  const updatePlanning = (id: string, field: string, value: any) => {
    setPlannings(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated: TacticalPlanning = { ...p, [field]: value };
      // Recalcular métricas del OT cuando cambia cualquier campo relevante
      const recalcFields = ['avanceMeta','puntoPartida','metaLlegada','trackingType','monthlyValues','checklistValues'];
      if (recalcFields.includes(field)) {
        const metrics = calcOTMetrics(updated);
        updated.avanceMeta = metrics.avanceMeta;
        updated.porcentajeMetaAlcanzado = metrics.porcentajeMetaAlcanzado;
      }
      return updated;
    }));
  };

  const toggleExpanded = (id: string) => {
    setPlannings(prev => prev.map(p => p.id === id ? { ...p, expanded: !p.expanded } : p));
  };

  const addResultKey = (planningId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id !== planningId) return p;
      const newRK: ResultKey = {
        id: Date.now().toString(),
        description: '', responsible: '', startDate: '', endDate: '',
        implementationDate: '', observation: '', tasks: [],
      };
      return { ...p, resultKeys: [...p.resultKeys, newRK] };
    }));
  };

  const updateResultKey = (planningId: string, resultKeyId: string, field: string, value: any) => {
    setPlannings(prev => prev.map(p => {
      if (p.id !== planningId) return p;
      return {
        ...p,
        resultKeys: p.resultKeys.map(rk => {
          if (rk.id !== resultKeyId) return rk;
          const updated: ResultKey = { ...rk, [field]: value };
          // Recalcular métricas del OO cuando cambia cualquier campo relevante
          const recalcFields = ['condicionActual','condicionInicial','meta','ooTrackingType','ooMonthlyValues','ooChecklistValues'];
          if (recalcFields.includes(field)) {
            const metrics = calcOOMetrics(updated);
            updated.condicionActual = metrics.condicionActual;
            updated.porcentajeAlcanzado = metrics.porcentajeAlcanzado;
          }
          return updated;
        }),
      };
    }));
  };

  const deleteResultKey = (planningId: string, resultKeyId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id !== planningId) return p;
      return { ...p, resultKeys: p.resultKeys.filter(rk => rk.id !== resultKeyId) };
    }));
  };

  const addTask = (planningId: string, resultKeyId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id !== planningId) return p;
      return {
        ...p,
        resultKeys: p.resultKeys.map(rk => {
          if (rk.id !== resultKeyId) return rk;
          const newTask: Task = {
            id: Date.now().toString(),
            description: '', responsible: '', date: '',
            percentageCompleted: 0, weighting: 0, taskType: 'puntual',
          };
          return { ...rk, tasks: [...rk.tasks, newTask] };
        }),
      };
    }));
  };

  const updateTask = (planningId: string, resultKeyId: string, taskId: string, field: string, value: any) => {
    setPlannings(prev => prev.map(p => {
      if (p.id !== planningId) return p;
      return {
        ...p,
        resultKeys: p.resultKeys.map(rk => {
          if (rk.id !== resultKeyId) return rk;
          return {
            ...rk,
            tasks: rk.tasks.map(t => {
              if (t.id !== taskId) return t;
              const updatedTask = { ...t, [field]: value };
              if (field === 'taskType' && value === 'mensual' && !t.monthlyProgress) {
                updatedTask.monthlyProgress = Array(12).fill(false);
                updatedTask.percentageCompleted = 0;
              }
              return updatedTask;
            }),
          };
        }),
      };
    }));
  };

  const deleteTask = (planningId: string, resultKeyId: string, taskId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id !== planningId) return p;
      return {
        ...p,
        resultKeys: p.resultKeys.map(rk => {
          if (rk.id !== resultKeyId) return rk;
          return { ...rk, tasks: rk.tasks.filter(t => t.id !== taskId) };
        }),
      };
    }));
  };

  // ─── Cálculos de avance ─────────────────────────────────────────────────────

  const calculateTasksAverage = (resultKey: ResultKey): number => {
    if (!resultKey.tasks || resultKey.tasks.length === 0) return 0;
    const totalWeightedCompletion = resultKey.tasks.reduce((sum, task) => sum + (task.percentageCompleted || 0) * (task.weighting || 0), 0);
    const totalWeighting = resultKey.tasks.reduce((sum, task) => sum + (task.weighting || 0), 0);
    if (totalWeighting === 0) {
      return resultKey.tasks.reduce((sum, task) => sum + (task.percentageCompleted || 0), 0) / resultKey.tasks.length;
    }
    return totalWeightedCompletion / totalWeighting;
  };

  const calculateOTTasksAverage = (planning: TacticalPlanning): number => {
    if (!planning.resultKeys || planning.resultKeys.length === 0) return 0;
    const totalWeightedAvance = planning.resultKeys.reduce((sum, rk) => sum + calculateTasksAverage(rk) * (rk.ponderacion || 0), 0);
    const totalPonderacion = planning.resultKeys.reduce((sum, rk) => sum + (rk.ponderacion || 0), 0);
    if (totalPonderacion === 0) {
      return planning.resultKeys.reduce((sum, rk) => sum + calculateTasksAverage(rk), 0) / planning.resultKeys.length;
    }
    return totalWeightedAvance / totalPonderacion;
  };

  const calculateObjectiveCompletion = (planning: TacticalPlanning) => {
    if (planning.resultKeys.length === 0) return 0;
    let totalWeightedCompletion = 0;
    let totalPonderacion = 0;
    planning.resultKeys.forEach(rk => {
      const ponderacion = rk.ponderacion || 0;
      // Recalcular en tiempo real para que el indicador siempre sea correcto
      const { porcentajeAlcanzado } = calcOOMetrics(rk);
      totalWeightedCompletion += (porcentajeAlcanzado * ponderacion) / 100;
      totalPonderacion += ponderacion;
    });
    if (totalPonderacion === 0) {
      let totalCompletion = 0, totalTasks = 0;
      planning.resultKeys.forEach(rk => rk.tasks.forEach(task => { totalCompletion += task.percentageCompleted; totalTasks++; }));
      return totalTasks > 0 ? Math.round(totalCompletion / totalTasks) : 0;
    }
    return Math.round(totalWeightedCompletion);
  };

  const calculateDaysRemaining = (endDate: string) => {
    if (!endDate) return 0;
    const daysMs = new Date(endDate).getTime() - new Date().getTime();
    return Math.ceil(daysMs / (1000 * 60 * 60 * 24));
  };

  const indicators = useMemo(() => {
    if (plannings.length === 0) return { metaAlcanzada: 0, alcanzadoPorOO: 0, alcanzadoPorTareas: 0, isEfficient: false };
    let totalMetaAlcanzada = 0, totalAlcanzadoPorOO = 0, totalAlcanzadoPorTareas = 0;
    plannings.forEach(planning => {
      const ponderacion = planning.ponderacion || 0;
      const { porcentajeMetaAlcanzado } = calcOTMetrics(planning);
      const avanceOO = calculateObjectiveCompletion(planning);
      const avanceTareas = calculateOTTasksAverage(planning);
      totalMetaAlcanzada += porcentajeMetaAlcanzado * (ponderacion / 100);
      totalAlcanzadoPorOO += avanceOO * (ponderacion / 100);
      totalAlcanzadoPorTareas += avanceTareas * (ponderacion / 100);
    });
    const metaAlcanzada = Math.round(totalMetaAlcanzada);
    const alcanzadoPorOO = Math.round(totalAlcanzadoPorOO);
    const alcanzadoPorTareas = Math.round(totalAlcanzadoPorTareas);
    return { metaAlcanzada, alcanzadoPorOO, alcanzadoPorTareas, isEfficient: alcanzadoPorOO < metaAlcanzada };
  }, [plannings]);

  const handleBack = async () => {
    // Forzar blur en el campo activo para que NumericInput actualice el estado padre
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
      // Esperar un tick para que el estado React se actualice
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    // Guardar antes de navegar si hay cambios pendientes
    // Usar planningsRef.current para obtener el estado más reciente (incluyendo el valor del blur)
    const latestPlannings = planningsRef.current;
    if (pendingSaveRef.current && latestPlannings.length > 0 && processId) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      pendingSaveRef.current = false;
      try {
        const planningsToSave = latestPlannings.map(p => {
          const metrics = calcOTMetrics(p);
          return { ...p, avanceMeta: metrics.avanceMeta, porcentajeMetaAlcanzado: metrics.porcentajeMetaAlcanzado };
        });
        localStorage.setItem(`tactical_planning_${processId}`, JSON.stringify(planningsToSave));
        await Promise.allSettled(planningsToSave.map(planning =>
          savePlanningMutation.mutateAsync({
            objectiveId: planning.objectiveId,
            category: planning.category,
            goal: typeof planning.goal === 'string' ? planning.goal : String(planning.goal || ''),
            resultKeys: planning.resultKeys,
            ponderacion: planning.ponderacion || 0,
            puntoPartida: planning.puntoPartida || 0,
            metaLlegada: planning.metaLlegada || 0,
            unidadMedida: planning.unidadMedida || '',
            avanceMeta: planning.avanceMeta || 0,
            trackingType: (planning.trackingType || 'puntual') as any,
            monthlyValues: Array(12).fill(0).map((_, i) => Number((planning.monthlyValues || [])[i] || 0)),
            checklistValues: Array(12).fill(false).map((_, i) => Boolean((planning.checklistValues || [])[i] || false)),
          })
        ));
        // Eliminar el caché de tRPC para que al remontar el componente se carguen los datos frescos desde la BD
        queryClient.removeQueries();
      } catch (e) {
        // ignore errors on exit
      }
    }
    setLocation('/process-tactical-objectives');
  };

  const handleSaveNow = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setManualSaving(true);
    const savePromise = (async () => {
      // Recalcular avanceMeta antes de guardar para asegurar que sea correcto
      const planningsToSave = plannings.map(p => {
        const metrics = calcOTMetrics(p);
        return { ...p, avanceMeta: metrics.avanceMeta, porcentajeMetaAlcanzado: metrics.porcentajeMetaAlcanzado };
      });
      localStorage.setItem(`tactical_planning_${processId}`, JSON.stringify(planningsToSave));
      const savePromises = planningsToSave.map(planning =>
        savePlanningMutation.mutateAsync({
          objectiveId: planning.objectiveId,
          category: planning.category,
          goal: typeof planning.goal === 'string' ? planning.goal : String(planning.goal || ''),
          resultKeys: planning.resultKeys,
          ponderacion: planning.ponderacion || 0,
          puntoPartida: planning.puntoPartida || 0,
          metaLlegada: planning.metaLlegada || 0,
          unidadMedida: planning.unidadMedida || '',
          avanceMeta: planning.avanceMeta || 0,
          trackingType: (planning.trackingType || 'puntual') as any,
          monthlyValues: Array(12).fill(0).map((_, i) => Number((planning.monthlyValues || [])[i] || 0)),
          checklistValues: Array(12).fill(false).map((_, i) => Boolean((planning.checklistValues || [])[i] || false)),
        }).catch(error => ({ success: false, error }))
      );
      const results = await Promise.allSettled(savePromises);
      const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any)?.success === false));
      setLastSaveTime(new Date().toLocaleTimeString());
      if (failures.length === 0) return '✓ Guardado exitosamente';
      throw new Error(`⚠ Se guardaron ${plannings.length - failures.length} de ${plannings.length} objetivos`);
    })();
    toast.promise(savePromise, { loading: 'Guardando planificación...', success: (msg) => msg as string, error: (err) => (err as any).message || '✗ Error al guardar' });
    try { await savePromise; } catch (error) { console.error('Error:', error); } finally { setManualSaving(false); savingRef.current = false; }
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderOTTrackingSection = (planning: TacticalPlanning) => {
    const type = planning.trackingType || 'puntual';

    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Seguimiento</label>
          <select
            value={type}
            onChange={(e) => {
              const newType = e.target.value as TrackingType;
              updatePlanning(planning.id, 'trackingType', newType);
              if ((newType === 'mensual_sumatoria' || newType === 'mensual_promedio') && !planning.monthlyValues) updatePlanning(planning.id, 'monthlyValues', Array(12).fill(0));
              if (newType === 'mensual_checklist' && !planning.checklistValues) updatePlanning(planning.id, 'checklistValues', Array(12).fill(false));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="puntual">Puntual (valor directo)</option>
            <option value="mensual_sumatoria">Mensual Sumatoria (12 meses)</option>
            <option value="mensual_promedio">Mensual Promedio (12 meses)</option>
            <option value="mensual_checklist">Mensual Check List</option>
          </select>
        </div>

        {type === 'puntual' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Avance de la Meta</label>
              <NumericInput value={planning.avanceMeta || 0}
                onChange={(val) => updatePlanning(planning.id, 'avanceMeta', val)}
                placeholder="Avance actual" className="border-gray-300" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">% Meta alcanzada</label>
              <p className="text-2xl font-bold text-blue-600">{calcOTMetrics(planning).porcentajeMetaAlcanzado.toFixed(0)}%</p>
            </div>
          </div>
        )}

        {type === 'mensual_sumatoria' && (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-2" translate="no">
              {MONTHS.map((mes, idx) => {
                const vals = planning.monthlyValues || Array(12).fill(0);
                return (
                  <div key={`otms_${idx}`} className="flex flex-col items-center gap-1">
                    <label className="text-xs font-semibold text-gray-600">{mes}</label>
                    <NumericInput value={vals[idx] || 0}
                      onChange={(val) => {
                        const newVals = [...(planning.monthlyValues || Array(12).fill(0))];
                        newVals[idx] = val;
                        updatePlanning(planning.id, 'monthlyValues', newVals);
                      }}
                      className="border-gray-300 text-xs px-1 py-1 text-center" />
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Total acumulado (Condición Actual)</label>
                <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
                  <span className="text-xl font-bold text-green-700">
                    {((planning.monthlyValues || Array(12).fill(0)).reduce((s: number, v: number) => s + (v || 0), 0)).toFixed(2)}{planning.unidadMedida ? ` ${planning.unidadMedida}` : ''}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">% Meta alcanzada</label>
                <p className="text-2xl font-bold text-blue-600">{calcOTMetrics(planning).porcentajeMetaAlcanzado.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        )}



        {type === 'mensual_promedio' && (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-2" translate="no">
              {MONTHS.map((mes, idx) => {
                const vals = planning.monthlyValues || Array(12).fill(0);
                return (
                  <div key={`otmp_${idx}`} className="flex flex-col items-center gap-1">
                    <label className="text-xs font-semibold text-gray-600">{mes}</label>
                    <NumericInput value={vals[idx] || 0}
                      onChange={(val) => {
                        const newVals = [...(planning.monthlyValues || Array(12).fill(0))];
                        newVals[idx] = val;
                        updatePlanning(planning.id, 'monthlyValues', newVals);
                      }}
                      className="border-gray-300 text-xs px-1 py-1 text-center" />
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Promedio (Condición Actual)</label>
                <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
                  <span className="text-xl font-bold text-green-700">
                    {(() => { const vals = planning.monthlyValues || Array(12).fill(0); const nz = vals.filter(v => v !== 0); return nz.length > 0 ? (nz.reduce((s, v) => s + v, 0) / nz.length).toFixed(2) : '0.00'; })()}{planning.unidadMedida ? ` ${planning.unidadMedida}` : ''}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">% Meta alcanzada</label>
                <p className="text-2xl font-bold text-blue-600">{calcOTMetrics(planning).porcentajeMetaAlcanzado.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        )}

        {type === 'mensual_checklist' && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap" translate="no">
              {MONTHS.map((mes, idx) => {
                const vals = planning.checklistValues || Array(12).fill(false);
                const checked = vals[idx];
                return (
                  <div key={`otcl_${idx}`} className="flex flex-col items-center gap-1">
                    <button type="button"
                      onClick={() => {
                        const newVals = [...(planning.checklistValues || Array(12).fill(false))];
                        newVals[idx] = !newVals[idx];
                        updatePlanning(planning.id, 'checklistValues', newVals);
                      }}
                      className={`w-9 h-9 rounded border-2 transition-all flex items-center justify-center text-sm font-bold cursor-pointer ${checked ? 'bg-green-500 border-green-600 text-white hover:bg-green-600' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`}
                    >{checked ? '✓' : ''}</button>
                    <span className="text-xs text-gray-600 font-semibold">{mes}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Meses cumplidos</label>
                <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
                  <span className="text-xl font-bold text-green-700">
                    {(planning.checklistValues || Array(12).fill(false)).filter(Boolean).length} / 12
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">% Meta alcanzada</label>
                <p className="text-2xl font-bold text-blue-600">{calcOTMetrics(planning).porcentajeMetaAlcanzado.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOOTrackingSection = (planning: TacticalPlanning, resultKey: ResultKey) => {
    const type = resultKey.ooTrackingType || 'puntual';

    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Seguimiento</label>
          <select
            value={type}
            onChange={(e) => {
              const newType = e.target.value as TrackingType;
              updateResultKey(planning.id, resultKey.id, 'ooTrackingType', newType);
              if ((newType === 'mensual_sumatoria' || newType === 'mensual_promedio') && !resultKey.ooMonthlyValues) updateResultKey(planning.id, resultKey.id, 'ooMonthlyValues', Array(12).fill(0));
              if (newType === 'mensual_checklist' && !resultKey.ooChecklistValues) updateResultKey(planning.id, resultKey.id, 'ooChecklistValues', Array(12).fill(false));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="puntual">Puntual (valor directo)</option>
            <option value="mensual_sumatoria">Mensual Sumatoria (12 meses)</option>
            <option value="mensual_promedio">Mensual Promedio (12 meses)</option>
            <option value="mensual_checklist">Mensual Check List</option>
          </select>
        </div>

        {type === 'puntual' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Condición Actual</label>
            <NumericInput value={resultKey.condicionActual || 0}
              onChange={(val) => updateResultKey(planning.id, resultKey.id, 'condicionActual', val)}
              placeholder="Condición actual" className="border-gray-300" />
          </div>
        )}

        {type === 'mensual_sumatoria' && (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-2" translate="no">
              {MONTHS.map((mes, idx) => {
                const vals = resultKey.ooMonthlyValues || Array(12).fill(0);
                return (
                  <div key={`ooms_${idx}`} className="flex flex-col items-center gap-1">
                    <label className="text-xs font-semibold text-gray-600">{mes}</label>
                    <NumericInput value={vals[idx] || 0}
                      onChange={(val) => {
                        const newVals = [...(resultKey.ooMonthlyValues || Array(12).fill(0))];
                        newVals[idx] = val;
                        updateResultKey(planning.id, resultKey.id, 'ooMonthlyValues', newVals);
                      }}
                      className="border-gray-300 text-xs px-1 py-1 text-center" />
                  </div>
                );
              })}
            </div>
            <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Total acumulado (Condición Actual)</label>
              <span className="text-xl font-bold text-green-700">{calcOOMetrics(resultKey).condicionActual.toFixed(2)}</span>
            </div>
          </div>
        )}

        {type === 'mensual_promedio' && (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-2" translate="no">
              {MONTHS.map((mes, idx) => {
                const vals = resultKey.ooMonthlyValues || Array(12).fill(0);
                return (
                  <div key={`oomp_${idx}`} className="flex flex-col items-center gap-1">
                    <label className="text-xs font-semibold text-gray-600">{mes}</label>
                    <NumericInput value={vals[idx] || 0}
                      onChange={(val) => {
                        const newVals = [...(resultKey.ooMonthlyValues || Array(12).fill(0))];
                        newVals[idx] = val;
                        updateResultKey(planning.id, resultKey.id, 'ooMonthlyValues', newVals);
                      }}
                      className="border-gray-300 text-xs px-1 py-1 text-center" />
                  </div>
                );
              })}
            </div>
            <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Promedio (Condición Actual)</label>
              <span className="text-xl font-bold text-green-700">{calcOOMetrics(resultKey).condicionActual.toFixed(2)}</span>
            </div>
          </div>
        )}

        {type === 'mensual_checklist' && (
          <div className="space-y-3">
            <div className="flex gap-1 flex-wrap" translate="no">
              {MONTHS.map((mes, idx) => {
                const vals = resultKey.ooChecklistValues || Array(12).fill(false);
                const checked = vals[idx];
                const isCurrentMonth = idx === new Date().getMonth();
                return (
                  <div key={`oocl_${idx}`} className="flex flex-col items-center gap-1">
                    <button type="button"
                      onClick={() => {
                        const newVals = [...(resultKey.ooChecklistValues || Array(12).fill(false))];
                        newVals[idx] = !newVals[idx];
                        updateResultKey(planning.id, resultKey.id, 'ooChecklistValues', newVals);
                      }}
                      className={`w-8 h-8 rounded border-2 transition-all flex items-center justify-center text-xs font-bold cursor-pointer ${checked ? 'bg-green-500 border-green-600 text-white hover:bg-green-600' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'} ${isCurrentMonth ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                    >{checked ? '✓' : ''}</button>
                    <span className="text-xs text-gray-600 font-semibold">{mes}</span>
                  </div>
                );
              })}
            </div>
            <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
              <span className="text-sm font-semibold text-gray-600">Meses cumplidos: </span>
              <span className="text-xl font-bold text-green-700">{calcOOMetrics(resultKey).condicionActual} / 12</span>
            </div>
          </div>
        )}

        {/* % Alcanzado — siempre visible y reactivo */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">% Alcanzado</label>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <span className="text-2xl font-bold text-blue-600">{calcOOMetrics(resultKey).porcentajeAlcanzado.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    );
  };

  // ─── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold text-green-900 mb-2">OTE - PLANIFICACIÓN DE OBJETIVOS TÁCTICOS ESTRATÉGICOS</h1>
            <p className="text-gray-600">Proceso: <span className="font-semibold">{getSessionScope().processName || ""}</span></p>
            <p className="text-sm text-green-600 mt-1">
              {saving ? "Guardando..." : "✓ Guardado automático"}
              {lastSaveTime && ` (Último: ${lastSaveTime})`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {plannings.length > 0 && (
              <Button onClick={() => { exportTacticalObjectivesToPDF(plannings, getSessionScope().processName || 'Proceso'); toast.success('PDF exportado correctamente'); }}
                className="bg-green-600 hover:bg-green-700 flex items-center gap-2">
                <Download size={20} /> Exportar a PDF
              </Button>
            )}
            <Button onClick={handleSaveNow} className="bg-green-600 hover:bg-green-700" disabled={manualSaving}>
              {manualSaving ? 'Guardando...' : 'Guardar Ahora'}
            </Button>
            <Button onClick={handleBack} variant="outline" className="flex items-center gap-2">
              <ArrowLeft size={20} /> VOLVER
            </Button>
          </div>
        </div>

        <Card className="mb-6 bg-gradient-to-r from-blue-50 to-green-50 border-2 border-green-600">
          <CardHeader>
            <CardTitle className="text-green-900">Indicador General de OTE</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-white rounded-lg border-2 border-blue-300">
                <p className="text-sm font-semibold text-gray-600 mb-2">% Meta alcanzada por Objetivos Tácticos</p>
                {plannings.length === 0 ? <p className="text-4xl font-bold text-gray-400">...</p> : <p className="text-4xl font-bold text-blue-600">{indicators.metaAlcanzada}%</p>}
              </div>
              <div className="text-center p-4 bg-white rounded-lg border-2 border-green-300">
                <p className="text-sm font-semibold text-gray-600 mb-2">Avance Objetivos Operativos</p>
                {plannings.length === 0 ? <p className="text-4xl font-bold text-gray-400">...</p> : <p className="text-4xl font-bold text-green-600">{indicators.alcanzadoPorOO}%</p>}
              </div>
              <div className="text-center p-4 bg-white rounded-lg border-2 border-purple-300">
                <p className="text-sm font-semibold text-gray-600 mb-2">Avance de Tareas</p>
                {plannings.length === 0 ? <p className="text-4xl font-bold text-gray-400">...</p> : <p className="text-4xl font-bold text-purple-600">{indicators.alcanzadoPorTareas}%</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {plannings.map((planning) => (
            <Card key={planning.id} className="border-l-4 border-l-green-600">
              <CardHeader className="cursor-pointer" onClick={() => toggleExpanded(planning.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <ChevronDown size={20} className={`transform transition-transform ${planning.expanded ? 'rotate-180' : ''}`} />
                    <div className="flex-1">
                      <CardTitle className="text-lg text-green-900">{planning.objectiveName}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">Ponderación: {planning.ponderacion || 0}%</p>
                    </div>
                  </div>
                  <div className="text-right space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-600">% Meta alcanzada</p>
                      <p className="text-2xl font-bold text-blue-600">{calcOTMetrics(planning).porcentajeMetaAlcanzado.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Avance Objetivos Operativos</p>
                      <p className="text-2xl font-bold text-green-600">{calculateObjectiveCompletion(planning)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Avance de Tareas</p>
                      <p className="text-2xl font-bold text-blue-600">{calculateOTTasksAverage(planning).toFixed(0)}%</p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {planning.expanded && (
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                    <select value={planning.category} onChange={(e) => updatePlanning(planning.id, 'category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
                      <option value="">Seleccionar categoría</option>
                      {CATEGORIES.map((cat, idx) => <option key={`cat_${idx}`} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Meta del Objetivo</label>
                    <Input type="text" value={planning.goal} onChange={(e) => updatePlanning(planning.id, 'goal', e.target.value)}
                      placeholder="Ingrese la meta del objetivo" className="border-gray-300" />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <h5 className="font-semibold text-blue-900">Datos del Objetivo Táctico</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Ponderación (%)</label>
                        <Input type="number" step="0.01" value={planning.ponderacion || 0} disabled className="border-gray-300 bg-gray-100" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Punto de Partida</label>
                        <Input type="number" step="0.01" value={planning.puntoPartida || 0} disabled className="border-gray-300 bg-gray-100" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Meta o Punto de Llegada</label>
                        <Input type="number" step="0.01" value={planning.metaLlegada || 0} disabled className="border-gray-300 bg-gray-100" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Unidad de Medida</label>
                        <Input type="text" value={planning.unidadMedida || ''} disabled className="border-gray-300 bg-gray-100" />
                      </div>
                    </div>
                    {renderOTTrackingSection(planning)}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-700">Objetivos Operativos</h4>
                    </div>

                    {planning.resultKeys.map((resultKey, rkIdx) => (
                      <Card key={`rk_${resultKey.id || rkIdx}`} className="bg-sky-100 border-sky-300">
                        <CardContent className="pt-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-700 bg-green-100 px-2 py-1 rounded">{rkIdx + 1}</span>
                              <label className="block text-sm font-semibold text-gray-700">Objetivo Operativo</label>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-gray-600">Avance de Tareas</p>
                              <p className="text-lg font-bold text-blue-600">{calculateTasksAverage(resultKey).toFixed(0)}%</p>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción</label>
                            <AutoExpandingTextarea value={resultKey.description}
                              onChange={(e: any) => updateResultKey(planning.id, resultKey.id, 'description', e.target.value)}
                              placeholder="Descripción del objetivo operativo" />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Ponderacion (%)</label>
                              <Input type="number" step="0.01" value={resultKey.ponderacion || 0}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'ponderacion', parseFloat(e.target.value) || 0)}
                                placeholder="Ponderacion" className="border-gray-300" />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Condicion Inicial</label>
                              <Input type="number" step="0.01" value={resultKey.condicionInicial || 0}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'condicionInicial', parseFloat(e.target.value) || 0)}
                                placeholder="Condicion inicial" className="border-gray-300" />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Meta</label>
                            <Input type="number" step="0.01" value={resultKey.meta || 0}
                              onChange={(e) => updateResultKey(planning.id, resultKey.id, 'meta', parseFloat(e.target.value) || 0)}
                              placeholder="Meta" className="border-gray-300" />
                          </div>

                          {renderOOTrackingSection(planning, resultKey)}

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Responsable</label>
                              <Input value={resultKey.responsible}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'responsible', e.target.value)}
                                placeholder="Responsable" className="border-gray-300" />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha de Inicio</label>
                              <Input type="date" value={resultKey.startDate}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'startDate', e.target.value)}
                                className="border-gray-300" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha de Fin</label>
                              <Input type="date" value={resultKey.endDate}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'endDate', e.target.value)}
                                className="border-gray-300" />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Días Restantes</label>
                              <p className={`text-lg font-bold ${calculateDaysRemaining(resultKey.endDate) < 0 ? 'text-red-600' : calculateDaysRemaining(resultKey.endDate) < 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {calculateDaysRemaining(resultKey.endDate)} días
                              </p>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Observación</label>
                            <AutoExpandingTextarea value={resultKey.observation}
                              onChange={(e: any) => updateResultKey(planning.id, resultKey.id, 'observation', e.target.value)}
                              placeholder="Observación" />
                          </div>

                          {/* Tareas */}
                          <div className="space-y-2">
                            <h5 className="font-semibold text-gray-700 text-sm">Tareas</h5>
                            {resultKey.tasks.map((task, taskIdx) => (
                              <Card key={`task_${task.id || taskIdx}`} className="bg-white border border-gray-200">
                                <CardContent className="pt-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-500 bg-blue-100 px-2 py-1 rounded">{taskIdx + 1}</span>
                                    <label className="text-sm font-semibold text-gray-700">Tarea</label>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción</label>
                                    <AutoExpandingTextarea value={task.description}
                                      onChange={(e: any) => updateTask(planning.id, resultKey.id, task.id, 'description', e.target.value)}
                                      placeholder="Descripción de la tarea" className="text-sm" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">Responsable</label>
                                      <Input value={task.responsible}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'responsible', e.target.value)}
                                        placeholder="Responsable" className="border-gray-300 text-sm" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha</label>
                                      <Input type="date" value={task.date}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'date', e.target.value)}
                                        className="border-gray-300 text-sm" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Seguimiento</label>
                                    <select value={task.taskType || 'puntual'}
                                      onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'taskType', e.target.value as 'puntual' | 'mensual')}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                                      <option value="puntual">Puntual (% directo)</option>
                                      <option value="mensual">Mensual (12 meses)</option>
                                    </select>
                                  </div>
                                  {(task.taskType || 'puntual') === 'puntual' ? (
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">% Completado</label>
                                      <Input type="number" min="0" max="100" value={task.percentageCompleted}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'percentageCompleted', parseInt(e.target.value))}
                                        className="border-gray-300 text-sm" />
                                    </div>
                                  ) : (
                                    <div className="space-y-2 w-full">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-700">
                                          % Completado: {task.monthlyProgress ? Math.round((task.monthlyProgress.filter(m => m).length / 12) * 100) : 0}% ({task.monthlyProgress?.filter(m => m).length || 0}/12 meses)
                                        </span>
                                      </div>
                                      <div className="flex gap-1 flex-wrap">
                                        {MONTHS.map((month, index) => {
                                          const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
                                          const currentMonth = new Date().getMonth();
                                          const progress = task.monthlyProgress || Array(12).fill(false);
                                          const isCompleted = progress[index];
                                          const isCurrentMonth = index === currentMonth;
                                          return (
                                            <div key={`month_${index}`} className="flex flex-col items-center gap-1">
                                              <button type="button"
                                                onClick={() => {
                                                  const newProgress = [...(task.monthlyProgress || Array(12).fill(false))];
                                                  newProgress[index] = !newProgress[index];
                                                  const completedMonths = newProgress.filter(m => m).length;
                                                  const newPercentage = Math.round((completedMonths / 12) * 100);
                                                  setPlannings(prev => prev.map(p => {
                                                    if (p.id !== planning.id) return p;
                                                    return {
                                                      ...p,
                                                      resultKeys: p.resultKeys.map(rk => {
                                                        if (rk.id !== resultKey.id) return rk;
                                                        return { ...rk, tasks: rk.tasks.map(t => t.id !== task.id ? t : { ...t, monthlyProgress: newProgress, percentageCompleted: newPercentage }) };
                                                      }),
                                                    };
                                                  }));
                                                }}
                                                title={monthNames[index]}
                                                className={`w-8 h-8 rounded border-2 transition-all flex items-center justify-center text-xs font-bold cursor-pointer ${isCompleted ? 'bg-green-500 border-green-600 text-white hover:bg-green-600' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'} ${isCurrentMonth ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                                              >{isCompleted ? '✓' : ''}</button>
                                              <span className="text-xs text-gray-600 font-semibold">{month}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-2">Haz clic en cada mes para marcar como completado. El mes actual está resaltado en azul.</div>
                                    </div>
                                  )}
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">Ponderación</label>
                                      <Input type="number" min="0" max="100" value={task.weighting}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'weighting', parseInt(e.target.value))}
                                        className="border-gray-300 text-sm" />
                                    </div>
                                    <div className="flex items-end">
                                      <Button onClick={() => deleteTask(planning.id, resultKey.id, task.id)}
                                        size="sm" variant="destructive" className="w-full flex items-center gap-1">
                                        <Trash2 size={14} /> Eliminar
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>

                          <Button onClick={() => addTask(planning.id, resultKey.id)} size="sm"
                            className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1 w-full justify-center">
                            <Plus size={16} /> Agregar Tarea
                          </Button>

                          <Button onClick={() => deleteResultKey(planning.id, resultKey.id)} size="sm"
                            variant="destructive" className="w-full flex items-center gap-1">
                            <Trash2 size={16} /> Eliminar Objetivo Operativo
                          </Button>
                        </CardContent>
                      </Card>
                    ))}

                    <Button onClick={() => addResultKey(planning.id)} size="sm"
                      className="bg-green-600 hover:bg-green-700 flex items-center gap-1 w-full justify-center">
                      <Plus size={16} /> Agregar Objetivo Operativo
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
