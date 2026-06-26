import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import { ArrowLeft, Plus, Trash2, Save, AlertCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  MatrizFODARow, MatrizFODAIndicadores, FODAType, FactorType, SistemaGestionType,
  ProbabilidadType, ImpactoType, calcularNivelRiesgo,
  AccionOTG, TrackingOTGType, MONTHS_SHORT, calcularPorcentajeAccion, calcularPorcentajeOTG,
} from '@/types/matrizFODA';
import { useManagerAuth } from '@/_core/hooks/useManagerAuth';
import { useProcessLeaderAuth } from '@/contexts/ProcessLeaderAuthContext';
import { exportRiskMatrixToPDF } from '@/lib/exportRiskMatrixToPDF';
import { exportMatrizFODAToPDF } from '@/lib/exportMatrizFODAToPDF';

// ─── AccionOTGRow ────────────────────────────────────────────────────────────────
function AccionOTGRow({
  accion,
  onChange,
  onDelete,
}: {
  accion: AccionOTG;
  onChange: (updated: AccionOTG) => void;
  onDelete: () => void;
}) {
  const ponderacionRef = useRef<HTMLInputElement>(null);
  const partidaRef = useRef<HTMLInputElement>(null);
  const llegadaRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof AccionOTG, value: any) => {
    onChange({ ...accion, [field]: value });
  };

  const updateMonthly = (idx: number, val: number) => {
    const vals = [...(accion.monthlyValues || Array(12).fill(0))];
    vals[idx] = val;
    update('monthlyValues', vals);
  };

  const updateChecklist = (idx: number, val: boolean) => {
    const vals = [...(accion.checklistValues || Array(12).fill(false))];
    vals[idx] = val;
    update('checklistValues', vals);
  };

  return (
    <div className="border rounded-lg p-4 bg-white space-y-4 relative">
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1"
        title="Eliminar acción"
      >
        <Trash2 size={16} />
      </button>

      {/* Fila 1: OTG + Responsable + Fecha */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          <label className="text-xs font-semibold text-slate-600">Objetivo Táctico de Gestión</label>
          <textarea
            defaultValue={accion.accion}
            onBlur={(e) => update('accion', e.target.value)}
            rows={2}
            className="w-full border rounded p-2 text-sm resize-y"
            placeholder="Describe el objetivo..."
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Responsable</label>
          <input
            type="text"
            defaultValue={accion.responsable}
            onBlur={(e) => update('responsable', e.target.value)}
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Fecha de Implementación</label>
          <input
            type="date"
            defaultValue={accion.fechaImplementacion}
            onBlur={(e) => update('fechaImplementacion', e.target.value)}
            className="w-full border rounded p-2 text-sm"
          />
        </div>
      </div>

      {/* Fila 2: Ponderación + Tipo de Seguimiento */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-600">Ponderación (%)</label>
          <input
            ref={ponderacionRef}
            type="number"
            step="1"
            min={0}
            max={100}
            defaultValue={accion.ponderacion ?? 0}
            onBlur={(e) => {
              const val = parseFloat(e.target.value) || 0;
              if (ponderacionRef.current) ponderacionRef.current.value = String(val);
              update('ponderacion', val);
            }}
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Tipo de Seguimiento</label>
          <select
            value={accion.tipoSeguimiento}
            onChange={(e) => update('tipoSeguimiento', e.target.value as TrackingOTGType)}
            className="w-full border rounded p-2 text-sm"
          >
            <option value="puntual">Puntual (% de avance)</option>
            <option value="mensual_sumatoria">Mensual — Sumatoria</option>
            <option value="mensual_promedio">Mensual — Promedio</option>
            <option value="mensual_checklist">Mensual — Checklist</option>
          </select>
        </div>
      </div>

      {/* Campos según tipo */}
      {accion.tipoSeguimiento === 'puntual' && (
        <div>
          <label className="text-xs font-semibold text-slate-600">% de Avance</label>
          <input
            type="number"
            step="1"
            min={0}
            max={100}
            defaultValue={accion.valorPuntual ?? 0}
            onBlur={(e) => update('valorPuntual', parseFloat(e.target.value) || 0)}
            className="w-full border rounded p-2 text-sm"
          />
        </div>
      )}
      {(accion.tipoSeguimiento === 'mensual_sumatoria' || accion.tipoSeguimiento === 'mensual_promedio') && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
            <div>
              <label className="text-xs font-semibold text-slate-600">Punto de Partida</label>
              <input
                ref={partidaRef}
                type="number"
                step="any"
                defaultValue={accion.puntoPartidaAccion ?? 0}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (partidaRef.current) partidaRef.current.value = String(val);
                  update('puntoPartidaAccion', val);
                }}
                className="w-full border rounded p-2 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Punto de Llegada (Meta)</label>
              <input
                ref={llegadaRef}
                type="number"
                step="any"
                defaultValue={accion.puntoLlegadaAccion ?? 0}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (llegadaRef.current) llegadaRef.current.value = String(val);
                  update('puntoLlegadaAccion', val);
                }}
                className="w-full border rounded p-2 text-sm"
                placeholder="100"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Unidad de Medida</label>
              <input
                type="text"
                defaultValue={accion.unidadMedidaAccion || ''}
                onBlur={(e) => update('unidadMedidaAccion', e.target.value)}
                className="w-full border rounded p-2 text-sm"
                placeholder="ej: kg, %, unidades..."
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-2 block">
              Valores Mensuales ({accion.tipoSeguimiento === 'mensual_sumatoria' ? 'Sumatoria' : 'Promedio'})
            </label>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
              {MONTHS_SHORT.map((mes, idx) => (
                <div key={idx} className="text-center">
                  <div className="text-xs text-slate-500 mb-1">{mes}</div>
                  <input
                    type="number"
                    step="any"
                    defaultValue={(accion.monthlyValues || Array(12).fill(0))[idx]}
                    onBlur={(e) => updateMonthly(idx, parseFloat(e.target.value) || 0)}
                    className="w-full border rounded p-1 text-xs text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {accion.tipoSeguimiento === 'mensual_checklist' && (
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-2 block">Checklist Mensual</label>
          <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
            {MONTHS_SHORT.map((mes, idx) => (
              <div key={idx} className="text-center">
                <div className="text-xs text-slate-500 mb-1">{mes}</div>
                <input
                  type="checkbox"
                  checked={(accion.checklistValues || Array(12).fill(false))[idx]}
                  onChange={(e) => updateChecklist(idx, e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* % Completado calculado */}
      <div className="text-right text-xs text-slate-500">
        % Completado: <span className="font-bold text-blue-700">{calcularPorcentajeAccion(accion)}%</span>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────────────────
export default function ProcessRiskMatrix() {
  const [, setLocation] = useLocation();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem('managerCompanyId') !== null || isManagerLogin;
  const [processId, setProcessId] = useState<number | null>(null);
  const [processName, setProcessName] = useState('');
  const [rows, setRows] = useState<MatrizFODARow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const initialLoadDoneRef = useRef(false);
  const savingRef = useRef(false);

  // Load process ID and name from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('selectedProcessId');
    const storedName = localStorage.getItem('selectedProcessName');
    if (stored) {
      setProcessId(parseInt(stored));
      setProcessName(storedName || 'Proceso');
    }
  }, []);

  // Fetch FODA data from database
  const { data: fodaData } = trpc.processFODA.get.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );

  // Sync FODA elements with OTG rows after initial load
  // When FODA adds/removes elements, OTG must reflect those changes
  useEffect(() => {
    if (!fodaData || !initialLoadDoneRef.current) return;
    try {
      const allFodaItems: Array<{ statement: string; type: FODAType; subprocess: string; policyObjective: string }> = [
        ...JSON.parse(fodaData.strengths || '[]').map((i: any) => ({ ...i, type: 'Fortaleza' as FODAType })),
        ...JSON.parse(fodaData.opportunities || '[]').map((i: any) => ({ ...i, type: 'Oportunidad' as FODAType })),
        ...JSON.parse(fodaData.weaknesses || '[]').map((i: any) => ({ ...i, type: 'Debilidad' as FODAType })),
        ...JSON.parse(fodaData.threats || '[]').map((i: any) => ({ ...i, type: 'Amenaza' as FODAType })),
      ];
      const fodaStatements = new Set(allFodaItems.map(i => i.statement).filter(Boolean));

      setRows(prev => {
        const existingStatements = new Set(prev.map(r => r.elemento).filter(Boolean));
        // Add rows for new FODA elements not yet in OTG
        const toAdd: MatrizFODARow[] = allFodaItems
          .filter(i => i.statement && !existingStatements.has(i.statement))
          .map((item, idx) => ({
            id: Date.now() + idx,
            subproceso: item.subprocess || '',
            objetivoPolitica: item.policyObjective || '',
            elemento: item.statement || '',
            foda: item.type,
            factor: 'Humano' as FactorType,
            consecuencia: '',
            sistemaGestion: 'Calidad' as SistemaGestionType,
            probabilidad: (item.type === 'Debilidad' || item.type === 'Amenaza') ? 'A' as ProbabilidadType : undefined,
            impacto: (item.type === 'Debilidad' || item.type === 'Amenaza') ? 1 as ImpactoType : undefined,
            accionATomar: '',
            planContingencia: '',
            planContinuidad: '',
            simulacro: '',
            comunicado: 'NO' as 'SI' | 'NO',
            partesInteresadas: '',
            evidencia: '',
            mejoraImplementada: 'NO' as 'SI' | 'NO',
            observacion: '',
            medioVerificacion: '',
            objetivoLogrado: 'NO' as 'SI' | 'NO',
          }));
        // Remove rows whose FODA element was deleted (only if elemento exists and is no longer in FODA)
        const filtered = prev.filter(r => !r.elemento || fodaStatements.has(r.elemento));
        if (toAdd.length === 0 && filtered.length === prev.length) return prev; // no change
        return [...filtered, ...toAdd];
      });
    } catch (e) {
      console.error('Error syncing FODA to OTG:', e);
    }
  }, [fodaData]);

  // Initialize rows from FODA data — only on first load, never on refetch
  useEffect(() => {
    if (fodaData && !initialLoadDoneRef.current) {
      try {
        let newRows: MatrizFODARow[] = [];

        // Build a lookup map from FODA source data: elemento (statement) -> policyObjective
        const fodaLookup: Record<string, string> = {};
        try {
          const allFodaItems = [
            ...JSON.parse(fodaData.strengths || '[]'),
            ...JSON.parse(fodaData.opportunities || '[]'),
            ...JSON.parse(fodaData.weaknesses || '[]'),
            ...JSON.parse(fodaData.threats || '[]'),
          ];
          allFodaItems.forEach((item: any) => {
            if (item.statement && item.policyObjective) {
              fodaLookup[item.statement] = item.policyObjective;
            }
          });
        } catch (e) {
          console.error('Error building FODA lookup:', e);
        }

        // Try to load from matrixData first
        if (fodaData.matrixData) {
          try {
            const parsedMatrix = JSON.parse(fodaData.matrixData);
            if (Array.isArray(parsedMatrix) && parsedMatrix.length > 0) {
              // Enrich rows that are missing objetivoPolitica using the FODA lookup
              newRows = parsedMatrix.map((row: any) => ({
                ...row,
                objetivoPolitica: row.objetivoPolitica || fodaLookup[row.elemento] || '',
              }));
              console.log('Loaded matrixData with', parsedMatrix.length, 'rows');
            }
          } catch (e) {
            console.error('Error parsing matrixData:', e);
          }
        }

        // If no valid matrixData, load from old structure (4-column format)
        if (newRows.length === 0) {
          const strengths = JSON.parse(fodaData.strengths || '[]');
          const opportunities = JSON.parse(fodaData.opportunities || '[]');
          const weaknesses = JSON.parse(fodaData.weaknesses || '[]');
          const threats = JSON.parse(fodaData.threats || '[]');

          let id = 1;

          const addRows = (items: any[], type: FODAType) => {
            items.forEach((item) => {
              newRows.push({
                id,
                subproceso: item.subprocess || '',
                objetivoPolitica: item.policyObjective || '',
                elemento: item.statement || '',
                foda: type,
                factor: 'Humano',
                consecuencia: '',
                sistemaGestion: 'Calidad',
                probabilidad: type === 'Debilidad' || type === 'Amenaza' ? 'A' : undefined,
                impacto: type === 'Debilidad' || type === 'Amenaza' ? 1 : undefined,
                accionATomar: '',
                planContingencia: '',
                planContinuidad: '',
                simulacro: '',
                comunicado: 'NO',
                partesInteresadas: '',
                evidencia: '',
                mejoraImplementada: 'NO',
                observacion: '',
                medioVerificacion: '',
                objetivoLogrado: 'NO',
              });
              id++;
            });
          };

          addRows(strengths, 'Fortaleza');
          addRows(opportunities, 'Oportunidad');
          addRows(weaknesses, 'Debilidad');
          addRows(threats, 'Amenaza');
        }

        setRows(newRows);
        setTimeout(() => { initialLoadDoneRef.current = true; }, 200);
      } catch (error) {
        console.error('Error loading FODA data:', error);
      }
    }
  }, [fodaData]);

  // Calculate indicators directly from rows (useMemo ensures always in sync)
  const indicadores = useMemo<MatrizFODAIndicadores>(() => {
    const totalPlanificado = rows.length;
    const totalAlcanzadoCount = rows.filter((r) => r.objetivoLogrado === 'SI').length;
    const totalAlcanzado = totalPlanificado > 0 ? Math.round((totalAlcanzadoCount / totalPlanificado) * 100) : 0;
    const porcentajeComunicado = totalPlanificado > 0 ? Math.round((rows.filter((r) => r.comunicado === 'SI').length / totalPlanificado) * 100) : 0;

    // Calculate by Sistema de Gestión
    const alcancePorSistema = {
      Calidad: { alcanzados: 0, total: 0, porcentaje: 0 },
      Ambiente: { alcanzados: 0, total: 0, porcentaje: 0 },
      SSO: { alcanzados: 0, total: 0, porcentaje: 0 },
      'Seguridad Física': { alcanzados: 0, total: 0, porcentaje: 0 },
      'Responsabilidad Social': { alcanzados: 0, total: 0, porcentaje: 0 },
      Otro: { alcanzados: 0, total: 0, porcentaje: 0 },
    };

    rows.forEach((row) => {
      const sistema = row.sistemaGestion || 'Calidad';
      if (alcancePorSistema[sistema as keyof typeof alcancePorSistema]) {
        alcancePorSistema[sistema as keyof typeof alcancePorSistema].total++;
        if (row.objetivoLogrado === 'SI') {
          alcancePorSistema[sistema as keyof typeof alcancePorSistema].alcanzados++;
        }
      }
    });

    // Calculate percentages
    Object.keys(alcancePorSistema).forEach((sistema) => {
      const key = sistema as keyof typeof alcancePorSistema;
      if (alcancePorSistema[key].total > 0) {
        alcancePorSistema[key].porcentaje = Math.round((alcancePorSistema[key].alcanzados / alcancePorSistema[key].total) * 100);
      }
    });

    return {
      totalPlanificado,
      totalAlcanzado,
      porcentajeComunicado,
      alcancePorSistema,
    };
  }, [rows]);

  // Auto-save data whenever rows change — protected against initial load and concurrent saves
  const saveMatrixMutation = trpc.processFODA.saveMatrixData.useMutation();

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const saveTimeout = setTimeout(async () => {
      if (rows.length > 0 && processId && !savingRef.current) {
        savingRef.current = true;
        setIsAutoSaving(true);
        const matrixDataJson = JSON.stringify(rows);
        try {
          await saveMatrixMutation.mutateAsync(
            { processId, matrixData: matrixDataJson }
          );
          setIsAutoSaving(false);
          setLastSaved(new Date());
          console.log('Matrix auto-saved successfully');
        } catch (error) {
          setIsAutoSaving(false);
          console.error('Error auto-saving matrix:', error);
          toast.error('Error guardando matriz: ' + (error instanceof Error ? error.message : 'Error desconocido'));
        } finally {
          savingRef.current = false;
        }
      }
    }, 1500);

    return () => clearTimeout(saveTimeout);
  }, [rows, processId, saveMatrixMutation]);

  const updateRow = (id: number, field: keyof MatrizFODARow, value: any) => {
    setRows(
      rows.map((row) => {
        if (row.id === id) {
          const updated = { ...row, [field]: value };

          // Calculate risk level if probability or impact changes
          if ((field === 'probabilidad' || field === 'impacto') && updated.probabilidad && updated.impacto) {
            const riesgo = calcularNivelRiesgo(updated.probabilidad, updated.impacto);
            if (riesgo) {
              updated.nivelRiesgo = riesgo.nivelRiesgo;
              updated.estimacion = riesgo.estimacion;
            }
          }

          // Calculate new risk level after implementation
          if ((field === 'probabilidadNueva' || field === 'impacto') && updated.probabilidadNueva && updated.impacto) {
            const riesgo = calcularNivelRiesgo(updated.probabilidadNueva, updated.impacto);
            if (riesgo) {
              updated.nivelRiesgoNuevo = riesgo.nivelRiesgo;
              updated.estimacionNueva = riesgo.estimacion;
            }
          }

          // Calculate days remaining
          if (field === 'fechaFinalPrevista' && updated.fechaFinalPrevista) {
            const today = new Date();
            const finalDate = new Date(updated.fechaFinalPrevista);
            const diffTime = finalDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            updated.diasRestantes = diffDays;
          }

          return updated;
        }
        return row;
      })
    );
  };

  const addRow = () => {
    const newId = Math.max(...rows.map((r) => r.id), 0) + 1;
    setRows([
      ...rows,
      {
        id: newId,
        subproceso: '',
        elemento: '',
        foda: 'Debilidad',
        factor: 'Humano',
        consecuencia: '',
        sistemaGestion: 'Calidad',
        probabilidad: 'A',
        impacto: 1,
        accionATomar: '',
        planContingencia: '',
        planContinuidad: '',
        simulacro: '',
        comunicado: 'NO',
        partesInteresadas: '',
        evidencia: '',
        mejoraImplementada: 'NO',
        observacion: '',
        medioVerificacion: '',
        objetivoLogrado: 'NO',
      },
    ]);
  };

  const deleteRow = (id: number) => {
    setRows(rows.filter((r) => r.id !== id));
  };

  const updateAcciones = (rowId: number, acciones: AccionOTG[]) => {
    setRows(rows.map((row) => {
      if (row.id !== rowId) return row;
      const porcentajeCumplimiento = calcularPorcentajeOTG(acciones);
      return { ...row, acciones, porcentajeCumplimiento };
    }));
  };

  const addAccion = (rowId: number) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const newAccion: AccionOTG = {
      id: crypto.randomUUID(),
      accion: '',
      ponderacion: 0,
      responsable: '',
      fechaImplementacion: '',
      tipoSeguimiento: 'puntual',
      valorPuntual: 0,
      porcentajeCompletado: 0,
    };
    updateAcciones(rowId, [...(row.acciones || []), newAccion]);
  };

  const toggleRowExpanded = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
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
            <Button className="w-full mt-4" onClick={() => setLocation('/process-characterization')}>
              Ir a Caracterización de Procesos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">OTG - OBJETIVOS TÁCTICOS DE GESTIÓN</h1>
          <p className="text-slate-600 mt-2">
            Proceso: <strong>{processName}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => {
              setIsSaving(true);
              const matrixDataJson = JSON.stringify(rows);
              saveMatrixMutation.mutateAsync(
                { processId: processId || 0, matrixData: matrixDataJson }
              ).then(() => {
                setIsSaving(false);
                setLastSaved(new Date());
                toast.success('Matriz guardada correctamente');
              }).catch((error) => {
                setIsSaving(false);
                console.error('Error:', error);
                toast.error('Error al guardar la matriz');
              });
            }}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            disabled={isSaving}
          >
            <Save size={16} />
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button 
            onClick={() => {
              const success = exportMatrizFODAToPDF(rows, processName);
              if (success) {
                toast.success('PDF de Matriz FODA exportado correctamente');
              } else {
                toast.error('Error al exportar el PDF');
              }
            }}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <Download size={16} />
            Descargar Matriz
          </Button>
          <Button variant="outline" onClick={() => setLocation('/process-characterization')} className="gap-2">
            <ArrowLeft size={16} />
            VOLVER
          </Button>
        </div>
      </div>

      {/* Indicadores principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-600">% Previsto</p>
            <p className="text-2xl font-bold text-blue-600">{indicadores.totalPlanificado > 0 ? '100%' : '0%'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-600">% Alcanzado</p>
            <p className="text-2xl font-bold text-green-600">{indicadores.totalAlcanzado}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-600">% Comunicado</p>
            <p className="text-2xl font-bold text-purple-600">{indicadores.porcentajeComunicado}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Indicadores por Sistema de Gestión - MEJORA c) */}
      {Object.values(indicadores.alcancePorSistema).some((s) => s.total > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Indicadores por Sistema de Gestión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {Object.entries(indicadores.alcancePorSistema).map(([sistema, datos]) =>
                datos.total > 0 ? (
                  <div key={sistema} className="p-4 border rounded-lg bg-slate-50">
                    <p className="text-xs font-semibold text-slate-700 mb-2">{sistema}</p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-slate-600">Cantidad</p>
                        <p className="text-lg font-bold text-blue-600">
                          {datos.alcanzados}/{datos.total}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Cumplimiento</p>
                        <p className={`text-lg font-bold ${datos.porcentaje >= 80 ? 'text-green-600' : datos.porcentaje >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {datos.porcentaje}%
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Matrix Legend */}
      <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
        <span className="font-semibold">Criterios de Riesgo:</span>
        <span className="ml-2">🔴 <strong>Crítico:</strong> A1-A5, B2-B5, C4-C5</span>
        <span className="ml-2">🟠 <strong>Alto:</strong> A2-A3, B1, B3-B4, C3, D5</span>
        <span className="ml-2">🟡 <strong>Medio:</strong> A4, B1, C1-C2, D3-D4, E5</span>
        <span className="ml-2">🟢 <strong>Bajo:</strong> C1, D1-D2, E1-E4</span>
      </div>

      {/* Matriz Rows - MEJORA a) Tarjetas colapsables */}
      <div className="space-y-4">
        {rows.map((row) => {
          const isExpanded = expandedRows.has(row.id);
          const implementacionStatus = row.objetivoLogrado === 'SI' ? '✓ SI' : '✗ NO';

          return (
            <Card key={row.id} className="border-l-4 border-l-blue-500">
              {/* Header colapsable */}
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  {/* Basura a la izquierda, separada del toggle */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRow(row.id);
                    }}
                    className="text-red-600 hover:bg-red-50 shrink-0 mt-0.5"
                    title="Eliminar fila"
                  >
                    <Trash2 size={14} />
                  </Button>
                  {/* Contenido colapsable */}
                  <div
                    className="flex-1 cursor-pointer hover:bg-slate-50 rounded p-2 transition-colors"
                    onClick={() => toggleRowExpanded(row.id)}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm items-center">
                      <div className="md:col-span-2 font-semibold text-slate-900 truncate">
                        {row.elemento || `Elemento #${row.id}`}
                      </div>
                      <div className="text-slate-600">
                        <span className="font-semibold">{row.foda}</span>
                      </div>
                      <div className="text-slate-600">
                        <span className="font-semibold">{row.sistemaGestion}</span>
                      </div>
                      <div className="flex items-center gap-3 justify-end">
                        <span className={`font-semibold text-xs ${row.objetivoLogrado === 'SI' ? 'text-green-600' : 'text-red-600'}`}>
                          {implementacionStatus}
                        </span>
                        {(row.acciones || []).length > 0 && (
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                            {calcularPorcentajeOTG(row.acciones || [])}%
                          </span>
                        )}
                        {isExpanded ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {/* Contenido expandible */}
              {isExpanded && (
                <CardContent className="space-y-6 border-t pt-6">
                  {/* A. IDENTIFICACIÓN - MEJORA b) */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">A. IDENTIFICACIÓN</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Subproceso</label>
                        <input
                          type="text"
                          value={row.subproceso}
                          onChange={(e) => updateRow(row.id, 'subproceso', e.target.value)}
                          className="w-full border rounded p-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Objetivo de la Política</label>
                        <input
                          type="text"
                          value={row.objetivoPolitica || ''}
                          readOnly
                          className="w-full border rounded p-2 text-sm bg-slate-50 text-slate-700"
                          placeholder="—"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 mt-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Elemento</label>
                        <input
                          type="text"
                          value={row.elemento}
                          onChange={(e) => updateRow(row.id, 'elemento', e.target.value)}
                          className="w-full border rounded p-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">FODA</label>
                        <select
                          value={row.foda}
                          onChange={(e) => updateRow(row.id, 'foda', e.target.value as FODAType)}
                          className="w-full border rounded p-2 text-sm"
                        >
                          <option value="Fortaleza">Fortaleza</option>
                          <option value="Oportunidad">Oportunidad</option>
                          <option value="Debilidad">Debilidad</option>
                          <option value="Amenaza">Amenaza</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Factor</label>
                        <select
                          value={row.factor}
                          onChange={(e) => updateRow(row.id, 'factor', e.target.value as FactorType)}
                          className="w-full border rounded p-2 text-sm"
                        >
                          <option value="Humano">Humano</option>
                          <option value="Tecnológico">Tecnológico</option>
                          <option value="Natural">Natural</option>
                        </select>
                      </div>
                    </div>
                    {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                      <div className="mt-4">
                        <label className="text-xs font-semibold text-slate-600">Consecuencia de la Materialización</label>
                        <Textarea
                          value={row.consecuencia}
                          onChange={(e) => updateRow(row.id, 'consecuencia', e.target.value)}
                          className="w-full text-sm min-h-[80px]"
                        />
                      </div>
                    )}
                    <div className="mt-4">
                      <label className="text-xs font-semibold text-slate-600">Sistema de Gestión</label>
                      <select
                        value={row.sistemaGestion}
                        onChange={(e) => updateRow(row.id, 'sistemaGestion', e.target.value as SistemaGestionType)}
                        className="w-full border rounded p-2 text-sm"
                      >
                        <option value="Calidad">Calidad</option>
                        <option value="Ambiente">Ambiente</option>
                        <option value="SSO">SSO</option>
                        <option value="Seguridad Física">Seguridad Física</option>
                        <option value="Responsabilidad Social">Responsabilidad Social</option>
                        <option value="Otro">Otro</option>
                      </select>
                      {row.sistemaGestion === 'Otro' && (
                        <input
                          type="text"
                          value={row.otroSistemaGestion || ''}
                          onChange={(e) => updateRow(row.id, 'otroSistemaGestion', e.target.value)}
                          placeholder="Especificar"
                          className="w-full border rounded p-2 text-sm mt-2"
                        />
                      )}
                    </div>
                  </div>

                  {/* B. VALORACIÓN - Solo para Debilidades y Amenazas - MEJORA b) */}
                  {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-4">B. VALORACIÓN DE DEBILIDADES Y AMENAZAS</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Probabilidad (A-E)</label>
                          <select
                            value={row.probabilidad || 'A'}
                            onChange={(e) => updateRow(row.id, 'probabilidad', e.target.value as ProbabilidadType)}
                            className="w-full border rounded p-2 text-sm"
                            translate="no"
                          >
                            <option value="A" translate="no">A</option>
                            <option value="B" translate="no">B</option>
                            <option value="C" translate="no">C</option>
                            <option value="D" translate="no">D</option>
                            <option value="E" translate="no">E</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Impacto (1-5)</label>
                          <select
                            value={row.impacto || 1}
                            onChange={(e) => updateRow(row.id, 'impacto', parseInt(e.target.value) as ImpactoType)}
                            className="w-full border rounded p-2 text-sm"
                          >
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Nivel de Riesgo</label>
                          <div
                            className={`w-full border rounded p-2 text-sm font-semibold text-center text-white ${
                              row.nivelRiesgo
                                ? row.estimacion === 'Crítico'
                                  ? 'bg-red-600'
                                  : row.estimacion === 'Alto'
                                    ? 'bg-yellow-500'
                                    : row.estimacion === 'Medio'
                                      ? 'bg-yellow-300 text-slate-700'
                                      : 'bg-green-500'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {row.nivelRiesgo || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* B. PLANIFICACIÓN DE ACCIÓN A TOMAR - MEJORA b) */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">B. PLANIFICACIÓN DE ACCIÓN A TOMAR</h3>
                    <div className="space-y-4">
                      {(row.foda === 'Debilidad' || row.foda === 'Amenaza') ? (
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Acción a Tomar</label>
                          <Textarea
                            value={row.accionATomar}
                            onChange={(e) => updateRow(row.id, 'accionATomar', e.target.value)}
                            className="w-full text-sm min-h-[60px]"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Acción de Aprovechamiento</label>
                          <Textarea
                            value={row.accionATomar}
                            onChange={(e) => updateRow(row.id, 'accionATomar', e.target.value)}
                            className="w-full text-sm min-h-[60px]"
                          />
                        </div>
                      )}
                      {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                        <>
                          <div>
                            <label className="text-xs font-semibold text-slate-600">Plan de Contingencia</label>
                            <Textarea
                              value={row.planContingencia}
                              onChange={(e) => updateRow(row.id, 'planContingencia', e.target.value)}
                              className="w-full text-sm min-h-[60px]"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600">Plan de Continuidad del Negocio</label>
                            <Textarea
                              value={row.planContinuidad}
                              onChange={(e) => updateRow(row.id, 'planContinuidad', e.target.value)}
                              className="w-full text-sm min-h-[60px]"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600">Simulacro</label>
                            <Textarea
                              value={row.simulacro}
                              onChange={(e) => updateRow(row.id, 'simulacro', e.target.value)}
                              className="w-full text-sm min-h-[60px]"
                            />
                          </div>
                        </>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Fecha de Planificación de la Mejora</label>
                          <input
                            type="date"
                            value={row.fechaInicial || ''}
                            onChange={(e) => updateRow(row.id, 'fechaInicial', e.target.value)}
                            className="w-full border rounded p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Fecha Final Prevista</label>
                          <input
                            type="date"
                            value={row.fechaFinalPrevista || ''}
                            onChange={(e) => updateRow(row.id, 'fechaFinalPrevista', e.target.value)}
                            className="w-full border rounded p-2 text-sm"
                          />
                        </div>
                      </div>
                      {row.diasRestantes !== undefined && (
                        <div
                          className={`p-2 rounded text-sm font-semibold text-center ${
                            row.diasRestantes >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          A tiempo: {row.diasRestantes} días {row.diasRestantes >= 0 ? 'restantes' : 'pasados'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* C. COMUNICACIÓN DE ELEMENTOS DEL FODA - MEJORA b) */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">C. COMUNICACIÓN DE ELEMENTOS DEL FODA</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Comunicado</label>
                        <select
                          value={row.comunicado}
                          onChange={(e) => updateRow(row.id, 'comunicado', e.target.value as 'SI' | 'NO')}
                          className={`w-full border rounded p-2 text-sm font-semibold ${
                            row.comunicado === 'SI' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Partes Interesadas Comunicadas</label>
                        <Textarea
                          value={row.partesInteresadas}
                          onChange={(e) => updateRow(row.id, 'partesInteresadas', e.target.value)}
                          className="w-full text-sm min-h-[60px]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Evidencia</label>
                        <Textarea
                          value={row.evidencia}
                          onChange={(e) => updateRow(row.id, 'evidencia', e.target.value)}
                          className="w-full text-sm min-h-[60px]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* D. SEGUIMIENTO Y REEVALUACIÓN - MEJORA b) */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">D. SEGUIMIENTO Y REEVALUACIÓN</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Implantada la Mejora</label>
                        <select
                          value={row.mejoraImplementada}
                          onChange={(e) => updateRow(row.id, 'mejoraImplementada', e.target.value as 'SI' | 'NO')}
                          className={`w-full border rounded p-2 text-sm font-semibold ${
                            row.mejoraImplementada === 'SI' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Observación</label>
                        <Textarea
                          value={row.observacion}
                          onChange={(e) => updateRow(row.id, 'observacion', e.target.value)}
                          className="w-full text-sm min-h-[60px]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Medio de Verificación</label>
                        <Textarea
                          value={row.medioVerificacion}
                          onChange={(e) => updateRow(row.id, 'medioVerificacion', e.target.value)}
                          className="w-full text-sm min-h-[60px]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Fecha de Implementación</label>
                        <input
                          type="date"
                          value={row.fechaImplementacion || ''}
                          onChange={(e) => updateRow(row.id, 'fechaImplementacion', e.target.value)}
                          className="w-full border rounded p-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Implementación Cumplió su Objetivo</label>
                        <select
                          value={row.objetivoLogrado}
                          onChange={(e) => updateRow(row.id, 'objetivoLogrado', e.target.value as 'SI' | 'NO')}
                          className={`w-full border rounded p-2 text-sm font-semibold ${
                            row.objetivoLogrado === 'SI' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </div>

                      {/* Reevaluación - Solo para Debilidades y Amenazas */}
                      {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                        <div className="border-t pt-4">
                          <h4 className="font-semibold text-slate-700 mb-3">Reevaluación de Riesgo</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Probabilidad Nueva (A-E)</label>
                              <select
                                value={row.probabilidadNueva || row.probabilidad || 'A'}
                                onChange={(e) => updateRow(row.id, 'probabilidadNueva', e.target.value as ProbabilidadType)}
                                className="w-full border rounded p-2 text-sm"
                                translate="no"
                              >
                                <option value="A" translate="no">A</option>
                                <option value="B" translate="no">B</option>
                                <option value="C" translate="no">C</option>
                                <option value="D" translate="no">D</option>
                                <option value="E" translate="no">E</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Impacto (sin cambios)</label>
                              <div className="w-full border rounded p-2 text-sm bg-slate-100 text-slate-700 font-semibold">
                                {row.impacto || 'A'}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Nuevo Nivel de Riesgo</label>
                              <div
                                className={`w-full border rounded p-2 text-sm font-semibold text-center text-white ${
                                  row.nivelRiesgoNuevo
                                    ? row.estimacionNueva === 'Crítico'
                                      ? 'bg-red-600'
                                      : row.estimacionNueva === 'Alto'
                                        ? 'bg-yellow-500'
                                        : row.estimacionNueva === 'Medio'
                                          ? 'bg-yellow-300 text-slate-700'
                                          : 'bg-green-500'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {row.nivelRiesgoNuevo || '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* E. OBJETIVOS TÁCTICOS DE GESTIÓN (OTG) */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">E. OBJETIVOS TÁCTICOS DE GESTIÓN (OTG)</h3>
                    <div className="space-y-3">
                      {(row.acciones || []).map((accion) => (
                        <AccionOTGRow
                          key={accion.id}
                          accion={accion}
                          onChange={(updated) => {
                            const newAcciones = (row.acciones || []).map((a) => a.id === updated.id ? updated : a);
                            updateAcciones(row.id, newAcciones);
                          }}
                          onDelete={() => {
                            const newAcciones = (row.acciones || []).filter((a) => a.id !== accion.id);
                            updateAcciones(row.id, newAcciones);
                          }}
                        />
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addAccion(row.id)}
                        className="gap-2 w-full border-dashed"
                      >
                        <Plus size={14} />
                        Agregar Acción OTG
                      </Button>
                      {(row.acciones || []).length > 0 && (
                        <div className="text-right text-sm font-semibold text-blue-700">
                          % Cumplimiento OTG: {calcularPorcentajeOTG(row.acciones || [])}%
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add Row Button */}
      <Button onClick={addRow} className="gap-2">
        <Plus size={16} />
        Agregar Fila
      </Button>

      {/* Export and Last Saved Info */}
      <div className="flex gap-2 mt-6 items-center">
        <Button 
          onClick={() => {
            const exportData = rows.map(row => ({
              id: row.id,
              enunciado: row.elemento || '',
              tipo: (row as any).tipo as 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza',
              sistemaGestion: String(row.sistemaGestion || ''),
              probabilidad: String(row.probabilidad || ''),
              impacto: String(row.impacto || ''),
              nivelRiesgo: String(row.nivelRiesgo || ''),
              evaluacion: String((row as any).evaluacion || '')
            })) as any[];
            exportRiskMatrixToPDF(exportData, processName);
            toast.success('PDF exportado correctamente');
          }}
          className="gap-2 bg-green-600 hover:bg-green-700"
          size="lg"
        >
          <Download size={20} />
          Exportar a PDF
        </Button>
        {lastSaved && (
          <div className="text-xs text-slate-500 ml-auto">
            Guardado: {lastSaved.toLocaleTimeString('es-ES')}
          </div>
        )}
      </div>
    </div>
  );
}
