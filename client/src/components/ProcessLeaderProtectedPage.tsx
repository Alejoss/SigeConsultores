import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";

/**
 * Higher-order component to protect pages that require process leader authentication
 * Waits for context to load before rendering the page
 */
export function withProcessLeaderProtection<P extends object>(
  Component: React.ComponentType<P>
) {
  return function ProtectedComponent(props: P) {
    const [, setLocation] = useLocation();
    const { session: processLeaderSession, isLoading: contextLoading } = useProcessLeaderAuth();
    const { user } = useAuth();
    const { isManagerLogin } = useManagerAuth();
    const [isAuthChecked, setIsAuthChecked] = useState(false);

    useEffect(() => {
      if (contextLoading) {
        console.log("[ProcessLeaderProtectedPage] Waiting for context to load...");
        return;
      }

      console.log("[ProcessLeaderProtectedPage] Context loaded, isProcessLeader:", !!processLeaderSession);

      // Check if user is authenticated in any way
      if (!processLeaderSession && !isManagerLogin && !user) {
        console.log("[ProcessLeaderProtectedPage] No authentication detected, redirecting to login");
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

    return <Component {...props} />;
  };
}
