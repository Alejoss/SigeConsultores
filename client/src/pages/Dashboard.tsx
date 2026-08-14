import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { MODULE_GROUPS } from "@shared/dashboardModules";
import { HardDrive } from "lucide-react";

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

  const storageQuery = trpc.adminOperations.getMyStorageUsage.useQuery(
    { companyId: companyIdNum },
    { enabled: companyIdNum > 0, refetchOnWindowFocus: false }
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

        {/* Indicador de almacenamiento — discreto, solo cuando hay empresa seleccionada */}
        {selectedCompany && companyIdNum > 0 && storageQuery.data && (
          <div className="flex items-center gap-3 bg-white border rounded-lg px-4 py-3 shadow-sm">
            <HardDrive
              className={`h-5 w-5 flex-shrink-0 ${
                storageQuery.data.percentUsed >= 100
                  ? "text-red-500"
                  : storageQuery.data.percentUsed >= 80
                  ? "text-yellow-500"
                  : "text-blue-400"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500 font-medium">Almacenamiento</span>
                <span
                  className={`font-semibold text-xs ${
                    storageQuery.data.percentUsed >= 100
                      ? "text-red-600"
                      : storageQuery.data.percentUsed >= 80
                      ? "text-yellow-600"
                      : "text-slate-600"
                  }`}
                >
                  {storageQuery.data.usedMb < 1
                    ? `${Math.round(storageQuery.data.usedBytes / 1024)} KB`
                    : `${storageQuery.data.usedMb.toFixed(1)} MB`}{" "}
                  / {storageQuery.data.limitMb} MB &mdash; {storageQuery.data.percentUsed}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    storageQuery.data.percentUsed >= 100
                      ? "bg-red-500"
                      : storageQuery.data.percentUsed >= 80
                      ? "bg-yellow-500"
                      : "bg-blue-400"
                  }`}
                  style={{ width: `${Math.min(storageQuery.data.percentUsed, 100)}%` }}
                />
              </div>
              {storageQuery.data.percentUsed >= 80 && storageQuery.data.percentUsed < 100 && (
                <p className="text-xs text-yellow-600 mt-1">
                  Atención: estás usando más del 80% de tu espacio. Contacta al administrador para ampliar tu plan.
                </p>
              )}
              {storageQuery.data.percentUsed >= 100 && (
                <p className="text-xs text-red-600 mt-1">
                  Has alcanzado el límite de almacenamiento. No podrás subir nuevos archivos. Contacta al administrador.
                </p>
              )}
            </div>
          </div>
        )}

        {selectedCompany && companyIdNum > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Módulos de ISGE 360</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {MODULE_GROUPS.map((group) => {
                const AXIS_STYLES: Record<string, { card: string; btn: string; icon_bg: string }> = {
                  estrategia: { card: "bg-sky-50 border-sky-200 hover:border-sky-400 hover:shadow-sky-100", btn: "border-sky-300 text-sky-700 hover:bg-sky-100", icon_bg: "bg-sky-100" },
                  gestion:    { card: "bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-100", btn: "border-emerald-300 text-emerald-700 hover:bg-emerald-100", icon_bg: "bg-emerald-100" },
                  desempeno:  { card: "bg-violet-50 border-violet-200 hover:border-violet-400 hover:shadow-violet-100", btn: "border-violet-300 text-violet-700 hover:bg-violet-100", icon_bg: "bg-violet-100" },
                };
                const AXIS_ROUTES: Record<string, string> = {
                  estrategia: "/axis-estrategia",
                  gestion:    "/axis-gestion",
                  desempeno:  "/axis-desempeno",
                };
                const style = AXIS_STYLES[group.id];
                return (
                  <Card
                    key={group.id}
                    className={`cursor-pointer transition-all hover:shadow-lg ${style.card}`}
                    onClick={() => setLocation(AXIS_ROUTES[group.id])}
                  >
                    <CardHeader className="pb-3">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl mb-3 ${style.icon_bg}`}>
                        {group.icon}
                      </div>
                      <CardTitle className="text-xl">{group.label}</CardTitle>
                      <CardDescription className="text-sm">{group.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className={`w-full ${style.btn}`}>
                        Ver módulos
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
