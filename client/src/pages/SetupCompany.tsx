import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { trpc } from "@/lib/trpc";
import { getApiErrorMessage, PASSWORD_HINT, validatePasswordStrength } from "@/lib/password";
import { PasswordRequirements } from "@/components/PasswordRequirements";

export default function SetupCompany() {
  const [, setLocation] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get token from URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const completeSetupMutation = trpc.companySetup.completeSetup.useMutation({
    onSuccess: () => {
      // Redirect to home after successful setup
      setLocation("/");
    },
    onError: (error: unknown) => {
      setError(getApiErrorMessage(error, "Error al completar la configuración"));
      setIsLoading(false);
    },
  });

  const validateForm = () => {
    if (!firstName.trim()) {
      setError("Por favor ingresa tu nombre");
      return false;
    }
    if (!lastName.trim()) {
      setError("Por favor ingresa tu apellido");
      return false;
    }
    if (!password) {
      setError("Por favor ingresa una contraseña");
      return false;
    }
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      setError(strength.message!);
      return false;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    if (!token) {
      setError("Token de invitación no encontrado");
      return;
    }

    setIsLoading(true);
    completeSetupMutation.mutate({
      token,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      password,
    });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Token de invitación no encontrado. Por favor, usa el enlace del email.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Completar Configuración</CardTitle>
          <CardDescription>
            Completa tu perfil para acceder a Lalita S.A.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Nombre</label>
              <Input
                type="text"
                placeholder="Tu nombre"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Apellido</label>
              <Input
                type="text"
                placeholder="Tu apellido"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Contraseña</label>
              <PasswordInput
                placeholder="Contraseña robusta"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
              <p className="text-xs text-gray-500 mt-1">{PASSWORD_HINT}</p>
              <PasswordRequirements className="mt-2" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Confirmar Contraseña</label>
              <PasswordInput
                placeholder="Confirma tu contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Completando..." : "Completar Configuración"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
