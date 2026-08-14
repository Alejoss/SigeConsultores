import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

/**
 * Process Owner Invitation Acceptance Page
 * Allows process owners to accept invitations by providing the 4-digit access code
 */
export default function ProcessOwnerInvitationAccept() {
  const [, setLocation] = useLocation();
  const [accessCode, setAccessCode] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Extract token from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");
    if (!token) {
      setError("Token de invitación no válido. Por favor, verifica el link que recibiste.");
      setIsLoading(false);
    } else {
      setInvitationToken(token);
      // TODO: Fetch invitation data by token
      setIsLoading(false);
    }
  }, []);

  const [acceptanceSuccess, setAcceptanceSuccess] = useState(false);

  // Accept invitation mutation
  const acceptInvitationMutation = trpc.hierarchicalAccess.processOwnerInvitations.accept.useMutation({
    onSuccess: () => {
      // Store the invitation token in localStorage for later use when user logs in
      localStorage.setItem('processOwnerInvitationToken', invitationToken);
      setAcceptanceSuccess(true);
      toast.success("¡Invitación aceptada correctamente!");
    },
    onError: (error: any) => {
      setError(error.message || "Error al aceptar la invitación. Verifica el código de acceso.");
      toast.error("Error al aceptar la invitación");
    },
  });

  const handleAcceptInvitation = async () => {
    if (!accessCode || accessCode.length !== 12) {
      setError("Por favor ingresa un código de 12 caracteres");
      return;
    }

    if (!invitationToken) {
      setError("Token de invitación no válido");
      return;
    }

    setError(null);
    acceptInvitationMutation.mutate({
      token: invitationToken,
      accessCode,
    });
  };

  if (!invitationToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Link Inválido</CardTitle>
            <CardDescription>El link de invitación no es válido</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button onClick={() => setLocation("/")} className="w-full mt-4">
              Volver al Inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando invitación...</p>
        </div>
      </div>
    );
  }

  // Success state - show confirmation message
  if (acceptanceSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6" />
              ¡Invitación Aceptada!
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Tu invitación ha sido aceptada correctamente. Ya tienes acceso a tu proceso en la plataforma.
                </AlertDescription>
              </Alert>

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-semibold text-blue-900 mb-2">¿Qué hacer ahora?</p>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>Inicia sesión en la plataforma con tu email: <strong>{invitationData?.email || "tu email"}</strong></li>
                  <li>Accede a "Mapa de Procesos" para ver tu proceso asignado</li>
                  <li>Explora los módulos de ISGE 360 disponibles para tu proceso</li>
                </ol>
              </div>

              <Button
                onClick={() => {
                  window.location.href = getLoginUrl();
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                Iniciar Sesión en la Plataforma
              </Button>
              
              <p className="text-xs text-center text-gray-500 mt-2">
                Se abrirá la página de login. Usa tu email: <strong>{invitationData?.email || "tu email"}</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
          <CardTitle>Aceptar Invitación</CardTitle>
          <CardDescription className="text-blue-100">
            Crea tu código de acceso personal (12 caracteres)
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {/* Invitation Details */}
          <div className="space-y-4 mb-6 p-4 bg-blue-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">Proceso Asignado</p>
              <p className="font-semibold text-gray-900">{invitationData?.processName || "Proceso"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email Registrado</p>
              <p className="font-semibold text-gray-900">{invitationData?.email || "email@example.com"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Estado</p>
              <p className="font-semibold">
                <span className="text-yellow-600">Pendiente de Aceptación</span>
              </p>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Access Code Input */}
          <div className="space-y-2 mb-6">
            <Label htmlFor="accessCode" className="text-base font-semibold">
              Crea tu Código de Acceso (12 caracteres)
            </Label>
            <Input
              id="accessCode"
              type="text"
              placeholder="MiCodigo@2024#X"
              maxLength={12}
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
              }}
              disabled={acceptInvitationMutation.isPending}
              className="text-center font-mono"
            />
            <p className="text-xs text-gray-500">
              Crea un código robusto de 12 caracteres que solo tú conoces. Puede incluir letras, números y símbolos. Este código será tu contraseña de acceso.
            </p>
          </div>

          {/* Accept Button */}
          <Button
            onClick={handleAcceptInvitation}
            disabled={acceptInvitationMutation.isPending || accessCode.length !== 12}
            className="w-full"
            size="lg"
          >
            {acceptInvitationMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Aceptando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aceptar Invitación y Crear Acceso
              </>
            )}
          </Button>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-800">
              <strong>¿Qué sucede después?</strong> Una vez aceptes la invitación con tu código personal, deberás iniciar sesión en la plataforma
              con tu email y este código para acceder a tu proceso específico en "Mapa de Procesos" y a todos los módulos de ISGE 360.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
