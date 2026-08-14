import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, UserRoundX } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { getCompanyIdFromSession } from "@/lib/sessionScope";

type InactiveEmployee = {
  id: number;
  fullName: string;
  identityCard: string;
  hireDate: string | Date;
  area: string;
  position: string;
  terminationDate: string | Date | null;
};

const dateLabel = (value: string | Date | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "numeric" });
};

export default function PayrollInactive() {
  const [, setLocation] = useLocation();
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);
  const { data, isLoading } = trpc.payroll.list.useQuery(
    { companyId, status: "pasivo" },
    { enabled: companyId > 0 },
  );
  const employees = (data || []) as InactiveEmployee[];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-200 p-3 text-slate-700"><UserRoundX className="h-7 w-7" /></div>
            <div><h1 className="text-3xl font-bold text-slate-900">Personal Pasivo</h1><p className="mt-1 text-slate-600">Historial de trabajadores desvinculados. Estos registros no se eliminan al borrar el personal activo.</p></div>
          </div>
          <Button variant="outline" onClick={() => setLocation(`/payroll?companyId=${companyId}`)} className="gap-2"><ArrowLeft className="h-4 w-4" />Volver a Nómina</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Historial de personal</CardTitle><CardDescription>Los datos se conservan para futuras evaluaciones e indicadores históricos.</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <p className="py-10 text-center text-slate-500">Cargando Personal Pasivo...</p> : employees.length === 0 ? <p className="rounded-lg border border-dashed py-12 text-center text-slate-500">No hay personal pasivo registrado.</p> : (
              <div className="overflow-x-auto rounded-lg border"><table className="min-w-[800px] w-full text-sm"><thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Cédula C.I.</th><th className="px-4 py-3">Fecha de ingreso</th><th className="px-4 py-3">Área</th><th className="px-4 py-3">Cargo</th><th className="px-4 py-3">Fecha de desvinculación</th></tr></thead><tbody className="divide-y">{employees.map((employee) => <tr key={employee.id}><td className="px-4 py-3 font-medium">{employee.fullName}</td><td className="px-4 py-3">{employee.identityCard}</td><td className="px-4 py-3">{dateLabel(employee.hireDate)}</td><td className="px-4 py-3">{employee.area}</td><td className="px-4 py-3">{employee.position}</td><td className="px-4 py-3">{dateLabel(employee.terminationDate)}</td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
