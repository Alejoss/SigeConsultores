import { useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { BarChart2, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { getCompanyIdFromSession } from "@/lib/sessionScope";
import { getOEReturnTab, getProcessQuickHref, positiveScopeId, selectNavigationProcess, type ProcessIndicatorPanel } from "@/lib/processQuickNavigation";

/** Wait on actual mutation lifecycle, not an arbitrary autosave delay. */
export function waitForNavigationMutations(client: QueryClient, timeoutMs = 30_000): Promise<boolean> {
  const cache = client.getMutationCache();
  const observed = new Set(cache.getAll().filter(mutation => mutation.state.status === "pending"));
  if (observed.size === 0) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    const finish = (success: boolean) => { if (done) return; done = true; clearTimeout(timeout); unsubscribe(); resolve(success); };
    const check = () => {
      cache.getAll().filter(mutation => mutation.state.status === "pending").forEach(mutation => observed.add(mutation));
      if (!Array.from(observed).some(mutation => mutation.state.status === "pending")) finish(!Array.from(observed).some(mutation => mutation.state.status === "error"));
    };
    const unsubscribe = cache.subscribe(() => { queueMicrotask(check); });
    const timeout = setTimeout(() => finish(false), timeoutMs);
    check();
  });
}

type Props = {
  processId: number | string | null | undefined;
  companyId?: number | null;
  indicatorPanel?: ProcessIndicatorPanel;
  indicatorLabel?: string;
  beforeNavigate?: () => boolean | Promise<boolean>;
  className?: string;
};
export function ProcessQuickNavigation({ processId, companyId, indicatorPanel, indicatorLabel, beforeNavigate, className = "" }: Props) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const client = useQueryClient();
  const pid = positiveScopeId(processId);
  const requestedCompany = positiveScopeId(companyId) || positiveScopeId(getCompanyIdFromSession());
  // This existing endpoint enforces company AND process access for the current role.
  const process = trpc.processMap.get.useQuery({ processId: pid || 0 }, { enabled: Boolean(pid), retry: false });
  const verifiedCompany = positiveScopeId(process.data?.companyId);
  const validScope = Boolean(pid && verifiedCompany && (!requestedCompany || requestedCompany === verifiedCompany));
  const [busy, setBusy] = useState(false);
  const navigating = useRef(false);
  async function go(destination: "indicators" | "schedule") {
    if (!validScope || !pid || !verifiedCompany || navigating.current) return;
    navigating.current = true;
    setBusy(true);
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      // Allow onBlur/local React state to settle before reading the page's draft.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (beforeNavigate && !(await beforeNavigate())) throw new Error("No se pudo completar el guardado. Tus cambios siguen en esta página; vuelve a intentar.");
      if (!(await waitForNavigationMutations(client))) throw new Error("Hay un guardado pendiente o fallido. Revisa tus cambios antes de salir.");
      if (process.data) selectNavigationProcess(process.data);
      navigate(getProcessQuickHref(destination, pid, verifiedCompany, indicatorPanel, getOEReturnTab(search)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar el guardado antes de navegar.");
    } finally { navigating.current = false; setBusy(false); }
  }
  const label = indicatorLabel || (indicatorPanel === "ote" ? "Ir a Indicadores OTE" : indicatorPanel === "otg" ? "Ir a Indicadores OTG" : indicatorPanel === "partes" ? "Ir a Indicadores de Partes Interesadas" : "Ir a Indicadores del Área");
  return <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Accesos directos del área">
    <Button type="button" size="sm" variant="outline" disabled={!validScope || busy} onClick={() => void go("indicators")} className="gap-2">{busy ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}{label}</Button>
    <Button type="button" size="sm" variant="outline" disabled={!validScope || busy} onClick={() => void go("schedule")} className="gap-2"><CalendarDays size={15} />Ir a Cronograma Consolidado</Button>
    {process.error && <span className="text-xs text-red-700" role="status">No se pudo verificar el acceso a esta área.</span>}
  </div>;
}
