import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Building2, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { APP_TITLE } from "@/const";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { MODULE_GROUPS } from "@shared/dashboardModules";

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
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (contextLoading) return;
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

        {/* Modules Section — primero */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Módulos del Sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {MODULE_GROUPS.map((group) => {
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

        {/* Datos Generales — colapsable, debajo de módulos */}
        <div className="mb-8">
          <button
            className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-3 transition-colors"
            onClick={() => setShowInfo(!showInfo)}
          >
            {showInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showInfo ? "Ocultar datos generales" : "▼ Datos generales"}
          </button>
          {showInfo && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          )}
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
