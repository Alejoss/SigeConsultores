import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO, APP_TITLE } from "@/const";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";

/**
 * Login unificado: correo + contraseña.
 * El backend detecta tipo de usuario y devuelve `kind` para redirección.
 *
 * NOTA: El mensaje de error se renderiza FUERA del <form> para evitar el crash
 * "NotFoundError: insertBefore on Node" causado por gestores de contraseñas
 * (Chrome, LastPass, Bitwarden) que inyectan nodos extra dentro del formulario.
 * Al estar fuera del form, React no necesita tocar el árbol del formulario
 * cuando aparece/desaparece el mensaje de error.
 */
export default function LoginSelector() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Hacer scroll al error cuando aparece
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error]);

  type LoginResponse =
    | {
        ok: true;
        kind: "platform_user";
        user: { id: number; email: string | null; name: string | null; role: "admin" | "user" };
      }
    | {
        ok: true;
        kind: "company_manager";
        companyId: number;
        companyName: string;
        managerEmail: string;
      }
    | {
        ok: true;
        kind: "process_leader";
        processLeaderId: number;
        leaderName: string;
        leaderEmail: string;
        processId: number;
        companyId: number;
        companyName: string;
      }
    | { ok: false; error?: string };

  const mapLoginError = (status: number, serverError?: string): string => {
    const normalized = (serverError || "").trim().toLowerCase();

    if (status === 400 || normalized === "solicitud inválida") {
      return "Revisa el correo y la contraseña. Asegúrate de usar un correo válido (ejemplo: nombre@dominio.com).";
    }

    if (
      status === 401 ||
      normalized.includes("email o contraseña incorrectos") ||
      normalized.includes("correo o contraseña incorrectos")
    ) {
      return "Correo o contraseña incorrectos.";
    }

    if (status === 403) {
      if (normalized.includes("no tiene un rol")) {
        return "Tu cuenta existe, pero aún no tiene permisos asignados. Contacta al administrador.";
      }
      return "Tu cuenta no tiene acceso a esta sección.";
    }

    if (status >= 500) {
      return "No pudimos iniciar sesión por un problema del servidor. Inténtalo de nuevo en unos minutos.";
    }

    return serverError || "No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Completa correo y contraseña para continuar.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Ingresa un correo válido, por ejemplo: nombre@dominio.com.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      let data: LoginResponse | null = null;
      try {
        data = (await res.json()) as LoginResponse;
      } catch {
        data = null;
      }

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        const serverError = (data as { error?: string } | null)?.error;
        setError(mapLoginError(res.status, serverError));
        return;
      }

      if (data.kind === "company_manager") {
        localStorage.setItem("managerCompanyId", data.companyId.toString());
        localStorage.setItem("managerCompanyName", data.companyName);
        localStorage.setItem("selectedCompanyId", data.companyId.toString());
        localStorage.setItem("managerEmail", data.managerEmail);
        localStorage.setItem("managerName", data.managerEmail);
        window.location.assign("/manager-dashboard");
        return;
      }

      if (data.kind === "process_leader") {
        const sessionData = {
          processLeaderId: data.processLeaderId,
          leaderName: data.leaderName,
          leaderEmail: data.leaderEmail,
          processId: data.processId,
          companyId: data.companyId,
          companyName: data.companyName,
          processName: "Proceso",
          loginTime: new Date().toISOString(),
          rememberMe: true,
        };
        localStorage.setItem("processLeaderSession", JSON.stringify(sessionData));
        sessionStorage.removeItem("processLeaderSession");
        window.location.assign(
          `/process-leader-dashboard?processId=${data.processId}`
        );
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("Error de red al iniciar sesión");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo y Título */}
        <div className="text-center mb-8">
          {APP_LOGO && <img src={APP_LOGO} alt={APP_TITLE} className="h-12 mx-auto mb-4" />}
          <h1 className="text-3xl font-bold text-gray-900">{APP_TITLE}</h1>
          <p className="text-gray-600 mt-2">Sistema Integrado de Gestión Empresarial</p>
        </div>

        {/* Card de Login */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Iniciar Sesión</CardTitle>
            <CardDescription>Ingresa tu correo y contraseña</CardDescription>
          </CardHeader>
          <CardContent>
            {/*
              IMPORTANTE: El mensaje de error está FUERA del <form> para evitar
              el crash "insertBefore on Node" causado por gestores de contraseñas
              del navegador que inyectan nodos DOM dentro del formulario.
            */}
            {error && (
              <div
                ref={errorRef}
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 mb-4"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    Ingresar
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={() => setLocation("/forgot-password-manager")}
                className="w-full text-sm text-blue-700 hover:text-blue-800 underline"
                disabled={isLoading}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-600">
          <p>© 2025 SIGE Consultores. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}
