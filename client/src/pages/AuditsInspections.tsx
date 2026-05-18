import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Loader2, ClipboardList, Search, Settings } from "lucide-react";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";

export default function AuditsInspections() {
  const [, setLocation] = useLocation();
  const { isManagerLogin } = useManagerAuth();
  const { session: processLeaderSession } = useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const isManagerAccess = localStorage.getItem("managerCompanyId") !== null;

  const [companyId, setCompanyId] = useState<number | null>(() => {
    if (isProcessLeader && processLeaderSession?.companyId) {
      return processLeaderSession.companyId;
    }
    if (isManagerAccess) {
      const id = localStorage.getItem("managerCompanyId");
      return id ? parseInt(id) : null;
    }
    return getCompanyIdFromLocationOrStorage();
  });

  useEffect(() => {
    if (isProcessLeader && processLeaderSession?.companyId) {
      setCompanyId(processLeaderSession.companyId);
    }
  }, [isProcessLeader, processLeaderSession?.companyId]);

  if (!companyId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-slate-600">
              <Loader2 size={20} className="animate-spin" />
              <p>Cargando sesión...</p>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const modules = [
    {
      key: "management-systems",
      icon: <Settings size={40} className="text-blue-500" />,
      title: "Sistema de Gestión",
      description: "Gestiona los sistemas de gestión certificados de la empresa y sus archivos de certificación y check lists.",
      path: `/audits-inspections/management-systems?companyId=${companyId}`,
    },
    {
      key: "audits",
      icon: <ClipboardList size={40} className="text-blue-500" />,
      title: "Auditorías",
      description: "Registra y controla las auditorías internas y externas, hallazgos y cierres.",
      path: `/audits-inspections/audits?companyId=${companyId}`,
    },
    {
      key: "inspections",
      icon: <Search size={40} className="text-blue-500" />,
      title: "Inspecciones",
      description: "Registra y controla las inspecciones realizadas por área, hallazgos y cierres.",
      path: `/audits-inspections/inspections?companyId=${companyId}`,
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="flex items-center gap-2"
            >
              ← Volver
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Auditorías e Inspecciones</h1>
          <p className="text-slate-500 mt-1">
            Con ellas se busca garantizar conformidad, mitigar riesgos y mejorar continuamente.
          </p>
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((mod) => (
            <Card
              key={mod.key}
              className="border-2 border-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
              onClick={() => setLocation(mod.path)}
            >
              <CardContent className="pt-6 pb-6 flex flex-col items-start gap-4">
                <div>{mod.icon}</div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{mod.title}</h2>
                  <p className="text-sm text-slate-500 mt-1">{mod.description}</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocation(mod.path);
                  }}
                >
                  Acceder
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
