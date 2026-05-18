import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Building2, Settings, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { APP_TITLE } from "@/const";
import { toast } from "sonner";
import DashboardModulesGrid from "@/components/DashboardModulesGrid";
import { buildScopedModuleRoute } from "@shared/dashboardModules";

// Welcome Card Component
function WelcomeCard({ companyId, companyName }: { companyId: number | null; companyName: string | null }) {
  const companyQuery = trpc.managerAuth.getCompanyInfo.useQuery(
    { companyId: companyId || 0 },
    { enabled: !!companyId }
  );

  const description = companyQuery.data?.description || "Accede a los módulos de tu empresa para gestionar el Sistema Integrado de Gestión Empresarial";

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
      </div>
    </Card>
  );
}

export default function ManagerDashboard() {
  const [, setLocation] = useLocation();
  const [managerEmail, setManagerEmail] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    leaderEmail: "",
    leaderName: "",
    processId: "",
  });

  // Fetch processes for the company
  const getProcessesQuery = trpc.processes.list.useQuery(
    { companyId: companyId || 0 },
    { enabled: !!companyId }
  );

  // Create invitation mutation
  const createInvitationMutation = trpc.processLeaderInvitations.createInvitationByManager.useMutation({
    onSuccess: (data) => {
      toast.success("Invitación creada exitosamente");
      setShowInviteModal(false);
      setInviteForm({ leaderEmail: "", leaderName: "", processId: "" });
      // Redirect to invitation link page with token
      if (data.invitationToken) {
        setLocation(`/process-leader-invitation-link?token=${encodeURIComponent(data.invitationToken)}`);
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let compId = localStorage.getItem("managerCompanyId");
      let compName = localStorage.getItem("managerCompanyName");
      let email = localStorage.getItem("managerEmail");

      if (!compId || !compName) {
        try {
          const res = await fetch("/api/auth/session/me", { credentials: "include" });
          const data = (await res.json()) as {
            authenticated: boolean;
            kind?: string;
            companyId?: number;
            companyName?: string;
            managerEmail?: string;
          };
          if (
            data.authenticated &&
            data.kind === "company_manager" &&
            data.companyId != null &&
            data.companyName
          ) {
            compId = String(data.companyId);
            compName = data.companyName;
            email = data.managerEmail ?? null;
            localStorage.setItem("managerCompanyId", compId);
            localStorage.setItem("managerCompanyName", compName);
            if (email) {
              localStorage.setItem("managerEmail", email);
              localStorage.setItem("managerName", email);
            }
            localStorage.setItem("selectedCompanyId", compId);
          }
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;
      if (!compId || !compName) {
        setLocation("/login");
        return;
      }

      setCompanyId(parseInt(compId, 10));
      setCompanyName(compName);
      setManagerEmail(email);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  const handleLogout = () => {
    void fetch("/api/auth/session/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("managerCompanyId");
    localStorage.removeItem("managerCompanyName");
    localStorage.removeItem("managerEmail");
    localStorage.removeItem("managerName");
    localStorage.removeItem("selectedCompanyId");
    setLocation("/login");
  };

  const handleQuickAction = (action: "editProfile" | "changePassword" | "documentation") => {
    if (action === "editProfile") {
      setLocation("/manager-edit-profile");
      return;
    }
    const labels = {
      changePassword: "Cambiar Contraseña",
      documentation: "Ver Documentación",
    };
    toast.info(`${labels[action]} - Próximamente disponible`);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[ManagerDashboard] handleInviteSubmit called");
    console.log("[ManagerDashboard] inviteForm:", inviteForm);
    console.log("[ManagerDashboard] managerEmail:", managerEmail);
    console.log("[ManagerDashboard] companyId:", companyId);
    
    if (!inviteForm.processId || !inviteForm.leaderEmail || !inviteForm.leaderName) {
      console.log("[ManagerDashboard] Missing required fields");
      toast.error("Por favor completa todos los campos");
      return;
    }

    if (!companyId) {
      console.log("[ManagerDashboard] Missing company ID");
      toast.error("ID de empresa no disponible");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteForm.leaderEmail)) {
      console.log("[ManagerDashboard] Invalid email format");
      toast.error("Email del jefe de proceso inválido");
      return;
    }

    console.log("[ManagerDashboard] Calling createInvitationMutation.mutateAsync");
    try {
      const result = await createInvitationMutation.mutateAsync({
        companyId: companyId,
        processId: parseInt(inviteForm.processId),
        leaderEmail: inviteForm.leaderEmail,
        leaderName: inviteForm.leaderName,
      });
      console.log("[ManagerDashboard] Mutation completed successfully:", result);
    } catch (error) {
      console.error("[ManagerDashboard] Mutation error:", error);
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      toast.error(`Error al enviar invitación: ${errorMessage}`);
    }

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{APP_TITLE}</h1>
            <p className="text-sm text-gray-600">Panel del Gerente</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{managerEmail}</p>
              <p className="text-xs text-gray-600">Gerente</p>
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
        <WelcomeCard companyId={companyId} companyName={companyName} />

        {/* Company Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Información de la Empresa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-2">ID de Empresa:</p>
              <p className="text-lg font-semibold text-gray-900">{companyId || "Cargando..."}</p>
              <p className="text-sm text-gray-600 mt-4 mb-2">Tu Correo:</p>
              <p className="text-sm font-medium text-gray-900">{managerEmail}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Acciones Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => handleQuickAction("editProfile")}
              >
                Editar Perfil
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => handleQuickAction("changePassword")}
              >
                Cambiar Contraseña
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => handleQuickAction("documentation")}
              >
                Ver Documentación
              </Button>
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

        {/* Administrator Section */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Administración</h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Gestión de Jefes de Proceso
              </CardTitle>
              <CardDescription>
                Invita y gestiona a los jefes de proceso de tu empresa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setShowInviteModal(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Invitar Jefe de Proceso
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Modules Section */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Módulos Disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companyId ? (
              <DashboardModulesGrid
                companyId={companyId}
                onNavigate={setLocation}
                getPath={(moduleName) =>
                  buildScopedModuleRoute(moduleName, { companyId, isManager: true })
                }
              />
            ) : null}
          </div>
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Invitar Jefe de Proceso</CardTitle>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proceso
                  </label>
                  <select
                    value={inviteForm.processId}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, processId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">Selecciona un proceso</option>
                    {getProcessesQuery.data?.map((process: any) => (
                      <option key={process.id} value={process.id}>
                        {process.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Jefe
                  </label>
                  <input
                    type="text"
                    value={inviteForm.leaderName}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, leaderName: e.target.value })
                    }
                    placeholder="Nombre completo"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={inviteForm.leaderEmail}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, leaderEmail: e.target.value })
                    }
                    placeholder="correo@ejemplo.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={createInvitationMutation.isPending}
                  >
                    {createInvitationMutation.isPending ? "Enviando..." : "Enviar Invitación"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
