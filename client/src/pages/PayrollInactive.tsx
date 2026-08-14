import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, FileDown, FileText, UserRoundX } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  terminationDate: string | Date | null;
};

export default function PayrollInactive() {
  const [, setLocation] = useLocation();
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);
  const { data, isLoading } = trpc.payroll.list.useQuery(
    { companyId, status: "pasivo" },
    { enabled: companyId > 0 },
  );
  const employees = (data || []) as InactiveEmployee[];

  const exportInactiveExcel = () => {
    exportPayrollExcel(employees, "pasivo");
    toast.success("Personal Pasivo exportado a Excel.");
  };

  const exportInactivePdf = () => {
    exportPayrollPdf(employees, "pasivo");
    toast.success("Personal Pasivo exportado a PDF.");
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-200 p-3 text-slate-700"><UserRoundX className="h-7 w-7" /></div>
            <div><h1 className="text-3xl font-bold text-slate-900">Personal Pasivo</h1><p className="mt-1 text-slate-600">Historial de trabajadores desvinculados. Estos registros no se eliminan al borrar el personal activo.</p></div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={exportInactiveExcel} disabled={employees.length === 0} className="gap-2 border-emerald-300 text-emerald-700"><FileDown className="h-4 w-4" />Exportar Excel</Button>
            <Button variant="outline" onClick={exportInactivePdf} disabled={employees.length === 0} className="gap-2 border-rose-300 text-rose-700"><FileText className="h-4 w-4" />Exportar PDF</Button>
            <Button variant="outline" onClick={() => setLocation(`/payroll?companyId=${companyId}`)} className="gap-2"><ArrowLeft className="h-4 w-4" />Volver a Nómina</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Historial de personal</CardTitle><CardDescription>Los datos se conservan para futuras evaluaciones e indicadores históricos.</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <p className="py-10 text-center text-slate-500">Cargando Personal Pasivo...</p> : employees.length === 0 ? <p className="rounded-lg border border-dashed py-12 text-center text-slate-500">No hay personal pasivo registrado.</p> : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-[1250px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="min-w-[300px] px-4 py-3">Nombre completo</th><th className="min-w-32 px-4 py-3">Cédula C.I.</th><th className="min-w-36 px-4 py-3">Fecha de ingreso</th><th className="min-w-44 px-4 py-3">Tiempo en la empresa</th><th className="min-w-48 px-4 py-3">Área</th><th className="min-w-56 px-4 py-3">Cargo</th><th className="min-w-44 px-4 py-3">Fecha de desvinculación</th></tr></thead>
                  <tbody className="divide-y">{employees.map((employee) => <tr key={employee.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium leading-5">{employee.fullName}</td><td className="px-4 py-3">{employee.identityCard}</td><td className="px-4 py-3 whitespace-nowrap">{formatPayrollDate(employee.hireDate)}</td><td className="px-4 py-3 font-medium whitespace-nowrap">{formatPayrollTenure(employee.hireDate, employee.terminationDate)}</td><td className="px-4 py-3">{employee.area}</td><td className="px-4 py-3">{employee.position}</td><td className="px-4 py-3 whitespace-nowrap">{formatPayrollDate(employee.terminationDate)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
