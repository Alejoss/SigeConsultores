import { useLocation } from "wouter";
import { useAnnualWorkspace } from "@/contexts/AnnualWorkspaceContext";
import { useDetailedTeamAccess } from "@/contexts/TeamAccessContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { routeModule, type TeamModuleKey } from "@/lib/teamAccess";

export function useCompanyManagementPermission(
  companyId: number | null | undefined,
  requestedModule?: TeamModuleKey
) {
  const [location] = useLocation();
  const { user, loading: userLoading } = useAuth();
  const { isManagerLogin, isLoading: managerLoading } = useManagerAuth();
  const { closed } = useAnnualWorkspace();
  const query = useDetailedTeamAccess(companyId);
  const module = requestedModule || routeModule(`${location}${window.location.search}`) || "strategy";
  const isChecking = userLoading || managerLoading || query.isChecking;
  const adminOrManager = user?.role === "admin" || isManagerLogin;
  const level = query.access?.moduleAccess[module];
  const nestedDenied =
    (module === "company_foda" || module === "change_management") &&
    query.access?.moduleAccess.strategy === "none";
  const canManageCompany =
    !closed &&
    !isChecking &&
    (adminOrManager ||
      (query.isProcessLeader &&
        level === "write" &&
        !nestedDenied &&
        module !== "organization_personnel"));
  return {
    isProcessLeader: query.isProcessLeader,
    isChecking,
    canManageCompany,
    canReadCompany:
      adminOrManager || Boolean(level && level !== "none" && !nestedDenied),
  };
}
export function CompanyReadOnlyNotice() {
  return (
    <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <p>
        <strong>Modo de consulta.</strong> Puedes revisar y descargar la
        información. Crear, editar, cargar o eliminar requiere una autorización
        de edición para este módulo; un año cerrado siempre permanece en
        consulta.
      </p>
    </div>
  );
}
