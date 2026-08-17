import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CalendarDays, CheckCircle2, CircleAlert, Clock3, History, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  ote: "OTE",
  otg: "OTG",
  stakeholder_action: "Partes interesadas",
  compliance: "Cumplimiento",
  participant_kpi: "KPI de personal",
};

const TYPE_COLORS: Record<string, string> = {
  ote: "border-yellow-300 bg-yellow-50 text-yellow-800",
  otg: "border-violet-300 bg-violet-50 text-violet-800",
  stakeholder_action: "border-sky-300 bg-sky-50 text-sky-800",
  compliance: "border-pink-300 bg-pink-50 text-pink-800",
  participant_kpi: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

function formatPercent(value: unknown) {
  const number = Number(value);
  return `${Number.isFinite(number) ? number.toLocaleString("es-EC", { maximumFractionDigits: 1 }) : "0"}%`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Sin fecha límite";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha límite" : date.toLocaleDateString("es-EC");
}

export default function ProcessPlanningCycles() {
  const [, setLocation] = useLocation();
  const { isManagerLogin } = useManagerAuth();
  const parameters = useMemo(() => new URLSearchParams(window.location.search), []);
  const companyId = Number(parameters.get("companyId") || localStorage.getItem("selectedCompanyId") || 0);
  const processId = Number(parameters.get("processId") || localStorage.getItem("selectedProcessId") || 0);
  const [targetYear, setTargetYear] = useState(Number(parameters.get("targetYear") || new Date().getFullYear() + 1));
  const [view, setView] = useState<"new" | "history">("new");
  const [deadlineValue, setDeadlineValue] = useState("");
  const isManager = isManagerLogin || localStorage.getItem("managerCompanyId") !== null;
  const enabled = companyId > 0 && processId > 0;
  const utils = trpc.useUtils();

  const overviewQuery = trpc.planningCycles.overview.useQuery(
    { companyId, processId, targetYear },
    { enabled },
  );
  const managerQuery = trpc.planningCycles.managerOverview.useQuery(
    { companyId, targetYear },
    { enabled: isManager && companyId > 0 },
  );

  const refresh = async () => {
    await Promise.all([
      utils.planningCycles.overview.invalidate({ companyId, processId, targetYear }),
      utils.planningCycles.managerOverview.invalidate({ companyId, targetYear }),
    ]);
  };

  const prepareMutation = trpc.planningCycles.prepareDraft.useMutation({
    onSuccess: async (result) => {
      toast.success(result.created
        ? `Borrador preparado con ${result.itemCount} elementos para revisar.`
        : "Ya existía un borrador para este ciclo.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const decisionMutation = trpc.planningCycles.updateDecision.useMutation({
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const readyMutation = trpc.planningCycles.markReady.useMutation({
    onSuccess: async () => {
      toast.success("El proceso quedó listo para el nuevo ciclo.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const deadlineMutation = trpc.planningCycles.setDeadline.useMutation({
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const activateMutation = trpc.planningCycles.activateCompanyCycle.useMutation({
    onSuccess: async (result) => {
      toast.success(`Ciclo empresarial activado con ${result.activatedCycles} proceso(s) preparado(s).`);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const overview = overviewQuery.data;
  const decisions = overview?.decisions || [];
  const ready = Boolean(overview?.ready);
  const pendingCount = overview?.pendingCount || 0;
  const scheduleDecisionCount = decisions.filter((decision) => decision.sourceItemKey?.startsWith("schedule:")).length;
  const kpiDecisionCount = decisions.filter((decision) => decision.itemType === "participant_kpi").length;

  if (!enabled) {
    return (
      <DashboardLayout>
        <Card className="m-6 max-w-2xl">
          <CardContent className="p-8 text-center">
            <CircleAlert className="mx-auto mb-3 text-amber-600" size={32} />
            <p className="font-semibold">Seleccione primero una empresa y un proceso.</p>
            <Button className="mt-5" onClick={() => setLocation("/process-map")}>Volver al Mapa de Procesos</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
              <RefreshCw size={17} /> GESTIÓN ANUAL SEGURA
            </div>
            <h1 className="text-3xl font-bold text-blue-900">CICLOS DE PLANIFICACIÓN</h1>
            <p className="mt-1 max-w-3xl text-slate-600">
              Prepare la transición del proceso hacia un nuevo año sin modificar la planificación ni los resultados actuales.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => setLocation(`/process-characterization?processId=${processId}&companyId=${companyId}`)}>
            <ArrowLeft size={16} /> VOLVER
          </Button>
        </div>

        <Alert className="mb-6 border-emerald-200 bg-emerald-50">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          <AlertTitle className="text-emerald-900">Protección de la información actual</AlertTitle>
          <AlertDescription className="text-emerald-800">
            Este módulo trabaja con un borrador y un histórico separado. No elimina, reinicia ni modifica OTE, tareas, KPI, Nómina, Participantes o cronogramas existentes.
          </AlertDescription>
        </Alert>

        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          <Button variant={view === "new" ? "default" : "outline"} onClick={() => setView("new")} className="gap-2">
            <CalendarDays size={16} /> Ciclo nuevo
          </Button>
          <Button variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")} className="gap-2">
            <History size={16} /> Ciclos anteriores
          </Button>
          <div className="ml-auto flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
            <span className="text-slate-500">Año de destino</span>
            <Input
              type="number"
              min={2020}
              max={2100}
              className="h-8 w-24 bg-white text-center font-semibold"
              value={targetYear}
              onChange={(event) => setTargetYear(Number(event.target.value) || new Date().getFullYear() + 1)}
            />
          </div>
        </div>

        {overviewQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" /> Cargando ciclo...</div>
        ) : view === "history" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History size={20} /> Historial del ciclo {targetYear - 1}</CardTitle>
              <CardDescription>Una vez activado el ciclo nuevo, los elementos cerrados se preservan aquí como consulta de solo lectura.</CardDescription>
            </CardHeader>
            <CardContent>
              {overview?.snapshots?.length ? (
                <div className="space-y-3">
                  {overview.snapshots.map((snapshot) => (
                    <div key={snapshot.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Badge className={TYPE_COLORS[snapshot.itemType] || ""}>{TYPE_LABELS[snapshot.itemType] || snapshot.itemType}</Badge>
                          <h3 className="mt-2 font-semibold text-slate-900">{snapshot.title}</h3>
                          {snapshot.description && <p className="mt-1 text-sm text-slate-600">{snapshot.description}</p>}
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-bold text-blue-700">{formatPercent(snapshot.completionPercent)}</p>
                          <p className="text-slate-500">{snapshot.migrationDecision === "migrate" ? "Migrado al ciclo siguiente" : snapshot.migrationDecision === "close" ? "Cerrado en este ciclo" : "Requiere revisión"}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-600">
                  Aún no existen cierres históricos para este proceso. El historial aparecerá aquí cuando el nuevo ciclo sea activado.
                </div>
              )}
            </CardContent>
          </Card>
        ) : !overview?.cycle ? (
          <Card className="overflow-hidden border-blue-200">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-sky-50">
              <CardTitle className="text-xl text-blue-950">Preparar {targetYear} a partir del cierre de {targetYear - 1}</CardTitle>
              <CardDescription>La plataforma reunirá los elementos de planificación del proceso para que usted decida, uno por uno, cuáles continúan.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4"><p className="font-semibold text-yellow-900">Objetivos y tareas</p><p className="mt-1 text-sm text-yellow-800">OTE, objetivos operativos y planificación pendiente.</p></div>
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4"><p className="font-semibold text-sky-900">Gestión y cumplimiento</p><p className="mt-1 text-sm text-sky-800">Acciones con partes interesadas y cumplimientos renovables.</p></div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-900">KPI de personal</p><p className="mt-1 text-sm text-emerald-800">Se revisan como definición anual; los resultados nunca se copian.</p></div>
              </div>
              <Button className="mt-6 gap-2 bg-blue-800 hover:bg-blue-900" disabled={prepareMutation.isPending} onClick={() => prepareMutation.mutate({ companyId, processId, targetYear })}>
                {prepareMutation.isPending ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
                Preparar borrador del nuevo ciclo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-blue-200"><CardContent className="p-5"><p className="text-sm text-slate-600">Actividades del Cronograma</p><p className="mt-1 text-3xl font-bold text-blue-800">{scheduleDecisionCount}</p><p className="mt-1 text-xs text-slate-500">Misma fuente del Cronograma Consolidado</p></CardContent></Card>
              <Card className="border-emerald-200"><CardContent className="p-5"><p className="text-sm text-slate-600">KPI anuales a revisar</p><p className="mt-1 text-3xl font-bold text-emerald-700">{kpiDecisionCount}</p><p className="mt-1 text-xs text-slate-500">Definiciones; no se copian resultados</p></CardContent></Card>
              <Card className={pendingCount ? "border-amber-200" : "border-emerald-200"}><CardContent className="p-5"><p className="text-sm text-slate-600">Decisiones pendientes</p><p className={`mt-1 text-3xl font-bold ${pendingCount ? "text-amber-600" : "text-emerald-700"}`}>{pendingCount}</p><p className="mt-1 text-xs text-slate-500">Total de elementos: {decisions.length}</p></CardContent></Card>
              <Card className="border-slate-200"><CardContent className="p-5"><p className="text-sm text-slate-600">Estado del proceso</p><p className="mt-1 font-bold text-slate-800">{overview?.cycle.status === "ready" ? "Listo para activar" : "En revisión"}</p></CardContent></Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Decisiones de transición</CardTitle>
                <CardDescription>Elija el destino de cada elemento. La decisión se guarda de inmediato y puede cambiarse mientras el ciclo esté en revisión.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {decisions.length ? decisions.map((decision) => (
                  <div key={decision.id} className="rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={TYPE_COLORS[decision.itemType] || ""}>{TYPE_LABELS[decision.itemType] || decision.itemType}</Badge>
                          <span className="text-sm font-semibold text-blue-700">Cumplimiento al cierre: {formatPercent(decision.completionPercent)}</span>
                        </div>
                        <h3 className="mt-2 font-semibold text-slate-900">{decision.title}</h3>
                        {decision.description && <p className="mt-1 text-sm text-slate-600">{decision.description}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button size="sm" variant={decision.decision === "migrate" ? "default" : "outline"} className={decision.decision === "migrate" ? "bg-emerald-600 hover:bg-emerald-700" : "border-emerald-300 text-emerald-700"} disabled={decisionMutation.isPending || overview?.cycle.status === "ready"} onClick={() => decisionMutation.mutate({ companyId, decisionId: decision.id, decision: "migrate" })}><CheckCircle2 size={15} /> Migrar</Button>
                        <Button size="sm" variant={decision.decision === "close" ? "default" : "outline"} className={decision.decision === "close" ? "bg-slate-700 hover:bg-slate-800" : ""} disabled={decisionMutation.isPending || overview?.cycle.status === "ready"} onClick={() => decisionMutation.mutate({ companyId, decisionId: decision.id, decision: "close" })}><XCircle size={15} /> No migrar</Button>
                        <Button size="sm" variant={decision.decision === "review" ? "default" : "outline"} className={decision.decision === "review" ? "bg-amber-600 hover:bg-amber-700" : "border-amber-300 text-amber-700"} disabled={decisionMutation.isPending || overview?.cycle.status === "ready"} onClick={() => decisionMutation.mutate({ companyId, decisionId: decision.id, decision: "review" })}><Clock3 size={15} /> Revisar</Button>
                      </div>
                    </div>
                  </div>
                )) : <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-600">El proceso no tiene elementos anuales disponibles para este cierre.</div>}
              </CardContent>
            </Card>

            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-5 md:flex-row md:items-center md:justify-between">
              <div><p className="font-semibold text-blue-950">Finalizar la revisión del proceso</p><p className="text-sm text-blue-800">Solo se habilita cuando los {decisions.length} elementos tengan una decisión.</p></div>
              <Button disabled={!ready || readyMutation.isPending || overview?.cycle.status === "ready"} className="bg-blue-800 hover:bg-blue-900" onClick={() => overview?.cycle && readyMutation.mutate({ companyId, cycleId: overview.cycle.id })}>
                {readyMutation.isPending && <Loader2 className="mr-2 animate-spin" size={16} />}
                {overview?.cycle.status === "ready" ? "Proceso listo" : "Marcar proceso como listo"}
              </Button>
            </div>
          </>
        )}

        {isManager && (
          <Card className="mt-8 border-violet-200">
            <CardHeader className="bg-violet-50">
              <CardTitle className="text-violet-950">Control gerencial del ciclo {targetYear}</CardTitle>
              <CardDescription>Esta sección consolida la preparación de todos los procesos. La activación empresarial solo cambia el estado de los borradores y genera el histórico; no borra datos operativos.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="w-full md:max-w-xs"><Label htmlFor="cycle-deadline">Fecha límite de preparación</Label><Input id="cycle-deadline" type="date" value={deadlineValue || (managerQuery.data?.activation?.deadline ? new Date(managerQuery.data.activation.deadline).toISOString().slice(0, 10) : "")} onChange={(event) => setDeadlineValue(event.target.value)} onBlur={() => deadlineMutation.mutate({ companyId, targetYear, deadline: deadlineValue || null })} /></div>
                <p className="text-sm text-slate-600">Estado empresarial: <span className="font-semibold">{managerQuery.data?.activation?.status === "active" ? "Ciclo activado" : "En preparación"}</span></p>
              </div>
              <div className="space-y-2">
                {managerQuery.data?.processes.map((process) => (
                  <div key={process.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3">
                    <div><p className="font-semibold text-slate-900">{process.name}</p><p className="text-sm text-slate-500">{process.macroProcess || "Proceso"}</p></div>
                    <Badge className={process.cycle?.status === "ready" ? "bg-emerald-100 text-emerald-800" : process.cycle?.status === "active" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}>{process.cycle?.status === "ready" ? "Listo" : process.cycle?.status === "active" ? "Activo" : process.cycle?.status === "in_review" ? "En revisión" : "Sin iniciar"}</Badge>
                  </div>
                ))}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button className="mt-6 bg-violet-700 hover:bg-violet-800" disabled={activateMutation.isPending || managerQuery.data?.activation?.status === "active"}>Activar ciclo empresarial {targetYear}</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>¿Activar el ciclo empresarial {targetYear}?</AlertDialogTitle><AlertDialogDescription>Se conservarán snapshots históricos de los procesos listos y se activarán sus borradores. Los procesos sin preparar quedarán identificados como pendientes, sin borrar su información actual.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => activateMutation.mutate({ companyId, targetYear })}>Activar de forma controlada</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
