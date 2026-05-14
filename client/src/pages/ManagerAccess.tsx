import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";

export default function ManagerAccess() {
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<"validate" | "accept" | "success" | "error">("validate");
  const [errorMessage, setErrorMessage] = useState("");
  const [invitationData, setInvitationData] = useState<any>(null);


  // Validate invitation token
  const { data: validationResult, isLoading: isValidating } = trpc.managerInvitations.getByToken.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );



  // Accept invitation mutation
  const acceptMutation = trpc.managerInvitations.accept.useMutation({
    onSuccess: (data) => {
      setStep("success");
    },
    onError: (error: any) => {
      setErrorMessage(error.message || "Error al aceptar la invitación");
      setStep("error");
    },
  });

  useEffect(() => {
    if (!token) {
      setErrorMessage("Token de invitación no encontrado");
      setStep("error");
      return;
    }

    if (isValidating) return;

    if (validationResult?.valid) {
      setInvitationData(validationResult.invitation);
      setStep("accept");
    } else {
      setErrorMessage(validationResult?.message || "Invitación no válida");
      setStep("error");
    }
  }, [validationResult, isValidating, token]);



  const validatePassword = (pwd: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (pwd.length < 12) {
      errors.push("Mínimo 12 caracteres");
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push("Al menos una mayúscula");
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push("Al menos una minúscula");
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push("Al menos un número");
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) {
      errors.push("Al menos un carácter especial (!@#$%^&* etc)");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setErrorMessage("Por favor completa todos los campos");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden");
      return;
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      setErrorMessage(`Contraseña inválida: ${validation.errors.join(", ")}`);
      return;
    }

    // Accept the invitation with password
    acceptMutation.mutate({ token: token || "", password });
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
            <CardTitle>Validando invitación...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-2" />
            <CardTitle className="text-red-600">Error en la Invitación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
            <Button onClick={() => navigate("/")} className="w-full">
              Ir a inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
            <CardTitle>¡Invitación Aceptada!</CardTitle>
            <CardDescription>Tu cuenta ha sido creada exitosamente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                Ya puedes acceder a la plataforma con tu correo y contraseña.
              </AlertDescription>
            </Alert>
            <Button onClick={() => navigate("/login")} className="w-full bg-green-600 hover:bg-green-700">
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const passwordValidation = password ? validatePassword(password) : { valid: false, errors: [] };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Aceptar Invitación de Gerente</CardTitle>
          <CardDescription>Completa tu registro en la plataforma SIGE</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccept} className="space-y-4">
            {/* Email display */}
            <div className="space-y-2">
              <Label>Correo Electrónico</Label>
              <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700">
                {invitationData?.managerEmail}
              </div>
            </div>

            {/* Company display */}
            <div className="space-y-2">
              <Label>Empresa</Label>
              <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700">
                {invitationData?.companyId}
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="12+ caracteres (mayús, minús, números, signos)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && (
                <div className="text-sm space-y-1">
                  {passwordValidation.errors.map((error, idx) => (
                    <div key={idx} className="text-red-600 flex items-center gap-1">
                      <span className="text-xs">✗</span> {error}
                    </div>
                  ))}
                  {passwordValidation.valid && (
                    <div className="text-green-600 flex items-center gap-1">
                      <span className="text-xs">✓</span> Contraseña válida
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña *</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repite tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <div className="text-sm text-red-600 flex items-center gap-1">
                  <span className="text-xs">✗</span> Las contraseñas no coinciden
                </div>
              )}
              {confirmPassword && password === confirmPassword && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <span className="text-xs">✓</span> Las contraseñas coinciden
                </div>
              )}
            </div>

            {/* Error message */}
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full"
              disabled={acceptMutation.isPending || !passwordValidation.valid || password !== confirmPassword}
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aceptando...
                </>
              ) : (
                "Aceptar Invitación"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
