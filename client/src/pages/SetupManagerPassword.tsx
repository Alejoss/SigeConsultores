import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getApiErrorMessage, PASSWORD_HINT, validatePasswordStrength } from "@/lib/password";
import { PasswordRequirements } from "@/components/PasswordRequirements";

export default function SetupManagerPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  // Extract token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    
    if (!tokenFromUrl) {
      setTokenError(true);
      setError("Token de invitación no encontrado. Por favor, verifica el enlace de correo electrónico.");
    } else {
      setToken(tokenFromUrl);
    }
  }, []);

  const createPasswordMutation = trpc.managerCredentials.setInitialPassword.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!password || !confirmPassword) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      setError(strength.message!);
      return;
    }

    setLoading(true);

    try {
      const result = await createPasswordMutation.mutateAsync({
        invitationToken: token,
        password,
        confirmPassword,
      });

      if (result.companyId && result.managerEmail) {
        setSuccess(true);
      } else {
        setError("Error al procesar tu solicitud. Por favor intenta de nuevo.");
      }
      setPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al crear la contraseña. Por favor intenta de nuevo."));
    } finally {
      setLoading(false);
    }
  };

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Token Inválido</CardTitle>
            <CardDescription>No se pudo procesar tu solicitud</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                El token de invitación no es válido o ha expirado. Por favor solicita un nuevo enlace de invitación.
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => setLocation("/")}
              className="w-full"
            >
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Crear Contraseña</CardTitle>
          <CardDescription>
            Configura tu contraseña para acceder a la plataforma SIGE
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div className="text-center space-y-2 mb-4">
                <h3 className="font-semibold text-lg">¡Invitación Aceptada!</h3>
                <p className="text-sm text-gray-600">Tu cuenta ha sido creada exitosamente</p>
              </div>

              <Button
                onClick={() => setLocation("/login")}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Ir al login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Contraseña</label>
                <PasswordInput
                  placeholder="Ingresa una contraseña segura"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                />
                <p className="text-xs text-gray-500">{PASSWORD_HINT}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Confirmar Contraseña</label>
                <PasswordInput
                  placeholder="Confirma tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                />
              </div>

              <PasswordRequirements />

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configurando contraseña...
                  </>
                ) : (
                  "Configurar Contraseña"
                )}
              </Button>

              <p className="text-xs text-gray-500 text-center">
                Tu contraseña es responsabilidad tuya. Guárdala en un lugar seguro.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
