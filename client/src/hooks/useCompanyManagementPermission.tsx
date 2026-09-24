import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { trpc } from "@/lib/trpc";

/**
 * Los Administradores y Gerentes pueden gestionar la información corporativa.
 * Un Jefe de Proceso sólo la puede editar si el Gerente le concede el rol
 * reversible de Coordinador de empresa. Mientras se resuelve esa autorización,
 * la interfaz se mantiene en modo consulta para evitar un falso permiso visual.
 */
export function useCompanyManagementPermission(companyId: number | null | undefined) {
  const { session: processLeaderSession, isLoading: processLeaderLoading } =
    useProcessLeaderAuth();
  const isProcessLeader = processLeaderSession !== null;
  const accessQuery = trpc.teamAccess.getMyCompanyManagementAccess.useQuery(
    { companyId: companyId || 0 },
    { enabled: isProcessLeader && Boolean(companyId) }
  );

  const isChecking =
    processLeaderLoading || (isProcessLeader && accessQuery.isLoading);
  const canManageCompany =
    !isProcessLeader ||
    (!isChecking && accessQuery.data?.accessLevel === "coordinator");

  return {
    isProcessLeader,
    isChecking,
    canManageCompany,
  };
}

export function CompanyReadOnlyNotice() {
  return (
    <div className="mb-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <span aria-hidden="true">🔒</span>
      <p>
        <strong>Modo de consulta.</strong> Puede revisar y descargar la información,
        pero sólo el Gerente General o un Jefe autorizado como Coordinador de empresa
        puede crear, editar, cargar o eliminar registros corporativos.
      </p>
    </div>
  );
}
