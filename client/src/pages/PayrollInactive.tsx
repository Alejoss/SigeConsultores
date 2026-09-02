import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  FileDown,
  FileText,
  Pencil,
  Search,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportPayrollExcel, exportPayrollPdf, formatPayrollDate, formatPayrollTenure } from "@/lib/payrollExports";
import { trpc } from "@/lib/trpc";
import { getCompanyIdFromSession } from "@/lib/sessionScope";
import { toast } from "sonner";

type InactiveEmployee = {
  id: number;
  fullName: string;
  identityCard: string;
  hireDate: string | Date;
  area: string;
  position: string;
  workPosition?: string | null;
  terminationDate: string | Date | null;
};

const normalizeSearchText = (value: unknown) =>
  String(value ?? "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const toInputDate = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const raw = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (raw) return raw;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export default function PayrollInactive() {
  const [, setLocation] = useLocation();
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.payroll.list.useQuery(
    { companyId, status: "pasivo" },
    { enabled: companyId > 0 },
  );
  const employees = (data || []) as InactiveEmployee[];
  const [showInactiveSearch, setShowInactiveSearch] = useState(false);
  const [inactiveSearch, setInactiveSearch] = useState("");
  const [terminationEditor, setTerminationEditor] = useState<InactiveEmployee | null>(null);
  const [editedTerminationDate, setEditedTerminationDate] = useState("");
  const [rehireTarget, setRehireTarget] = useState<InactiveEmployee | null>(null);
  const [rehireDate, setRehireDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deleteTarget, setDeleteTarget] = useState<InactiveEmployee | null>(null);
  const inactiveTableScrollRef = useRef<HTMLDivElement | null>(null);
  const fixedInactiveScrollbarRef = useRef<HTMLDivElement | null>(null);
  const fixedInactiveScrollbarContentRef = useRef<HTMLDivElement | null>(null);
  const [scrollbarMountVersion, setScrollbarMountVersion] = useState(0);
  const registerInactiveTableScroller = useCallback((node: HTMLDivElement | null) => {
    inactiveTableScrollRef.current = node;
    if (node) setScrollbarMountVersion(current => current + 1);
  }, []);
  const registerFixedInactiveScrollbar = useCallback((node: HTMLDivElement | null) => {
    fixedInactiveScrollbarRef.current = node;
    if (node) setScrollbarMountVersion(current => current + 1);
  }, []);
  const registerFixedInactiveScrollbarContent = useCallback((node: HTMLDivElement | null) => {
    fixedInactiveScrollbarContentRef.current = node;
    if (node) setScrollbarMountVersion(current => current + 1);
  }, []);

  useEffect(() => {
    const tableScroller = inactiveTableScrollRef.current;
    const fixedScroller = fixedInactiveScrollbarRef.current;
    const fixedContent = fixedInactiveScrollbarContentRef.current;
    if (!tableScroller || !fixedScroller || !fixedContent) return;

    let isSynchronizing = false;
    const syncWidth = () => {
      const tableBounds = tableScroller.getBoundingClientRect();
      fixedScroller.style.width = `${tableScroller.clientWidth}px`;
      fixedScroller.style.marginLeft = `${Math.max(0, tableBounds.left)}px`;
      fixedContent.style.width = `${tableScroller.scrollWidth}px`;
    };
    const syncFromTable = () => {
      if (isSynchronizing) return;
      isSynchronizing = true;
      fixedScroller.scrollLeft = tableScroller.scrollLeft;
      isSynchronizing = false;
    };
    const syncFromFixedBar = () => {
      if (isSynchronizing) return;
      isSynchronizing = true;
      tableScroller.scrollLeft = fixedScroller.scrollLeft;
      isSynchronizing = false;
    };

    syncWidth();
    tableScroller.addEventListener("scroll", syncFromTable);
    fixedScroller.addEventListener("scroll", syncFromFixedBar);
    window.addEventListener("resize", syncWidth);
    const observer = new ResizeObserver(syncWidth);
    observer.observe(tableScroller);
    return () => {
      tableScroller.removeEventListener("scroll", syncFromTable);
      fixedScroller.removeEventListener("scroll", syncFromFixedBar);
      window.removeEventListener("resize", syncWidth);
      observer.disconnect();
    };
  }, [employees.length, isLoading, scrollbarMountVersion]);

  const refresh = async () => {
    await utils.payroll.list.invalidate({ companyId, status: "pasivo" });
    await utils.payroll.list.invalidate({ companyId, status: "activo" });
    await utils.payroll.analytics.invalidate({ companyId });
  };

  const updateTerminationMutation = trpc.payroll.updateInactiveTermination.useMutation({
    onSuccess: refresh,
  });
  const reactivateMutation = trpc.payroll.reactivateInactive.useMutation({
    onSuccess: refresh,
  });
  const deleteMutation = trpc.payroll.deleteInactive.useMutation({
    onSuccess: refresh,
  });

  const filteredEmployees = useMemo(() => {
    const query = normalizeSearchText(inactiveSearch);
    if (!query) return employees;
    return employees.filter(employee =>
      [
        employee.fullName,
        employee.identityCard,
        employee.hireDate,
        formatPayrollDate(employee.hireDate),
        formatPayrollTenure(employee.hireDate, employee.terminationDate),
        employee.area,
        employee.position,
        employee.workPosition,
        employee.terminationDate,
        formatPayrollDate(employee.terminationDate),
        "pasivo",
      ].some(value => normalizeSearchText(value).includes(query))
    );
  }, [employees, inactiveSearch]);

  const exportInactiveExcel = () => {
    exportPayrollExcel(employees, "pasivo");
    toast.success("Personal Pasivo exportado a Excel.");
  };

  const exportInactivePdf = () => {
    exportPayrollPdf(employees, "pasivo");
    toast.success("Personal Pasivo exportado a PDF.");
  };

  const updateTerminationDate = async () => {
    if (!terminationEditor || !editedTerminationDate) return;
    try {
      await updateTerminationMutation.mutateAsync({
        id: terminationEditor.id,
        companyId,
        terminationDate: editedTerminationDate,
      });
      toast.success("Fecha de desvinculación corregida.");
      setTerminationEditor(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo corregir la fecha de salida.");
    }
  };

  const reactivateEmployee = async () => {
    if (!rehireTarget || !rehireDate) return;
    try {
      await reactivateMutation.mutateAsync({
        id: rehireTarget.id,
        companyId,
        hireDate: rehireDate,
      });
      toast.success(`${rehireTarget.fullName} volvió a Personal Activo. Su periodo anterior quedó preservado.`);
      setRehireTarget(null);
      setLocation(`/payroll?companyId=${companyId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reincorporar al trabajador.");
    }
  };

  const deleteInactiveEmployee = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id, companyId });
      toast.success("Registro retirado de Personal Pasivo.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo retirar el registro.");
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-200 p-3 text-slate-700"><UserRoundX className="h-7 w-7" /></div>
            <div><h1 className="text-3xl font-bold text-slate-900">Personal Pasivo</h1><p className="mt-1 text-slate-600">Historial de trabajadores desvinculados y opciones para corregir o reincorporar registros.</p></div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={exportInactiveExcel} disabled={employees.length === 0} className="gap-2 border-emerald-300 text-emerald-700"><FileDown className="h-4 w-4" />Exportar Excel</Button>
            <Button variant="outline" onClick={exportInactivePdf} disabled={employees.length === 0} className="gap-2 border-rose-300 text-rose-700"><FileText className="h-4 w-4" />Exportar PDF</Button>
            <Button variant="outline" onClick={() => setLocation(`/payroll?companyId=${companyId}`)} className="gap-2"><ArrowLeft className="h-4 w-4" />Volver a Nómina</Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Historial de personal</CardTitle>
              <CardDescription>La reincorporación conserva cada periodo laboral anterior y evita duplicar la C.I.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {showInactiveSearch && (
                <div className="relative w-full sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    aria-label="Buscar en Historial de personal"
                    autoFocus
                    value={inactiveSearch}
                    onChange={event => setInactiveSearch(event.target.value)}
                    placeholder="Buscar por cualquier dato..."
                    className="pr-9 pl-9"
                  />
                  {inactiveSearch && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setInactiveSearch("")}
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  if (showInactiveSearch) setInactiveSearch("");
                  setShowInactiveSearch(current => !current);
                }}
                aria-label={showInactiveSearch ? "Cerrar búsqueda" : "Buscar personal"}
                title={showInactiveSearch ? "Cerrar búsqueda" : "Buscar personal"}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <p className="py-10 text-center text-slate-500">Cargando Personal Pasivo...</p> : employees.length === 0 ? <p className="rounded-lg border border-dashed py-12 text-center text-slate-500">No hay personal pasivo registrado.</p> : filteredEmployees.length === 0 ? <p className="rounded-lg border border-dashed py-12 text-center text-slate-500">No se encontraron trabajadores que coincidan con “{inactiveSearch}”.</p> : (
              <div ref={registerInactiveTableScroller} className="overflow-x-auto rounded-lg border [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <table className="min-w-[1600px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="min-w-[300px] px-4 py-3">Nombre completo</th><th className="min-w-32 px-4 py-3">Cédula C.I.</th><th className="min-w-36 px-4 py-3">Fecha de ingreso</th><th className="min-w-44 px-4 py-3">Tiempo en la empresa</th><th className="min-w-48 px-4 py-3">Área</th><th className="min-w-56 px-4 py-3">Cargo</th><th className="min-w-56 px-4 py-3">Puesto de Trabajo</th><th className="min-w-44 px-4 py-3">Fecha de desvinculación</th><th className="min-w-[272px] px-4 py-3 text-right">Acciones</th></tr></thead>
                  <tbody className="divide-y">{filteredEmployees.map((employee) => <tr key={employee.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium leading-5">{employee.fullName}</td><td className="px-4 py-3">{employee.identityCard}</td><td className="px-4 py-3 whitespace-nowrap">{formatPayrollDate(employee.hireDate)}</td><td className="px-4 py-3 font-medium whitespace-nowrap">{formatPayrollTenure(employee.hireDate, employee.terminationDate)}</td><td className="px-4 py-3">{employee.area}</td><td className="px-4 py-3">{employee.position}</td><td className="px-4 py-3">{employee.workPosition || <span className="text-xs text-slate-400">Sin asignar</span>}</td><td className="px-4 py-3 whitespace-nowrap">{formatPayrollDate(employee.terminationDate)}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setTerminationEditor(employee); setEditedTerminationDate(toInputDate(employee.terminationDate)); }} title="Corregir fecha de salida"><Pencil className="h-3.5 w-3.5" />Corregir salida</Button><Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => { setRehireTarget(employee); setRehireDate(new Date().toISOString().slice(0, 10)); }} title="Reincorporar a Personal Activo"><UserRoundCheck className="h-3.5 w-3.5" />Reincorporar</Button><Button variant="ghost" size="icon" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDeleteTarget(employee)} title="Retirar registro"><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white/95 py-1.5 shadow-[0_-3px_10px_rgba(15,23,42,0.12)] backdrop-blur">
        <div
          ref={registerFixedInactiveScrollbar}
          className="h-4 overflow-x-auto overflow-y-hidden"
          aria-label="Desplazamiento horizontal de Personal Pasivo"
        >
          <div ref={registerFixedInactiveScrollbarContent} className="h-px" />
        </div>
      </div>

      <Dialog open={terminationEditor !== null} onOpenChange={open => !open && setTerminationEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir fecha de desvinculación</DialogTitle>
            <DialogDescription>Actualiza la fecha de salida de {terminationEditor?.fullName}. La información se corregirá sin cambiar el resto de sus datos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="termination-date">Fecha de salida</Label>
            <Input id="termination-date" type="date" value={editedTerminationDate} onChange={event => setEditedTerminationDate(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminationEditor(null)}>Cancelar</Button>
            <Button onClick={updateTerminationDate} disabled={!editedTerminationDate || updateTerminationMutation.isPending}>Actualizar fecha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rehireTarget !== null} onOpenChange={open => !open && setRehireTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reincorporar a Personal Activo</DialogTitle>
            <DialogDescription>Se conservará el periodo laboral anterior de {rehireTarget?.fullName} y se habilitará su misma C.I. en Personal Activo. Después podrás actualizar área, cargo y puesto si cambió.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rehire-date">Nueva fecha de ingreso</Label>
            <Input id="rehire-date" type="date" value={rehireDate} onChange={event => setRehireDate(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRehireTarget(null)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={reactivateEmployee} disabled={!rehireDate || reactivateMutation.isPending}>Reincorporar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Retirar este registro de Personal Pasivo?</DialogTitle>
            <DialogDescription>Esta acción lo ocultará de la lista y de los indicadores de nómina. No elimina definitivamente la información de la base, por lo que mantiene una vía de recuperación segura si se trataba de un error.</DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-900"><strong>{deleteTarget?.fullName}</strong> · C.I. {deleteTarget?.identityCard}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={deleteInactiveEmployee} disabled={deleteMutation.isPending}>Retirar registro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
