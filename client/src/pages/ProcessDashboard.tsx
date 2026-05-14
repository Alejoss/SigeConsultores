import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { trpc } from "@/lib/trpc";
import { LogOut, AlertCircle, Lock } from "lucide-react";

/**
 * Process Dashboard for Process Leaders
 * Shows process-specific information and controls
 * Only accessible with valid process leader session
 */
export default function ProcessDashboard() {
  const [, navigate] = useLocation();
  const { session, isLoading: isAuthLoading, logout } = useProcessLeaderAuth();

  // Get processId from URL
  const urlParams = new URLSearchParams(window.location.search);
  const processIdFromUrl = parseInt(urlParams.get("processId") || "0");

  // Fetch process details
  const { data: processData, isLoading: isProcessLoading } = trpc.processes.get.useQuery(
    { processId: processIdFromUrl },
    {
      enabled: session !== null && processIdFromUrl > 0,
    }
  );

  // Redirect if not authenticated after loading completes
  useEffect(() => {
    if (!isAuthLoading && !session) {
      navigate(`/login?processId=${processIdFromUrl}`);
    }
  }, [isAuthLoading, session, navigate, processIdFromUrl]);

  // Show loading state while auth context is loading
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  // Show error if not authenticated
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No estás autenticado. Redirigiendo al login...
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Verify processId matches session
  if (session.processId !== processIdFromUrl) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Alert variant="destructive" className="max-w-md mx-auto mt-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            ID de proceso no coincide. Por favor, accede con el link correcto.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Panel de Líder de Proceso</h1>
            <p className="text-gray-600 text-sm mt-1">
              Bienvenido, {session.leaderName}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Session Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información de Sesión</CardTitle>
            <CardDescription>Detalles de tu acceso actual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Nombre</p>
                <p className="font-medium">{session.leaderName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{session.leaderEmail}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">ID de Proceso</p>
                <p className="font-medium">{session.processId}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Sesión</p>
                <p className="font-medium">
                  {session.rememberMe ? "Recordada (30 días)" : "Actual"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Process Details */}
        {isProcessLoading ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-600">Cargando información del proceso...</p>
            </CardContent>
          </Card>
        ) : processData ? (
          <Card>
            <CardHeader>
              <CardTitle>{processData?.name || "Proceso"}</CardTitle>
              <CardDescription>Detalles del proceso asignado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Descripción</p>
                <p className="text-gray-800">{processData?.description || "Sin descripción"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Empresa</p>
                  <p className="font-medium">{processData?.companyId || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Estado</p>
                  <p className="font-medium">Activo</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No se pudo cargar la información del proceso.
            </AlertDescription>
          </Alert>
        )}

        {/* Future Features */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subprocesos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Próximamente: Visualización de subprocesos asignados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Próximamente: Registros y auditoría de actividades
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cambiar contraseña</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Próximamente: Opción para cambiar tu contraseña de acceso
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Soporte</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Próximamente: Contacto con administrador
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
