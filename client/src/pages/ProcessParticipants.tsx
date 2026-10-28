import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { Plus, Trash2, AlertCircle, Edit2, ArrowLeft, Download, UsersRound, UserPlus, ChevronDown, ChevronUp, Gauge, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { exportParticipantsToPDF } from "@/lib/exportParticipantsToPDF";
import { getAxisBackPathForRole, getCompanyIdFromSession } from "@/lib/sessionScope";

const MONTHS = [
  [1, "Ene"], [2, "Feb"], [3, "Mar"], [4, "Abr"], [5, "May"], [6, "Jun"],
  [7, "Jul"], [8, "Ago"], [9, "Sep"], [10, "Oct"], [11, "Nov"], [12, "Dic"],
] as const;

const EMPTY_PARTICIPANT = { position: "", objective: "", responsibility: "", authority: "" };
const EMPTY_KPI = { name: "", monthlyTarget: "" };

const formatPercent = (value: number | null | undefined) => value === null || value === undefined
  ? "Pendiente de evaluación"
  : `${value.toFixed(1)}%`;

export default function ProcessParticipants() {
  const [, setLocation] = useLocation();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem("managerCompanyId") !== null || isManagerLogin;
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);
  const [processId, setProcessId] = useState<number | null>(null);
  const [processName, setProcessName] = useState("Proceso");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(EMPTY_PARTICIPANT);
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedParticipantId, setExpandedParticipantId] = useState<number | null>(null);
  const [expandedRoleDetails, setExpandedRoleDetails] = useState<Set<number>>(() => new Set());
  const [workerPicker, setWorkerPicker] = useState<any | null>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(() => new Set());
  const [kpiFormAssignmentId, setKpiFormAssignmentId] = useState<number | null>(null);
  const [kpiDraft, setKpiDraft] = useState(EMPTY_KPI);
  const [payrollAreaSelectionDraft, setPayrollAreaSelectionDraft] = useState<any>({ mode: "none" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedProcessId = localStorage.getItem("selectedProcessId") || params.get("processId");
    const selectedProcessName = localStorage.getItem("selectedProcessName");
    if (selectedProcessId) setProcessId(parseInt(selectedProcessId));
    if (selectedProcessName) setProcessName(selectedProcessName);
  }, []);

  const utils = trpc.useUtils();
  // El contexto general conserva el id del proceso. Participantes se almacena por
  // caracterización, por lo que se resuelve esa relación antes de consultar datos.
  // Si una sesión heredada ya contiene el id de caracterización, el fallback preserva
  // su funcionamiento mientras se completa la transición al contexto correcto.
  const { data: resolvedCharacterization } = trpc.processCharacterization.getByProcessId.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null },
  );
  const { data: processDetails } = trpc.processMap.get.useQuery(
    { processId: processId || 0 },
    { enabled: processId !== null },
  );
  useEffect(() => {
    if (processDetails?.name) setProcessName(processDetails.name);
  }, [processDetails?.name]);
  const processCharacterizationId = resolvedCharacterization?.id || processId || 0;
  const { data: participants = [], isLoading, refetch } = trpc.processParticipants.list.useQuery(
    { companyId, processCharacterizationId },
    { enabled: processId !== null && companyId > 0 },
  );
  const { data: performanceData, isLoading: isLoadingPerformance, refetch: refetchPerformance } = trpc.processParticipants.performanceDashboard.useQuery(
    { companyId, processCharacterizationId, year },
    { enabled: processId !== null && companyId > 0 },
  );
  const { data: payrollAreaOptions, refetch: refetchPayrollArea } = trpc.processParticipants.payrollAreaOptions.useQuery(
    { companyId, processCharacterizationId },
    { enabled: processId !== null && companyId > 0 },
  );

  const refreshPerformance = async () => {
    if (!processId || !companyId) return;
    await utils.processParticipants.performanceDashboard.invalidate({ companyId, processCharacterizationId, year });
    await refetchPerformance();
  };

  const setPayrollAreaSelectionMutation = trpc.processParticipants.setPayrollAreaSelection.useMutation({
    onSuccess: async (result) => {
      toast.success(result.payrollAreaSelection.mode === "all"
        ? "Se asociaron todas las áreas activas de Nómina"
        : `${result.payrollAreaSelection.areas.length} área(s) de Nómina asociada(s)`);
      await utils.processParticipants.payrollAreaOptions.invalidate({ companyId, processCharacterizationId });
      await refetchPayrollArea();
      await refreshPerformance();
    },
    onError: (error: any) => toast.error(error.message || "No fue posible asociar las áreas de Nómina"),
  });
  useEffect(() => {
    if (!payrollAreaOptions?.payrollAreaSelection || setPayrollAreaSelectionMutation.isPending) return;
    setPayrollAreaSelectionDraft(payrollAreaOptions.payrollAreaSelection);
  }, [payrollAreaOptions?.payrollAreaSelection, setPayrollAreaSelectionMutation.isPending]);
  const createMutation = trpc.processParticipants.create.useMutation({
    onSuccess: () => {
      toast.success("Puesto de Trabajo agregado exitosamente");
      setFormData(EMPTY_PARTICIPANT);
      setShowForm(false);
      refetch();
      refreshPerformance();
    },
    onError: (error: any) => toast.error(error.message || "Error al agregar el participante"),
  });
  const updateMutation = trpc.processParticipants.update.useMutation({
    onSuccess: () => {
      toast.success("Puesto de Trabajo actualizado exitosamente");
      setFormData(EMPTY_PARTICIPANT);
      setEditingId(null);
      setShowForm(false);
      refetch();
      refreshPerformance();
    },
    onError: (error: any) => toast.error(error.message || "Error al actualizar el participante"),
  });
  const deleteMutation = trpc.processParticipants.delete.useMutation({
    onSuccess: () => { toast.success("Puesto de Trabajo eliminado"); refetch(); refreshPerformance(); },
    onError: (error: any) => toast.error(error.message || "Error al eliminar el participante"),
  });
  const assignWorkersMutation = trpc.processParticipants.assignWorkers.useMutation({
    onSuccess: (result) => {
      toast.success(result.addedCount === 1 ? "1 trabajador vinculado al Puesto de Trabajo" : `${result.addedCount} trabajadores vinculados al Puesto de Trabajo`);
      setSelectedWorkerIds(new Set());
      setWorkerPicker(null);
      refreshPerformance();
    },
    onError: (error: any) => toast.error(error.message || "No fue posible vincular a los trabajadores"),
  });
  useEffect(() => { setSelectedWorkerIds(new Set()); }, [workerPicker?.participant?.id]);
  const unassignWorkerMutation = trpc.processParticipants.unassignWorker.useMutation({
    onSuccess: () => { toast.success("Trabajador retirado del puesto. Su historial de KPI se conserva."); refreshPerformance(); },
    onError: (error: any) => toast.error(error.message || "No fue posible desvincular al trabajador"),
  });
  const addKpiMutation = trpc.processParticipants.addKpi.useMutation({
    onSuccess: () => { toast.success("KPI agregado"); setKpiDraft(EMPTY_KPI); setKpiFormAssignmentId(null); refreshPerformance(); },
    onError: (error: any) => toast.error(error.message || "No fue posible agregar el KPI"),
  });
  const updateKpiMutation = trpc.processParticipants.updateKpi.useMutation({
    onSuccess: () => refreshPerformance(),
    onError: (error: any) => toast.error(error.message || "No fue posible actualizar el KPI"),
  });
  const deleteKpiMutation = trpc.processParticipants.deleteKpi.useMutation({
    onSuccess: () => { toast.success("KPI eliminado"); refreshPerformance(); },
    onError: (error: any) => toast.error(error.message || "No fue posible eliminar el KPI"),
  });
  const setKpiValueMutation = trpc.processParticipants.setKpiValue.useMutation({
    onSuccess: () => refreshPerformance(),
    onError: (error: any) => toast.error(error.message || "No fue posible guardar el resultado mensual"),
  });

  const handleAddParticipant = async () => {
    if (!formData.position.trim()) return toast.error("Por favor ingresa el nombre del Puesto de Trabajo");
    if (!processId) return toast.error("Por favor selecciona un proceso primero");
    if (editingId) await updateMutation.mutateAsync({ id: editingId, ...formData });
    else await createMutation.mutateAsync({ processCharacterizationId, ...formData, orderIndex: participants.length + 1 });
  };

  const handleEdit = (participant: any) => {
    setEditingId(participant.id);
    setFormData({
      position: participant.position || "",
      objective: participant.objective || "",
      responsibility: participant.responsibility || "",
      authority: participant.authority || "",
    });
    setShowForm(true);
  };

  const saveKpiValue = (kpiId: number, month: number, rawValue: string) => {
    if (!companyId) return;
    const actualValue = rawValue.trim() === "" ? null : Number(rawValue);
    if (actualValue !== null && (!Number.isFinite(actualValue) || actualValue < 0)) {
      toast.error("Ingresa un número igual o mayor a cero");
      return;
    }
    setKpiValueMutation.mutate({ companyId, kpiId, month, actualValue });
  };

  const selectedPayrollAreas = payrollAreaSelectionDraft?.mode === "selected" ? payrollAreaSelectionDraft.areas || [] : [];
  const hasPayrollAreaSelection = payrollAreaSelectionDraft?.mode === "all" || selectedPayrollAreas.length > 0;
  const hasSavedPayrollAreaSelection = payrollAreaOptions?.payrollAreaSelection?.mode === "all"
    || (payrollAreaOptions?.payrollAreaSelection?.mode === "selected" && payrollAreaOptions.payrollAreaSelection.areas.length > 0);
  const togglePayrollArea = (area: string, checked: boolean) => {
    const nextAreas = checked ? [...selectedPayrollAreas, area] : selectedPayrollAreas.filter((selected: string) => selected !== area);
    setPayrollAreaSelectionDraft({ mode: "selected", areas: nextAreas });
  };
  const savePayrollAreaSelection = () => {
    if (payrollAreaSelectionDraft?.mode === "all") {
      setPayrollAreaSelectionMutation.mutate({ companyId, processCharacterizationId, selection: { mode: "all" } });
      return;
    }
    if (!selectedPayrollAreas.length) return toast.error("Selecciona al menos una área específica o marca Todas las áreas");
    setPayrollAreaSelectionMutation.mutate({ companyId, processCharacterizationId, selection: { mode: "selected", areas: selectedPayrollAreas } });
  };

  if (!processId) {
    return <DashboardLayout><Card><CardContent className="pt-6"><div className="flex items-center gap-3 text-slate-600"><AlertCircle size={20} /><p>Por favor, selecciona un proceso primero desde el Mapa de Procesos</p></div><Button className="w-full mt-4" onClick={() => setLocation(getAxisBackPathForRole())}>Volver al Mapa de Procesos</Button></CardContent></Card></DashboardLayout>;
  }
  if (isLoading) {
    return <DashboardLayout><Card><CardContent className="pt-6"><p className="text-center text-slate-600">Cargando participantes...</p></CardContent></Card></DashboardLayout>;
  }

  const participantPerformance = new Map((performanceData?.participants || []).map((row: any) => [row.participant.id, row]));

  return (
    <DashboardLayout>
      <div className="p-6 bg-white min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">PARTICIPANTES DEL PROCESO</h1>
            <p className="text-slate-600 mt-1">Proceso: <span className="font-semibold">{processName}</span></p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/process-characterization")} className="gap-2"><ArrowLeft size={16} />VOLVER</Button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-emerald-500"><CardContent className="pt-5"><p className="text-sm text-slate-600">Puestos de Trabajo</p><p className="mt-1 text-3xl font-bold text-emerald-600">{isLoadingPerformance ? "—" : performanceData?.totalPositions || 0}</p><p className="mt-1 text-xs text-slate-500">Puestos definidos en este proceso</p></CardContent></Card>
          <Card className="border-l-4 border-l-blue-500"><CardContent className="pt-5"><p className="text-sm text-slate-600">Participantes en puestos</p><p className="mt-1 text-3xl font-bold text-blue-700">{isLoadingPerformance ? "—" : performanceData?.totalAssignedWorkers || 0}</p><p className="mt-1 text-xs text-slate-500">Trabajadores actualmente vinculados a un Puesto de Trabajo</p></CardContent></Card>
          <Card className="border-l-4 border-l-amber-500"><CardContent className="pt-5"><p className="text-sm text-slate-600">Pendientes de evaluación</p><p className="mt-1 text-3xl font-bold text-amber-600">{isLoadingPerformance ? "—" : performanceData?.pendingEvaluations || 0}</p><p className="mt-1 text-xs text-slate-500">Trabajadores vinculados sin resultado de KPI en {year}</p></CardContent></Card>
        </div>

        <Card className="border border-violet-200 bg-violet-50/60">
          <CardContent className="flex flex-col gap-4 pt-5">
            <div>
              <p className="font-semibold text-violet-950">Áreas de Nómina asociadas</p>
              <p className="mt-1 text-sm text-violet-800">Elige una, varias o todas las áreas de RR.HH. cuyos trabajadores pueden vincularse a los Puestos de Trabajo de este proceso. El Cargo contractual se conserva sin cambios.</p>
              {payrollAreaOptions?.suggestedPayrollArea && !hasSavedPayrollAreaSelection && <p className="mt-1 text-xs font-medium text-violet-700">Sugerencia automática: {payrollAreaOptions.suggestedPayrollArea}</p>}
            </div>
            <div className="rounded-md border border-violet-200 bg-white p-3">
              <div className="flex items-center gap-2 border-b border-violet-100 pb-3">
                <Checkbox
                  id="payroll-area-all"
                  checked={payrollAreaSelectionDraft?.mode === "all"}
                  disabled={!payrollAreaOptions || setPayrollAreaSelectionMutation.isPending}
                  onCheckedChange={(checked) => setPayrollAreaSelectionDraft(checked === true ? { mode: "all" } : { mode: "selected", areas: selectedPayrollAreas })}
                />
                <Label htmlFor="payroll-area-all" className="cursor-pointer font-semibold text-violet-950">Todas las áreas</Label>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(payrollAreaOptions?.areas || []).map((area) => {
                  const id = `payroll-area-${area}`;
                  return <div key={area} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={payrollAreaSelectionDraft?.mode === "all" || selectedPayrollAreas.includes(area)}
                      disabled={!payrollAreaOptions || payrollAreaSelectionDraft?.mode === "all" || setPayrollAreaSelectionMutation.isPending}
                      onCheckedChange={(checked) => togglePayrollArea(area, checked === true)}
                    />
                    <Label htmlFor={id} className="cursor-pointer text-sm text-slate-700">{area}</Label>
                  </div>;
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">{payrollAreaSelectionDraft?.mode === "all" ? "Se incluirá todo el personal activo de Nómina." : hasPayrollAreaSelection ? `${selectedPayrollAreas.length} área(s) seleccionada(s).` : "Aún no hay áreas seleccionadas."}</p>
                <Button size="sm" onClick={savePayrollAreaSelection} disabled={!payrollAreaOptions || !hasPayrollAreaSelection || setPayrollAreaSelectionMutation.isPending}>
                  {setPayrollAreaSelectionMutation.isPending ? "Guardando…" : "Guardar áreas"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader><CardTitle>{editingId ? "Editar Puesto de Trabajo" : "Agregar Nuevo Puesto de Trabajo"}</CardTitle><CardDescription>Ingresa los detalles del puesto, su objetivo, responsabilidades y autoridad.</CardDescription></CardHeader>
            <CardContent>
              {!showForm ? <Button onClick={() => setShowForm(true)} className="gap-2"><Plus size={16} />Agregar Puesto de Trabajo</Button> : (
                <div className="space-y-4">
                  <div><Label>Nombre del Puesto de Trabajo *</Label><Input className="mt-2" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} placeholder="Ej: Supervisor de Empaque" /></div>
                  <div><Label>Objetivo del Puesto</Label><Textarea className="mt-2" value={formData.objective} onChange={(e) => setFormData({ ...formData, objective: e.target.value })} placeholder="Describe el objetivo principal del puesto" rows={3} /></div>
                  <div><Label>Responsabilidades</Label><Textarea className="mt-2" value={formData.responsibility} onChange={(e) => setFormData({ ...formData, responsibility: e.target.value })} placeholder="Lista las responsabilidades principales" rows={3} /></div>
                  <div><Label>Autoridad</Label><Textarea className="mt-2" value={formData.authority} onChange={(e) => setFormData({ ...formData, authority: e.target.value })} placeholder="Describe la autoridad del cargo" rows={3} /></div>
                  <div className="flex gap-2 pt-2"><Button onClick={handleAddParticipant} disabled={createMutation.isPending || updateMutation.isPending}>{editingId ? "Actualizar" : "Agregar"}</Button><Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setFormData(EMPTY_PARTICIPANT); }}>Cancelar</Button></div>
                </div>
              )}
            </CardContent>
          </Card>

          {participants.length > 0 && <div className="flex justify-end"><Button onClick={() => {
            exportParticipantsToPDF(participants.map((p: any) => ({ id: p.id, nombre: p.position || "", cargo: p.position || "", objetivo: p.objective || "", responsabilidad: p.responsibility || "", autoridad: p.authority || "" })), processName);
            toast.success("PDF exportado correctamente");
          }} className="gap-2 bg-green-600 hover:bg-green-700"><Download size={16} />Exportar a PDF</Button></div>}

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4"><div><CardTitle>Puestos de Trabajo registrados ({participants.length})</CardTitle><CardDescription>Gestiona los trabajadores y KPI de cada puesto. El año seleccionado define la evaluación mostrada.</CardDescription></div><div className="flex shrink-0 flex-col gap-1"><Label htmlFor="evaluation-year" className="text-xs text-slate-600">Año de evaluación</Label><select id="evaluation-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium"><option value={year - 1}>{year - 1}</option><option value={year}>{year}</option><option value={year + 1}>{year + 1}</option></select></div></CardHeader>
            <CardContent>
              {participants.length === 0 ? <p className="text-center text-slate-500 py-8">No hay Puestos de Trabajo registrados aún</p> : (
                <div className="space-y-4">
                  {participants.map((participant: any) => {
                    const row: any = participantPerformance.get(participant.id);
                    const isExpanded = expandedParticipantId === participant.id;
                    const areRoleDetailsExpanded = expandedRoleDetails.has(participant.id);
                    return <div key={participant.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3 mb-3">
                        <div><h3 className="text-lg font-semibold text-blue-900">{participant.position}</h3><div className="flex flex-wrap gap-2 mt-2"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"><UsersRound className="inline h-3.5 w-3.5 mr-1" />{row?.workerCount || 0} trabajador{(row?.workerCount || 0) === 1 ? "" : "es"} por puesto</span><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700"><Gauge className="inline h-3.5 w-3.5 mr-1" />% gestión: {formatPercent(row?.managementPercentage)}</span></div></div>
                        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setExpandedRoleDetails((current) => { const next = new Set(current); if (next.has(participant.id)) next.delete(participant.id); else next.add(participant.id); return next; })} className="gap-1"><ChevronDown size={14} className={areRoleDetailsExpanded ? "rotate-180 transition-transform" : "transition-transform"} />{areRoleDetailsExpanded ? "Ocultar detalles" : "Ver detalles del cargo"}</Button><Button size="sm" variant="outline" onClick={() => setExpandedParticipantId(isExpanded ? null : participant.id)} className="gap-1"><UsersRound size={14} />Trabajadores y KPI {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button><Button size="sm" variant="outline" onClick={() => handleEdit(participant)} className="gap-1"><Edit2 size={14} />Editar</Button><Button size="sm" variant="destructive" onClick={() => confirm("¿Estás seguro de que deseas eliminar este participante?") && deleteMutation.mutate({ id: participant.id, companyId })} className="gap-1"><Trash2 size={14} />Eliminar</Button></div>
                      </div>
                      {areRoleDetailsExpanded && <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                        <div><p className="font-semibold text-slate-700">Objetivo:</p><p className="mt-1 text-slate-600 whitespace-pre-wrap">{participant.objective || "—"}</p></div>
                        <div><p className="font-semibold text-slate-700">Responsabilidades:</p><p className="mt-1 text-slate-600 whitespace-pre-wrap">{participant.responsibility || "—"}</p></div>
                        <div><p className="font-semibold text-slate-700">Autoridad:</p><p className="mt-1 text-slate-600 whitespace-pre-wrap">{participant.authority || "—"}</p></div>
                      </div>}

                      {isExpanded && <div className="mt-5 border-t border-slate-200 pt-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4"><div><h4 className="font-semibold text-slate-800">Trabajadores y KPI — {year}</h4><p className="text-xs text-slate-500">Selecciona trabajadores activos del Área de Nómina asociada y registra sus KPI mensuales con autosave.</p></div><Button size="sm" disabled={!payrollAreaOptions?.payrollArea} onClick={() => setWorkerPicker(row || { participant, availableWorkers: [], workers: [] })} className="gap-1"><UserPlus size={14} />Añadir trabajador</Button></div>
                        {!payrollAreaOptions?.payrollArea ? <div className="rounded-md border border-amber-200 bg-amber-50 p-5 text-center text-sm text-amber-800">Primero selecciona la Área de Nómina asociada al proceso para vincular trabajadores.</div> : !row || row.workers.length === 0 ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">Aún no hay trabajadores vinculados a este Puesto de Trabajo. Selecciona un trabajador activo del Área de Nómina para comenzar.</div> : <div className="space-y-4">{row.workers.map((worker: any) => <div key={worker.assignment.id} className="rounded-lg border border-sky-300 bg-sky-100/85 p-4 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><p className="font-semibold text-slate-800">{worker.employee.fullName}</p><p className="text-xs text-slate-500">C.I. {worker.employee.identityCard} · Área: {worker.employee.area} · Cargo: {worker.employee.position} · Desempeño: <span className="font-semibold text-blue-700">{formatPercent(worker.performance)}</span></p></div><Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => confirm("¿Deseas retirar a este trabajador de este Puesto de Trabajo? No se elimina de Nómina y su historial de KPI se conserva.") && unassignWorkerMutation.mutate({ companyId, assignmentId: worker.assignment.id })}><X size={14} className="mr-1" />Retirar</Button></div>
                          <div className="mt-4 space-y-3">{worker.kpis.map((kpi: any) => { const values = new Map(kpi.values.map((value: any) => [value.month, value.actualValue])); return <div key={kpi.id} className="rounded-md border border-sky-200 bg-white/80 p-3"><div className="grid grid-cols-1 lg:grid-cols-[1fr_130px_auto_auto] gap-2 items-end"><div><Label className="text-xs">KPI</Label><Input defaultValue={kpi.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== kpi.name) updateKpiMutation.mutate({ companyId, kpiId: kpi.id, name: e.target.value.trim(), monthlyTarget: Number(kpi.monthlyTarget) }); }} /></div><div><Label className="text-xs">Meta mensual</Label><Input type="number" min="0.01" step="0.01" defaultValue={String(kpi.monthlyTarget)} onBlur={(e) => { const value = Number(e.target.value); if (value > 0 && value !== Number(kpi.monthlyTarget)) updateKpiMutation.mutate({ companyId, kpiId: kpi.id, name: kpi.name, monthlyTarget: value }); }} /></div><div className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-blue-700">{formatPercent(kpi.percentage)}</div><Button size="sm" variant="ghost" className="text-rose-600" onClick={() => confirm("¿Eliminar este KPI y sus resultados mensuales?") && deleteKpiMutation.mutate({ companyId, kpiId: kpi.id })}><Trash2 size={15} /></Button></div><div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12 gap-2">{MONTHS.map(([month, label]) => <div key={month}><Label className="text-[10px] text-slate-500">{label}</Label><Input type="number" min="0" step="0.01" className="h-8 text-sm" placeholder="—" defaultValue={values.has(month) ? String(values.get(month)) : ""} onBlur={(e) => saveKpiValue(kpi.id, month, e.target.value)} /></div>)}</div></div>; })}</div>
                          {kpiFormAssignmentId === worker.assignment.id ? <div className="mt-3 rounded-md border border-dashed border-blue-300 bg-blue-50 p-3"><p className="text-sm font-semibold text-blue-800 mb-2">Nuevo KPI para {worker.employee.fullName}</p><div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto_auto] gap-2"><Input placeholder="Nombre del KPI" value={kpiDraft.name} onChange={(e) => setKpiDraft({ ...kpiDraft, name: e.target.value })} /><Input type="number" min="0.01" step="0.01" placeholder="Meta mensual" value={kpiDraft.monthlyTarget} onChange={(e) => setKpiDraft({ ...kpiDraft, monthlyTarget: e.target.value })} /><Button size="sm" onClick={() => { const target = Number(kpiDraft.monthlyTarget); if (!kpiDraft.name.trim() || target <= 0) return toast.error("Ingresa un nombre de KPI y una meta mensual mayor a cero"); addKpiMutation.mutate({ companyId, assignmentId: worker.assignment.id, year, name: kpiDraft.name.trim(), monthlyTarget: target }); }}>Añadir</Button><Button size="sm" variant="outline" onClick={() => { setKpiFormAssignmentId(null); setKpiDraft(EMPTY_KPI); }}>Cancelar</Button></div></div> : <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={() => { setKpiFormAssignmentId(worker.assignment.id); setKpiDraft(EMPTY_KPI); }}><Plus size={14} />Aumentar otro KPI</Button>}
                        </div>)}</div>}
                      </div>}
                    </div>;
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!workerPicker} onOpenChange={(open) => { if (!open) { setSelectedWorkerIds(new Set()); setWorkerPicker(null); } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Seleccionar trabajadores</DialogTitle>
            <DialogDescription>Se muestran los trabajadores activos de las áreas de Nómina asociadas que todavía no tienen un Puesto de Trabajo vinculado. Marca uno o varios y vincúlalos en un solo paso.</DialogDescription>
          </DialogHeader>
          {workerPicker && (() => {
            const candidates = (workerPicker.availableWorkers || []).filter((employee: any) => employee.currentProcessParticipantId === null);
            const candidateIds = candidates.map((employee: any) => employee.id);
            const allCandidatesSelected = candidates.length > 0 && candidates.every((employee: any) => selectedWorkerIds.has(employee.id));
            const toggleAllCandidates = (checked: boolean) => setSelectedWorkerIds(checked ? new Set(candidateIds) : new Set());
            const toggleWorker = (employeeId: number, checked: boolean) => setSelectedWorkerIds((current) => {
              const next = new Set(current);
              if (checked) next.add(employeeId); else next.delete(employeeId);
              return next;
            });
            return candidates.length === 0 ? <p className="py-5 text-center text-sm text-slate-500">Todos los trabajadores activos de las áreas seleccionadas ya están vinculados a un Puesto de Trabajo.</p> : <>
              <div className="flex flex-col gap-3 rounded-md border border-blue-100 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2"><Checkbox id="select-all-workers" checked={allCandidatesSelected} onCheckedChange={(checked) => toggleAllCandidates(checked === true)} /><Label htmlFor="select-all-workers" className="cursor-pointer text-sm font-medium text-blue-950">Seleccionar todos los disponibles ({candidates.length})</Label></div>
                <Button size="sm" disabled={!selectedWorkerIds.size || assignWorkersMutation.isPending} onClick={() => assignWorkersMutation.mutate({ companyId, processParticipantId: workerPicker.participant.id, payrollEmployeeIds: Array.from(selectedWorkerIds) })}>{assignWorkersMutation.isPending ? "Vinculando…" : `Vincular ${selectedWorkerIds.size || ""} seleccionado${selectedWorkerIds.size === 1 ? "" : "s"}`}</Button>
              </div>
              <div className="mt-3 space-y-2 max-h-[48vh] overflow-y-auto">
                {candidates.map((employee: any) => {
                  const employeeId = `payroll-worker-${employee.id}`;
                  return <div key={employee.id} className="flex items-center gap-3 rounded-md border p-3"><Checkbox id={employeeId} checked={selectedWorkerIds.has(employee.id)} disabled={assignWorkersMutation.isPending} onCheckedChange={(checked) => toggleWorker(employee.id, checked === true)} /><Label htmlFor={employeeId} className="min-w-0 flex-1 cursor-pointer"><p className="font-medium text-slate-900">{employee.fullName}</p><p className="text-xs text-slate-500">C.I. {employee.identityCard} · Área: {employee.area} · Cargo: {employee.position}</p></Label></div>;
                })}
              </div>
            </>;
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
