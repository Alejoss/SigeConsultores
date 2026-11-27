/** Canonical company/account permissions, independent of annual workspaces. */
export const TEAM_MODULE_KEYS = [
  "strategy",
  "management_systems",
  "change_management",
  "company_foda",
  "organization_personnel",
] as const;
export const TEAM_ACCESS_LEVELS = ["none", "read", "write"] as const;
export type TeamModuleKey = (typeof TEAM_MODULE_KEYS)[number];
export type TeamAccessLevel = (typeof TEAM_ACCESS_LEVELS)[number];
export type ProcessAccessLevel = "read" | "write";
export type TeamRequestMode = "read" | "write";
export type TeamProcessAccess = { processId: number; accessLevel: ProcessAccessLevel };
export type DetailedTeamAccess = {
  moduleAccess: Record<TeamModuleKey, TeamAccessLevel>;
  /** Extra grants only; ownProcessId always carries implicit write. */
  processAccess: TeamProcessAccess[];
  ownProcessId: number | null;
  fullAccess: boolean;
};
export const TEAM_MODULE_LABELS: Record<TeamModuleKey, string> = {
  strategy: "Estrategia",
  management_systems: "Sistemas de gestión",
  change_management: "Gestión de cambios",
  company_foda: "FODA de empresa",
  organization_personnel: "Organización y personas",
};
export function hasTeamAccess(level: TeamAccessLevel, mode: TeamRequestMode): boolean {
  return level === "write" || (mode === "read" && level === "read");
}
