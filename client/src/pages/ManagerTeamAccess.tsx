import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, ShieldAlert, UserRoundX, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function ManagerTeamAccess() {
  const [, setLocation] = useLocation();
  const { isManagerLogin, managerCompanyId, isLoading } = useManagerAuth();
  const companyId = managerCompanyId || 0;
  const utils = trpc.useUtils();
  const [reassigningProcessId, setReassigningProcessId] = useState<number | null>(null);
  const [targetProcessId, setTargetProcessId] = useState<string>("");

  const leadersQuery = trpc.teamAccess.listProcessLeaders.useQuery(
    { companyId },
    { enabled: isManagerLogin && companyId > 0 },
  );
  const processesQuery = trpc.processMap.list.useQuery(
    { companyId },
    { enabled: isManagerLogin && companyId > 0 },
  );
  const refresh = async () => {
    await Promise.all([
      utils.teamAccess.listProcessLeaders.invalidate({ companyId }),
      utils.processMap.list.invalidate({ companyId }),
    ]);
  };
  const suspendMutation = trpc.teamAccess.suspendProcessLeader.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Acceso suspendido. La información del proceso se conserva intacta."); },
    onError: error => toast.error(error.message),
  });
  const reactivateMutation = trpc.teamAccess.reactivateProcessLeader.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Acceso reactivado correctamente."); },
    onError: error => toast.error(error.message),
  });
  const reassignMutation = trpc.teamAccess.reassignProcessLeader.useMutation({
    onSuccess: async () => { setReassigningProcessId(null); setTargetProcessId(""); await refresh(); toast.success("Jefe de Proceso reasignado correctamente."); },
    onError: error => toast.error(error.message),
  });

  if (isLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (!isManagerLogin || !companyId) {
    return <div className="min-h-screen grid place-items-center p-6"><Card className="max-w-md"><CardHeader><CardTitle>Acceso restringido</CardTitle><CardDescription>Esta página está disponible únicamente para el Gerente General de la empresa.</CardDescription></CardHeader><CardContent><Button onClick={() => setLocation("/login")}>Ir al inicio de sesión</Button></CardContent></Card></div>;
  }

  const leaders = leadersQuery.data || [];
  const processes = processesQuery.data || [];
  const activeProcessIds = new Set(leaders.filter(leader => leader.status === "active").map(leader => leader.processId));

  return <div className="min-h-screen bg-slate-50 p-4 md:p-6">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><Button variant="outline" size="icon" onClick={() => setLocation("/manager-dashboard")} aria-label="Volver al panel"><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold text-slate-900">Accesos del equipo</h1><p className="mt-1 text-sm text-slate-600">Suspenda, reactive o reasigne Jefes de Proceso sin borrar procesos, documentos, indicadores ni su historial.</p></div></div>
        <Button variant="outline" onClick={() => void leadersQuery.refetch()} disabled={leadersQuery.isFetching} className="gap-2"><RefreshCw className={leadersQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Actualizar</Button>
      </div>

      <Card className="border-blue-200 bg-blue-50/60"><CardContent className="flex gap-3 pt-5"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><p className="text-sm text-blue-950">Suspender un acceso sólo bloquea el inicio de sesión del Jefe. La empresa, los procesos, las planificaciones, los KPI, documentos e históricos permanecen disponibles para una futura reactivación.</p></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-blue-600" />Jefes de Proceso</CardTitle><CardDescription>{leaders.length} acceso{leaders.length === 1 ? "" : "s"} asociado{leaders.length === 1 ? "" : "s"} a esta empresa.</CardDescription></CardHeader><CardContent>
        {leadersQuery.isLoading ? <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" /></div> : leaders.length === 0 ? <p className="rounded-lg border border-dashed py-10 text-center text-slate-500">Aún no hay Jefes de Proceso asignados.</p> : <div className="space-y-3">{leaders.map(leader => {
          const isSuspended = leader.status === "suspended";
          const isReassigning = reassigningProcessId === leader.processId;
          const eligibleProcesses = processes.filter(process => process.id !== leader.processId && !activeProcessIds.has(process.id));
          return <div key={leader.accountRoleId} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{leader.processName}</p><span className={isSuspended ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800" : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"}>{isSuspended ? "Suspendido" : "Activo"}</span></div><p className="mt-1 text-sm text-slate-700">{leader.leaderName || "Jefe de Proceso"}</p><p className="text-sm text-slate-500">{leader.email || "Sin correo registrado"}</p></div><div className="flex flex-wrap gap-2">{isSuspended ? <Button variant="outline" onClick={() => reactivateMutation.mutate({ companyId, processId: leader.processId })} disabled={reactivateMutation.isPending} className="gap-2 border-emerald-300 text-emerald-700"><CheckCircle2 className="h-4 w-4" />Reactivar</Button> : <Button variant="outline" onClick={() => suspendMutation.mutate({ companyId, processId: leader.processId })} disabled={suspendMutation.isPending} className="gap-2 border-amber-300 text-amber-700"><UserRoundX className="h-4 w-4" />Suspender</Button>}<Button variant="outline" onClick={() => { setReassigningProcessId(isReassigning ? null : leader.processId); setTargetProcessId(""); }}>Reasignar</Button></div></div>{isReassigning && <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-end"><div className="space-y-2"><Label>Nuevo Puesto de Trabajo / proceso a cargo</Label><Select value={targetProcessId} onValueChange={setTargetProcessId}><SelectTrigger><SelectValue placeholder="Seleccionar proceso disponible" /></SelectTrigger><SelectContent>{eligibleProcesses.length ? eligibleProcesses.map(process => <SelectItem key={process.id} value={String(process.id)}>{process.name}</SelectItem>) : <SelectItem value="none" disabled>No hay procesos disponibles</SelectItem>}</SelectContent></Select></div><Button disabled={!targetProcessId || reassignMutation.isPending} onClick={() => reassignMutation.mutate({ companyId, fromProcessId: leader.processId, toProcessId: Number(targetProcessId) })}>{reassignMutation.isPending ? "Reasignando..." : "Confirmar reasignación"}</Button></div>}</div>;
        })}</div>}
      </CardContent></Card>
    </div>
  </div>;
}
