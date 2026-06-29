import { useEffect, useRef } from "react";
import { APP_LOGO, APP_TITLE } from "@/const";

/**
 * Login nativo sin React state para el formulario.
 * Usa refs y DOM nativo para evitar el crash "insertBefore on Node"
 * causado por gestores de contraseñas del navegador (Chrome, LastPass, etc.)
 * que inyectan nodos DOM dentro del formulario, rompiendo el reconciler de React.
 */
export default function LoginSelector() {
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const showError = (msg: string) => {
    if (!errorRef.current) return;
    errorRef.current.innerHTML = `
      <div class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 mb-4">
        <svg class="h-4 w-4 shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <line x1="12" y1="8" x2="12" y2="12" stroke-width="2"/>
          <line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2"/>
        </svg>
        <span>${msg}</span>
      </div>`;
  };

  const clearError = () => {
    if (errorRef.current) errorRef.current.innerHTML = "";
  };

  const setLoading = (loading: boolean) => {
    if (!btnRef.current) return;
    btnRef.current.disabled = loading;
    btnRef.current.innerHTML = loading
      ? `<svg class="animate-spin mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Ingresando...`
      : `<svg class="mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>Ingresar`;
  };

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleSubmit = async (e: Event) => {
      e.preventDefault();
      clearError();

      const emailInput = form.querySelector<HTMLInputElement>("#email");
      const passwordInput = form.querySelector<HTMLInputElement>("#password");
      if (!emailInput || !passwordInput) return;

      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value.trim();

      if (!email || !password) {
        showError("Completa correo y contraseña para continuar.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("Ingresa un correo válido, por ejemplo: nombre@dominio.com.");
        return;
      }

      setLoading(true);

      try {
        const res = await fetch("/api/auth/session/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });

        let data: Record<string, unknown> | null = null;
        try { data = await res.json(); } catch { data = null; }

        if (!res.ok || !data || !data.ok) {
          const serverError = (data?.error as string) || "";
          const normalized = serverError.trim().toLowerCase();
          let msg = "No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.";
          if (res.status === 400) msg = "Revisa el correo y la contraseña.";
          else if (res.status === 401 || normalized.includes("incorrectos")) msg = "Correo o contraseña incorrectos.";
          else if (res.status === 403) msg = "Tu cuenta no tiene acceso a esta sección.";
          else if (res.status >= 500) msg = "Problema del servidor. Inténtalo en unos minutos.";
          showError(msg);
          return;
        }

        const kind = data.kind as string;
        if (kind === "company_manager") {
          localStorage.setItem("managerCompanyId", String(data.companyId));
          localStorage.setItem("managerCompanyName", String(data.companyName));
          localStorage.setItem("selectedCompanyId", String(data.companyId));
          localStorage.setItem("managerEmail", String(data.managerEmail));
          localStorage.setItem("managerName", String(data.managerEmail));
          window.location.assign("/manager-dashboard");
          return;
        }
        if (kind === "process_leader") {
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
          window.location.assign(`/process-leader-dashboard?processId=${data.processId}`);
          return;
        }
        // platform_admin u otros roles: redirigir al manager-dashboard
        window.location.assign("/manager-dashboard");
      } catch {
        showError("Error de red al iniciar sesión.");
      } finally {
        setLoading(false);
      }
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {APP_LOGO && <img src={APP_LOGO} alt={APP_TITLE} className="h-12 mx-auto mb-4" />}
          <h1 className="text-3xl font-bold text-gray-900">{APP_TITLE}</h1>
          <p className="text-gray-600 mt-2">Sistema Integrado de Gestión Empresarial</p>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow-lg">
          <div className="flex flex-col space-y-1.5 p-6">
            <h3 className="text-2xl font-semibold leading-none tracking-tight">Iniciar Sesión</h3>
            <p className="text-sm text-muted-foreground">Ingresa tu correo y contraseña</p>
          </div>
          <div className="p-6 pt-0">
            {/* El div de error se actualiza via DOM nativo, sin React */}
            <div ref={errorRef} />

            {/* Formulario HTML nativo — React solo lo monta, no lo actualiza */}
            <form ref={formRef} className="space-y-4" autoComplete="on">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium leading-none">Correo</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="tu@empresa.com"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium leading-none">Contraseña</label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Mostrar contraseña"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:text-gray-700"
                    onClick={() => {
                      const inp = document.getElementById("password") as HTMLInputElement;
                      if (inp) inp.type = inp.type === "password" ? "text" : "password";
                    }}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                </div>
              </div>

              <button
                ref={btnRef}
                type="submit"
                className="inline-flex items-center justify-center w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Ingresar
              </button>

              <button
                type="button"
                className="w-full text-sm text-blue-700 hover:text-blue-800 underline"
                onClick={() => window.location.assign("/forgot-password-manager")}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-gray-600">
          <p>© 2025 SIGE Consultores. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}
