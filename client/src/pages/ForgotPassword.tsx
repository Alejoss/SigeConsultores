import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getApiErrorMessage, PASSWORD_HINT, validatePasswordStrength } from "@/lib/password";
import { PasswordRequirements } from "@/components/PasswordRequirements";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [resetToken, setResetToken] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  const requestPasswordResetMutation = trpc.managerCredentials.requestPasswordReset.useMutation();
  const resetPasswordMutation = trpc.managerCredentials.resetPassword.useMutation();

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !companyId) {
      setError("Por favor completa todos los campos");
      return;
    }

    const companyIdNum = parseInt(companyId, 10);
    if (isNaN(companyIdNum)) {
      setError("ID de empresa inválido");
      return;
    }

    setLoading(true);

    try {
      await requestPasswordResetMutation.mutateAsync({
        email,
      });

      setSuccess(true);
      setEmail("");
      setCompanyId("");

      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al solicitar recuperación de contraseña. Por favor intenta de nuevo."));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!resetToken || !newPassword || !confirmPassword) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      setError(strength.message!);
      return;
    }

    setLoading(true);

    try {
      await resetPasswordMutation.mutateAsync({
        resetToken,
        newPassword,
        confirmPassword,
      });

      setSuccess(true);
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");

      // Redirect to home after 2 seconds
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al restablecer la contraseña. Por favor intenta de nuevo."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Recuperar Contraseña</CardTitle>
          <CardDescription>
            {step === "email"
              ? "Ingresa tu correo electrónico para recibir instrucciones de recuperación"
              : "Ingresa tu nueva contraseña"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success && step === "email" && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Se ha enviado un enlace de recuperación a tu correo electrónico. Por favor revisa tu bandeja de entrada.
              </AlertDescription>
            </Alert>
          )}

          {success && step === "reset" && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                ¡Contraseña restablecida exitosamente! Redirigiendo...
              </AlertDescription>
            </Alert>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">ID de Empresa</label>
                <Input
                  type="number"
                  placeholder="Ingresa el ID de tu empresa"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Correo Electrónico</label>
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Instrucciones"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/")}
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Token de Recuperación</label>
                <Input
                  type="text"
                  placeholder="Pega el token del enlace de correo"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Nueva Contraseña</label>
                <PasswordInput
                  placeholder="Ingresa una nueva contraseña"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                />
                <p className="text-xs text-gray-500">{PASSWORD_HINT}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Confirmar Contraseña</label>
                <PasswordInput
                  placeholder="Confirma tu nueva contraseña"
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
                    Restableciendo...
                  </>
                ) : (
                  "Restablecer Contraseña"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("email");
                  setResetToken("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setError("");
                }}
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>
            </form>
          )}

          <p className="text-xs text-gray-500 text-center mt-4">
            ¿No recibiste el correo? Revisa tu carpeta de spam o intenta de nuevo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
