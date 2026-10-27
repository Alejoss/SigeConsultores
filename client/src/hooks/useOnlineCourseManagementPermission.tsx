import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { trpc } from "@/lib/trpc";

/**
 * Resuelve el acceso al panel de Capacitaciones en Línea sin reutilizar el
 * permiso corporativo de Coordinador de empresa.
 */
export function useOnlineCourseManagementPermission(
  companyId: number | null | undefined
) {
  const { session: processLeaderSession, isLoading: processLeaderLoading } =
    useProcessLeaderAuth();
  const { user, loading: userLoading } = useAuth();
  const { isManagerLogin, isLoading: managerLoading } = useManagerAuth();
  const isProcessLeader = processLeaderSession !== null;
  const accessQuery =
    trpc.teamAccess.getMyOnlineCourseManagementAccess.useQuery(
      { companyId: companyId || 0 },
      { enabled: isProcessLeader && Boolean(companyId) }
    );

  const isChecking =
    processLeaderLoading ||
    userLoading ||
    managerLoading ||
    (isProcessLeader && accessQuery.isLoading);
  const canManageOnlineCourses =
    !isChecking &&
    (user?.role === "admin" ||
      isManagerLogin ||
      (isProcessLeader &&
        accessQuery.data?.accessLevel === "online_course_manager"));

  return {
    isChecking,
    canManageOnlineCourses,
  };
}
