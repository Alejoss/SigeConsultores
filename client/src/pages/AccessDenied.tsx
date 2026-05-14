import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

/**
 * Access Denied Page
 * Shown when user tries to access a resource they don't have permission for
 */
export default function AccessDenied() {
  const [, navigate] = useLocation();

  const handleGoBack = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <div className="p-8 text-center space-y-6">
          <div className="flex justify-center">
            <AlertCircle className="h-16 w-16 text-red-600" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Acceso Denegado</h1>
            <p className="text-gray-600">
              No tienes permiso para acceder a este recurso.
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              Si crees que esto es un error, contacta con el administrador del sistema.
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <Button
              onClick={handleGoBack}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Volver al Inicio
            </Button>
            <Button
              onClick={() => window.history.back()}
              variant="outline"
              className="w-full"
            >
              Atrás
            </Button>
          </div>

          <div className="text-xs text-gray-500 pt-4 border-t border-gray-200">
            <p>Si tienes preguntas sobre tus permisos, contacta con:</p>
            <p className="font-medium">administrador@sigeconsultores.com</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
