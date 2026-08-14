import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { ArrowLeft, ChartNoAxesCombined, Download, FileDown, FileText, FileUp, Gauge, Loader2, Plus, Trash2, UserRoundX, UsersRound } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { getCompanyIdFromSession } from "@/lib/sessionScope";
import { exportPayrollExcel, exportPayrollPdf, formatPayrollTenure } from "@/lib/payrollExports";
import { toast } from "sonner";

type Employee = {
  id: number;
  companyId: number;
  fullName: string;
  identityCard: string;
  hireDate: string | Date;
  area: string;
  position: string;
  status: "activo" | "pasivo";
  terminationDate: string | Date | null;
  performance?: number | null;
};

type EmployeeDraft = {
  fullName: string;
  identityCard: string;
  hireDate: string;
  area: string;
  position: string;
};

const formatPerformance = (performance: number | null | undefined) => performance == null ? "Pendiente" : `${performance.toFixed(1)}%`;

const EMPTY_EMPLOYEE: EmployeeDraft = {
  fullName: "",
  identityCard: "",
  hireDate: "",
  area: "",
  position: "",
};

const formatDateInput = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
};

const readColumn = (row: Record<string, unknown>, ...columns: string[]) => {
  for (const column of columns) {
    const value = row[column];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const excelDateToIso = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && value > 1000 && value < 100000) {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + value * 86_400_000).toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

export default function Payroll() {
  const [, setLocation] = useLocation();
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);
  const performanceYear = useMemo(() => new Date().getFullYear(), []);
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rotationChartRef = useRef<HTMLDivElement>(null);
  const payrollTableScrollRef = useRef<HTMLDivElement>(null);
  const fixedPayrollScrollbarRef = useRef<HTMLDivElement>(null);
  const fixedPayrollScrollbarContentRef = useRef<HTMLDivElement>(null);
  const [scrollbarMountVersion, setScrollbarMountVersion] = useState(0);
  const registerPayrollTableScroller = useCallback((node: HTMLDivElement | null) => {
    payrollTableScrollRef.current = node;
    if (node) setScrollbarMountVersion((current) => current + 1);
  }, []);
  const registerFixedPayrollScrollbar = useCallback((node: HTMLDivElement | null) => {
    fixedPayrollScrollbarRef.current = node;
    if (node) setScrollbarMountVersion((current) => current + 1);
  }, []);
  const registerFixedPayrollScrollbarContent = useCallback((node: HTMLDivElement | null) => {
    fixedPayrollScrollbarContentRef.current = node;
    if (node) setScrollbarMountVersion((current) => current + 1);
  }, []);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmployee, setNewEmployee] = useState<EmployeeDraft>(EMPTY_EMPLOYEE);
  const [showCreate, setShowCreate] = useState(false);
  const [inactiveTarget, setInactiveTarget] = useState<Employee | null>(null);
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().slice(0, 10));
  const [isImporting, setIsImporting] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [selectedArea, setSelectedArea] = useState("");

  const { data, isLoading } = trpc.payroll.list.useQuery(
    { companyId, status: "activo", performanceYear },
    { enabled: companyId > 0 },
  );

  const { data: analytics, isLoading: analyticsLoading } = trpc.payroll.analytics.useQuery(
    { companyId, area: selectedArea || undefined, performanceYear },
    { enabled: companyId > 0 },
  );

  useEffect(() => {
    setEmployees((data || []) as Employee[]);
  }, [data]);

  useEffect(() => {
    const tableScroller = payrollTableScrollRef.current;
    const fixedScroller = fixedPayrollScrollbarRef.current;
    const fixedContent = fixedPayrollScrollbarContentRef.current;
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
    await utils.payroll.list.invalidate({ companyId, status: "activo", performanceYear });
    await utils.payroll.list.invalidate({ companyId, status: "pasivo" });
    await utils.payroll.analytics.invalidate({ companyId, area: selectedArea || undefined, performanceYear });
  };

  const createMutation = trpc.payroll.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.payroll.update.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.payroll.deleteActive.useMutation({ onSuccess: refresh });
  const clearMutation = trpc.payroll.clearActive.useMutation({ onSuccess: refresh });
  const inactiveMutation = trpc.payroll.passToInactive.useMutation({ onSuccess: refresh });
  const importMutation = trpc.payroll.importBulk.useMutation({ onSuccess: refresh });

  const goBack = () => setLocation(`/organization-chart?companyId=${companyId}`);

  const downloadRotationChart = async () => {
    const sourceSvg = rotationChartRef.current?.querySelector("svg.recharts-surface");
    if (!sourceSvg) {
      toast.error("La gráfica aún no está disponible para descargar.");
      return;
    }
    try {
      const width = sourceSvg.clientWidth || 900;
      const height = sourceSvg.clientHeight || 420;
      const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));
      clone.insertAdjacentHTML("afterbegin", `<rect width="100%" height="100%" fill="#ffffff" />`);
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * 2;
        canvas.height = height * 2;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas no disponible");
        context.scale(2, 2);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        const link = document.createElement("a");
        link.download = `curva_rotacion_${selectedArea ? selectedArea.toLowerCase().replace(/\\s+/g, "-") : "empresa"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        toast.error("No se pudo convertir la gráfica a imagen.");
      };
      image.src = url;
    } catch {
      toast.error("No se pudo descargar la gráfica como imagen.");
    }
  };

  const updateLocalEmployee = (id: number, field: keyof EmployeeDraft, value: string) => {
    setEmployees((current) => current.map((employee) => employee.id === id ? { ...employee, [field]: value } : employee));
  };

  const saveEmployee = async (employee: Employee) => {
    const hireDate = formatDateInput(employee.hireDate);
    if (!employee.fullName.trim() || !employee.identityCard.trim() || !hireDate || !employee.area.trim() || !employee.position.trim()) {
      toast.error("Completa Nombre, C.I., fecha de ingreso, área y cargo antes de guardar.");
      await refresh();
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: employee.id,
        companyId,
        fullName: employee.fullName,
        identityCard: employee.identityCard,
        hireDate,
        area: employee.area,
        position: employee.position,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el trabajador");
      await refresh();
    }
  };

  const addEmployee = async () => {
    if (!newEmployee.fullName || !newEmployee.identityCard || !newEmployee.hireDate || !newEmployee.area || !newEmployee.position) {
      toast.error("Completa todos los campos del trabajador.");
      return;
    }
    try {
      await createMutation.mutateAsync({ companyId, ...newEmployee });
      toast.success("Trabajador añadido a Personal Activo.");
      setNewEmployee(EMPTY_EMPLOYEE);
      setShowCreate(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo añadir el trabajador");
    }
  };

  const confirmInactive = async () => {
    if (!inactiveTarget || !terminationDate) return;
    try {
      await inactiveMutation.mutateAsync({ id: inactiveTarget.id, companyId, terminationDate });
      toast.success(`${inactiveTarget.fullName} pasó a Personal Pasivo.`);
      setInactiveTarget(null);
    } catch {
      toast.error("No se pudo trasladar al trabajador a Personal Pasivo.");
    }
  };

  const removeEmployee = async (employee: Employee) => {
    if (!window.confirm(`¿Eliminar a ${employee.fullName} de Personal Activo? Esta acción no afecta al Personal Pasivo.`)) return;
    try {
      await deleteMutation.mutateAsync({ id: employee.id, companyId });
      toast.success("Trabajador eliminado de Personal Activo.");
    } catch {
      toast.error("No se pudo eliminar el trabajador.");
    }
  };

  const clearEmployees = async () => {
    if (!window.confirm("¿Deseas borrar definitivamente a todo el Personal Activo? El Personal Pasivo se conservará sin cambios.")) return;
    try {
      await clearMutation.mutateAsync({ companyId });
      toast.success("Se eliminó todo el Personal Activo. El Personal Pasivo se mantiene.");
    } catch {
      toast.error("No se pudo borrar el Personal Activo.");
    }
  };

  const exportActiveExcel = () => {
    exportPayrollExcel(employees, "activo");
    toast.success("Nómina Activa exportada a Excel.");
  };

  const exportActivePdf = () => {
    exportPayrollPdf(employees, "activo");
    toast.success("Nómina Activa exportada a PDF.");
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Nombre", "Cédula C.I.", "Fecha de ingreso (YYYY-MM-DD)", "Área", "Cargo"],
    ]);
    worksheet["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 30 }, { wch: 26 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Nómina");
    XLSX.writeFile(workbook, "plantilla_nomina_isge360.xlsx");
    toast.success("Plantilla de Nómina descargada.");
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const raw = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
        const workbook = XLSX.read(raw, { type: "array", cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        const parsed = rows.map((row, index) => ({
          fullName: readColumn(row, "Nombre", "Nombres y apellidos", "fullName"),
          identityCard: readColumn(row, "Cédula C.I.", "Cedula C.I.", "Cédula", "Cedula", "C.I.", "identityCard"),
          hireDate: excelDateToIso(row["Fecha de ingreso (YYYY-MM-DD)"] || row["Fecha de ingreso"] || row["hireDate"]),
          area: readColumn(row, "Área", "Area", "area"),
          position: readColumn(row, "Cargo", "position"),
          rowNumber: index + 2,
        }));
        const invalid = parsed.filter((row) => !row.fullName || !row.identityCard || !row.hireDate || !row.area || !row.position);
        if (rows.length === 0) throw new Error("El Excel no contiene trabajadores.");
        if (invalid.length > 0) {
          throw new Error(`Hay ${invalid.length} fila(s) incompleta(s). Completa Nombre, C.I., fecha de ingreso, área y cargo.`);
        }
        const result = await importMutation.mutateAsync({
          companyId,
          rows: parsed.map(({ rowNumber, ...row }) => row),
        });
        toast.success(`Nómina actualizada: ${result.inserted} añadidos y ${result.updated} actualizados.${result.skippedInactive ? ` ${result.skippedInactive} C.I. pertenece(n) a Personal Pasivo y no se modificó/modificaron.` : ""}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo importar el Excel.");
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
  };

  if (!companyId) {
    return <DashboardLayout><p className="py-12 text-center text-slate-600">Selecciona una empresa para gestionar su nómina.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><UsersRound className="h-7 w-7" /></div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Nómina</h1>
                <p className="mt-1 text-slate-600">Administra el personal activo de la empresa. El desempeño se actualiza automáticamente desde los KPI registrados en Participantes.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="destructive" onClick={clearEmployees} disabled={clearMutation.isPending || employees.length === 0} className="gap-2"><Trash2 className="h-4 w-4" />Borrar todas</Button>
            <Button variant="outline" onClick={downloadTemplate} className="gap-2 border-emerald-300 text-emerald-700"><FileDown className="h-4 w-4" />Descargar Planilla</Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="gap-2 border-blue-300 text-blue-700"><FileUp className="h-4 w-4" />{isImporting ? "Importando..." : "Importar desde Excel"}</Button>
            <Button variant="outline" onClick={exportActiveExcel} disabled={employees.length === 0} className="gap-2 border-emerald-300 text-emerald-700"><FileDown className="h-4 w-4" />Exportar Excel</Button>
            <Button variant="outline" onClick={exportActivePdf} disabled={employees.length === 0} className="gap-2 border-rose-300 text-rose-700"><FileText className="h-4 w-4" />Exportar PDF</Button>
            <Button variant="outline" onClick={() => setLocation(`/payroll-inactive?companyId=${companyId}`)} className="gap-2"><UserRoundX className="h-4 w-4" />Personal Pasivo</Button>
            <Button variant="outline" onClick={goBack} className="gap-2"><ArrowLeft className="h-4 w-4" />Volver</Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-l-4 border-l-emerald-500"><CardContent className="pt-5"><p className="text-sm text-slate-600">Número de personal activo</p><p className="mt-1 text-3xl font-bold text-emerald-600">{analyticsLoading ? "—" : analytics?.activeCount ?? 0}</p></CardContent></Card>
          <Card className="border-l-4 border-l-slate-500"><CardContent className="pt-5"><p className="text-sm text-slate-600">Personal desvinculado histórico</p><p className="mt-1 text-3xl font-bold text-slate-700">{analyticsLoading ? "—" : analytics?.inactiveCount ?? 0}</p></CardContent></Card>
          <Card className="border-l-4 border-l-blue-500"><CardContent className="pt-5"><div className="flex items-start justify-between gap-2"><div><p className="text-sm text-slate-600">Promedio de desempeño</p><p className="mt-1 text-lg font-semibold text-blue-700">{analytics?.averagePerformance == null ? "Pendiente de evaluación" : `${analytics.averagePerformance}%`}</p></div><Gauge className="h-5 w-5 text-blue-500" /></div></CardContent></Card>
          <Card className="border-l-4 border-l-violet-500 transition-shadow hover:shadow-md"><CardContent className="flex h-full min-h-24 items-center justify-between gap-3 pt-5"><div><p className="text-sm text-slate-600">Análisis de rotación</p><p className="mt-1 font-semibold text-violet-700">Curva de rotación de personal</p></div><Button onClick={() => setShowRotation(true)} className="shrink-0 gap-2 bg-violet-600 hover:bg-violet-700"><ChartNoAxesCombined className="h-4 w-4" />Ver</Button></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Personal Activo</CardTitle>
              <CardDescription>Actualiza los datos directamente en la tabla; cada campo se guarda al salir de él.</CardDescription>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4" />Añadir nuevo trabajador</Button>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="flex items-center justify-center gap-2 py-12 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Cargando nómina...</div> : employees.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-slate-500">No hay personal activo registrado. Añade un trabajador o importa la Planilla de Nómina.</div>
            ) : (
                  <div ref={registerPayrollTableScroller} className="overflow-x-auto rounded-lg border [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <table className="min-w-[1450px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="w-14 px-3 py-3 text-center" aria-label="Eliminar" />
                      <th className="min-w-[310px] px-3 py-3">Nombre completo</th>
                      <th className="min-w-32 px-3 py-3">Cédula C.I.</th>
                      <th className="min-w-40 px-3 py-3">Fecha de ingreso</th>
                      <th className="min-w-44 px-3 py-3">Tiempo en la empresa</th>
                      <th className="min-w-48 px-3 py-3">Área</th>
                      <th className="min-w-56 px-3 py-3">Cargo</th>
                      <th className="min-w-32 px-3 py-3">Desempeño</th>
                      <th className="min-w-44 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {employees.map((employee) => (
                      <tr key={employee.id} className="bg-white hover:bg-slate-50">
                        <td className="px-3 py-2 text-center"><Button variant="ghost" size="icon" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => removeEmployee(employee)} aria-label={`Eliminar ${employee.fullName}`}><Trash2 className="h-4 w-4" /></Button></td>
                        <td className="px-3 py-2"><Input className="min-w-[280px]" value={employee.fullName} onChange={(e) => updateLocalEmployee(employee.id, "fullName", e.target.value)} onBlur={() => saveEmployee(employee)} /></td>
                        <td className="px-3 py-2"><Input className="min-w-28" value={employee.identityCard} onChange={(e) => updateLocalEmployee(employee.id, "identityCard", e.target.value)} onBlur={() => saveEmployee(employee)} /></td>
                        <td className="px-3 py-2"><Input className="min-w-36" type="date" value={formatDateInput(employee.hireDate)} onChange={(e) => updateLocalEmployee(employee.id, "hireDate", e.target.value)} onBlur={() => saveEmployee(employee)} /></td>
                        <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{formatPayrollTenure(employee.hireDate)}</td>
                        <td className="px-3 py-2"><Input className="min-w-44" value={employee.area} onChange={(e) => updateLocalEmployee(employee.id, "area", e.target.value)} onBlur={() => saveEmployee(employee)} /></td>
                        <td className="px-3 py-2"><Input className="min-w-52" value={employee.position} onChange={(e) => updateLocalEmployee(employee.id, "position", e.target.value)} onBlur={() => saveEmployee(employee)} /></td>
                        <td className="px-3 py-2 text-center">{employee.performance == null ? <span className="text-xs font-medium text-slate-400">Pendiente</span> : <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{formatPerformance(employee.performance)}</span>}</td>
                        <td className="px-4 py-2"><Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => { setInactiveTarget(employee); setTerminationDate(new Date().toISOString().slice(0, 10)); }}>Pasa a Pasivo</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white/95 py-1.5 shadow-[0_-3px_10px_rgba(15,23,42,0.12)] backdrop-blur">
        <div ref={registerFixedPayrollScrollbar} className="h-4 overflow-x-auto overflow-y-hidden" aria-label="Desplazamiento horizontal de Nómina">
          <div ref={registerFixedPayrollScrollbarContent} className="h-px" />
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Añadir nuevo trabajador</DialogTitle><DialogDescription>Completa los datos obligatorios para incorporarlo al Personal Activo.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Nombre</Label><Input value={newEmployee.fullName} onChange={(e) => setNewEmployee({ ...newEmployee, fullName: e.target.value })} /></div>
            <div className="space-y-2"><Label>Cédula C.I.</Label><Input value={newEmployee.identityCard} onChange={(e) => setNewEmployee({ ...newEmployee, identityCard: e.target.value })} /></div>
            <div className="space-y-2"><Label>Fecha de ingreso</Label><Input type="date" value={newEmployee.hireDate} onChange={(e) => setNewEmployee({ ...newEmployee, hireDate: e.target.value })} /></div>
            <div className="space-y-2"><Label>Área</Label><Input value={newEmployee.area} onChange={(e) => setNewEmployee({ ...newEmployee, area: e.target.value })} /></div>
            <div className="space-y-2"><Label>Cargo</Label><Input value={newEmployee.position} onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button><Button onClick={addEmployee} disabled={createMutation.isPending}>{createMutation.isPending ? "Añadiendo..." : "Añadir trabajador"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(inactiveTarget)} onOpenChange={(open) => !open && setInactiveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Pasar a Personal Pasivo</DialogTitle><DialogDescription>Registra la fecha de desvinculación. El historial del trabajador se conservará en Personal Pasivo.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label>Fecha de desvinculación</Label><Input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setInactiveTarget(null)}>Cancelar</Button><Button onClick={confirmInactive} disabled={inactiveMutation.isPending}>OK</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRotation} onOpenChange={setShowRotation}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[1180px] overflow-y-auto sm:max-w-[1180px]">
          <DialogHeader>
            <DialogTitle>Curva de rotación de personal</DialogTitle>
            <DialogDescription>Desvinculaciones y tasa mensual de desvinculación de los últimos 12 meses.</DialogDescription>
          </DialogHeader>
          <div ref={rotationChartRef} className="space-y-5 rounded-xl bg-white p-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="rotation-area">Área analizada</Label>
                <select id="rotation-area" value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)} className="block h-10 min-w-56 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-violet-500 focus:outline-none">
                  <option value="">Toda la empresa</option>
                  {(analytics?.areas || []).map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 text-right">
                <div><p className="text-xs text-slate-500">Desvinculaciones (12 meses)</p><p className="text-2xl font-bold text-slate-800">{analytics?.recentTerminations ?? 0}</p></div>
                <div><p className="text-xs text-slate-500">Tasa de desvinculación del período</p><p className="text-2xl font-bold text-violet-700">{analytics?.periodRotationRate ?? 0}%</p></div>
              </div>
            </div>
            {analyticsLoading ? <div className="flex h-80 items-center justify-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Calculando rotación...</div> : (
              <>
                {(analytics?.recentTerminations ?? 0) === 0 && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Aún no hay desvinculaciones registradas en este período. La curva se actualizará automáticamente cuando se traslade personal a Pasivo.</p>}
                <div className="h-[430px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={analytics?.months || []} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" allowDecimals={false} label={{ value: "Desvinculaciones", angle: -90, position: "insideLeft", style: { fill: "#475569", fontSize: 12 } }} />
                      <YAxis yAxisId="right" orientation="right" unit="%" label={{ value: "Tasa de desvinculación", angle: 90, position: "insideRight", style: { fill: "#7c3aed", fontSize: 12 } }} />
                      <Tooltip formatter={(value: number, name: string) => [name === "rotationRate" ? `${value}%` : value, name === "rotationRate" ? "Tasa de desvinculación" : "Desvinculaciones"]} />
                      <Legend formatter={(value) => value === "rotationRate" ? "Tasa de desvinculación" : "Desvinculaciones"} />
                      <Bar yAxisId="left" dataKey="exits" name="exits" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="rotationRate" name="rotationRate" stroke="#7c3aed" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowRotation(false)}>Cerrar</Button><Button onClick={downloadRotationChart} className="gap-2"><Download className="h-4 w-4" />Descargar imagen</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
