import React, { createContext, useContext, useEffect, useState } from "react";
import {
  clearAllAuthRoleClientContext,
  clearManagerClientContext,
  clearProcessLeaderClientContext,
} from "@/lib/authRoleContext";

/**
 * Datos de interfaz del Jefe de Proceso. Se hidratan exclusivamente desde la
 * sesión autenticada por el servidor.
 */
export interface ProcessLeaderSession {
  processLeaderId: number;
  leaderName: string;
  leaderEmail: string;
  processId: number;
  companyId?: number;
  companyName?: string;
  processName?: string;
  loginTime: string;
  rememberMe: boolean;
}

interface ProcessLeaderAuthContextType {
  session: ProcessLeaderSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  updateSession: (session: ProcessLeaderSession) => void;
}

const ProcessLeaderAuthContext = createContext<ProcessLeaderAuthContextType | undefined>(undefined);

type ServerProcessLeaderSession =
  | {
      authenticated: true;
      kind: "process_leader";
      processLeaderId: number;
      leaderName: string;
      leaderEmail: string;
      processId: number;
      companyId: number;
      companyName: string;
    }
  | { authenticated: true; kind: "company_manager" | "platform_user" }
  | { authenticated: false };

function toProcessLeaderSession(
  data: Extract<ServerProcessLeaderSession, { kind: "process_leader" }>
): ProcessLeaderSession {
  return {
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
}

/**
 * Fuente de verdad del Jefe de Proceso.
 *
 * El almacenamiento local conserva sólo una caché auxiliar para componentes
 * heredados; nunca puede reactivar ni autorizar un rol, una empresa o proceso.
 */
export function ProcessLeaderAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ProcessLeaderSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/auth/session/me", { credentials: "include" });
        const data = (await res.json()) as ServerProcessLeaderSession;
        if (cancelled) return;

        if (data.authenticated && data.kind === "process_leader") {
          const nextSession = toProcessLeaderSession(data);
          setSession(nextSession);
          localStorage.setItem("processLeaderSession", JSON.stringify(nextSession));
          sessionStorage.removeItem("processLeaderSession");
          // Compatibilidad visual con módulos que aún muestran la empresa
          // seleccionada. Estos valores vienen de la sesión del servidor y no
          // se utilizan para decidir el rol del usuario.
          localStorage.setItem("selectedCompanyId", String(data.companyId));
          localStorage.setItem("selectedCompanyName", data.companyName);
          clearManagerClientContext();
          return;
        }

        // Si el servidor confirma otro rol, o no confirma una sesión, se elimina
        // de inmediato cualquier Jefe recordado por una identidad anterior.
        setSession(null);
        clearProcessLeaderClientContext();
      } catch {
        if (!cancelled) {
          // Ante una sesión no verificable, no se concede acceso desde caché.
          setSession(null);
          clearProcessLeaderClientContext();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const logout = () => {
    void fetch("/api/auth/session/logout", { method: "POST", credentials: "include" });
    clearAllAuthRoleClientContext();
    setSession(null);
  };

  const updateSession = (newSession: ProcessLeaderSession) => {
    // Refleja el autosave de Mi cuenta durante esta vista. Al recargar, el
    // servidor vuelve a construir la sesión y mantiene la fuente de verdad.
    setSession(newSession);
    localStorage.setItem("processLeaderSession", JSON.stringify(newSession));
  };

  const value: ProcessLeaderAuthContextType = {
    session,
    isAuthenticated: session !== null,
    isLoading,
    logout,
    updateSession,
  };

  return (
    <ProcessLeaderAuthContext.Provider value={value}>
      {children}
    </ProcessLeaderAuthContext.Provider>
  );
}

export function useProcessLeaderAuth() {
  const context = useContext(ProcessLeaderAuthContext);
  if (context === undefined) {
    throw new Error("useProcessLeaderAuth must be used within ProcessLeaderAuthProvider");
  }
  return context;
}

/** @deprecated El proveedor actualiza la sesión reactiva después del autosave. */
export function updateProcessLeaderSession(_session: ProcessLeaderSession) {
  window.dispatchEvent(new Event("processLeaderSessionUpdated"));
}
