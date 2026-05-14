import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import { ArrowLeft, Plus, Trash2, Save, AlertCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { MatrizFODARow, MatrizFODAIndicadores, FODAType, FactorType, SistemaGestionType, ProbabilidadType, ImpactoType, calcularNivelRiesgo } from '@/types/matrizFODA';
import { useManagerAuth } from '@/_core/hooks/useManagerAuth';
import { useProcessLeaderAuth } from '@/contexts/ProcessLeaderAuthContext';
import { exportRiskMatrixToPDF } from '@/lib/exportRiskMatrixToPDF';
import { exportMatrizFODAToPDF } from '@/lib/exportMatrizFODAToPDF';

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
  const [indicadores, setIndicadores] = useState<MatrizFODAIndicadores>({
    totalPlanificado: 0,
    totalAlcanzado: 0,
    porcentajeComunicado: 0,
    alcancePorSistema: {
      Calidad: { alcanzados: 0, total: 0, porcentaje: 0 },
      Ambiente: { alcanzados: 0, total: 0, porcentaje: 0 },
      SSO: { alcanzados: 0, total: 0, porcentaje: 0 },
      'Seguridad Física': { alcanzados: 0, total: 0, porcentaje: 0 },
      'Responsabilidad Social': { alcanzados: 0, total: 0, porcentaje: 0 },
      Otro: { alcanzados: 0, total: 0, porcentaje: 0 },
    },
  });

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

  // Initialize rows from FODA data (first from matrixData, then from old structure)
  useEffect(() => {
    if (fodaData) {
      try {
        let newRows: MatrizFODARow[] = [];

        // Try to load from matrixData first
        if (fodaData.matrixData) {
          try {
            const parsedMatrix = JSON.parse(fodaData.matrixData);
            if (Array.isArray(parsedMatrix) && parsedMatrix.length > 0) {
              newRows = parsedMatrix;
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
      } catch (error) {
        console.error('Error loading FODA data:', error);
      }
    }
  }, [fodaData]);

  // Calculate indicators whenever rows change
  useEffect(() => {
    const totalPlanificado = rows.length;
    const totalAlcanzado = rows.filter((r) => r.objetivoLogrado === 'SI').length;
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

    setIndicadores({
      totalPlanificado,
      totalAlcanzado,
      porcentajeComunicado,
      alcancePorSistema,
    });
  }, [rows]);

  // Auto-save data whenever rows change
  const saveMatrixMutation = trpc.processFODA.saveMatrixData.useMutation();

  useEffect(() => {
    const saveTimeout = setTimeout(async () => {
      if (rows.length > 0 && processId) {
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
        }
      }
    }, 1000);

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
          <h1 className="text-3xl font-bold text-blue-900">MATRIZ DEL FODA</h1>
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
            <p className="text-2xl font-bold text-blue-600">{indicadores.totalPlanificado}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-600">% Alcanzado</p>
            <p className="text-2xl font-bold text-green-600">{indicadores.totalAlcanzado}</p>
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
              {/* Header colapsable - MEJORA a) */}
              <CardHeader
                className="cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleRowExpanded(row.id)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div className="font-semibold text-slate-900 truncate">
                      {row.elemento || `Elemento #${row.id}`}
                    </div>
                    <div className="text-slate-600">
                      <span className="font-semibold">{row.foda}</span>
                    </div>
                    <div className="text-slate-600">
                      <span className="font-semibold">{row.sistemaGestion}</span>
                    </div>
                    <div className={`font-semibold ${row.objetivoLogrado === 'SI' ? 'text-green-600' : 'text-red-600'}`}>
                      {implementacionStatus}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRow(row.id);
                      }}
                      className="text-red-600"
                    >
                      <Trash2 size={14} />
                    </Button>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
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
                        <label className="text-xs font-semibold text-slate-600">Elemento</label>
                        <input
                          type="text"
                          value={row.elemento}
                          onChange={(e) => updateRow(row.id, 'elemento', e.target.value)}
                          className="w-full border rounded p-2 text-sm"
                        />
                      </div>
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
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                            <option value="E">E</option>
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
                              >
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
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
