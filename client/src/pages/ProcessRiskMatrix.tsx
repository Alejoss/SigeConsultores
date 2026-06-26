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

  const pct = calcularPorcentajeAccion(accion);

  return (
    <div className="border rounded-lg p-4 bg-sky-50 border-sky-200 space-y-4 relative">
      {/* Fila 1: Descripción de la acción (ocupa todo el ancho) */}
      <div>
        <label className="text-xs font-semibold text-slate-600">Descripción de la Acción</label>
        <textarea
          defaultValue={accion.accion}
          onBlur={(e) => update('accion', e.target.value)}
          rows={2}
          className="w-full border rounded p-2 text-sm resize-y mt-1"
          placeholder="Describe la acción a tomar..."
        />
      </div>

      {/* Fila 2: Punto de Partida + Punto de Llegada + Unidad de Medida */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            className="w-full border rounded p-2 text-sm mt-1"
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
            className="w-full border rounded p-2 text-sm mt-1"
            placeholder="100"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Unidad de Medida</label>
          <input
            type="text"
            defaultValue={accion.unidadMedidaAccion || ''}
            onBlur={(e) => update('unidadMedidaAccion', e.target.value)}
            className="w-full border rounded p-2 text-sm mt-1"
            placeholder="ej: capacitaciones, kg, %..."
          />
        </div>
      </div>

      {/* Fila 3: Ponderación + Responsable + Fecha de Implementación */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            className="w-full border rounded p-2 text-sm mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Responsable</label>
          <input
            type="text"
            defaultValue={accion.responsable}
            onBlur={(e) => update('responsable', e.target.value)}
            className="w-full border rounded p-2 text-sm mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Fecha de Implementación</label>
          <input
            type="date"
            defaultValue={accion.fechaImplementacion}
            onBlur={(e) => update('fechaImplementacion', e.target.value)}
            className="w-full border rounded p-2 text-sm mt-1"
          />
        </div>
      </div>

      {/* Fila 4: Tipo de Seguimiento */}
      <div>
        <label className="text-xs font-semibold text-slate-600">Tipo de Seguimiento</label>
        <select
          value={accion.tipoSeguimiento}
          onChange={(e) => update('tipoSeguimiento', e.target.value as TrackingOTGType)}
          className="w-full border rounded p-2 text-sm mt-1"
        >
          <option value="puntual">Puntual (valor directo)</option>
          <option value="mensual_sumatoria">Mensual Sumatoria (12 meses)</option>
          <option value="mensual_promedio">Mensual Promedio (12 meses)</option>
          <option value="mensual_checklist">Lista de Verificación Mensual</option>
        </select>
      </div>

      {/* Campos según tipo de seguimiento */}
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
            className="w-full border rounded p-2 text-sm mt-1"
          />
        </div>
      )}

      {(accion.tipoSeguimiento === 'mensual_sumatoria' || accion.tipoSeguimiento === 'mensual_promedio') && (
        <div className="space-y-3">
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
          <div className="text-sm text-slate-600 bg-blue-50 border border-blue-200 rounded p-2">
            {accion.tipoSeguimiento === 'mensual_sumatoria' ? (
              <>Total acumulado: <strong>{((accion.monthlyValues || Array(12).fill(0)).reduce((s: number, v: number) => s + (v || 0), 0)).toFixed(2)}{accion.unidadMedidaAccion ? ` ${accion.unidadMedidaAccion}` : ''}</strong></>
            ) : (
              <>Promedio: <strong>{(() => { const vals = accion.monthlyValues || Array(12).fill(0); const nz = vals.filter((v: number) => v !== 0); return nz.length > 0 ? (nz.reduce((s: number, v: number) => s + v, 0) / nz.length).toFixed(2) : '0.00'; })()}{accion.unidadMedidaAccion ? ` ${accion.unidadMedidaAccion}` : ''}</strong></>
            )}
          </div>
        </div>
      )}

      {accion.tipoSeguimiento === 'mensual_checklist' && (
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-600 block">Lista de Verificación Mensual</label>
          <div className="flex gap-2 flex-wrap">
            {MONTHS_SHORT.map((mes, idx) => {
              const checked = (accion.checklistValues || Array(12).fill(false))[idx];
              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateChecklist(idx, !checked)}
                    className={`w-9 h-9 rounded border-2 transition-all flex items-center justify-center text-sm font-bold cursor-pointer ${checked ? 'bg-green-500 border-green-600 text-white hover:bg-green-600' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`}
                  >
                    {checked ? '✓' : ''}
                  </button>
                  <span className="text-xs text-slate-600 font-semibold">{mes}</span>
                </div>
              );
            })}
          </div>
          <div className="text-sm text-slate-600 bg-blue-50 border border-blue-200 rounded p-2">
            Meses cumplidos: <strong>{(accion.checklistValues || Array(12).fill(false)).filter(Boolean).length} / 12</strong>
          </div>
        </div>
      )}

      {/* % Completado + botón Eliminar */}
      <div className="flex items-center justify-between pt-2 border-t border-sky-200">
        <button
          onClick={onDelete}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded transition-colors"
          title="Eliminar acción"
        >
          Eliminar
        </button>
        <div className="text-sm font-semibold">
          % Completado: <span className="text-blue-700 font-bold">{pct}%</span>
        </div>
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
        const filtered = prev.filter(r => !r.elemento || fodaStatements.has(r.elemento));
        if (toAdd.length === 0 && filtered.length === prev.length) return prev;
        return [...filtered, ...toAdd];
      });
    } catch (e) {
      console.error('Error syncing FODA to OTG:', e);
    }
  }, [fodaData]);

  // Initialize rows from FODA data — only on first load
  useEffect(() => {
    if (fodaData && !initialLoadDoneRef.current) {
      try {
        let newRows: MatrizFODARow[] = [];

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

        if (fodaData.matrixData) {
          try {
            const parsedMatrix = JSON.parse(fodaData.matrixData);
            if (Array.isArray(parsedMatrix) && parsedMatrix.length > 0) {
              newRows = parsedMatrix.map((row: any) => ({
                ...row,
                objetivoPolitica: row.objetivoPolitica || fodaLookup[row.elemento] || '',
              }));
            }
          } catch (e) {
            console.error('Error parsing matrixData:', e);
          }
        }

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

  // Calculate indicators
  const indicadores = useMemo<MatrizFODAIndicadores>(() => {
    const totalPlanificado = rows.length;
    const totalAlcanzadoCount = rows.filter((r) => r.objetivoLogrado === 'SI').length;
    const totalAlcanzado = totalPlanificado > 0 ? Math.round((totalAlcanzadoCount / totalPlanificado) * 100) : 0;
    const porcentajeComunicado = totalPlanificado > 0 ? Math.round((rows.filter((r) => r.comunicado === 'SI').length / totalPlanificado) * 100) : 0;

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

    Object.keys(alcancePorSistema).forEach((sistema) => {
      const key = sistema as keyof typeof alcancePorSistema;
      if (alcancePorSistema[key].total > 0) {
        alcancePorSistema[key].porcentaje = Math.round((alcancePorSistema[key].alcanzados / alcancePorSistema[key].total) * 100);
      }
    });

    return { totalPlanificado, totalAlcanzado, porcentajeComunicado, alcancePorSistema };
  }, [rows]);

  const saveMatrixMutation = trpc.processFODA.saveMatrixData.useMutation();

  // Auto-save
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const saveTimeout = setTimeout(async () => {
      if (rows.length > 0 && processId && !savingRef.current) {
        savingRef.current = true;
        setIsAutoSaving(true);
        const matrixDataJson = JSON.stringify(rows);
        try {
          await saveMatrixMutation.mutateAsync({ processId, matrixData: matrixDataJson });
          setIsAutoSaving(false);
          setLastSaved(new Date());
        } catch (error) {
          setIsAutoSaving(false);
          toast.error('Error guardando: ' + (error instanceof Error ? error.message : 'Error desconocido'));
        } finally {
          savingRef.current = false;
        }
      }
    }, 1500);
    return () => clearTimeout(saveTimeout);
  }, [rows, processId, saveMatrixMutation]);

  const updateRow = (id: number, field: keyof MatrizFODARow, value: any) => {
    setRows(rows.map((row) => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };

      if ((field === 'probabilidad' || field === 'impacto') && updated.probabilidad && updated.impacto) {
        const riesgo = calcularNivelRiesgo(updated.probabilidad, updated.impacto);
        if (riesgo) { updated.nivelRiesgo = riesgo.nivelRiesgo; updated.estimacion = riesgo.estimacion; }
      }
      if ((field === 'probabilidadNueva' || field === 'impacto') && updated.probabilidadNueva && updated.impacto) {
        const riesgo = calcularNivelRiesgo(updated.probabilidadNueva, updated.impacto);
        if (riesgo) { updated.nivelRiesgoNuevo = riesgo.nivelRiesgo; updated.estimacionNueva = riesgo.estimacion; }
      }
      if (field === 'fechaFinalPrevista' && updated.fechaFinalPrevista) {
        const today = new Date();
        const finalDate = new Date(updated.fechaFinalPrevista);
        updated.diasRestantes = Math.ceil((finalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }
      return updated;
    }));
  };

  const addRow = () => {
    const newId = Math.max(...rows.map((r) => r.id), 0) + 1;
    setRows([...rows, {
      id: newId, subproceso: '', elemento: '', foda: 'Debilidad', factor: 'Humano',
      consecuencia: '', sistemaGestion: 'Calidad', probabilidad: 'A', impacto: 1,
      accionATomar: '', planContingencia: '', planContinuidad: '', simulacro: '',
      comunicado: 'NO', partesInteresadas: '', evidencia: '',
      mejoraImplementada: 'NO', observacion: '', medioVerificacion: '', objetivoLogrado: 'NO',
    }]);
  };

  const deleteRow = (id: number) => setRows(rows.filter((r) => r.id !== id));

  const updateAcciones = (rowId: number, acciones: AccionOTG[]) => {
    setRows(rows.map((row) => {
      if (row.id !== rowId) return row;
      return { ...row, acciones, porcentajeCumplimiento: calcularPorcentajeOTG(acciones) };
    }));
  };

  const addAccion = (rowId: number) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const newAccion: AccionOTG = {
      id: crypto.randomUUID(), accion: '', ponderacion: 0, responsable: '',
      fechaImplementacion: '', tipoSeguimiento: 'puntual', valorPuntual: 0, porcentajeCompletado: 0,
    };
    updateAcciones(rowId, [...(row.acciones || []), newAccion]);
  };

  const toggleRowExpanded = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
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
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">OTG - OBJETIVOS TÁCTICOS DE GESTIÓN</h1>
          <p className="text-slate-600 mt-2">Proceso: <strong>{processName}</strong></p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setIsSaving(true);
              saveMatrixMutation.mutateAsync({ processId: processId || 0, matrixData: JSON.stringify(rows) })
                .then(() => { setIsSaving(false); setLastSaved(new Date()); toast.success('Guardado correctamente'); })
                .catch(() => { setIsSaving(false); toast.error('Error al guardar'); });
            }}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            disabled={isSaving}
          >
            <Save size={16} />
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button
            onClick={() => { exportMatrizFODAToPDF(rows, processName); toast.success('PDF exportado'); }}
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

      {/* Indicadores por Sistema de Gestión */}
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
                        <p className="text-lg font-bold text-blue-600">{datos.alcanzados}/{datos.total}</p>
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

      {/* Criterios de Riesgo */}
      <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
        <span className="font-semibold">Criterios de Riesgo:</span>
        <span className="ml-2">🔴 <strong>Crítico:</strong> A1-A5, B2-B5, C4-C5</span>
        <span className="ml-2">🟠 <strong>Alto:</strong> A2-A3, B1, B3-B4, C3, D5</span>
        <span className="ml-2">🟡 <strong>Medio:</strong> A4, B1, C1-C2, D3-D4, E5</span>
        <span className="ml-2">🟢 <strong>Bajo:</strong> C1, D1-D2, E1-E4</span>
      </div>

      {/* Filas OTG */}
      <div className="space-y-4">
        {rows.map((row) => {
          const isExpanded = expandedRows.has(row.id);
          const pctOTG = calcularPorcentajeOTG(row.acciones || []);

          return (
            <Card key={row.id} className="border-l-4 border-l-blue-500">
              {/* Header colapsable */}
              <CardHeader className="pb-3">
                <div className="flex items-start gap-2">
                  {/* Área clickable para expandir/colapsar */}
                  <div
                    className="flex-1 cursor-pointer hover:bg-slate-50 rounded p-2 transition-colors"
                    onClick={() => toggleRowExpanded(row.id)}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm items-center">
                      <div className="md:col-span-2 font-semibold text-slate-900 truncate">
                        {row.accionATomar || row.elemento || `OTG #${row.id}`}
                      </div>
                      <div className="text-slate-600 text-xs">
                        <span className={`font-semibold px-1.5 py-0.5 rounded text-white text-xs ${
                          row.foda === 'Fortaleza' ? 'bg-green-500' :
                          row.foda === 'Oportunidad' ? 'bg-blue-500' :
                          row.foda === 'Debilidad' ? 'bg-orange-500' : 'bg-red-500'
                        }`}>{row.foda}</span>
                      </div>
                      <div className="text-slate-600 text-xs">
                        <span className="font-semibold">{row.sistemaGestion}</span>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <span className={`font-semibold text-xs ${row.objetivoLogrado === 'SI' ? 'text-green-600' : 'text-red-600'}`}>
                          {row.objetivoLogrado === 'SI' ? '✓ SI' : '✗ NO'}
                        </span>
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {pctOTG}%
                        </span>
                        {isExpanded ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
                      </div>
                    </div>
                  </div>
                  {/* Botón eliminar — separado a la derecha, lejos de la flecha */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); deleteRow(row.id); }}
                    className="text-red-600 hover:bg-red-50 shrink-0 ml-2"
                    title="Eliminar OTG"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardHeader>

              {/* Contenido expandible */}
              {isExpanded && (
                <CardContent className="space-y-6 border-t pt-6">

                  {/* A. IDENTIFICACIÓN */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">A. IDENTIFICACIÓN</h3>

                    {/* Subproceso + Objetivo de la Política */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Subproceso</label>
                        <input
                          type="text"
                          value={row.subproceso}
                          onChange={(e) => updateRow(row.id, 'subproceso', e.target.value)}
                          className="w-full border rounded p-2 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Objetivo de la Política</label>
                        <input
                          type="text"
                          value={row.objetivoPolitica || ''}
                          readOnly
                          className="w-full border rounded p-2 text-sm mt-1 bg-slate-50 text-slate-700"
                          placeholder="—"
                        />
                      </div>
                    </div>

                    {/* Elemento */}
                    <div className="mt-4">
                      <label className="text-xs font-semibold text-slate-600">Elemento (FODA)</label>
                      <input
                        type="text"
                        value={row.elemento}
                        onChange={(e) => updateRow(row.id, 'elemento', e.target.value)}
                        className="w-full border rounded p-2 text-sm mt-1"
                      />
                    </div>

                    {/* FODA + Factor + Sistema de Gestión — en una sola línea */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">FODA</label>
                        <select
                          value={row.foda}
                          onChange={(e) => updateRow(row.id, 'foda', e.target.value as FODAType)}
                          className="w-full border rounded p-2 text-sm mt-1"
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
                          className="w-full border rounded p-2 text-sm mt-1"
                        >
                          <option value="Humano">Humano</option>
                          <option value="Tecnológico">Tecnológico</option>
                          <option value="Natural">Natural</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Sistema de Gestión</label>
                        <select
                          value={row.sistemaGestion}
                          onChange={(e) => updateRow(row.id, 'sistemaGestion', e.target.value as SistemaGestionType)}
                          className="w-full border rounded p-2 text-sm mt-1"
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

                    {/* Consecuencia — solo Debilidad/Amenaza */}
                    {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                      <div className="mt-4">
                        <label className="text-xs font-semibold text-slate-600">Consecuencia de la Materialización</label>
                        <Textarea
                          value={row.consecuencia}
                          onChange={(e) => updateRow(row.id, 'consecuencia', e.target.value)}
                          className="w-full text-sm min-h-[80px] mt-1"
                        />
                      </div>
                    )}

                    {/* Objetivo Táctico de Gestión — campo principal, ocupa toda la línea */}
                    <div className="mt-4">
                      <label className="text-xs font-semibold text-slate-600">Objetivo Táctico de Gestión</label>
                      <Textarea
                        value={row.accionATomar}
                        onChange={(e) => updateRow(row.id, 'accionATomar', e.target.value)}
                        className="w-full text-sm min-h-[70px] mt-1"
                        placeholder="Describe el objetivo táctico de gestión..."
                      />
                    </div>

                    {/* Punto de Partida + Punto de Llegada + Unidad de Medida + Responsable */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Punto de Partida</label>
                        <input
                          type="text"
                          value={(row as any).puntoPartida || ''}
                          onChange={(e) => updateRow(row.id, 'puntoPartida' as any, e.target.value)}
                          className="w-full border rounded p-2 text-sm mt-1"
                          placeholder="Condición inicial"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Punto de Llegada</label>
                        <input
                          type="text"
                          value={(row as any).puntoLlegada || ''}
                          onChange={(e) => updateRow(row.id, 'puntoLlegada' as any, e.target.value)}
                          className="w-full border rounded p-2 text-sm mt-1"
                          placeholder="Meta a alcanzar"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Unidad de Medida</label>
                        <input
                          type="text"
                          value={(row as any).unidadMedida || ''}
                          onChange={(e) => updateRow(row.id, 'unidadMedida' as any, e.target.value)}
                          className="w-full border rounded p-2 text-sm mt-1"
                          placeholder="ej: %, kg, unidades..."
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Responsable</label>
                        <input
                          type="text"
                          value={(row as any).responsableOTG || ''}
                          onChange={(e) => updateRow(row.id, 'responsableOTG' as any, e.target.value)}
                          className="w-full border rounded p-2 text-sm mt-1"
                          placeholder="Nombre del responsable"
                        />
                      </div>
                    </div>
                  </div>

                  {/* B. VALORACIÓN — solo Debilidad/Amenaza */}
                  {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-4">B. VALORACIÓN DE DEBILIDADES Y AMENAZAS</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Probabilidad (A-E)</label>
                          <select
                            value={row.probabilidad || 'A'}
                            onChange={(e) => updateRow(row.id, 'probabilidad', e.target.value as ProbabilidadType)}
                            className="w-full border rounded p-2 text-sm mt-1"
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
                            className="w-full border rounded p-2 text-sm mt-1"
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
                          <div className={`w-full border rounded p-2 text-sm font-semibold text-center text-white mt-1 ${
                            row.nivelRiesgo
                              ? row.estimacion === 'Crítico' ? 'bg-red-600'
                                : row.estimacion === 'Alto' ? 'bg-yellow-500'
                                : row.estimacion === 'Medio' ? 'bg-yellow-300 text-slate-700'
                                : 'bg-green-500'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {row.nivelRiesgo || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* C. OBJETIVOS TÁCTICOS DE GESTIÓN (OTG) — Acciones */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">
                      {(row.foda === 'Debilidad' || row.foda === 'Amenaza')
                        ? 'C. OBJETIVOS TÁCTICOS DE GESTIÓN (OTG)'
                        : 'B. OBJETIVOS TÁCTICOS DE GESTIÓN (OTG)'}
                    </h3>

                    {/* Campos adicionales para Debilidad/Amenaza */}
                    {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                      <div className="space-y-4 mb-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Acción a Tomar</label>
                          <Textarea
                            value={row.accionATomar}
                            onChange={(e) => updateRow(row.id, 'accionATomar', e.target.value)}
                            className="w-full text-sm min-h-[60px] mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Plan de Contingencia</label>
                          <Textarea
                            value={row.planContingencia}
                            onChange={(e) => updateRow(row.id, 'planContingencia', e.target.value)}
                            className="w-full text-sm min-h-[60px] mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Plan de Continuidad del Negocio</label>
                          <Textarea
                            value={row.planContinuidad}
                            onChange={(e) => updateRow(row.id, 'planContinuidad', e.target.value)}
                            className="w-full text-sm min-h-[60px] mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Simulacro</label>
                          <Textarea
                            value={row.simulacro}
                            onChange={(e) => updateRow(row.id, 'simulacro', e.target.value)}
                            className="w-full text-sm min-h-[60px] mt-1"
                          />
                        </div>
                      </div>
                    )}

                    {/* Fechas de planificación */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Fecha de Planificación de la Mejora</label>
                        <input
                          type="date"
                          value={row.fechaInicial || ''}
                          onChange={(e) => updateRow(row.id, 'fechaInicial', e.target.value)}
                          className="w-full border rounded p-2 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Fecha Final Prevista</label>
                        <input
                          type="date"
                          value={row.fechaFinalPrevista || ''}
                          onChange={(e) => updateRow(row.id, 'fechaFinalPrevista', e.target.value)}
                          className="w-full border rounded p-2 text-sm mt-1"
                        />
                      </div>
                    </div>
                    {row.diasRestantes !== undefined && (
                      <div className={`p-2 rounded text-sm font-semibold text-center mb-4 ${row.diasRestantes >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        A tiempo: {row.diasRestantes} días {row.diasRestantes >= 0 ? 'restantes' : 'pasados'}
                      </div>
                    )}

                    {/* Lista de acciones OTG */}
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

                      {/* Botón Agregar nueva acción */}
                      <button
                        onClick={() => addAccion(row.id)}
                        className="w-full py-2 px-4 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold rounded transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus size={14} />
                        Agregar nueva acción
                      </button>

                      {(row.acciones || []).length > 0 && (
                        <div className="text-right text-sm font-semibold text-blue-700 bg-blue-50 p-2 rounded">
                          % Cumplimiento OTG: <span className="text-lg">{calcularPorcentajeOTG(row.acciones || [])}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* D. COMUNICACIÓN DE ELEMENTOS DEL FODA */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">
                      {(row.foda === 'Debilidad' || row.foda === 'Amenaza') ? 'D. COMUNICACIÓN DE ELEMENTOS DEL FODA' : 'C. COMUNICACIÓN DE ELEMENTOS DEL FODA'}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Comunicado</label>
                        <select
                          value={row.comunicado}
                          onChange={(e) => updateRow(row.id, 'comunicado', e.target.value as 'SI' | 'NO')}
                          className={`w-full border rounded p-2 text-sm font-semibold mt-1 ${row.comunicado === 'SI' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Partes Interesadas Comunicadas</label>
                        <Textarea value={row.partesInteresadas} onChange={(e) => updateRow(row.id, 'partesInteresadas', e.target.value)} className="w-full text-sm min-h-[60px] mt-1" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Evidencia</label>
                        <Textarea value={row.evidencia} onChange={(e) => updateRow(row.id, 'evidencia', e.target.value)} className="w-full text-sm min-h-[60px] mt-1" />
                      </div>
                    </div>
                  </div>

                  {/* E. SEGUIMIENTO Y REEVALUACIÓN */}
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-4">
                      {(row.foda === 'Debilidad' || row.foda === 'Amenaza') ? 'E. SEGUIMIENTO Y REEVALUACIÓN' : 'D. SEGUIMIENTO Y REEVALUACIÓN'}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Implantada la Mejora</label>
                        <select
                          value={row.mejoraImplementada}
                          onChange={(e) => updateRow(row.id, 'mejoraImplementada', e.target.value as 'SI' | 'NO')}
                          className={`w-full border rounded p-2 text-sm font-semibold mt-1 ${row.mejoraImplementada === 'SI' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Observación</label>
                        <Textarea value={row.observacion} onChange={(e) => updateRow(row.id, 'observacion', e.target.value)} className="w-full text-sm min-h-[60px] mt-1" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Medio de Verificación</label>
                        <Textarea value={row.medioVerificacion} onChange={(e) => updateRow(row.id, 'medioVerificacion', e.target.value)} className="w-full text-sm min-h-[60px] mt-1" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Fecha de Implementación</label>
                        <input type="date" value={row.fechaImplementacion || ''} onChange={(e) => updateRow(row.id, 'fechaImplementacion', e.target.value)} className="w-full border rounded p-2 text-sm mt-1" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Implementación Cumplió su Objetivo</label>
                        <select
                          value={row.objetivoLogrado}
                          onChange={(e) => updateRow(row.id, 'objetivoLogrado', e.target.value as 'SI' | 'NO')}
                          className={`w-full border rounded p-2 text-sm font-semibold mt-1 ${row.objetivoLogrado === 'SI' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </div>

                      {/* Reevaluación — solo Debilidad/Amenaza */}
                      {(row.foda === 'Debilidad' || row.foda === 'Amenaza') && (
                        <div className="border-t pt-4">
                          <h4 className="font-semibold text-slate-700 mb-3">Reevaluación de Riesgo</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Probabilidad Nueva (A-E)</label>
                              <select
                                value={row.probabilidadNueva || row.probabilidad || 'A'}
                                onChange={(e) => updateRow(row.id, 'probabilidadNueva', e.target.value as ProbabilidadType)}
                                className="w-full border rounded p-2 text-sm mt-1"
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
                              <div className="w-full border rounded p-2 text-sm bg-slate-100 text-slate-700 font-semibold mt-1">{row.impacto || 'A'}</div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Nuevo Nivel de Riesgo</label>
                              <div className={`w-full border rounded p-2 text-sm font-semibold text-center text-white mt-1 ${
                                row.nivelRiesgoNuevo
                                  ? row.estimacionNueva === 'Crítico' ? 'bg-red-600'
                                    : row.estimacionNueva === 'Alto' ? 'bg-yellow-500'
                                    : row.estimacionNueva === 'Medio' ? 'bg-yellow-300 text-slate-700'
                                    : 'bg-green-500'
                                  : 'bg-slate-200 text-slate-600'
                              }`}>
                                {row.nivelRiesgoNuevo || '-'}
                              </div>
                            </div>
                          </div>
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

      {/* Botón Agregar OTG */}
      <Button onClick={addRow} className="gap-2">
        <Plus size={16} />
        Agregar OTG
      </Button>

      {/* Exportar y estado de guardado */}
      <div className="flex gap-2 mt-6 items-center">
        <Button
          onClick={() => {
            const exportData = rows.map(row => ({
              id: row.id,
              enunciado: row.elemento || '',
              tipo: row.foda as 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza',
              sistemaGestion: String(row.sistemaGestion || ''),
              probabilidad: String(row.probabilidad || ''),
              impacto: String(row.impacto || ''),
              nivelRiesgo: String(row.nivelRiesgo || ''),
              evaluacion: '',
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
        {isAutoSaving && <span className="text-xs text-slate-400 ml-2">Guardando...</span>}
        {lastSaved && !isAutoSaving && (
          <div className="text-xs text-slate-500 ml-auto">
            Guardado: {lastSaved.toLocaleTimeString('es-ES')}
          </div>
        )}
      </div>
    </div>
  );
}
