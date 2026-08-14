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

export default function SetupProcessLeaderPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [tokenError, setTokenError] = useState(false);

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

  const createPasswordMutation = trpc.processLeaderInvitations.setInitialPassword.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Token de invitación no encontrado. Por favor usa el enlace compartido por tu gerente.");
      return;
    }

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
      await createPasswordMutation.mutateAsync({
        invitationToken: token,
        password,
        confirmPassword,
      });
      setSuccess(true);
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
            <CardTitle className="text-2xl">Token inválido</CardTitle>
            <CardDescription>No se pudo procesar tu solicitud</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                El token de invitación no es válido o ha expirado. Solicita un nuevo enlace a tu gerente.
              </AlertDescription>
            </Alert>
            <Button onClick={() => setLocation("/login")} className="w-full">
              Ir al login
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
          <CardTitle className="text-2xl">Crear contraseña</CardTitle>
          <CardDescription>Configura tu acceso como jefe de proceso en ISGE 360</CardDescription>
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
                <h3 className="font-semibold text-lg">¡Invitación aceptada!</h3>
                <p className="text-sm text-gray-600">Ya puedes iniciar sesión con tu correo y contraseña</p>
              </div>
              <Button onClick={() => setLocation("/login")} className="w-full bg-blue-600 hover:bg-blue-700">
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
                <label className="text-sm font-medium">Confirmar contraseña</label>
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

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configurando contraseña...
                  </>
                ) : (
                  "Configurar contraseña"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
