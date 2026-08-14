import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Building2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import OrganizationChartModule from "@/components/OrganizationChartModule";
import { Button } from "@/components/ui/button";
import { getCompanyIdFromSession } from "@/lib/sessionScope";

export default function OrganizationChartView() {
  const [, setLocation] = useLocation();
  const companyId = useMemo(() => getCompanyIdFromSession() || 0, []);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><Building2 className="h-7 w-7" /></div>
            <div><h1 className="text-3xl font-bold text-slate-900">Ver organigrama</h1><p className="mt-1 text-slate-600">Visualiza y actualiza la estructura organizacional de tu empresa.</p></div>
          </div>
          <Button variant="outline" onClick={() => setLocation(`/organization-chart?companyId=${companyId}`)} className="gap-2"><ArrowLeft className="h-4 w-4" />Volver</Button>
        </div>
        {companyId ? <OrganizationChartModule companyId={companyId} /> : <p className="py-12 text-center text-slate-600">Selecciona una empresa para ver el organigrama.</p>}
      </div>
    </DashboardLayout>
  );
}
