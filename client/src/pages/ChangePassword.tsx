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

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [companyId, setCompanyId] = useState<number | null>(null);

  // Get companyId from localStorage (set during login)
  useEffect(() => {
    const storedCompanyId = localStorage.getItem("companyId");
    if (!storedCompanyId) {
      setError("No se encontró información de la empresa. Por favor inicia sesión nuevamente.");
      setTimeout(() => setLocation("/"), 2000);
      return;
    }
    setCompanyId(parseInt(storedCompanyId, 10));
  }, [setLocation]);

  const changePasswordMutation = trpc.managerCredentials.changePassword.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las nuevas contraseñas no coinciden");
      return;
    }

    if (currentPassword === newPassword) {
      setError("La nueva contraseña debe ser diferente a la actual");
      return;
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      setError(strength.message!);
      return;
    }

    if (!companyId) {
      setError("Error: No se encontró la información de la empresa");
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Reset success message after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Error al cambiar la contraseña. Por favor intenta de nuevo."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Cambiar Contraseña</CardTitle>
          <CardDescription>
            Actualiza tu contraseña de acceso a la plataforma ISGE 360
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                ¡Contraseña cambiada exitosamente!
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Contraseña Actual</label>
              <PasswordInput
                placeholder="Ingresa tu contraseña actual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                visible={showPassword}
                onVisibleChange={setShowPassword}
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
              <label className="text-sm font-medium">Confirmar Nueva Contraseña</label>
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
                  Cambiando contraseña...
                </>
              ) : (
                "Cambiar Contraseña"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
