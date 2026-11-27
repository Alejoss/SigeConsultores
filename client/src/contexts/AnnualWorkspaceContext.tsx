import { useTeamAccessState } from "@/contexts/TeamAccessContext";
import { setClientTeamPolicy } from "@/lib/teamAccess";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { getCompanyIdFromSession, getProcessIdFromSession } from "@/lib/sessionScope";
import { getAnnualDocumentScope, getSelectedManagementYear, persistManagementYear, type AnnualOverview } from "@/lib/annualWorkspace";
import { flushAnnualExitGuards, waitForAnnualRequests, hasUnsafeAnnualDraft, markAnnualDraftEdited } from "@/lib/annualNavigation";
import { waitForNavigationMutations } from "@/components/ProcessQuickNavigation";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const Context = createContext<{ companyId: number | null; year: number; overview?: AnnualOverview; closed: boolean }>({ companyId: null, year: 2026, closed: false });
export function useAnnualWorkspace() { return useContext(Context); }
const publicRoutes = /^\/(?:$|login|home|manager-access(?:-success)?|manager-confirmation|process-leader-access-success|setup-|forgot-|reset-|change-password|request-access|process-owner-invitation|process-leader-invitation|process-leader-pin-recovery|admin-)/;
const processBusinessRoutes = /^\/(?:process-(?:characterization|output-release|resources|stakeholder-criticality|foda|risk-matrix|tactical-objectives|compliances|trainings|schedule|indicators|meetings)|tactical-(?:definition|planning)|subprocess-map|flowchart|procedures-characterization|linked-commitments)(?:\/|$)/;
export function AnnualWorkspaceFrame({ children }: { children: ReactNode }) {
  const team = useTeamAccessState();
  const [location, navigate] = useLocation();
  const currentRoute = useRef(location);
  const search = useSearch();
  const client = useQueryClient();
  const scope = getAnnualDocumentScope();
  const urlCompanyId = Number(new URLSearchParams(window.location.search).get("companyId"));
  const companyId = Number.isSafeInteger(urlCompanyId) && urlCompanyId > 0 ? urlCompanyId : scope.companyId || getCompanyIdFromSession();
  const year = getSelectedManagementYear(companyId);
  const { user } = useAuth();
  const { isManagerLogin } = useManagerAuth();
  useEffect(() => { currentRoute.current = location; }, [location]);
  const visible = Boolean(companyId && !publicRoutes.test(location));
  const list = trpc.annualWorkspaces.list.useQuery({ companyId: companyId || 0 }, { enabled: visible, retry: false, refetchOnWindowFocus: false });
  const overviewQuery = trpc.annualWorkspaces.overview.useQuery({ companyId: companyId || 0, year }, { enabled: visible, retry: false, refetchOnWindowFocus: false });
  const overview = overviewQuery.data as AnnualOverview | undefined;
  const [busy, setBusy] = useState(false);
  const activeSwitch = useRef(false);
  const processId = getProcessIdFromSession();
  const processStatus = overview?.processes.find(process => process.id === processId);
  const pending = Boolean(processBusinessRoutes.test(location) && overview && processId && processStatus?.status !== "incorporated");
  const companyChanged = Boolean(visible && companyId !== scope.companyId);
  const root = useRef<HTMLDivElement>(null);
  const closed = overview?.workspace.status === "closed";
  const accessReadOnly = team.isProcessLeader && (team.readOnly || team.isChecking);
  useEffect(() => {
    setClientTeamPolicy(team.isProcessLeader ? { access: team.access, companyId: team.companyId || 0, readOnly: Boolean(closed || accessReadOnly) } : null);
    return () => setClientTeamPolicy(null);
  }, [team.access, team.companyId, team.isProcessLeader, closed, accessReadOnly]);
  const pendingPositions = Boolean(location === "/process-participants" && processStatus?.status === "pending");

  async function changeYear(nextYear: number, nextCompany = companyId) {
    if (!nextCompany || activeSwitch.current) return;
    activeSwitch.current = true; setBusy(true);
    const switchRoute = location;
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await new Promise(resolve => setTimeout(resolve, 0));
      // Never abort writes: drain page queues, then mutation lifecycles, then multipart/fetch.
      if (!(await Promise.race([flushAnnualExitGuards(), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 30_000))])) || !(await waitForNavigationMutations(client)) || !(await waitForAnnualRequests())) throw new Error("El guardado sigue pendiente o falló. Conservamos este año y tus cambios; espera o reintenta el guardado.");
      if (hasUnsafeAnnualDraft()) throw new Error("Hay un formulario pendiente. Vuelve a la página y utiliza Guardar antes de cambiar el año; tus cambios se conservan.");
      if (currentRoute.current !== switchRoute) throw new Error("La página cambió durante el guardado. Repite la selección anual desde esta página.");
      await client.cancelQueries();
      persistManagementYear(localStorage, nextCompany, nextYear);
      localStorage.setItem("selectedCompanyId", String(nextCompany));
      const url = new URL(window.location.href);
      url.searchParams.set("companyId", String(nextCompany));
      url.searchParams.set("managementYear", String(nextYear));
      // Reload gives every editor, cache, timer and future request a fresh immutable scope.
      window.location.assign(url.pathname + url.search + url.hash);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cambiar de año. Los borradores siguen aquí."); }
    finally { activeSwitch.current = false; setBusy(false); }
  }
  // Progressive, broad read-only controls; backend checks remain the authority.
  useEffect(() => {
    if ((!closed && !pendingPositions && !accessReadOnly) || !root.current || location === "/annual-workspaces") return;
    const disable = () => root.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, select, button, [contenteditable], [role="button"], [role="checkbox"], [role="switch"], [role="combobox"]').forEach(element => {
      const text = `${element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;
      if (element.hasAttribute("contenteditable")) { element.setAttribute("contenteditable", "false"); element.dataset.annualReadonly = "true"; return; }
      if (/descargar|download|exportar|ver archivo|abrir archivo/i.test(text)) return;
      if (element.matches('input, textarea, select, [role="checkbox"], [role="switch"], [role="combobox"]') || /guardar|crear|agregar|añadir|eliminar|borrar|editar|importar|subir|cargar|aprobar|activar|incorporar|complet|registrar|enviar|aplicar|asignar|restringir|suspender|reactivar|reasignar|autorizar|revocar|retirar|anular|generar|copiar|reemplazar|nueva?\b/i.test(text)) { element.disabled = true; element.setAttribute("aria-disabled", "true"); element.dataset.annualReadonly = "true"; }
    });
    disable(); const observer = new MutationObserver(disable); observer.observe(root.current, { childList: true, subtree: true }); return () => observer.disconnect();
  }, [closed, pendingPositions, accessReadOnly, location]);
  return <Context.Provider value={{ companyId, year, overview, closed }}>
    {visible && <section aria-label="Selección anual empresarial" className="sticky top-0 z-50 border-b border-blue-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 sm:gap-4">
        <label htmlFor="management-year" className="text-sm font-semibold text-slate-800">Año de gestión</label>
        <NativeSelect id="management-year" className="w-auto min-w-40" value={String(year)} disabled={busy || list.isLoading || Boolean(list.error)} onChange={event => void changeYear(Number(event.target.value))}>
          {!list.data?.workspaces.some(workspace => workspace.year === year) && <option value={year}>{year} · Sin confirmar</option>}
          {list.data?.workspaces.map(workspace => <option key={workspace.id} value={workspace.year}>{workspace.year} · {workspace.status === "closed" ? "Cerrado" : "Abierto"}</option>)}
        </NativeSelect>
        {overview && <Badge variant="outline">{closed ? "Cerrado · Solo lectura" : "Abierto"}</Badge>}
        {(isManagerLogin || user?.role === "admin") && <Button variant="outline" size="sm" disabled={busy} onClick={() => navigate(`/annual-workspaces?companyId=${companyId}`)}>Gestionar años</Button>}
        {busy && <span role="status" className="text-sm text-blue-700">Guardando y esperando solicitudes del año {scope.year}…</span>}
        {(list.error || overviewQuery.error) && <span role="alert" className="text-sm text-red-700">No se pudo verificar el año. <button className="underline" onClick={() => { void list.refetch(); void overviewQuery.refetch(); }}>Reintentar</button></span>}
      </div>
      {pendingPositions && <p className="mt-2 text-sm text-amber-900">Puestos conservados · Proceso pendiente de incorporación. Las evaluaciones del año anterior no son evaluaciones de este año.</p>}
      {accessReadOnly && !closed && <p role="status" className="mt-2 text-sm text-slate-700">Acceso de Solo consulta. No se permite editar, guardar automáticamente ni cargar archivos. Tu proceso propio conserva sus permisos.</p>}
      {closed && <p role="status" className="mt-2 text-sm text-amber-900">El año {year} está cerrado. Puedes consultar y descargar; las modificaciones están bloqueadas.</p>}
      {overview && overview.incorporatedCount < overview.totalCount && <p className="mt-2 text-sm text-blue-900">Incorporación parcial: {overview.incorporatedCount} de {overview.totalCount} procesos. Los pendientes no representan mediciones ni promedios cero.</p>}
    </section>}
    {companyChanged && <div className="m-6 rounded-lg border bg-white p-5"><p>La empresa cambió. Para separar correctamente los borradores y solicitudes, abre su contexto anual en un documento nuevo.</p><Button className="mt-3" disabled={busy} onClick={() => void changeYear(year)}>Continuar con la empresa seleccionada</Button></div>}
    {pending && !companyChanged ? <div className="m-6 rounded-lg border border-amber-200 bg-amber-50 p-5"><h1 className="font-semibold">Proceso pendiente de incorporación en {year}</h1><p className="mt-2 text-sm">El catálogo, mapa y puestos se conservan. La caracterización y matrices estarán disponibles cuando Gerencia incorpore el proceso aprobado. No se muestran datos de 2026 como datos de este año.</p><div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => navigate("/process-map")}>Ver mapa de procesos</Button><Button variant="outline" onClick={() => navigate("/organization-chart")}>Ver organización</Button><Button variant="outline" onClick={() => navigate(`/process-planning-cycles?companyId=${companyId}&processId=${processId}&targetYear=${year}`)}>Ver preparación</Button></div></div> : <div ref={root} inert={busy || companyChanged} onClickCapture={event => { const target = (event.target as HTMLElement).closest("[data-annual-readonly]"); if (target) { event.preventDefault(); event.stopPropagation(); } }} onChangeCapture={event => { if (closed || accessReadOnly) { event.preventDefault(); event.stopPropagation(); return; } markAnnualDraftEdited(); }}>{children}</div>}
  </Context.Provider>;
}
