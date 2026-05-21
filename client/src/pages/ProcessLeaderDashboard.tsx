import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Building2, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { APP_TITLE } from "@/const";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import DashboardModulesGrid from "@/components/DashboardModulesGrid";
import { buildScopedModuleRoute } from "@shared/dashboardModules";

// Welcome Card Component
function WelcomeCard({ companyId, companyName, processName }: { companyId: number | null; companyName: string | null; processName: string | null }) {
  const companyQuery = trpc.managerAuth.getCompanyInfo.useQuery(
    { companyId: companyId || 0 },
    { enabled: !!companyId }
  );

  const description = companyQuery.data?.description || "Accede a los módulos de tu empresa para gestionar tu proceso en el Sistema Integrado de Gestión Empresarial";

  return (
    <Card className="mb-8 bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
      <CardHeader>
        <CardTitle className="text-2xl">
          Bienvenido, {companyName || "tu Empresa"}
        </CardTitle>
      </CardHeader>
      <div className="px-6 py-4 border-t border-blue-400">
        <p className="text-blue-50 text-sm leading-relaxed">
          {description}
        </p>
        {processName && (
          <p className="text-blue-100 text-sm mt-2">
            <strong>Tu Proceso:</strong> {processName}
          </p>
        )}
      </div>
    </Card>
  );
}

export default function ProcessLeaderDashboard() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, logout, isLoading: contextLoading } = useProcessLeaderAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait for context to finish loading before checking authentication
    if (contextLoading) {
      return; // Still loading, don't do anything yet
    }
    
    // Check if process leader is authenticated
    if (!processLeaderSession) {
      setLocation("/login");
      return;
    }
    setIsLoading(false);
  }, [processLeaderSession, contextLoading, setLocation]);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!processLeaderSession) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{APP_TITLE}</h1>
            <p className="text-sm text-gray-600">Panel del Jefe de Proceso</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{processLeaderSession.leaderEmail}</p>
              <p className="text-xs text-gray-600">Jefe de Proceso</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Card */}
        <WelcomeCard 
          companyId={processLeaderSession.companyId || null} 
          companyName={processLeaderSession.companyName || "Empresa"}
          processName={processLeaderSession.processName || "Mi Proceso"}
        />

        {/* Company Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Información General
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-2">Nombre:</p>
              <p className="text-lg font-semibold text-gray-900">{processLeaderSession.leaderName}</p>
              <p className="text-sm text-gray-600 mt-4 mb-2">Tu Correo:</p>
              <p className="text-sm font-medium text-gray-900">{processLeaderSession.leaderEmail}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Tu Proceso
            </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-2">Proceso Asignado:</p>
              <p className="text-lg font-semibold text-gray-900">{processLeaderSession.processName || "Cargando..."}</p>
              <p className="text-sm text-gray-600 mt-4 mb-2">ID del Proceso:</p>
              <p className="text-sm font-medium text-gray-900">{processLeaderSession.processId}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado del Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Plataforma</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Operativa
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Tu Acceso</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Activo
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Modules Section */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Módulos Disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {processLeaderSession.companyId && processLeaderSession.processId ? (
              <DashboardModulesGrid
                companyId={processLeaderSession.companyId}
                onNavigate={setLocation}
                getPath={(moduleName) =>
                  buildScopedModuleRoute(moduleName, {
                    companyId: processLeaderSession.companyId!,
                    processId: processLeaderSession.processId!,
                  })
                }
              />
            ) : null}
          </div>
        </div>

        {/* Note Section */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Nota:</strong> Tienes acceso a todos los módulos SIGE de la empresa, pero solo puedes editar tu proceso asignado. Si necesitas acceder a otros procesos, contacta con el Gerente General.
          </p>
        </div>
      </main>
    </div>
  );
}
