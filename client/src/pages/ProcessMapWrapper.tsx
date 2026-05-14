import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import ProcessMap from "./ProcessMap";

/**
 * Wrapper component that handles authentication check before rendering ProcessMap
 * This prevents the "Rendered more hooks than during the previous render" error
 * by ensuring all hooks in ProcessMap are called in the same order every render
 */
export default function ProcessMapWrapper() {
  const [, setLocation] = useLocation();
  const { session: processLeaderSession, isLoading: contextLoading } = useProcessLeaderAuth();
  const { user } = useAuth();
  const { isManagerLogin } = useManagerAuth();
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
    // If context is still loading, wait
    if (contextLoading) {
      console.log("[ProcessMapWrapper] Waiting for context to load...");
      return;
    }

    console.log(
      "[ProcessMapWrapper] Context loaded, isProcessLeader:",
      !!processLeaderSession,
      "isManagerLogin:",
      isManagerLogin,
      "user:",
      !!user
    );

    // Check if user is authenticated in any way
    if (!processLeaderSession && !isManagerLogin && !user) {
      // Last resort: check if there's a session in localStorage
      const storedSession = localStorage.getItem("processLeaderSession");
      if (storedSession) {
        console.log("[ProcessMapWrapper] Session found in localStorage, allowing access");
        setIsAuthChecked(true);
        return;
      }

      console.log("[ProcessMapWrapper] No authentication detected, redirecting to login");
      setLocation("/login");
      return;
    }

    setIsAuthChecked(true);
  }, [contextLoading, processLeaderSession, isManagerLogin, user, setLocation]);

  // Show loading state while checking authentication
  if (!isAuthChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  // Render ProcessMap only after authentication is verified
  return <ProcessMap />;
}
