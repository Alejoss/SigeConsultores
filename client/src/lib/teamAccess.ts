// Client policy: the server remains the authority. Never infer grants from storage.
import {
  TEAM_MODULE_KEYS,
  type TeamModuleKey,
  type TeamAccessLevel,
  type ProcessAccessLevel,
  type DetailedTeamAccess,
} from "@shared/teamAccess";
export { TEAM_MODULE_KEYS };
export type {
  TeamModuleKey,
  TeamAccessLevel,
  ProcessAccessLevel,
  DetailedTeamAccess,
};
export const MODULE_LABELS: Record<TeamModuleKey, string> = {
  strategy: "Estrategia",
  management_systems: "Sistemas de Gestión",
  change_management: "Gestión del cambio",
  company_foda: "FODA empresarial",
  organization_personnel: "Organización y Personal",
};
export const ACCESS_LABELS: Record<TeamAccessLevel, string> = {
  none: "Restringido",
  read: "Solo consulta",
  write: "Consulta y edición",
};
export function defaultModuleAccess(
  coordinator = false
): DetailedTeamAccess["moduleAccess"] {
  return {
    strategy: coordinator ? "write" : "read",
    management_systems: coordinator ? "write" : "read",
    change_management: coordinator ? "write" : "read",
    company_foda: coordinator ? "write" : "read",
    organization_personnel: "read",
  };
}
export function processAccessLevel(
  access: DetailedTeamAccess | undefined,
  processId: number | null
): TeamAccessLevel {
  if (!access || !processId) return "none";
  if (access.fullAccess || access.ownProcessId === processId) return "write";
  return (
    access.processAccess.find(grant => grant.processId === processId)
      ?.accessLevel || "none"
  );
}
export const PROCESS_ROUTES =
  /^\/(?:process-(?:characterization|output-release|resources|stakeholder-criticality|foda|risk-matrix|tactical-objectives|compliances|trainings|schedule|indicators|meetings|participants|planning-cycles|dashboard)|tactical-(?:definition|planning)|subprocess-map|procedures-characterization|linked-commitments)(?:\/|$)/;
export function routeModule(path: string): TeamModuleKey | null {
  const route = path.split("?")[0];
  if (route === "/strategic-trends") {
    const view = new URLSearchParams(path.split("?")[1] || "").get("view");
    if (view === "oe") return "strategy";
    if (view === "sgi") return "management_systems";
    if (view === "staff") return "organization_personnel";
    return null;
  }
  if (PROCESS_ROUTES.test(route)) return null;
  if (/^\/(?:change-management)(?:\/|$)/.test(route))
    return "change_management";
  if (/^\/(?:foda|foda-analysis)(?:\/|$)/.test(route)) return "company_foda";
  if (/^\/(?:organization-chart|payroll|payroll-inactive)(?:\/|$)/.test(route))
    return "organization_personnel";
  if (/^\/(?:audits-inspections|compliances|trainings)(?:\/|$)/.test(route))
    return "management_systems";
  if (
    /^\/(?:company-info|values|policy|policy-objectives|strategic-objectives|policy-documents|values-documents|strategic-objectives-documents|documents|criticality-matrix|risk-matrix|flowchart)(?:\/|$)/.test(
      route
    )
  )
    return "strategy";
  return null;
}
export function routeAccess(
  access: DetailedTeamAccess | undefined,
  path: string,
  processId: number | null
): TeamAccessLevel {
  if (!access) return "none";
  if (
    PROCESS_ROUTES.test(path.split("?")[0]) ||
    (processId && /^\/(?:consolidated-schedule|indicators)(?:\/|$)/.test(path))
  )
    return processAccessLevel(access, processId);
  const module = routeModule(path);
  if (!module) return "write";
  // A nested deny always wins over an assignment to the broader strategy.
  if (
    (module === "company_foda" || module === "change_management") &&
    access.moduleAccess.strategy === "none"
  )
    return "none";
  const level = access.moduleAccess[module];
  return module === "organization_personnel" && level === "write"
    ? "read"
    : level;
}
export function changedModules(
  before: DetailedTeamAccess["moduleAccess"],
  after: DetailedTeamAccess["moduleAccess"]
) {
  return TEAM_MODULE_KEYS.filter(
    module => before[module] !== after[module]
  ).map(module => ({ module, accessLevel: after[module] }));
}
let currentPolicy: {
  access?: DetailedTeamAccess;
  companyId: number;
  readOnly: boolean;
} | null = null;
export function setClientTeamPolicy(policy: typeof currentPolicy) {
  currentPolicy = policy;
}
/** Last-line UX guard for autosave, portals and uploads that bypass native disabled fields. */
export function clientMutationDenied(path: string, input: unknown): boolean {
  if (
    !currentPolicy ||
    /^(?:auth|managerAuth|processLeaderAuth|onlineCourses|teamAccess)\./.test(
      path
    )
  )
    return false;
  const scope = input as { processId?: number; companyId?: number } | undefined;
  if (scope?.companyId && scope.companyId !== currentPolicy.companyId)
    return true;
  if (
    scope?.processId &&
    processAccessLevel(currentPolicy.access, Number(scope.processId)) !==
      "write"
  )
    return true;
  return currentPolicy.readOnly;
}
