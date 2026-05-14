import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, loading, isAuthenticated } = useAuth();
  const processInvitationsMutation = trpc.auth.processAcceptedInvitations.useMutation();
  const processTokenMutation = trpc.auth.processInvitationByToken.useMutation();

  // Fetch companies for auto-selection
  const { data: companies } = trpc.adminOperations.getUserCompanies.useQuery(
    { accountId: user?.id || 0 },
    { enabled: !!user?.id && user?.role === 'user' }
  );

  // Process accepted invitations when user logs in
  useEffect(() => {
    if (isAuthenticated && !loading && user) {
      // First, try to process invitation by token from localStorage
      const token = localStorage.getItem('processOwnerInvitationToken');
      if (token) {
        console.log('[Home] Found invitation token in localStorage, processing...');
        processTokenMutation.mutate({ token });
        // Remove token after processing (success or failure)
        localStorage.removeItem('processOwnerInvitationToken');
      } else {
        // Fall back to email-based processing
        processInvitationsMutation.mutate();
      }
    }
  }, [isAuthenticated, loading, user]);

  // Auto-select company for Process Owners
  useEffect(() => {
    if (user?.role === 'user' && companies && companies.length === 1 && !localStorage.getItem('selectedCompanyId')) {
      console.log('[Home] Auto-selecting company for Process Owner:', companies[0].id);
      localStorage.setItem('selectedCompanyId', companies[0].id.toString());
    }
  }, [user?.role, companies]);

  // Redirigir al dashboard si el usuario está autenticado
  useEffect(() => {
    if (isAuthenticated && !loading) {
      const isManagerAccess = localStorage.getItem('managerCompanyId') !== null;
      setLocation(isManagerAccess ? "/manager-dashboard" : "/dashboard");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900 mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, mostrar página de bienvenida
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-800 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-6">
        <div className="bg-white rounded-lg shadow-xl p-8 space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <img
              src={APP_LOGO}
              alt={APP_TITLE}
              className="h-20 w-20 rounded-lg object-cover shadow-md"
            />
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">{APP_TITLE}</h1>
            <p className="text-slate-600">
              Sistema Integrado de Gestión Empresarial
            </p>
          </div>

          {/* Description */}
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Bienvenido a la plataforma SIGE. Aquí podrás gestionar de manera integral todos los aspectos de tu Sistema Integrado de Gestión Empresarial.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-blue-900">Funcionalidades principales:</h3>
              <ul className="space-y-1 text-blue-800">
                <li>✓ Gestión de Procesos</li>
                <li>✓ Análisis de Riesgos y Matrices</li>
                <li>✓ Cumplimientos y Capacitaciones</li>
                <li>✓ Documentación Centralizada</li>
                <li>✓ Indicadores y Reportes</li>
              </ul>
            </div>
          </div>

          {/* Login Buttons */}
          <div className="space-y-3">
            <Button
              onClick={() => {
                window.location.href = getLoginUrl();
              }}
              size="lg"
              className="w-full bg-blue-900 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg transition-all shadow-md hover:shadow-lg"
            >
              Iniciar Sesión
            </Button>
            
            <Button
              onClick={() => {
                setLocation("/login");
              }}
              size="lg"
              variant="outline"
              className="w-full border-2 border-blue-900 text-blue-900 hover:bg-blue-50 font-semibold py-3 rounded-lg transition-all"
            >
              ¿Ya tienes credenciales? Inicia sesión aquí
            </Button>
          </div>

          {/* Footer */}
          <p className="text-xs text-center text-slate-500">
            © 2025 SIGE Consultores. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
