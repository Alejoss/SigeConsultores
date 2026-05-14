import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * Component to protect routes that should only be accessible to managers
 * Redirects to unified login if not authenticated as manager
 */
export function ManagerProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isManagerLogin, isLoading } = useManagerAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isManagerLogin) {
      console.log("[ManagerProtectedRoute] Not a manager login, redirecting to unified login");
      setLocation("/login");
    }
  }, [isLoading, isManagerLogin, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isManagerLogin) {
    return null;
  }

  return <>{children}</>;
}
