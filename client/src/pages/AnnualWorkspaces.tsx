import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAnnualWorkspace } from "@/contexts/AnnualWorkspaceContext";
import { useAnnualExitGuard } from "@/hooks/useAnnualExitGuard";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useAuth } from "@/_core/hooks/useAuth";
import { type AnnualStrategy } from "@/lib/annualWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AnnualHistoricalPendingPanel } from "@/components/AnnualHistoricalPendingPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const choices: Array<[keyof AnnualStrategy, string]> = [["purpose", "Propósito"], ["mission", "Misión"], ["vision", "Visión"], ["values", "Valores"], ["policy", "Política"], ["strategicObjectives", "Objetivos estratégicos"]];
const initial: AnnualStrategy = { purpose: true, mission: true, vision: true, values: true, policy: true, strategicObjectives: true };
export default function AnnualWorkspaces() {
  const { companyId, year } = useAnnualWorkspace();
  const [, navigate] = useLocation();
  const { isManagerLogin, isLoading: managerLoading } = useManagerAuth();
  const { user, loading } = useAuth();
  const canManage = isManagerLogin || user?.role === "admin";
  const [sourceYear, setSourceYear] = useState(year);
  const [newYear, setNewYear] = useState(Math.max(2027, year + 1));
  const [strategy, setStrategy] = useState<AnnualStrategy>(initial);
  const [detailYear, setDetailYear] = useState(year);
  const [confirmation, setConfirmation] = useState("");
  const [showClose, setShowClose] = useState(false);
  // Configuration choices are not business drafts. Creation only occurs after explicit submission.
  useAnnualExitGuard(() => true);
  const list = trpc.annualWorkspaces.list.useQuery({ companyId: companyId || 0 }, { enabled: Boolean(companyId), retry: false });
  const overview = trpc.annualWorkspaces.overview.useQuery({ companyId: companyId || 0, year: detailYear }, { enabled: Boolean(companyId), retry: false });
  const utils = trpc.useUtils();
  const create = trpc.annualWorkspaces.create.useMutation();
  const incorporate = trpc.annualWorkspaces.incorporateProcess.useMutation();
  const close = trpc.annualWorkspaces.close.useMutation();
  const busy = create.isPending || incorporate.isPending || close.isPending;
  const refresh = async () => { await utils.annualWorkspaces.invalidate(); };
  async function createYear() {
    if (!companyId || !canManage || busy) return;
    try { await create.mutateAsync({ companyId, year: newYear, sourceYear, strategy }); await refresh(); setDetailYear(newYear); toast.success(`Año ${newYear} creado. El año ${sourceYear} permanece abierto si no estaba cerrado.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo crear el año. No se cambió la selección."); }
  }
  async function incorporateProcess(processId: number) {
    if (!companyId || !canManage || busy) return;
    try { await incorporate.mutateAsync({ companyId, year: detailYear, processId }); await refresh(); toast.success("Proceso incorporado. Los otros procesos mantienen su estado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo incorporar el proceso; revisa la aprobación y las decisiones."); }
  }
  async function closeYear() {
    if (!companyId || !canManage || confirmation !== `CERRAR ${detailYear}` || busy) return;
    try { await close.mutateAsync({ companyId, year: detailYear, confirmation }); setShowClose(false); setConfirmation(""); await refresh(); toast.success(`Año ${detailYear} cerrado en modo consulta.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cerrar el año; se conserva su estado anterior."); }
  }
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <header className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={() => navigate("/manager-dashboard")}>Volver</Button><div><h1 className="text-2xl font-bold text-slate-900">Gestionar años</h1><p className="mt-1 text-sm text-slate-600">La misma empresa, sus cuentas y accesos. Datos empresariales separados por año.</p></div></header>
    {(managerLoading || loading) ? <p>Cargando permisos…</p> : !canManage && <p role="alert" className="rounded-lg border p-4">Solo Gerencia o un administrador puede crear, incorporar o cerrar años.</p>}
    {list.error && <p role="alert">No se pudieron cargar los años. <Button variant="outline" onClick={() => void list.refetch()}>Reintentar</Button></p>}
    <Card><CardHeader><CardTitle>Años disponibles</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{list.isLoading ? <p>Cargando…</p> : list.data?.workspaces.map(workspace => <Button key={workspace.id} variant={detailYear === workspace.year ? "default" : "outline"} onClick={() => { setDetailYear(workspace.year); setShowClose(false); setConfirmation(""); }} disabled={busy}>{workspace.year} · {workspace.status === "closed" ? "Cerrado" : "Abierto"}</Button>)}</CardContent></Card>
    {canManage && <Card><CardHeader><CardTitle>Crear un año sin cerrar el anterior</CardTitle></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="new-year">Año nuevo</Label><Input id="new-year" type="number" min={2027} max={2100} value={newYear} onChange={event => setNewYear(Number(event.target.value))} disabled={busy} /></div><div><Label htmlFor="source-year">Año de origen</Label><NativeSelect id="source-year" value={sourceYear} onChange={event => setSourceYear(Number(event.target.value))} disabled={busy}>{list.data?.workspaces.map(workspace => <option key={workspace.id} value={workspace.year}>{workspace.year}</option>)}</NativeSelect></div></div>
      <div><p className="mb-3 font-semibold">Estrategia: seis elecciones de conservación</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{choices.map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-lg border p-3"><Checkbox checked={strategy[key]} onCheckedChange={checked => setStrategy(previous => ({ ...previous, [key]: checked === true }))} disabled={busy} /><span>Conservar {label.toLowerCase()}</span></label>)}</div><p className="mt-3 text-sm text-slate-600">Una elección desmarcada deja ese contenido vacío en el destino. Las configuraciones que se conservan no trasladan mediciones ni avances del año anterior.</p></div>
      <p className="text-sm text-slate-600">El mapa, catálogo de procesos y puestos permanecen. Cada proceso se incorpora gradualmente después de su preparación y aprobación. Las capacitaciones históricas conservan sus hechos y procedencia; los cursos en línea siguen compartidos.</p>
      <Button disabled={busy || list.isLoading || Boolean(list.error) || !Number.isInteger(newYear) || newYear <= sourceYear || newYear > 2100 || Boolean(list.data?.workspaces.some(workspace => workspace.year === newYear))} onClick={() => void createYear()}>{create.isPending ? "Preparando año…" : `Crear ${newYear}`}</Button>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Procesos de {detailYear}</CardTitle></CardHeader><CardContent className="space-y-4">
      {overview.isLoading ? <p>Cargando incorporación…</p> : overview.error ? <p role="alert">No se pudo obtener el estado de los procesos. <Button variant="outline" onClick={() => void overview.refetch()}>Reintentar</Button></p> : overview.data && <><p className="text-sm">{overview.data.incorporatedCount} de {overview.data.totalCount} procesos incorporados{overview.data.incorporatedCount < overview.data.totalCount ? " · Incorporación parcial" : ""}.</p><div className="space-y-3">{overview.data.processes.map(process => <div key={process.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{process.name}</p><Badge variant="outline" className="mt-1">{process.status === "incorporated" ? "Incorporado" : process.approved ? "Aprobado · Pendiente de incorporación" : "Pendiente de preparación o aprobación"}</Badge></div><div className="flex flex-wrap gap-2">{process.status !== "incorporated" && <Button variant="outline" size="sm" onClick={() => navigate(`/process-planning-cycles?companyId=${companyId}&processId=${process.id}&targetYear=${detailYear}`)}>Ver preparación</Button>}{canManage && process.status === "pending" && <Button size="sm" disabled={busy || !process.approved || overview.data?.workspace.status === "closed"} onClick={() => void incorporateProcess(process.id)}>{incorporate.isPending && incorporate.variables?.processId === process.id ? "Incorporando…" : "Incorporar aprobado"}</Button>}</div></div>)}</div>{overview.data.totalCount === 0 && <p>No hay procesos registrados para esta empresa.</p>}</>}
    </CardContent></Card>
    <AnnualHistoricalPendingPanel companyId={companyId} year={detailYear} readOnly={!canManage || overview.isLoading || Boolean(overview.error) || overview.data?.workspace.status !== "open"} />
    {canManage && overview.data?.workspace.status === "open" && <Card className="border-amber-300"><CardHeader><CardTitle>Cierre explícito de {detailYear}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">Cerrar conserva el histórico en modo lectura e impide modificaciones en ese año. Crear otro año no realiza este cierre.</p>{!showClose ? <Button variant="outline" disabled={busy} onClick={() => setShowClose(true)}>Revisar cierre</Button> : <div role="group" aria-label="Confirmación de cierre anual" className="space-y-3"><Label htmlFor="close-confirmation">Escribe exactamente CERRAR {detailYear}</Label><Input id="close-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setShowClose(false); setConfirmation(""); }}>Cancelar</Button><Button variant="destructive" disabled={busy || confirmation !== `CERRAR ${detailYear}`} onClick={() => void closeYear()}>{close.isPending ? "Cerrando…" : `Confirmar cierre ${detailYear}`}</Button></div></div>}</CardContent></Card>}
  </main>;
}
