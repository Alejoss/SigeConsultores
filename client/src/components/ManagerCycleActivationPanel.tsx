import { useMemo } from "react";
import { useLocation } from "wouter";
import { CalendarCheck2, ChevronRight, ClipboardCheck, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function statusLabel(process: any) {
  if (!process.cycle) return { text: "Sin iniciar", className: "bg-slate-100 text-slate-700" };
  if (process.cycle.status === "active") return { text: "Ciclo activo", className: "bg-blue-100 text-blue-800" };
  if (process.cycle.managerApprovalStatus === "approved") return { text: "Aprobado por Gerencia", className: "bg-emerald-100 text-emerald-800" };
  if (process.cycle.managerApprovalStatus === "returned") return { text: "Devuelto para ajuste", className: "bg-amber-100 text-amber-800" };
  if (process.cycle.status === "ready") return { text: "Pendiente de revisión", className: "bg-violet-100 text-violet-800" };
  return { text: "En preparación", className: "bg-slate-100 text-slate-700" };
}

export function ManagerCycleActivationPanel({ companyId }: { companyId: number }) {
  const [, setLocation] = useLocation();
  const activeCycle = trpc.planningCycles.activeYear.useQuery({ companyId }, { enabled: !!companyId });
  const targetYear = activeCycle.data?.isActive ? activeCycle.data.year : new Date().getFullYear() + 1;
  const overview = trpc.planningCycles.managerOverview.useQuery({ companyId, targetYear }, { enabled: !!companyId });

  const counts = useMemo(() => {
    const list = overview.data?.processes || [];
    return {
      pending: list.filter((item: any) => item.cycle?.status === "ready" && item.cycle?.managerApprovalStatus === "pending").length,
      approved: list.filter((item: any) => item.cycle?.managerApprovalStatus === "approved").length,
      returned: list.filter((item: any) => item.cycle?.managerApprovalStatus === "returned").length,
    };
  }, [overview.data]);

  const openReview = (process: any) => {
    localStorage.setItem("selectedCompanyId", String(companyId));
    localStorage.setItem("selectedProcessId", String(process.id));
    localStorage.setItem("selectedProcessName", process.name);
    setLocation(`/process-planning-cycles?processId=${process.id}&companyId=${companyId}`);
  };

  return (
    <details className="mb-8 group">
      <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 select-none list-none">
        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
        <CalendarCheck2 className="w-4 h-4 text-violet-700" />
        Activación de ciclo empresarial
        {counts.pending > 0 && <span className="ml-1 rounded-full bg-violet-600 px-2 py-0.5 text-xs text-white">{counts.pending} por revisar</span>}
      </summary>
      <Card className="mt-4 border-violet-200 bg-gradient-to-br from-violet-50 to-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-violet-950"><ClipboardCheck className="w-5 h-5" /> Revisión gerencial del ciclo {targetYear}</CardTitle>
          <CardDescription>Revise y apruebe cada proceso antes de la activación empresarial única. Los Jefes preparan; el Gerente autoriza.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-lg bg-white border p-3"><p className="text-xs text-slate-500">Por revisar</p><p className="text-2xl font-bold text-violet-700">{counts.pending}</p></div>
            <div className="rounded-lg bg-white border p-3"><p className="text-xs text-slate-500">Aprobados</p><p className="text-2xl font-bold text-emerald-700">{counts.approved}</p></div>
            <div className="rounded-lg bg-white border p-3"><p className="text-xs text-slate-500">Devueltos</p><p className="text-2xl font-bold text-amber-700">{counts.returned}</p></div>
          </div>
          {overview.isLoading ? <p className="text-sm text-slate-500">Cargando procesos…</p> : (
            <div className="space-y-3">
              {overview.data?.processes.map((process: any) => {
                const status = statusLabel(process);
                const summary = process.summary;
                return <div key={process.id} className="rounded-lg border bg-white p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{process.name}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.text}</span></div>
                    {summary && <p className="mt-1 text-xs text-slate-600">{summary.total} decisiones: {summary.migrate} migrar · {summary.close} cerrar · {summary.review} revisar</p>}
                    {process.cycle?.managerReviewNote && <p className="mt-1 text-xs text-amber-700">Observación: {process.cycle.managerReviewNote}</p>}
                  </div>
                  {process.cycle?.status === "ready" && process.cycle?.managerApprovalStatus !== "approved" ? <Button size="sm" onClick={() => openReview(process)}>Revisar decisiones <ChevronRight className="w-4 h-4 ml-1" /></Button> : process.cycle?.managerApprovalStatus === "returned" ? <Button variant="outline" size="sm" onClick={() => openReview(process)}><RotateCcw className="w-4 h-4 mr-1" /> Ver devolución</Button> : null}
                </div>;
              })}
              {!overview.data?.processes.length && <p className="text-sm text-slate-500">Aún no existen procesos para revisar.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </details>
  );
}
