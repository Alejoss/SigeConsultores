import { createContext, useContext, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { useManagerAuth } from "@/_core/hooks/useManagerAuth";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getProcessIdFromSession } from "@/lib/sessionScope";
import {
  routeAccess,
  type DetailedTeamAccess,
} from "@/lib/teamAccess";
import { Button } from "@/components/ui/button";

type State = {
  access?: DetailedTeamAccess;
  isProcessLeader: boolean;
  isChecking: boolean;
  readOnly: boolean;
  companyId: number | null;
};
const TeamAccessContext = createContext<State>({
  isProcessLeader: false,
  isChecking: false,
  readOnly: false,
  companyId: null,
});
export function useTeamAccessState() {
  return useContext(TeamAccessContext);
}
export function useDetailedTeamAccess(companyId: number | null | undefined) {
  const { session, isLoading } = useProcessLeaderAuth();
  const query = trpc.teamAccess.getMyDetailedAccess.useQuery(
    { companyId: companyId || 0 },
    {
      enabled: Boolean(session && companyId && session.companyId === companyId),
      retry: false,
    }
  );
  return {
    ...query,
    access: query.data as DetailedTeamAccess | undefined,
    isChecking: isLoading || Boolean(session && query.isLoading),
    isProcessLeader: Boolean(session),
  };
}
/** Mount no business page until the server confirms this URL's module/process. */
export function TeamAccessBoundary({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const { session, isLoading } = useProcessLeaderAuth();
  const { isManagerLogin, isLoading: managerLoading } = useManagerAuth();
  const { user, loading: userLoading } = useAuth();
  const query = useDetailedTeamAccess(session?.companyId);
  const isProcessLeader = Boolean(
    session && !isManagerLogin && user?.role !== "admin"
  );
  const publicPage =
    /^\/(?:$|login|home|setup-|forgot-|reset-|manager-access|manager-confirmation|process-leader-access-success|process-owner-invitation|process-leader-invitation|process-leader-pin-recovery|request-access|access-denied)/.test(
      location
    );
  const requestedCompany = Number(new URLSearchParams(search).get("companyId"));
  const processId = getProcessIdFromSession();
  const level = routeAccess(
    query.access,
    `${location}?${search.replace(/^\?/, "")}`,
    processId
  );
  const managerOnly =
    /^\/(?:manager-team-access|manager-company-admin|manager-dashboard|manager-edit-profile|annual-workspaces|customize-modules|admin-)/.test(
      location
    );
  const denied =
    isProcessLeader &&
    !publicPage &&
    (managerOnly ||
      Boolean(requestedCompany && requestedCompany !== session?.companyId) ||
      level === "none");
  const checking =
    !publicPage &&
    (isLoading ||
      managerLoading ||
      userLoading ||
      (isProcessLeader && query.isChecking));
  // A process URL change remounts editors: do not carry drafts/timers across processes.
  const key = `${session?.companyId || requestedCompany}:${processId}:${level}`;
  return (
    <TeamAccessContext.Provider
      value={{
        access: query.access,
        isProcessLeader,
        isChecking: checking,
        readOnly: isProcessLeader && level !== "write",
        companyId: session?.companyId || null,
      }}
    >
      {checking ? (
        <div role="status" className="p-8 text-center">
          Verificando permisos…
        </div>
      ) : denied ? (
        <div
          role="alert"
          className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-6"
        >
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="my-3">
            No tienes autorización para este módulo o proceso. Tu proceso propio
            y tus demás accesos se conservan.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate("/process-leader-dashboard")}
          >
            Volver a mi panel
          </Button>
          {query.error && (
            <Button variant="outline" onClick={() => void query.refetch()}>
              Reintentar verificación
            </Button>
          )}
        </div>
      ) : (
        <div key={key}>{children}</div>
      )}
    </TeamAccessContext.Provider>
  );
}
