import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { toast } from "sonner";
import { exportTacticalObjectivesToPDF } from "@/lib/exportTacticalObjectivesToPDF";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";



interface Task {
  id: string;
  description: string;
  responsible: string;
  date: string;
  percentageCompleted: number;
  weighting: number;
  taskType?: 'puntual' | 'mensual'; // Type of task: direct % or monthly tracker
  monthlyProgress?: boolean[]; // Array of 12 booleans for each month (Jan-Dec)
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
  number?: number; // Número del Objetivo Operativo
  ponderacion?: number;
  condicionInicial?: number;
  meta?: number;
  condicionActual?: number;
  porcentajeAlcanzado?: number;
  ooTrackingType?: 'puntual' | 'mensual'; // Tipo de seguimiento del OO
  ooMonthlyValues?: number[]; // 12 valores numéricos mensuales para modo mensual
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
  trackingType?: 'puntual' | 'mensual'; // Tipo de seguimiento del OT
  monthlyValues?: number[]; // 12 valores numéricos mensuales para modo mensual
}

const CATEGORIES = ['Finanzas', 'Cliente', 'Procesos Internos', 'Aprendizaje', 'Crecimiento'];

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

export default function TacticalPlanning() {
  const [, setLocation] = useLocation();
  const [processId, setProcessId] = useState<number | null>(null);
  const [plannings, setPlannings] = useState<TacticalPlanning[]>([]);
  const [saving, setSaving] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const savePlanningMutation = trpc.processTacticalObjectives.savePlanning.useMutation({
    onError: (error: any) => {
      console.error('Error saving to database:', error);
    },
  });

  const { data: tacticalObjectivesData } = trpc.processTacticalObjectives.list.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );

  const { data: planningDataFromDB } = trpc.processTacticalObjectives.loadPlanningData.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );

  useEffect(() => {
    const stored = localStorage.getItem("selectedProcessId");
    if (stored) {
      setProcessId(parseInt(stored));
    }
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) return; // Only load once
    
    if (!tacticalObjectivesData || tacticalObjectivesData.length === 0) {
      console.log('[TacticalPlanning] No tactical objectives data');
      return;
    }
    
    // Esperar a que planningDataFromDB también haya respondido (puede ser [] si no hay datos)
    // undefined significa que el query aún no terminó; [] significa que terminó pero no hay datos
    if (planningDataFromDB === undefined) {
      console.log('[TacticalPlanning] Waiting for planningDataFromDB...');
      return;
    }

    console.log('[TacticalPlanning] Loaded tactical objectives:', tacticalObjectivesData);
    console.log('[TacticalPlanning] Planning data from DB:', planningDataFromDB);

    // Marcar como cargado para evitar re-ejecuciones del useEffect
    hasLoadedRef.current = true;

    // First try to load from database
    if (planningDataFromDB && planningDataFromDB.length > 0) {
      console.log('[TacticalPlanning] Using planning data from DB');
      setPlannings(planningDataFromDB);
    } else {
      console.log('[TacticalPlanning] Creating plannings from tactical objectives');
      // Fallback to creating empty plannings from tactical objectives
      const newPlannings: TacticalPlanning[] = tacticalObjectivesData.map((obj: any) => {
        const ponderacion = typeof obj.ponderacion === 'string' ? parseFloat(obj.ponderacion) : (obj.ponderacion || 0);
        const puntoPartida = typeof obj.puntoPartida === 'string' ? parseFloat(obj.puntoPartida) : (obj.puntoPartida || 0);
        const metaLlegada = typeof obj.metaLlegada === 'string' ? parseFloat(obj.metaLlegada) : (obj.metaLlegada || 0);
        const avanceMeta = typeof obj.avanceMeta === 'string' ? parseFloat(obj.avanceMeta) : (obj.avanceMeta || 0);
        
        // Calculate porcentajeMetaAlcanzado
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
      console.log('[TacticalPlanning] New plannings created:', newPlannings.map(p => ({
        id: p.id,
        ponderacion: p.ponderacion,
        puntoPartida: p.puntoPartida,
        metaLlegada: p.metaLlegada,
        unidadMedida: p.unidadMedida,
      })));
    }
  }, [tacticalObjectivesData, planningDataFromDB]);

  // Auto-save to localStorage every 500ms (faster feedback)
  useEffect(() => {
    if (plannings.length === 0) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (savingRef.current || !processId) return;
      
      try {
        // Save to localStorage
        localStorage.setItem(`tactical_planning_${processId}`, JSON.stringify(plannings));
        
        // Save to database
        savingRef.current = true;
        setSaving(true);
        
        const savePromises = plannings.map(planning => 
          savePlanningMutation.mutateAsync(
            {
              objectiveId: planning.objectiveId,
              category: planning.category,
              goal: typeof planning.goal === 'string' ? planning.goal : String(planning.goal || ''),
              resultKeys: planning.resultKeys,
              ponderacion: planning.ponderacion || 0,
              puntoPartida: planning.puntoPartida || 0,
              metaLlegada: planning.metaLlegada || 0,
              unidadMedida: planning.unidadMedida || '',
              avanceMeta: planning.avanceMeta || 0,
              trackingType: planning.trackingType || 'puntual',
              monthlyValues: planning.monthlyValues || [],
            }
          ).catch(error => ({ success: false, error }))
        );
        
        await Promise.allSettled(savePromises);
        setLastSaveTime(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Error in autosave:', error);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [plannings, processId, savePlanningMutation]);

  const updatePlanning = (id: string, field: string, value: any) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };
        if (field === 'avanceMeta' || field === 'puntoPartida' || field === 'metaLlegada') {
          const pp = field === 'puntoPartida' ? value : (p.puntoPartida || 0);
          const m = field === 'metaLlegada' ? value : (p.metaLlegada || 0);
          const am = field === 'avanceMeta' ? value : (p.avanceMeta || 0);
          if (m === pp) {
            updated.porcentajeMetaAlcanzado = 0;
          } else {
            const porcentaje = ((am - pp) / (m - pp)) * 100;
            updated.porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentaje));
          }
        }
        return updated;
      }
      return p;
    }));
  };

  const toggleExpanded = (id: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, expanded: !p.expanded };
      }
      return p;
    }));
  };

  const addResultKey = (planningId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === planningId) {
        const newResultKey: ResultKey = {
          id: Date.now().toString(),
          description: '',
          responsible: '',
          startDate: '',
          endDate: '',
          implementationDate: '',
          observation: '',
          tasks: [],
        };
        return { ...p, resultKeys: [...p.resultKeys, newResultKey] };
      }
      return p;
    }));
  };

  const calculatePorcentajeAlcanzado = (condicionInicial: number, meta: number, condicionActual: number): number => {
    if (meta === condicionInicial) return 0;
    const porcentaje = ((condicionActual - condicionInicial) / (meta - condicionInicial)) * 100;
    return Math.max(-100, Math.min(100, porcentaje));
  };

  // Calculate average task completion for a ResultKey (OO)
  const calculateTasksAverage = (resultKey: ResultKey): number => {
    if (!resultKey.tasks || resultKey.tasks.length === 0) return 0;
    
    // Calculate weighted average: sum(% completed × weighting) / sum(weighting)
    const totalWeightedCompletion = resultKey.tasks.reduce((sum, task) => {
      const percentage = task.percentageCompleted || 0;
      const weighting = task.weighting || 0;
      return sum + (percentage * weighting);
    }, 0);
    
    const totalWeighting = resultKey.tasks.reduce((sum, task) => sum + (task.weighting || 0), 0);
    
    // If total weighting is 0, return simple average as fallback
    if (totalWeighting === 0) {
      const totalCompletion = resultKey.tasks.reduce((sum, task) => sum + (task.percentageCompleted || 0), 0);
      return totalCompletion / resultKey.tasks.length;
    }
    
    return totalWeightedCompletion / totalWeighting;
  };

  // Calculate average task completion for all ResultKeys in a Planning (OT)
  // Uses weighted average: sum(Avance Tareas OO x Ponderacion OO) / sum(Ponderacion OO)
  const calculateOTTasksAverage = (planning: TacticalPlanning): number => {
    if (!planning.resultKeys || planning.resultKeys.length === 0) return 0;
    
    // Calculate weighted average: sum(avance x ponderacion) / sum(ponderacion)
    const totalWeightedAvance = planning.resultKeys.reduce((sum, rk) => {
      const avance = calculateTasksAverage(rk);
      const ponderacion = rk.ponderacion || 0;
      return sum + (avance * ponderacion);
    }, 0);
    
    const totalPonderacion = planning.resultKeys.reduce((sum, rk) => sum + (rk.ponderacion || 0), 0);
    
    // If total ponderacion is 0, return simple average as fallback
    if (totalPonderacion === 0) {
      const totalAverage = planning.resultKeys.reduce((sum, rk) => sum + calculateTasksAverage(rk), 0);
      return totalAverage / planning.resultKeys.length;
    }
    
    return totalWeightedAvance / totalPonderacion;
  };

  const updateResultKey = (planningId: string, resultKeyId: string, field: string, value: any) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === planningId) {
        return {
          ...p,
          resultKeys: p.resultKeys.map(rk => {
            if (rk.id === resultKeyId) {
              const updated = { ...rk, [field]: value };
              if (field === 'condicionActual' || field === 'condicionInicial' || field === 'meta') {
                const ci = field === 'condicionInicial' ? value : (rk.condicionInicial || 0);
                const m = field === 'meta' ? value : (rk.meta || 0);
                const ca = field === 'condicionActual' ? value : (rk.condicionActual || 0);
                updated.porcentajeAlcanzado = calculatePorcentajeAlcanzado(ci, m, ca);
              }
              return updated;
            }
            return rk;
          }),
        };
      }
      return p;
    }));
  };

  const deleteResultKey = (planningId: string, resultKeyId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === planningId) {
        return {
          ...p,
          resultKeys: p.resultKeys.filter(rk => rk.id !== resultKeyId),
        };
      }
      return p;
    }));
  };

  const addTask = (planningId: string, resultKeyId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === planningId) {
        return {
          ...p,
          resultKeys: p.resultKeys.map(rk => {
            if (rk.id === resultKeyId) {
              const newTask: Task = {
                id: Date.now().toString(),
                description: '',
                responsible: '',
                date: '',
                percentageCompleted: 0,
                weighting: 0,
              };
              return { ...rk, tasks: [...rk.tasks, newTask] };
            }
            return rk;
          }),
        };
      }
      return p;
    }));
  };

  const updateTask = (planningId: string, resultKeyId: string, taskId: string, field: string, value: any) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === planningId) {
        return {
          ...p,
          resultKeys: p.resultKeys.map(rk => {
            if (rk.id === resultKeyId) {
              return {
                ...rk,
                tasks: rk.tasks.map(t => {
                  if (t.id === taskId) {
                    const updatedTask = { ...t, [field]: value };
                    // Si se cambia a 'mensual', inicializar monthlyProgress
                    if (field === 'taskType' && value === 'mensual' && !t.monthlyProgress) {
                      updatedTask.monthlyProgress = Array(12).fill(false);
                      updatedTask.percentageCompleted = 0;
                    }
                    return updatedTask;
                  }
                  return t;
                }),
              };
            }
            return rk;
          }),
        };
      }
      return p;
    }));
  };

  const deleteTask = (planningId: string, resultKeyId: string, taskId: string) => {
    setPlannings(prev => prev.map(p => {
      if (p.id === planningId) {
        return {
          ...p,
          resultKeys: p.resultKeys.map(rk => {
            if (rk.id === resultKeyId) {
              return {
                ...rk,
                tasks: rk.tasks.filter(t => t.id !== taskId),
              };
            }
            return rk;
          }),
        };
      }
      return p;
    }));
  };

  const calculateObjectiveCompletion = (planning: TacticalPlanning) => {
    if (planning.resultKeys.length === 0) return 0;
    let totalWeightedCompletion = 0;
    let totalPonderacion = 0;
    planning.resultKeys.forEach(rk => {
      const ponderacion = rk.ponderacion || 0;
      const porcentajeAlcanzado = rk.porcentajeAlcanzado || 0;
      totalWeightedCompletion += (porcentajeAlcanzado * ponderacion) / 100;
      totalPonderacion += ponderacion;
    });
    if (totalPonderacion === 0) {
      let totalCompletion = 0;
      let totalTasks = 0;
      planning.resultKeys.forEach(rk => {
        rk.tasks.forEach(task => {
          totalCompletion += task.percentageCompleted;
          totalTasks += 1;
        });
      });
      return totalTasks > 0 ? Math.round(totalCompletion / totalTasks) : 0;
    }
    return Math.round(totalWeightedCompletion);
  };

  const calculateDaysRemaining = (endDate: string) => {
    if (!endDate) return 0;
    const end = new Date(endDate).getTime();
    const now = new Date().getTime();
    const daysMs = end - now;
    return Math.ceil(daysMs / (1000 * 60 * 60 * 24));
  };

  const indicators = useMemo(() => {
    if (plannings.length === 0) return { metaAlcanzada: 0, alcanzadoPorOO: 0, alcanzadoPorTareas: 0, isEfficient: false };
    
    // Calculate % Meta Alcanzada = (Meta de OT x Ponderacion OT) sumado para todos los OT
    // Calculate % Alcanzado por OO = (Avance de OT x Ponderacion OT) sumado para todos los OT
    // Calculate % Alcanzado por Tareas = (Avance de Tareas OT x Ponderacion OT) sumado para todos los OT
    let totalMetaAlcanzada = 0;
    let totalAlcanzadoPorOO = 0;
    let totalAlcanzadoPorTareas = 0;
    
    plannings.forEach(planning => {
      const ponderacion = planning.ponderacion || 0;
      // Usar el porcentajeMetaAlcanzado almacenado, o recalcularlo si es 0 y hay datos
      let porcentajeMetaAlcanzado = planning.porcentajeMetaAlcanzado ?? 0;
      if (porcentajeMetaAlcanzado === 0 && planning.metaLlegada !== planning.puntoPartida) {
        const avanceMeta = planning.avanceMeta || 0;
        const puntoPartida = planning.puntoPartida || 0;
        const metaLlegada = planning.metaLlegada || 0;
        porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
        porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
      }
      const avanceOO = calculateObjectiveCompletion(planning);
      const avanceTareas = calculateOTTasksAverage(planning);
      
      // % Meta Alcanzada = % de Meta Alcanzado x Ponderacion
      totalMetaAlcanzada += porcentajeMetaAlcanzado * (ponderacion / 100);
      
      // % Alcanzado por OO = Avance Objetivos Operativos x Ponderacion
      totalAlcanzadoPorOO += avanceOO * (ponderacion / 100);
      
      // % Alcanzado por Tareas = Avance de Tareas x Ponderacion
      totalAlcanzadoPorTareas += avanceTareas * (ponderacion / 100);
    });
    
    const metaAlcanzada = Math.round(totalMetaAlcanzada);
    const alcanzadoPorOO = Math.round(totalAlcanzadoPorOO);
    const alcanzadoPorTareas = Math.round(totalAlcanzadoPorTareas);
    
    // Determine efficiency: if OO < Meta, it's efficient (green)
    const isEfficient = alcanzadoPorOO < metaAlcanzada;
    
    return { metaAlcanzada, alcanzadoPorOO, alcanzadoPorTareas, isEfficient };
  }, [plannings]);
  const handleBack = () => {
    setLocation('/process-tactical-objectives');
  };

  const handleSaveNow = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setManualSaving(true);

    const savePromise = (async () => {
      localStorage.setItem(`tactical_planning_${processId}`, JSON.stringify(plannings));
      
      const savePromises = plannings.map(planning => 
        savePlanningMutation.mutateAsync(
          {
            objectiveId: planning.objectiveId,
            category: planning.category,
            goal: typeof planning.goal === 'string' ? planning.goal : String(planning.goal || ''),
            resultKeys: planning.resultKeys,
            ponderacion: planning.ponderacion || 0,
            puntoPartida: planning.puntoPartida || 0,
            metaLlegada: planning.metaLlegada || 0,
            unidadMedida: planning.unidadMedida || '',
            avanceMeta: planning.avanceMeta || 0,
            trackingType: planning.trackingType || 'puntual',
            monthlyValues: planning.monthlyValues || [],
          }
        ).catch(error => ({ success: false, error }))
      );
      
      const results = await Promise.allSettled(savePromises);
      const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.success === false));
      
      setLastSaveTime(new Date().toLocaleTimeString());
      
      if (failures.length === 0) {
        return '✓ Guardado exitosamente';
      } else {
        throw new Error(`⚠ Se guardaron ${plannings.length - failures.length} de ${plannings.length} objetivos`);
      }
    })();

    toast.promise(savePromise, {
      loading: 'Guardando planificación...',
      success: (msg) => msg,
      error: (err) => err.message || '✗ Error al guardar',
    });

    try {
      await savePromise;
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setManualSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold text-green-900 mb-2">PLANIFICACIÓN DE OBJETIVOS TÁCTICOS</h1>
            <p className="text-gray-600">Proceso: <span className="font-semibold">{localStorage.getItem("selectedProcessName") || "Proceso"}</span></p>
            <p className="text-sm text-green-600 mt-1">✓ Guardado automático cada 500ms {lastSaveTime && `(Último: ${lastSaveTime})`}</p>
          </div>
          <div className="flex items-center gap-4">
            {plannings.length > 0 && (
              <Button
                onClick={() => {
                  exportTacticalObjectivesToPDF(plannings, localStorage.getItem('selectedProcessName') || 'Proceso');
                  toast.success('PDF exportado correctamente');
                }}
                className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
              >
                <Download size={20} />
                Exportar a PDF
              </Button>
            )}
            <Button
              onClick={handleSaveNow}
              className="bg-green-600 hover:bg-green-700"
              disabled={manualSaving}
            >
              {manualSaving ? 'Guardando...' : 'Guardar Ahora'}
            </Button>
            <Button
              onClick={handleBack}
              variant="outline"
              className="flex items-center gap-2"
            >
              <ArrowLeft size={20} />
              VOLVER
            </Button>
          </div>
        </div>

        <Card className="mb-6 bg-gradient-to-r from-blue-50 to-green-50 border-2 border-green-600">
          <CardHeader>
            <CardTitle className="text-green-900">Indicador General de Objetivos Tácticos</CardTitle>
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
                      <p className="text-2xl font-bold text-blue-600">{(planning.porcentajeMetaAlcanzado || 0).toFixed(0)}%</p>
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
                    <select
                      value={planning.category}
                      onChange={(e) => updatePlanning(planning.id, 'category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar categoría</option>
                      {CATEGORIES.map((cat, idx) => (
                        <option key={`cat_${idx}_${cat}`} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Meta del Objetivo</label>
                    <Input
                      type="text"
                      value={planning.goal}
                      onChange={(e) => updatePlanning(planning.id, 'goal', e.target.value)}
                      placeholder="Ingrese la meta del objetivo"
                      className="border-gray-300"
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <h5 className="font-semibold text-blue-900">Datos del Objetivo Táctico</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Ponderación (%)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={planning.ponderacion || 0}
                          disabled
                          placeholder="Ponderación"
                          className="border-gray-300 bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Punto de Partida</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={planning.puntoPartida || 0}
                          disabled
                          placeholder="Punto de partida"
                          className="border-gray-300 bg-gray-100"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Meta o Punto de Llegada</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={planning.metaLlegada || 0}
                          disabled
                          placeholder="Meta"
                          className="border-gray-300 bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Unidad de Medida</label>
                        <Input
                          type="text"
                          value={planning.unidadMedida || ''}
                          disabled
                          placeholder="%, $, gr, Kg, horas, etc."
                          className="border-gray-300 bg-gray-100"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Seguimiento</label>
                        <select
                          value={planning.trackingType || 'puntual'}
                          onChange={(e) => {
                            const newType = e.target.value as 'puntual' | 'mensual';
                            if (newType === 'mensual') {
                              // Initialize 12 monthly values if switching to mensual
                              const currentValues = planning.monthlyValues || Array(12).fill(0);
                              const total = currentValues.reduce((s: number, v: number) => s + (v || 0), 0);
                              updatePlanning(planning.id, 'trackingType', newType);
                              if (!planning.monthlyValues) {
                                updatePlanning(planning.id, 'monthlyValues', Array(12).fill(0));
                              }
                            } else {
                              updatePlanning(planning.id, 'trackingType', newType);
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="puntual">Puntual (valor directo)</option>
                          <option value="mensual">Mensual (12 meses)</option>
                        </select>
                      </div>

                      {(planning.trackingType || 'puntual') === 'puntual' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Avance de la Meta</label>
                            <Input
                              type="number"
                              step="0.01"
                              value={planning.avanceMeta || 0}
                              onChange={(e) => updatePlanning(planning.id, 'avanceMeta', parseFloat(e.target.value) || 0)}
                              placeholder="Avance actual"
                              className="border-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">% Meta alcanzada</label>
                            <p className="text-2xl font-bold text-blue-600">{(planning.porcentajeMetaAlcanzado || 0).toFixed(0)}%</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-6 gap-2">
                            {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((mes, idx) => {
                              const vals = planning.monthlyValues || Array(12).fill(0);
                              return (
                                <div key={`ot_month_${idx}`} className="flex flex-col items-center gap-1">
                                  <label className="text-xs font-semibold text-gray-600">{mes}</label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={vals[idx] || 0}
                                    onChange={(e) => {
                                      const inputVal = parseFloat(e.target.value) || 0;
                                      setPlannings(prev => prev.map(p => {
                                        if (p.id === planning.id) {
                                          const newVals = [...(p.monthlyValues || Array(12).fill(0))];
                                          newVals[idx] = inputVal;
                                          const total = newVals.reduce((s, v) => s + (v || 0), 0);
                                          const pp = p.puntoPartida || 0;
                                          const m = p.metaLlegada || 0;
                                          let pct = 0;
                                          if (m !== pp) {
                                            pct = ((total - pp) / (m - pp)) * 100;
                                            pct = Math.max(-100, Math.min(100, pct));
                                          }
                                          return { ...p, monthlyValues: newVals, avanceMeta: total, porcentajeMetaAlcanzado: pct };
                                        }
                                        return p;
                                      }));
                                    }}
                                    className="border-gray-300 text-xs px-1 py-1 text-center"
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Total acumulado (Avance)</label>
                              <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
                                <span className="text-xl font-bold text-green-700">
                                  {((planning.monthlyValues || Array(12).fill(0)).reduce((s: number, v: number) => s + (v || 0), 0)).toFixed(2)}
                                  {planning.unidadMedida ? ` ${planning.unidadMedida}` : ''}
                                </span>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">% Meta alcanzada</label>
                              <p className="text-2xl font-bold text-blue-600">{(planning.porcentajeMetaAlcanzado || 0).toFixed(0)}%</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-700">Objetivos Operativos</h4>
                    </div>

                    {planning.resultKeys.map((resultKey, rkIdx) => (
                      <Card key={`rk_${resultKey.id || rkIdx}`} className="bg-gray-50">
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
                            <AutoExpandingTextarea
                              value={resultKey.description}
                              onChange={(e: any) => updateResultKey(planning.id, resultKey.id, 'description', e.target.value)}
                              placeholder="Descripción del objetivo operativo"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Ponderacion (%)</label>
                              <Input
                                type="number"
                                step="0.01"
                                value={resultKey.ponderacion || 0}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'ponderacion', parseFloat(e.target.value) || 0)}
                                placeholder="Ponderacion"
                                className="border-gray-300"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Condicion Inicial</label>
                              <Input
                                type="number"
                                step="0.01"
                                value={resultKey.condicionInicial || 0}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'condicionInicial', parseFloat(e.target.value) || 0)}
                                placeholder="Condicion inicial"
                                className="border-gray-300"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Meta</label>
                            <Input
                              type="number"
                              step="0.01"
                              value={resultKey.meta || 0}
                              onChange={(e) => updateResultKey(planning.id, resultKey.id, 'meta', parseFloat(e.target.value) || 0)}
                              placeholder="Meta"
                              className="border-gray-300"
                            />
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Seguimiento</label>
                              <select
                                value={resultKey.ooTrackingType || 'puntual'}
                                onChange={(e) => {
                                  const newType = e.target.value as 'puntual' | 'mensual';
                                  updateResultKey(planning.id, resultKey.id, 'ooTrackingType', newType);
                                  if (newType === 'mensual' && !resultKey.ooMonthlyValues) {
                                    updateResultKey(planning.id, resultKey.id, 'ooMonthlyValues', Array(12).fill(0));
                                  }
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              >
                                <option value="puntual">Puntual (valor directo)</option>
                                <option value="mensual">Mensual (12 meses)</option>
                              </select>
                            </div>

                            {(resultKey.ooTrackingType || 'puntual') === 'puntual' ? (
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Condición Actual</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={resultKey.condicionActual || 0}
                                  onChange={(e) => updateResultKey(planning.id, resultKey.id, 'condicionActual', parseFloat(e.target.value) || 0)}
                                  placeholder="Condicion actual"
                                  className="border-gray-300"
                                />
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="grid grid-cols-6 gap-2">
                                  {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((mes, idx) => {
                                    const vals = resultKey.ooMonthlyValues || Array(12).fill(0);
                                    return (
                                      <div key={`oo_month_${idx}`} className="flex flex-col items-center gap-1">
                                        <label className="text-xs font-semibold text-gray-600">{mes}</label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={vals[idx] || 0}
                                          onChange={(e) => {
                                            const inputVal = parseFloat(e.target.value) || 0;
                                            setPlannings(prev => prev.map(p => {
                                              if (p.id === planning.id) {
                                                return {
                                                  ...p,
                                                  resultKeys: p.resultKeys.map(rk => {
                                                    if (rk.id === resultKey.id) {
                                                      const newVals = [...(rk.ooMonthlyValues || Array(12).fill(0))];
                                                      newVals[idx] = inputVal;
                                                      const total = newVals.reduce((s, v) => s + (v || 0), 0);
                                                      const ci = rk.condicionInicial || 0;
                                                      const m = rk.meta || 0;
                                                      const pct = calculatePorcentajeAlcanzado(ci, m, total);
                                                      return { ...rk, ooMonthlyValues: newVals, condicionActual: total, porcentajeAlcanzado: pct };
                                                    }
                                                    return rk;
                                                  }),
                                                };
                                              }
                                              return p;
                                            }));
                                          }}
                                          className="border-gray-300 text-xs px-1 py-1 text-center"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-gray-700 mb-1">Total acumulado (Condición Actual)</label>
                                  <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-center">
                                    <span className="text-xl font-bold text-green-700">
                                      {((resultKey.ooMonthlyValues || Array(12).fill(0)).reduce((s: number, v: number) => s + (v || 0), 0)).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">% Alcanzado</label>
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                              <span className="text-2xl font-bold text-blue-600">{(resultKey.porcentajeAlcanzado || 0).toFixed(2)}%</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Responsable</label>
                              <Input
                                value={resultKey.responsible}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'responsible', e.target.value)}
                                placeholder="Responsable"
                                className="border-gray-300"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha de Inicio</label>
                              <Input
                                type="date"
                                value={resultKey.startDate}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'startDate', e.target.value)}
                                className="border-gray-300"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha de Fin</label>
                              <Input
                                type="date"
                                value={resultKey.endDate}
                                onChange={(e) => updateResultKey(planning.id, resultKey.id, 'endDate', e.target.value)}
                                className="border-gray-300"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Días Restantes</label>
                              <Input
                                type="text"
                                value={calculateDaysRemaining(resultKey.endDate)}
                                disabled
                                className="border-gray-300 bg-gray-100"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Observación</label>
                            <AutoExpandingTextarea
                              value={resultKey.observation}
                              onChange={(e: any) => updateResultKey(planning.id, resultKey.id, 'observation', e.target.value)}
                              placeholder="Observaciones"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h5 className="font-semibold text-gray-700">Tareas</h5>
                              <Button
                                onClick={() => addTask(planning.id, resultKey.id)}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
                              >
                                <Plus size={14} />
                                Agregar Tarea
                              </Button>
                            </div>

                            {resultKey.tasks.map((task, tIdx) => (
                              <Card key={`task_${task.id || tIdx}`} className="bg-white border-l-4 border-l-blue-400">
                                <CardContent className="pt-3 space-y-2">
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción</label>
                                    <AutoExpandingTextarea
                                      value={task.description}
                                      onChange={(e: any) => updateTask(planning.id, resultKey.id, task.id, 'description', e.target.value)}
                                      placeholder="Descripción de la tarea"
                                      className="text-sm"
                                    />
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">Responsable</label>
                                      <Input
                                        value={task.responsible}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'responsible', e.target.value)}
                                        placeholder="Responsable"
                                        className="border-gray-300 text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha</label>
                                      <Input
                                        type="date"
                                        value={task.date}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'date', e.target.value)}
                                        className="border-gray-300 text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Seguimiento</label>
                                    <select
                                      value={task.taskType || 'puntual'}
                                      onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'taskType', e.target.value as 'puntual' | 'mensual')}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                      <option value="puntual">Puntual (% directo)</option>
                                      <option value="mensual">Mensual (12 meses)</option>
                                    </select>
                                  </div>

                                  {(task.taskType || 'puntual') === 'puntual' ? (
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">% Completado</label>
                                      <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={task.percentageCompleted}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'percentageCompleted', parseInt(e.target.value))}
                                        className="border-gray-300 text-sm"
                                      />
                                    </div>
                                  ) : (
                                    <div className="space-y-2 w-full">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-700">
                                          % Completado: {task.monthlyProgress ? Math.round((task.monthlyProgress.filter(m => m).length / 12) * 100) : 0}% ({task.monthlyProgress?.filter(m => m).length || 0}/12 meses)
                                        </span>
                                      </div>
                                      <div className="flex gap-1 flex-wrap">
                                        {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((month, index) => {
                                          const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                                          const currentMonth = new Date().getMonth();
                                          const progress = task.monthlyProgress || Array(12).fill(false);
                                          const isCompleted = progress[index];
                                          const isCurrentMonth = index === currentMonth;
                                          
                                          return (
                                            <div key={`month_${index}`} className="flex flex-col items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newProgress = [...(task.monthlyProgress || Array(12).fill(false))];
                                                  newProgress[index] = !newProgress[index];
                                                  const completedMonths = newProgress.filter(m => m).length;
                                                  const newPercentage = Math.round((completedMonths / 12) * 100);
                                                  
                                                  setPlannings(plannings.map(p => {
                                                    if (p.id === planning.id) {
                                                      return {
                                                        ...p,
                                                        resultKeys: p.resultKeys.map(rk => {
                                                          if (rk.id === resultKey.id) {
                                                            return {
                                                              ...rk,
                                                              tasks: rk.tasks.map(t => {
                                                                if (t.id === task.id) {
                                                                  return { ...t, monthlyProgress: newProgress, percentageCompleted: newPercentage };
                                                                }
                                                                return t;
                                                              }),
                                                            };
                                                          }
                                                          return rk;
                                                        }),
                                                      };
                                                    }
                                                    return p;
                                                  }));
                                                }}
                                                title={monthNames[index]}
                                                className={`w-8 h-8 rounded border-2 transition-all flex items-center justify-center text-xs font-bold cursor-pointer ${isCompleted ? 'bg-green-500 border-green-600 text-white hover:bg-green-600' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'} ${isCurrentMonth ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                                              >
                                                {isCompleted ? '✓' : ''}
                                              </button>
                                              <span className="text-xs text-gray-600 font-semibold">{month}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-2">
                                        Haz clic en cada mes para marcar como completado. El mes actual está resaltado en azul.
                                      </div>
                                    </div>
                                  )}

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-semibold text-gray-700 mb-1">Ponderación</label>
                                      <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={task.weighting}
                                        onChange={(e) => updateTask(planning.id, resultKey.id, task.id, 'weighting', parseInt(e.target.value))}
                                        className="border-gray-300 text-sm"
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      <Button
                                        onClick={() => deleteTask(planning.id, resultKey.id, task.id)}
                                        size="sm"
                                        variant="destructive"
                                        className="w-full flex items-center gap-1"
                                      >
                                        <Trash2 size={14} />
                                        Eliminar
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>

                          <Button
                            onClick={() => deleteResultKey(planning.id, resultKey.id)}
                            size="sm"
                            variant="destructive"
                            className="w-full flex items-center gap-1"
                          >
                            <Trash2 size={16} />
                            Eliminar Objetivo Operativo
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                    
                    <Button
                      onClick={() => addResultKey(planning.id)}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 flex items-center gap-1 w-full justify-center"
                    >
                      <Plus size={16} />
                      Agregar Objetivo Operativo
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
