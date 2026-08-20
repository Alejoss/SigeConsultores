import { useEffect, useState } from "react";
import {
  clearManagerClientContext,
  syncManagerClientContext,
} from "@/lib/authRoleContext";

async function fetchSessionMe(): Promise<unknown> {
  const res = await fetch("/api/auth/session/me", { credentials: "include" });
  return res.json();
}

/**
 * Detecta sesión de gerente vía cookie (misma fuente que el servidor).
 */
export function useManagerAuth() {
  const [isManagerLogin, setIsManagerLogin] = useState(false);
  const [managerCompanyId, setManagerCompanyId] = useState<number | null>(null);
  const [managerCompanyName, setManagerCompanyName] = useState<string | null>(null);
  const [managerEmail, setManagerEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = (await fetchSessionMe()) as Record<string, unknown>;
        if (cancelled) return;
        if (
          data.authenticated === true &&
          data.kind === "company_manager" &&
          typeof data.companyId === "number" &&
          typeof data.companyName === "string" &&
          typeof data.managerEmail === "string"
        ) {
          setIsManagerLogin(true);
          setManagerCompanyId(data.companyId);
          setManagerCompanyName(data.companyName);
          setManagerEmail(data.managerEmail);
          // Solo se sincronizan datos auxiliares para pantallas heredadas.
          // La autenticación y el alcance del Gerente provienen del servidor.
          syncManagerClientContext({
            companyId: data.companyId,
            companyName: data.companyName,
            managerEmail: data.managerEmail,
          });
          return;
        }

        // El servidor confirmó que la sesión pertenece a otro rol o que no
        // existe. Nunca se debe reactivar un Gerente desde localStorage.
        setIsManagerLogin(false);
        setManagerCompanyId(null);
        setManagerCompanyName(null);
        setManagerEmail(null);
        clearManagerClientContext();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error");
          setIsManagerLogin(false);
          setManagerCompanyId(null);
          setManagerCompanyName(null);
          clearManagerClientContext();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    isManagerLogin,
    managerCompanyId,
    managerCompanyName,
    managerEmail,
    isLoading,
    error,
  };
}
