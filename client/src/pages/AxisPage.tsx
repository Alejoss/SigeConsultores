import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_MODULES, MODULE_GROUPS, buildScopedModuleRoute } from "@shared/dashboardModules";
import { useModuleLabels } from "@/hooks/useModuleLabels";

type AxisId = "estrategia" | "gestion" | "desempeno";

const AXIS_STYLES: Record<AxisId, { bg: string; border: string; header: string; icon_bg: string; btn: string }> = {
  estrategia: {
    bg: "bg-sky-50",
    border: "border-sky-200 hover:border-sky-400",
    header: "bg-sky-100 border-b border-sky-200",
    icon_bg: "bg-sky-100",
    btn: "border-sky-300 text-sky-700 hover:bg-sky-100",
  },
  gestion: {
    bg: "bg-emerald-50",
    border: "border-emerald-200 hover:border-emerald-400",
    header: "bg-emerald-100 border-b border-emerald-200",
    icon_bg: "bg-emerald-100",
    btn: "border-emerald-300 text-emerald-700 hover:bg-emerald-100",
  },
  desempeno: {
    bg: "bg-violet-50",
    border: "border-violet-200 hover:border-violet-400",
    header: "bg-violet-100 border-b border-violet-200",
    icon_bg: "bg-violet-100",
    btn: "border-violet-300 text-violet-700 hover:bg-violet-100",
  },
};

interface AxisPageProps {
  axisId: AxisId;
  backPath: string;
}

export default function AxisPage({ axisId, backPath }: AxisPageProps) {
  const [, setLocation] = useLocation();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    const cid = localStorage.getItem("managerCompanyId");
    const mgr = localStorage.getItem("managerToken");
    if (cid) setCompanyId(parseInt(cid));
    if (mgr) setIsManager(true);
    // Store axis origin so modules know where to go back
    localStorage.setItem("axisOrigin", axisId);
  }, [axisId]);

  const group = MODULE_GROUPS.find((g) => g.id === axisId)!;
  const modules = DASHBOARD_MODULES.filter((m) => m.group === axisId);
  const style = AXIS_STYLES[axisId];
  const { getLabel } = useModuleLabels(companyId);

  const handleNavigate = (moduleName: string) => {
    if (!companyId) return;
    const path = buildScopedModuleRoute(moduleName, { companyId, isManager });
    if (path) setLocation(path);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className={`${style.header} px-6 py-4 flex items-center gap-4`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(backPath)}
          className="gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Volver
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{group.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{group.label}</h1>
            <p className="text-sm text-gray-500">{group.description}</p>
          </div>
        </div>
      </div>

      {/* Module grid */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((mod) => {
            const title = mod.labelKey
              ? getLabel(mod.labelKey, mod.defaultTitle)
              : mod.defaultTitle;
            return (
              <Card
                key={mod.moduleName}
                className={`hover:shadow-lg transition-all cursor-pointer ${style.bg} ${style.border}`}
                onClick={() => handleNavigate(mod.moduleName)}
              >
                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-2 ${style.icon_bg}`}>
                    {mod.icon}
                  </div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className={`w-full ${style.btn}`}>
                    Acceder
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
