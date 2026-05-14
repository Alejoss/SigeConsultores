import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useModuleLabels } from "@/hooks/useModuleLabels";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useMemo, useEffect } from "react";
export default function Dashboard() {
  const { user } = useAuth();
  const { isManagerLogin, managerCompanyId } = useManagerAuth();
  const [location, setLocation] = useLocation();

  // Check if companyId is in URL parameters
  const urlParams = new URLSearchParams(location.split('?')[1]);
  const companyIdFromUrl = urlParams.get('companyId');
  
  // Use manager company if logged in as manager, otherwise use URL parameter or localStorage
  const selectedCompanyId = useMemo(() => {
    if (isManagerLogin && managerCompanyId) {
      return managerCompanyId.toString();
    }
    return companyIdFromUrl || localStorage.getItem("selectedCompanyId");
  }, [isManagerLogin, managerCompanyId, companyIdFromUrl]);
  
  // Query for OAuth users to get their companies
  const { data: companies, isLoading } = trpc.adminOperations.getUserCompanies.useQuery(
    { accountId: user?.id || 0 },
    { enabled: !!user?.id && !isManagerLogin }
  );
  
  // Query for manager to get their specific company
  const companyIdNum = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const { data: managerCompany, isLoading: isManagerCompanyLoading } = trpc.adminOperations.getCompanyById.useQuery(
    { companyId: companyIdNum },
    { enabled: isManagerLogin && companyIdNum > 0 }
  );
  
  // Save to localStorage if coming from URL
  useEffect(() => {
    if (companyIdFromUrl) {
      localStorage.setItem("selectedCompanyId", companyIdFromUrl);
    }
  }, [companyIdFromUrl]);
  
  // Use manager company if manager login, otherwise find in companies array
  const selectedCompany = useMemo(() => {
    if (isManagerLogin) {
      return managerCompany;
    }
    return companies?.find(c => c.id.toString() === selectedCompanyId);
  }, [isManagerLogin, managerCompany, companies, selectedCompanyId]);
  
  // Clean up URL parameter after saving to localStorage
  useEffect(() => {
    if (companyIdFromUrl && location.includes('?')) {
      setLocation('/dashboard');
    }
  }, []);
  
  // Already defined above in selectedCompanyId useMemo
  const { getLabel } = useModuleLabels(companyIdNum);

  // Auto-select company for managers and process owners (if they have only one company)
  useEffect(() => {
    if (companies && companies.length === 1 && !selectedCompanyId && user?.role === "user") {
      localStorage.setItem("selectedCompanyId", companies[0].id.toString());
    }
  }, [companies, selectedCompanyId, user?.role]);

  // Debug: Log selectedCompanyId
  useEffect(() => {
    console.log("Dashboard - selectedCompanyId:", selectedCompanyId);
    console.log("Dashboard - companies:", companies);
    console.log("Dashboard - managerCompany:", managerCompany);
    console.log("Dashboard - selectedCompany:", selectedCompany);
    console.log("Dashboard - isManagerLogin:", isManagerLogin);
  }, [selectedCompanyId, companies, selectedCompany, managerCompany, isManagerLogin]);

  const menuItems = useMemo(() => [
    {
      title: getLabel("sige_company_info", "Propósito, Misión, Visión"),
      description: "Define los fundamentos estratégicos de tu empresa",
      path: "/company-info",
      icon: "🎯",
    },
    {
      title: getLabel("sige_corporate_values", "Valores Empresariales"),
      description: "Establece los valores que guían tu organización",
      path: "/values",
      icon: "💎",
    },
    {
      title: getLabel("sige_policy", "Política"),
      description: "Documenta la política del Sistema Integrado de Gestión",
      path: "/policy",
      icon: "📋",
    },
    {
      title: getLabel("sige_organization_chart", "Organigrama"),
      description: "Gestiona la estructura organizacional de tu empresa",
      path: "/organization-chart",
      icon: "🏢",
    },
    {
      title: getLabel("sige_process_map", "Mapa de Procesos"),
      description: "Visualiza y gestiona los procesos empresariales",
      path: "/process-map",
      icon: "🗺️",
    },
    {
      title: getLabel("sige_strategic_objectives", "Objetivos Estratégicos"),
      description: "Define los objetivos a largo plazo de la empresa",
      path: "/strategic-objectives",
      icon: "🎪",
    },
    {
      title: "FODA de Empresa",
      description: "Consolida los FODA de procesos y crea el FODA general de la empresa",
      path: "/foda",
      icon: "📈",
    },
    {
      title: getLabel("sige_indicators", "Indicadores"),
      description: "Monitorea el desempeño de tu Sistema Integrado de Gestión",
      path: "/indicators",
      icon: "📊",
    },
    {
      title: "Flujograma SIGE",
      description: "Visualiza la estructura completa del Sistema Integrado de Gestión",
      path: "/flowchart",
      icon: "🔄",
    },
  ], [getLabel]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg p-8">
          {selectedCompany ? (
            <>
              <h1 className="text-4xl font-bold mb-2">Bienvenido, {selectedCompany.name}</h1>
              <p className="text-blue-100">
                {selectedCompany.description || "Plataforma para gestionar tu Sistema Integrado de Gestión Empresarial"}
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

        {/* Companies Section - Only show if no company is selected and user is admin */}
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
                        // Store selected company in localStorage for use in other pages
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

        {selectedCompany && user?.role === "admin" ? (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Módulos de SIGE</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {menuItems.map((item) => (
                <Card
                  key={item.path}
                  className="hover:shadow-lg transition-all cursor-pointer hover:border-blue-400"
                  onClick={() => setLocation(item.path)}
                >
                  <CardHeader>
                    <div className="text-4xl mb-2">{item.icon}</div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full">
                      Acceder
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold mb-4">Módulos de SIGE</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {menuItems.map((item) => (
                <Card
                  key={item.path}
                  className="hover:shadow-lg transition-all cursor-pointer hover:border-blue-400"
                  onClick={() => setLocation(item.path)}
                >
                  <CardHeader>
                    <div className="text-4xl mb-2">{item.icon}</div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full">
                      Acceder
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

import DashboardLayout from "@/components/DashboardLayout";
