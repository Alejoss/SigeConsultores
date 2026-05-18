import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DASHBOARD_MODULES } from "@shared/dashboardModules";
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
    <>
      {DASHBOARD_MODULES.map((module) => {
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
    </>
  );
}
