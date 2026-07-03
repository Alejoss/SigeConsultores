import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Loader2, ClipboardList, Search, Settings, BookOpen, CheckSquare, GraduationCap } from "lucide-react";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { getCompanyIdFromLocationOrStorage } from "@/lib/utils";
import { getAxisBackPathForRole } from "@/lib/sessionScope";

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

  const modules: {
    key: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    path: string;
    comingSoon?: boolean;
  }[] = [
    {
      key: "management-systems",
      icon: <Settings size={40} className="text-blue-500" />,
      title: "Sistema de Gestión",
      description: "Gestiona los sistemas de gestión certificados de la empresa y sus archivos de certificación y check lists.",
      path: `/audits-inspections/management-systems?companyId=${companyId}`,
    },
    {
      key: "programs",
      icon: <BookOpen size={40} className="text-blue-500" />,
      title: "Programas",
      description: "Registra y controla los programas de cada sistema de gestión, sus acciones planificadas y realizadas.",
      path: `/audits-inspections/programs?companyId=${companyId}`,
    },
    {
      key: "compliances",
      icon: <CheckSquare size={40} className="text-blue-500" />,
      title: "Cumplimientos",
      description: "Registra y controla los requisitos legales y normativos aplicables a la empresa.",
      path: `/compliances?companyId=${companyId}`,
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
      title: "Inspecciones y Simulacros",
      description: "Registra y controla las inspecciones realizadas por área, hallazgos y cierres.",
      path: `/audits-inspections/inspections?companyId=${companyId}`,
    },
    {
      key: "trainings",
      icon: <GraduationCap size={40} className="text-purple-500" />,
      title: "Capacitaciones",
      description: "Registra y controla las capacitaciones planificadas y realizadas por área.",
      path: `/trainings?companyId=${companyId}`,
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
              onClick={() => setLocation(getAxisBackPathForRole())}
              className="flex items-center gap-2"
            >
              ← Volver
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Sistemas de Gestión</h1>
          <p className="text-slate-500 mt-1">
            Con ellos se busca garantizar conformidad, mitigar riesgos y mejorar continuamente.
          </p>
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((mod) => (
            <Card
              key={mod.key}
              className={`border-2 transition-colors ${
                mod.comingSoon
                  ? "border-slate-200 bg-slate-50 opacity-70 cursor-default"
                  : "border-blue-100 hover:border-blue-300 cursor-pointer"
              }`}
              onClick={() => !mod.comingSoon && setLocation(mod.path)}
            >
              <CardContent className="pt-6 pb-6 flex flex-col items-start gap-4">
                <div className="flex items-start justify-between w-full">
                  <div>{mod.icon}</div>
                  {mod.comingSoon && (
                    <span className="text-xs font-semibold bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                      Próximamente
                    </span>
                  )}
                </div>
                <div>
                  <h2 className={`text-lg font-bold ${mod.comingSoon ? "text-slate-400" : "text-slate-800"}`}>
                    {mod.title}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">{mod.description}</p>
                </div>
                <Button
                  variant="outline"
                  disabled={mod.comingSoon}
                  className={`w-full ${
                    mod.comingSoon
                      ? "border-slate-300 text-slate-400 cursor-not-allowed"
                      : "border-blue-300 text-blue-700 hover:bg-blue-50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!mod.comingSoon) setLocation(mod.path);
                  }}
                >
                  {mod.comingSoon ? "Próximamente" : "Acceder"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
