import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader, AlertCircle, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface CreateManagerWithCredentialsProps {
  companyId: number;
  userId: number;
  onSuccess?: () => void;
}

export default function CreateManagerWithCredentials({
  companyId,
  userId,
  onSuccess,
}: CreateManagerWithCredentialsProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createMutation = trpc.managerCreation.createWithCredentials.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      
      setTimeout(() => {
        setSuccess(false);
        onSuccess?.();
      }, 2000);
    },
    onError: (error: any) => {
      setError(error.message || "Error al crear el manager");
      setIsLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Validation
    if (!email || !password || !confirmPassword) {
      setError("Por favor completa todos los campos");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    if (password.length < 12) {
      setError("La contraseña debe tener al menos 12 caracteres");
      setIsLoading(false);
      return;
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSymbols) {
      setError("La contraseña debe contener mayúsculas, minúsculas, números y símbolos");
      setIsLoading(false);
      return;
    }

    createMutation.mutate({
      companyId,
      userId,
      email,
      password,
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Crear Manager con Credenciales</CardTitle>
        <CardDescription>
          Genera automáticamente credenciales de acceso para el nuevo manager
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Manager creado exitosamente con credenciales</span>
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              Correo Electrónico
            </label>
            <Input
              id="email"
              type="email"
              placeholder="manager@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || success}
            />
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 12 caracteres con mayúsculas, números y símbolos"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || success}
            />
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
              Confirmar Contraseña
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Repite la contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading || success}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading || success}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              "Crear Manager con Credenciales"
            )}
          </Button>
        </form>

        {/* Info Message */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
          <p className="font-medium mb-1">Nota:</p>
          <p>
            El manager podrá acceder a la plataforma usando el email y contraseña que establezca aquí.
            Asegúrate de guardar esta información de forma segura.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
