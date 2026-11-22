import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, AlertCircle, Download, Check } from 'lucide-react';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { exportFODAToPDF } from "@/lib/exportFODAToPDF";
import { getProcessIdFromSession } from "@/lib/sessionScope";
import { ActivePlanningCycleBadge } from "@/components/ActivePlanningCycleBadge";
import { parseStoredFodaArray } from "@shared/fodaStoredJson";

type FODAType = 'Fortaleza' | 'Oportunidad' | 'Debilidad' | 'Amenaza';

interface FODAElement {
  id: number;
  fodaElementId?: string;
  type: FODAType;
  subprocess: string;
  policyObjectiveId?: number | null;
  policyObjective: string;
  policyObjectiveDescription?: string;
  selectedObjectiveContent: string;
  statement: string;
  description: string;
}

export default function ProcessFODA() {
  const [, setLocation] = useLocation();
  const [processId] = useState(() => {
    const id = getProcessIdFromSession();
    return id !== null && Number.isInteger(id) && id > 0 ? id : null;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const lastHydratedDataRef = useRef<unknown>(undefined);
  const mountedRef = useRef(true);
  const returningRef = useRef(false);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  const [elements, setElements] = useState<FODAElement[]>([
    { id: 1, fodaElementId: crypto.randomUUID(), type: 'Fortaleza', subprocess: '', policyObjectiveId: null, policyObjective: '', selectedObjectiveContent: '', statement: '', description: '' },
  ]);
  const elementsRef = useRef(elements);
  // UI numbering must never replace an existing persistent row identity.
  const storedIdsRef = useRef(new Map<number, unknown>());
  const [subprocesses, setSubprocesses] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const { data: processData, isError: isProcessError } = trpc.processMap.get.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );
  const processName = processData?.id === processId ? processData.name : isProcessError ? "Nombre no disponible" : "Cargando nombre del proceso...";
  const { data: fodaData, isLoading, isFetching: isFodaFetching, isError: isFodaError } = trpc.processFODA.get.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null, staleTime: 0, refetchOnMount: "always" }
  );
  const { data: subprocessMapData } = trpc.subprocessMap.get.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null }
  );
  // The server resolves the company from the authorized process, never from selectedPolicyId.
  const { data: policyObjectivesData, isError: isObjectivesError } = trpc.processFODA.listPolicyObjectives.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: "always" }
  );
  const updateMutation = trpc.processFODA.upsert.useMutation();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

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

  // Reopening must await fresh data rather than hydrate an old cached snapshot.
  // Fresh responses can update a clean form, never an unsaved draft or an in-flight write.
  useEffect(() => {
    if (!processId || fodaData === undefined || isFodaFetching || isFodaError || isSaving
      || savedRevisionRef.current !== revisionRef.current
      || (hydratedRef.current && lastHydratedDataRef.current === fodaData)) return;
    try {
      const groups = [
        { type: 'Fortaleza' as FODAType, data: fodaData?.strengths },
        { type: 'Oportunidad' as FODAType, data: fodaData?.opportunities },
        { type: 'Debilidad' as FODAType, data: fodaData?.weaknesses },
        { type: 'Amenaza' as FODAType, data: fodaData?.threats },
      ];
      const loaded: FODAElement[] = [];
      const storedIds = new Map<number, unknown>();
      for (const group of groups) {
        const parsed = parseStoredFodaArray<FODAElement>(group.data);
        for (const row of parsed) {
          const uiId = loaded.length + 1;
          storedIds.set(uiId, row.id);
          loaded.push({ ...row, id: uiId, type: group.type });
        }
      }
      const next: FODAElement[] = loaded.length ? loaded : [{ id: 1, fodaElementId: crypto.randomUUID(), type: 'Fortaleza', subprocess: '', policyObjectiveId: null, policyObjective: '', selectedObjectiveContent: '', statement: '', description: '' }];
      storedIdsRef.current = storedIds;
      elementsRef.current = next;
      setElements(next);
      lastHydratedDataRef.current = fodaData;
      hydratedRef.current = true;
      setLoadError(false);
      setIsReady(true);
    } catch (error) {
      console.error("Error loading FODA data:", error);
      setLoadError(true);
    }
  }, [fodaData, processId, isFodaFetching, isFodaError, isSaving]);

  const clearAutoSaveTimer = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  };

  const serializeGroup = (rows: FODAElement[], type: FODAType) => JSON.stringify(
    rows.filter(row => row.type === type).map(row => {
      if (!storedIdsRef.current.has(row.id)) return row;
      const { id, ...rest } = row;
      const storedId = storedIdsRef.current.get(id);
      return storedId === undefined ? rest : { ...rest, id: storedId };
    })
  );

  // All callers share one in-flight write. After it finishes, only the newest unsaved revision is written.
  // A failure leaves the draft intact and returns false so VOLVER cannot discard it.
  const flushSave = async (): Promise<boolean> => {
    clearAutoSaveTimer();
    while (mountedRef.current) {
      if (savePromiseRef.current) {
        if (!await savePromiseRef.current) return false;
        continue;
      }
      if (!processId || !hydratedRef.current || savedRevisionRef.current === revisionRef.current) return true;
      clearAutoSaveTimer();
      const revision = revisionRef.current;
      const snapshot = elementsRef.current;
      setIsSaving(true);
      setSaveError(false);
      const pending = (async () => {
        try {
          await updateMutation.mutateAsync({
            processId,
            strengths: serializeGroup(snapshot, 'Fortaleza'),
            opportunities: serializeGroup(snapshot, 'Oportunidad'),
            weaknesses: serializeGroup(snapshot, 'Debilidad'),
            threats: serializeGroup(snapshot, 'Amenaza'),
          });
          savedRevisionRef.current = revision;
          if (mountedRef.current) {
            setLastSaved(new Date());
            setHasUnsavedChanges(savedRevisionRef.current !== revisionRef.current);
          }
          // Refresh the cache after a successful write. A failed refresh is not a failed save;
          // reopening still requires a successful fresh query before enabling edits.
          await utils.processFODA.get.invalidate({ processId }).catch(() => undefined);
          return true;
        } catch (error) {
          if (mountedRef.current) {
            setSaveError(true);
            toast.error(error instanceof Error ? error.message : "Error al guardar el análisis");
          }
          return false;
        } finally {
          if (mountedRef.current) setIsSaving(false);
        }
      })();
      savePromiseRef.current = pending;
      const success = await pending;
      if (savePromiseRef.current === pending) savePromiseRef.current = null;
      if (!success) return false;
    }
    return false;
  };

  // Only explicit user actions schedule autosave; neither hydration nor objective-list refresh does.
  const editElements = (update: (current: FODAElement[]) => FODAElement[]) => {
    if (!hydratedRef.current) return;
    const next = update(elementsRef.current);
    elementsRef.current = next;
    setElements(next);
    revisionRef.current += 1;
    setHasUnsavedChanges(true);
    setSaveError(false);
    clearAutoSaveTimer();
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void flushSave();
    }, 1500);
  };

  const handleBack = async () => {
    if (returningRef.current) return;
    returningRef.current = true;
    setIsReturning(true);
    try {
      if (await flushSave() && mountedRef.current) setLocation("/process-characterization");
    } finally {
      returningRef.current = false;
      if (mountedRef.current) setIsReturning(false);
    }
  };

  const addElement = (type: FODAType) => {
    editElements(current => {
      const newId = Math.max(...current.map(e => e.id), ...Array.from(storedIdsRef.current.keys()), 0) + 1;
      return [...current, { id: newId, fodaElementId: crypto.randomUUID(), type, subprocess: '', policyObjectiveId: null, policyObjective: '', selectedObjectiveContent: '', statement: '', description: '' }];
    });
  };

  const deleteElement = (id: number) => {
    editElements(current => current.filter(e => e.id !== id));
  };

  const updateElement = (id: number, field: keyof FODAElement, value: string) => {
    editElements(current => current.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleObjectiveChange = (elementId: number, selectedObjectiveId: string) => {
    const fullObjective = policyObjectivesData?.find(obj => obj.id === Number(selectedObjectiveId));
    // Historical IDs are display-only, never silently converted to an empty/new link.
    if (selectedObjectiveId && !fullObjective) return;
    const content = fullObjective ? `${fullObjective.objective}\n\n${fullObjective.description || ''}` : '';
    editElements(current => current.map(e => e.id === elementId ? {
      ...e,
      policyObjectiveId: fullObjective?.id ?? null,
      policyObjective: fullObjective?.objective ?? '',
      policyObjectiveDescription: fullObjective?.description ?? '',
      selectedObjectiveContent: content,
    } : e));
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

  const fortalezas = elements.filter(e => e.type === 'Fortaleza');
  const oportunidades = elements.filter(e => e.type === 'Oportunidad');
  const debilidades = elements.filter(e => e.type === 'Debilidad');
  const amenazas = elements.filter(e => e.type === 'Amenaza');

  const renderFODACard = (title: string, type: FODAType, items: FODAElement[], bgColor: string, borderColor: string, buttonText: string) => (
    <Card className={`border-2 ${borderColor}`}>
      <CardHeader className={bgColor}>
        <CardTitle className={borderColor.replace('border-', 'text-')}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {items.map((element) => {
          const hasObjectiveId = element.policyObjectiveId !== null && element.policyObjectiveId !== undefined;
          const hasHistoricalText = Boolean(element.policyObjective || element.selectedObjectiveContent || element.policyObjectiveDescription);
          const missingObjective = hasObjectiveId && !policyObjectivesData?.some(obj => obj.id === element.policyObjectiveId);
          const isHistorical = hasObjectiveId ? policyObjectivesData !== undefined && missingObjective : hasHistoricalText;
          return (
            <div key={element.id} className="border rounded-lg p-3 space-y-2 bg-slate-50">
              <div className="flex gap-2 items-start">
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Subproceso</label>
                    <select
                      aria-label="Subproceso"
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
                      aria-label="Objetivo de la Política"
                      value={element.policyObjectiveId ?? ''}
                      disabled={policyObjectivesData === undefined}
                      onChange={(e) => handleObjectiveChange(element.id, e.target.value)}
                      className="w-full text-xs border rounded p-2 min-h-8"
                    >
                      <option value="" disabled={hasHistoricalText && !hasObjectiveId}>
                        {hasHistoricalText && !hasObjectiveId
                          ? `Objetivo histórico: ${element.policyObjective || element.selectedObjectiveContent}`
                          : 'Seleccionar objetivo...'}
                      </option>
                      {missingObjective && (
                        <option value={element.policyObjectiveId!} disabled>
                          {policyObjectivesData === undefined ? 'Objetivo guardado' : 'Objetivo histórico'}: {element.policyObjective || `ID ${element.policyObjectiveId}`}
                        </option>
                      )}
                      {(policyObjectivesData || []).map(obj => (
                        <option key={obj.id} value={obj.id}>{obj.objective}</option>
                      ))}
                    </select>
                    {isHistorical && (
                      <p className="mt-1 text-xs text-slate-500">Objetivo histórico; selecciona uno vigente si deseas actualizar el vínculo</p>
                    )}
                  </div>

                  {element.selectedObjectiveContent && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Objetivo Seleccionado</label>
                      <Textarea
                        aria-label="Objetivo Seleccionado"
                        value={element.selectedObjectiveContent}
                        readOnly
                        className="text-sm min-h-[100px] bg-blue-50 border-blue-300"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-600">Enunciado</label>
                    <Textarea
                      aria-label="Enunciado"
                      value={element.statement}
                      onChange={(e) => updateElement(element.id, 'statement', e.target.value)}
                      placeholder="Define brevemente esta fortaleza/oportunidad/debilidad/amenaza..."
                      className="text-sm min-h-[60px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">Descripción (Justificación)</label>
                    <Textarea
                      aria-label="Descripción (Justificación)"
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
                  aria-label={`Eliminar ${type}`}
                  onClick={() => deleteElement(element.id)}
                  className="text-red-600 hover:text-red-700 h-fit mt-6"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          );
        })}
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
      <div className="flex flex-wrap gap-3 items-start justify-between mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold text-blue-900">ANÁLISIS FODA</h1><ActivePlanningCycleBadge companyId={Number(localStorage.getItem("selectedCompanyId"))} /></div>
          <p className="text-slate-600 mt-2">Proceso: <strong>{processName}</strong></p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" className={`text-xs ${saveError ? 'text-amber-700' : 'text-slate-500'}`}>
            {isSaving ? 'Guardando...' : saveError ? 'No se pudo guardar; los cambios siguen en el formulario.' : hasUnsavedChanges ? 'Cambios pendientes...' : lastSaved ? (
              <span className="text-green-600 flex items-center gap-1">
                <Check size={12} /> Guardado a las {lastSaved.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : 'Autoguardado activado'}
          </span>
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isReturning}
            className="gap-2"
          >
            <ArrowLeft size={16} />
            VOLVER
          </Button>
        </div>
      </div>

      {!isReady ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600" role={loadError || isFodaError ? 'alert' : undefined}>
              {loadError || isFodaError ? 'No se pudo cargar el análisis FODA. No se han modificado los datos guardados.' : isLoading ? 'Cargando análisis FODA...' : 'Esperando el análisis FODA...'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {isObjectivesError && <p className="text-xs text-slate-500">No se pudieron actualizar los objetivos. Los vínculos guardados se conservan.</p>}
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
