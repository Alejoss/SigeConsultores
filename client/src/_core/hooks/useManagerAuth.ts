import { useEffect, useState } from "react";

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
          localStorage.setItem("managerCompanyId", data.companyId.toString());
          localStorage.setItem("managerCompanyName", data.companyName);
          localStorage.setItem("managerEmail", data.managerEmail);
          localStorage.setItem("managerName", data.managerEmail);
          localStorage.setItem("selectedCompanyId", data.companyId.toString());
        } else {
          setIsManagerLogin(false);
          setManagerCompanyId(null);
          setManagerCompanyName(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error");
          setIsManagerLogin(false);
          setManagerCompanyId(null);
          setManagerCompanyName(null);
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
    isLoading,
    error,
  };
}
