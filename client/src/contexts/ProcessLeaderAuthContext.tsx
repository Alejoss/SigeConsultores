import React, { createContext, useContext, useState, useEffect } from "react";

/**
 * Process Leader Session Data
 * Stored in localStorage (if "remember me") or sessionStorage
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

/**
 * Process Leader Auth Context
 * Manages authentication state for process leaders (non-OAuth)
 */
interface ProcessLeaderAuthContextType {
  session: ProcessLeaderSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  updateSession: (session: ProcessLeaderSession) => void;
}

const ProcessLeaderAuthContext = createContext<ProcessLeaderAuthContextType | undefined>(undefined);

/**
 * Process Leader Auth Provider
 * Wraps the application to provide process leader auth state
 */
export function ProcessLeaderAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ProcessLeaderSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper function to load session from storage
  const loadSessionFromStorage = () => {
    try {
      // Always try localStorage first (now the primary storage)
      let storedSession = localStorage.getItem("processLeaderSession");
      console.log("[ProcessLeaderAuth] loadSessionFromStorage - localStorage:", storedSession ? "found" : "not found");

      // If not in localStorage, try sessionStorage (for backward compatibility)
      if (!storedSession) {
        storedSession = sessionStorage.getItem("processLeaderSession");
        console.log("[ProcessLeaderAuth] loadSessionFromStorage - sessionStorage:", storedSession ? "found" : "not found");
      }

      if (storedSession) {
        const parsedSession = JSON.parse(storedSession) as ProcessLeaderSession;
        console.log("[ProcessLeaderAuth] Loaded session:", parsedSession);

        // For now, accept all sessions (they're valid for the current session)
        setSession(parsedSession);
      } else {
        console.log("[ProcessLeaderAuth] No session found in storage");
        setSession(null);
      }
    } catch (error) {
      console.error("[ProcessLeaderAuth] Failed to load session:", error);
      localStorage.removeItem("processLeaderSession");
      sessionStorage.removeItem("processLeaderSession");
      setSession(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const applyFromStorage = () => {
      try {
        let stored = localStorage.getItem("processLeaderSession");
        if (!stored) stored = sessionStorage.getItem("processLeaderSession");
        if (stored) {
          const parsed = JSON.parse(stored) as ProcessLeaderSession;
          if (!cancelled) setSession(parsed);
          return;
        }
      } catch (e) {
        console.error("[ProcessLeaderAuth] Failed to parse session:", e);
      }
      if (!cancelled) setSession(null);
    };

    (async () => {
      try {
        const res = await fetch("/api/auth/session/me", { credentials: "include" });
        const data = (await res.json()) as
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
          | { authenticated: false };

        if (!cancelled && data.authenticated && data.kind === "process_leader") {
          const s: ProcessLeaderSession = {
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
          setSession(s);
        } else if (!cancelled) {
          applyFromStorage();
        }
      } catch {
        if (!cancelled) applyFromStorage();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    const handleStorageChange = () => {
      loadSessionFromStorage();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("processLeaderSessionUpdated", handleStorageChange);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("processLeaderSessionUpdated", handleStorageChange);
    };
  }, []);

  const logout = () => {
    void fetch("/api/auth/session/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("processLeaderSession");
    sessionStorage.removeItem("processLeaderSession");
    setSession(null);
  };

  const updateSession = (newSession: ProcessLeaderSession) => {
    console.log("[ProcessLeaderAuth] Updating session:", newSession);
    setSession(newSession);
    // Save to localStorage for persistence across page navigations
    localStorage.setItem("processLeaderSession", JSON.stringify(newSession));
    // Dispatch custom event to notify other parts of the app
    window.dispatchEvent(new Event("processLeaderSessionUpdated"));
    console.log("[ProcessLeaderAuth] Session updated to localStorage and event dispatched");
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

/**
 * Hook to use process leader auth context
 */
export function useProcessLeaderAuth() {
  const context = useContext(ProcessLeaderAuthContext);
  if (context === undefined) {
    throw new Error("useProcessLeaderAuth must be used within ProcessLeaderAuthProvider");
  }
  return context;
}

/**
 * Helper function to update process leader session from outside the context
 * Used when saving session in ProcessLeaderLogin
 */
export function updateProcessLeaderSession(session: ProcessLeaderSession) {
  window.dispatchEvent(new Event("processLeaderSessionUpdated"));
}
