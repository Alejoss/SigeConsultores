import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardModulesGrid from "@/components/DashboardModulesGrid";
import { DASHBOARD_MODULES } from "@shared/dashboardModules";

export default function Dashboard() {
  const { user } = useAuth();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const [location, setLocation] = useLocation();

  const urlParams = new URLSearchParams(location.split("?")[1]);
  const companyIdFromUrl = urlParams.get("companyId");

  const selectedCompanyId = useMemo(() => {
    if (isManagerLogin && managerCompanyId) {
      return managerCompanyId.toString();
    }
    return companyIdFromUrl || localStorage.getItem("selectedCompanyId");
  }, [isManagerLogin, managerCompanyId, companyIdFromUrl]);

  const { data: companies } = trpc.adminOperations.getUserCompanies.useQuery(
    { accountId: user?.id || 0 },
    { enabled: !!user?.id && !isManagerLogin }
  );

  const companyIdNum = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const { data: managerCompany } = trpc.adminOperations.getCompanyById.useQuery(
    { companyId: companyIdNum },
    { enabled: isManagerLogin && companyIdNum > 0 }
  );

  useEffect(() => {
    if (companyIdFromUrl) {
      localStorage.setItem("selectedCompanyId", companyIdFromUrl);
    }
  }, [companyIdFromUrl]);

  const selectedCompany = useMemo(() => {
    if (isManagerLogin) {
      return managerCompany;
    }
    return companies?.find((c) => c.id.toString() === selectedCompanyId);
  }, [isManagerLogin, managerCompany, companies, selectedCompanyId]);

  useEffect(() => {
    if (companyIdFromUrl && location.includes("?")) {
      setLocation("/dashboard");
    }
  }, []);

  useEffect(() => {
    if (companies && companies.length === 1 && !selectedCompanyId && user?.role === "user") {
      localStorage.setItem("selectedCompanyId", companies[0].id.toString());
    }
  }, [companies, selectedCompanyId, user?.role]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg p-8">
          {selectedCompany ? (
            <>
              <h1 className="text-4xl font-bold mb-2">Bienvenido, {selectedCompany.name}</h1>
              <p className="text-blue-100">
                {selectedCompany.description ||
                  "Plataforma para gestionar tu Sistema Integrado de Gestión Empresarial"}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold mb-2">Bienvenido, {user?.name || "Usuario"}</h1>
              <p className="text-blue-100">
                Plataforma para gestionar tu Sistema Integrado de Gestión Empresarial
              </p>
            </>
          )}
        </div>

        {!selectedCompany && companies && companies.length > 0 && user?.role === "admin" && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Tus Empresas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {companies.map((company) => (
                <Card key={company.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{company.name}</CardTitle>
                    <CardDescription>{company.description || "Sin descripción"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        localStorage.setItem("selectedCompanyId", company.id.toString());
                        setLocation("/company-info");
                      }}
                    >
                      Acceder
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {selectedCompany && companyIdNum > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Módulos de SIGE</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <DashboardModulesGrid
                companyId={companyIdNum}
                onNavigate={setLocation}
                getPath={(moduleName) =>
                  DASHBOARD_MODULES.find((m) => m.moduleName === moduleName)?.path ?? null
                }
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
