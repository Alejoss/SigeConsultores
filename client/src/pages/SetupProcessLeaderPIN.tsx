import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function SetupProcessLeaderPIN() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [companyName, setCompanyName] = useState<string>("");

  const setInitialPINMutation = trpc.processLeaderInvitations.setInitialPIN.useMutation();

  // Extract token from URL on component mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, []);

  const handleSetPIN = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Token de invitación no encontrado. Por favor usa el enlace compartido por tu Gerente.");
      return;
    }

    if (!password || !confirmPassword) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const result = await setInitialPINMutation.mutateAsync({
        invitationToken: token,
        pin: password,
        confirmPin: confirmPassword,
      });

      // Save process leader session to localStorage
      const session = {
        processLeaderId: result.processLeaderId || 0,
        leaderName: result.leaderName || "",
        leaderEmail: result.leaderEmail || "",
        processId: result.processId || 0,
        companyId: result.companyId,
        processName: result.processName,
        loginTime: new Date().toISOString(),
        rememberMe: false // Session-based, not persistent
      };
      sessionStorage.setItem("processLeaderSession", JSON.stringify(session));
      
      // Also save individual items for backward compatibility
      if (result.leaderEmail) {
        localStorage.setItem("processLeaderEmail", result.leaderEmail);
      }
      if (result.processId) {
        localStorage.setItem("processLeaderProcessId", result.processId.toString());
      }
      if (result.companyId) {
        localStorage.setItem("selectedCompanyId", result.companyId.toString());
      }

      if (result.processId && result.companyId) {
        setCompanyName(result.companyName || "la plataforma SIGE");
        setSuccess(true);
      } else {
        setError("Error al procesar tu solicitud. Por favor intenta de nuevo.");
      }
      setPassword("");
      setConfirmPassword("");

    } catch (err: any) {
      setError(err.message || "Error al configurar la contraseña. Por favor intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Configurar contraseña de acceso</CardTitle>
          <CardDescription>
            Crea tu contraseña para acceder a tu proceso
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  ¡Bienvenido a {companyName}!
                </AlertDescription>
              </Alert>
              
              <Button
                onClick={() => setLocation("/login")}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Ingresar
              </Button>
            </div>
          ) : null}

          {!token && !success && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Token de invitación no encontrado. Por favor usa el enlace del correo electrónico.
              </AlertDescription>
            </Alert>
          )}

          {token && !success && (
            <form onSubmit={handleSetPIN} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Contraseña</label>
                <Input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Confirmar contraseña</label>
                <Input
                  type="password"
                  placeholder="Repite tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">Requisitos de la contraseña:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Mínimo 8 caracteres</li>
                  <li>Evita usar datos personales obvios</li>
                  <li>La usarás en el acceso unificado</li>
                </ul>
              </div>

              <Button
                type="submit"
                disabled={loading || password.length < 8 || confirmPassword.length < 8}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configurando...
                  </>
                ) : (
                  "Configurar contraseña"
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
          )}

          <p className="text-xs text-gray-500 text-center mt-4">
            ¿Problemas? Contacta al administrador de tu empresa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
