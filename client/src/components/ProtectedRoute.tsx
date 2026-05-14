import { useLocation } from "wouter";
import { useEffect } from "react";
import { useRoleAccess, UserRole } from "@/hooks/useRoleAccess";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  requiredPermission?: (roleAccess: ReturnType<typeof useRoleAccess>) => boolean;
  fallbackPath?: string;
}

/**
 * ProtectedRoute component
 * Restricts access to routes based on user role and permissions
 * 
 * Usage:
 * <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.GENERAL_MANAGER]}>
 *   <AdminDashboard />
 * </ProtectedRoute>
 * 
 * Or with custom permission check:
 * <ProtectedRoute requiredPermission={(access) => access.canEditCompanyInfo}>
 *   <CompanyEditor />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  requiredRoles,
  requiredPermission,
  fallbackPath = "/access-denied",
}: ProtectedRouteProps) {
  const [, navigate] = useLocation();
  const roleAccess = useRoleAccess();

  useEffect(() => {
    // Check if user has required role
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(roleAccess.role)) {
        navigate(fallbackPath);
        return;
      }
    }

    // Check if user has required permission
    if (requiredPermission) {
      if (!requiredPermission(roleAccess)) {
        navigate(fallbackPath);
        return;
      }
    }
  }, [roleAccess.role, roleAccess, navigate, requiredRoles, requiredPermission, fallbackPath]);

  // If checking roles or permissions, verify access before rendering
  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(roleAccess.role)) {
      return null;
    }
  }

  if (requiredPermission) {
    if (!requiredPermission(roleAccess)) {
      return null;
    }
  }

  return <>{children}</>;
}
