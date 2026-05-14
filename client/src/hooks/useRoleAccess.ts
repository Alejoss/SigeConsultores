import { useAuth } from "@/_core/hooks/useAuth";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";

export enum UserRole {
  ADMIN = "admin",
  GENERAL_MANAGER = "general_manager",
  PROCESS_LEADER = "process_leader",
  UNAUTHENTICATED = "unauthenticated",
}

/**
 * Hook to determine current user role and access permissions
 * Handles both OAuth (Admin/General Manager) and PIN (Process Leader) authentication
 */
export function useRoleAccess() {
  const { user: oauthUser, isAuthenticated: isOAuthAuthenticated } = useAuth();
  const { session: processLeaderSession, isAuthenticated: isProcessLeaderAuthenticated } = useProcessLeaderAuth();

  // Determine the current user role
  const role: UserRole = (() => {
    if (isOAuthAuthenticated && oauthUser) {
      return oauthUser.role === "admin" ? UserRole.ADMIN : UserRole.GENERAL_MANAGER;
    }
    if (isProcessLeaderAuthenticated && processLeaderSession) {
      return UserRole.PROCESS_LEADER;
    }
    return UserRole.UNAUTHENTICATED;
  })();

  // Get current user info
  const currentUser = oauthUser || null;
  const currentProcessLeader = processLeaderSession || null;

  // Check permissions
  const isAdmin = role === UserRole.ADMIN;
  const isGeneralManager = role === UserRole.GENERAL_MANAGER;
  const isProcessLeader = role === UserRole.PROCESS_LEADER;
  const isAuthenticated = isOAuthAuthenticated || isProcessLeaderAuthenticated;

  // Can view company info
  const canViewCompanyInfo = isAuthenticated;

  // Can edit company info (only Admin and General Manager)
  const canEditCompanyInfo = isAdmin || isGeneralManager;

  // Can view all processes (Admin and General Manager)
  const canViewAllProcesses = isAdmin || isGeneralManager;

  // Can edit all processes (Admin and General Manager)
  const canEditAllProcesses = isAdmin || isGeneralManager;

  // Can view assigned process (all authenticated users)
  const canViewAssignedProcess = isAuthenticated;

  // Can edit assigned process (Admin, General Manager, and Process Leader)
  const canEditAssignedProcess = isAuthenticated;

  // Can access admin dashboard (only Admin)
  const canAccessAdminDashboard = isAdmin;

  // Can manage users (only Admin)
  const canManageUsers = isAdmin;

  // Can manage companies (only Admin)
  const canManageCompanies = isAdmin;

  return {
    role,
    isAdmin,
    isGeneralManager,
    isProcessLeader,
    isAuthenticated,
    currentUser,
    currentProcessLeader,
    canViewCompanyInfo,
    canEditCompanyInfo,
    canViewAllProcesses,
    canEditAllProcesses,
    canViewAssignedProcess,
    canEditAssignedProcess,
    canAccessAdminDashboard,
    canManageUsers,
    canManageCompanies,
  };
}
