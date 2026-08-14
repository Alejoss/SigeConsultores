import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Building2, UsersRound } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAxisBackPathForRole, getCompanyIdFromSession } from "@/lib/sessionScope";

export default function OrganizationChart() {
  const [, setLocation] = useLocation();
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);
  const scopedPath = (path: string) => `${path}?companyId=${companyId}`;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Nómina y Organigrama</h1>
            <p className="mt-2 text-slate-600">Gestiona la estructura organizacional y la información de personal de tu empresa.</p>
          </div>
          <Button variant="outline" onClick={() => setLocation(getAxisBackPathForRole())} className="gap-2"><ArrowLeft className="h-4 w-4" />Volver</Button>
        </div>

        {!companyId ? <p className="rounded-lg border border-dashed py-12 text-center text-slate-600">Selecciona una empresa antes de ingresar a Nómina y Organigrama.</p> : (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="cursor-pointer border-blue-200 bg-blue-50 transition-shadow hover:shadow-lg" onClick={() => setLocation(scopedPath("/organization-chart/view"))}>
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Building2 className="h-6 w-6" /></div>
                <CardTitle>Ver organigrama</CardTitle>
                <CardDescription>Visualiza y administra la estructura organizacional de la empresa.</CardDescription>
              </CardHeader>
              <CardContent><Button variant="outline" className="w-full border-blue-300 text-blue-700">Acceder</Button></CardContent>
            </Card>
            <Card className="cursor-pointer border-emerald-200 bg-emerald-50 transition-shadow hover:shadow-lg" onClick={() => setLocation(scopedPath("/payroll"))}>
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><UsersRound className="h-6 w-6" /></div>
                <CardTitle>Nómina</CardTitle>
                <CardDescription>Registra el personal activo y conserva el historial de personal pasivo.</CardDescription>
              </CardHeader>
              <CardContent><Button variant="outline" className="w-full border-emerald-300 text-emerald-700">Acceder</Button></CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
