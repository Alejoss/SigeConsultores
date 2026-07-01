import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DASHBOARD_MODULES, MODULE_GROUPS } from "@shared/dashboardModules";
import { useModuleLabels } from "@/hooks/useModuleLabels";

type DashboardModulesGridProps = {
  companyId: number;
  onNavigate: (path: string) => void;
  getPath: (moduleName: string) => string | null;
};

export default function DashboardModulesGrid({
  companyId,
  onNavigate,
  getPath,
}: DashboardModulesGridProps) {
  const { getLabel, isLoading } = useModuleLabels(companyId);

  if (isLoading) {
    return <p className="text-gray-500">Cargando módulos...</p>;
  }

  return (
    <div className="space-y-10">
      {MODULE_GROUPS.map((group) => {
        const groupModules = DASHBOARD_MODULES.filter((m) => m.group === group.id);
        return (
          <div key={group.id}>
            {/* Group header */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{group.icon}</span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{group.label}</h2>
                <p className="text-sm text-gray-500">{group.description}</p>
              </div>
            </div>
            {/* Module cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupModules.map((module) => {
                const title = module.labelKey
                  ? getLabel(module.labelKey, module.defaultTitle)
                  : module.defaultTitle;
                return (
                  <Card
                    key={module.moduleName}
                    className="hover:shadow-lg transition-all cursor-pointer hover:border-blue-400"
                    onClick={() => {
                      const path = getPath(module.moduleName);
                      if (path) onNavigate(path);
                    }}
                    title={title}
                  >
                    <CardHeader>
                      <div className="text-4xl mb-2">{module.icon}</div>
                      <CardTitle className="text-lg">{title}</CardTitle>
                      <CardDescription>{module.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className="w-full">
                        Acceder
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
