import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader, AlertCircle, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { APP_LOGO, APP_TITLE } from "@/const";
import { toast } from "sonner";
import { getApiErrorMessage, PASSWORD_HINT, validatePasswordStrength } from "@/lib/password";
import { PasswordRequirements } from "@/components/PasswordRequirements";

type Step = "email" | "password";

export default function ForgotPasswordManager() {
  const [, setLocation] = useLocation();
  const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
  const [step, setStep] = useState<Step>(tokenFromUrl ? "password" : "email");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetToken] = useState<string | null>(tokenFromUrl);

  // Mutations
  const requestResetMutation = trpc.passwordReset.requestReset.useMutation();
  const resetPasswordMutation = trpc.passwordReset.resetPassword.useMutation();

  // Step 1: request password reset email
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!email) {
      setError("Por favor ingresa tu correo electrónico");
      setIsLoading(false);
      return;
    }

    try {
      const result = await requestResetMutation.mutateAsync({ email: email.trim().toLowerCase() });
      if (result.success) {
        toast.success("Si el correo existe, recibirás instrucciones para restablecer tu contraseña.");
      } else {
        setError(result.message || "No se pudo iniciar la recuperación de contraseña");
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al procesar tu solicitud"));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: reset password with token
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!newPassword || !confirmPassword) {
      setError("Por favor completa ambos campos de contraseña");
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      setError(strength.message!);
      setIsLoading(false);
      return;
    }

    if (!resetToken) {
      setError("Token inválido. Por favor intenta nuevamente.");
      setIsLoading(false);
      return;
    }

    try {
      const result = await resetPasswordMutation.mutateAsync({
        resetToken,
        newPassword,
      });
      if (result.success) {
        toast.success("Contraseña actualizada exitosamente");
        setTimeout(() => {
          setLocation("/login");
        }, 2000);
      } else {
        setError(result.message || "Error al actualizar la contraseña");
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al procesar tu solicitud"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          {APP_LOGO && (
            <div className="flex justify-center mb-4">
              <img src={APP_LOGO} alt={APP_TITLE} className="h-12 w-auto" />
            </div>
          )}
          <CardTitle className="text-2xl">Recuperar Contraseña</CardTitle>
          <CardDescription>
            {step === "email" && "Ingresa tu correo para recibir el enlace de recuperación"}
            {step === "password" && "Crea tu nueva contraseña"}
          </CardDescription>
          
          {/* Progress Indicator */}
          <div className="flex gap-2 mt-4">
            <div className={`flex-1 h-1 rounded ${step === "email" || step === "password" ? "bg-blue-600" : "bg-gray-200"}`}></div>
            <div className={`flex-1 h-1 rounded ${step === "password" ? "bg-blue-600" : "bg-gray-200"}`}></div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Step 1: Email */}
          {step === "email" && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Correo Electrónico
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar enlace de recuperación"
                )}
              </Button>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === "password" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="newPassword" className="text-sm font-medium text-gray-700">
                  Nueva Contraseña
                </label>
                <PasswordInput
                  id="newPassword"
                  placeholder="Contraseña segura"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">{PASSWORD_HINT}</p>
              </div>

              <PasswordRequirements />

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                  Confirmar Contraseña
                </label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Repite tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  "Actualizar Contraseña"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("email")}
                className="w-full"
              >
                Volver
              </Button>
            </form>
          )}

          {/* Back to Login Link */}
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="text-sm text-blue-600 hover:text-blue-700 underline flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al login
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
