import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  accounts, accountRoles, roles,
  companyManagementAccess, companyTeamModuleAccess, companyTeamProcessAccess, processes,
} from "../../drizzle/schema";
import {
  TEAM_MODULE_KEYS, hasTeamAccess,
  type DetailedTeamAccess, type TeamAccessLevel, type TeamModuleKey,
  type TeamProcessAccess, type TeamRequestMode,
} from "../../shared/teamAccess";
import { getDb } from "../db";
import { withoutAnnualScope } from "../annual/runtime";
import type { TrpcContext } from "./context";

export type TeamAccessPolicy = DetailedTeamAccess & {
  companyId: number;
  accountId: number | null;
  /** Verified canonical company catalog, never derived from grant rows alone. */
  companyProcessIds: readonly number[];
  coordinator: boolean;
};
type ModuleRow = { companyId: number; accountId: number; module: TeamModuleKey; accessLevel: TeamAccessLevel };
type ProcessRow = TeamProcessAccess & { companyId: number; accountId: number };

/** Pure calculation also used to enrich the manager's account list. */
export function buildTeamAccessPolicy(options: {
  companyId: number;
  accountId: number | null;
  ownProcessId: number | null;
  fullAccess?: boolean;
  coordinator?: boolean;
  companyProcessIds: readonly number[];
  moduleGrants?: readonly ModuleRow[];
  processGrants?: readonly ProcessRow[];
}): TeamAccessPolicy {
  const fullAccess = options.fullAccess === true;
  const coordinator = options.coordinator === true;
  const companyProcessIds = Array.from(new Set(options.companyProcessIds));
  const ownProcessId = options.ownProcessId !== null && companyProcessIds.includes(options.ownProcessId)
    ? options.ownProcessId : null;
  const moduleAccess = Object.fromEntries(TEAM_MODULE_KEYS.map(module => [module,
    fullAccess || (coordinator && module !== "organization_personnel") ? "write" : "read",
  ])) as Record<TeamModuleKey, TeamAccessLevel>;
  if (!fullAccess) {
    const applicable = (options.moduleGrants ?? []).filter(row =>
      row.companyId === options.companyId && row.accountId === options.accountId && TEAM_MODULE_KEYS.includes(row.module));
    const strategy = applicable.find(row => row.module === "strategy");
    if (strategy) {
      // Strategy is the parent axis; explicit child rows always win below.
      moduleAccess.strategy = strategy.accessLevel;
      moduleAccess.change_management = strategy.accessLevel;
      moduleAccess.company_foda = strategy.accessLevel;
    }
    for (const row of options.moduleGrants ?? []) {
      if (row.companyId === options.companyId && row.accountId === options.accountId && TEAM_MODULE_KEYS.includes(row.module)) {
        // Explicit write cannot delegate personnel mutation authority.
        moduleAccess[row.module] = row.module === "organization_personnel" && row.accessLevel === "write" ? "read" : row.accessLevel;
      }
    }
  }
  const extras = new Map<number, TeamProcessAccess>();
  for (const row of options.processGrants ?? []) {
    if (row.companyId === options.companyId && row.accountId === options.accountId &&
      companyProcessIds.includes(row.processId) && row.processId !== ownProcessId) {
      extras.set(row.processId, { processId: row.processId, accessLevel: row.accessLevel });
    }
  }
  return {
    companyId: options.companyId, accountId: options.accountId, ownProcessId,
    fullAccess, coordinator, moduleAccess, companyProcessIds,
    processAccess: fullAccess ? [] : Array.from(extras.values()).sort((a, b) => a.processId - b.processId),
  };
}

export function getDetailedTeamAccess(policy: TeamAccessPolicy): DetailedTeamAccess {
  return {
    moduleAccess: { ...policy.moduleAccess },
    processAccess: policy.processAccess.map(row => ({ ...row })),
    ownProcessId: policy.ownProcessId, fullAccess: policy.fullAccess,
  };
}

/** SQL errors (including missing additive tables) intentionally propagate: no ACL downgrade. */
export async function hydrateTeamAccessPolicy(ctx: TrpcContext, companyId?: number): Promise<TeamAccessPolicy | undefined> {
  const targetCompanyId = companyId ?? ctx.manager?.companyId ?? ctx.processLeader?.companyId;
  if (!targetCompanyId) return undefined;
  const fullAccess = ctx.user?.role === "admin" || ctx.manager?.companyId === targetCompanyId;
  const leader = ctx.processLeader;
  if (!fullAccess && (!leader || leader.companyId !== targetCompanyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a esta empresa." });
  }
  return withoutAnnualScope(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible para validar los accesos del equipo." });
    const catalog = await db.select({ id: processes.id }).from(processes).where(eq(processes.companyId, targetCompanyId));
    if (fullAccess) return buildTeamAccessPolicy({ companyId: targetCompanyId, accountId: null, ownProcessId: null, fullAccess: true, companyProcessIds: catalog.map(row => row.id) });
    const accountId = leader!.processLeaderId;
    const [activeAccount] = await db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.status, "active"))).limit(1);
    const [activeAssignment] = await db.select({ id: accountRoles.id }).from(accountRoles)
      .innerJoin(roles, eq(accountRoles.roleId, roles.id))
      .innerJoin(processes, eq(accountRoles.processId, processes.id))
      .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.companyId, targetCompanyId),
        eq(accountRoles.processId, leader!.processId), eq(accountRoles.status, "active"),
        eq(roles.slug, "process_leader"), eq(processes.companyId, targetCompanyId))).limit(1);
    if (!activeAccount || !activeAssignment) {
      throw new TRPCError({ code: "FORBIDDEN", message: "La cuenta o asignación de Jefe de Proceso ya no está activa en esta empresa." });
    }
    const [legacy, modules, extraProcesses] = await Promise.all([
      db.select({ accessLevel: companyManagementAccess.accessLevel }).from(companyManagementAccess)
        .where(and(eq(companyManagementAccess.companyId, targetCompanyId), eq(companyManagementAccess.accountId, accountId))).limit(1),
      db.select().from(companyTeamModuleAccess)
        .where(and(eq(companyTeamModuleAccess.companyId, targetCompanyId), eq(companyTeamModuleAccess.accountId, accountId))),
      db.select().from(companyTeamProcessAccess)
        .where(and(eq(companyTeamProcessAccess.companyId, targetCompanyId), eq(companyTeamProcessAccess.accountId, accountId))),
    ]);
    return buildTeamAccessPolicy({
      companyId: targetCompanyId, accountId, ownProcessId: leader!.processId,
      coordinator: legacy[0]?.accessLevel === "coordinator", companyProcessIds: catalog.map(row => row.id),
      moduleGrants: modules, processGrants: extraProcesses,
    });
  });
}

export function canAccessProcess(policy: TeamAccessPolicy | undefined, processId: number, mode: TeamRequestMode = "read", companyId?: number): boolean {
  if (!policy || (companyId !== undefined && companyId !== policy.companyId) || !policy.companyProcessIds.includes(processId)) return false;
  if (policy.fullAccess || policy.ownProcessId === processId) return true;
  const grant = policy.processAccess.find(row => row.processId === processId);
  return grant !== undefined && hasTeamAccess(grant.accessLevel, mode);
}

export function assertModuleAccess(ctx: TrpcContext, module: TeamModuleKey, mode: TeamRequestMode = ctx.requestMode ?? "read", companyId?: number): void {
  if (ctx.user?.role === "admin") return;
  const targetCompanyId = companyId ?? ctx.teamAccessPolicy?.companyId ?? ctx.manager?.companyId ?? ctx.processLeader?.companyId;
  if (ctx.manager?.companyId === targetCompanyId) return;
  const policy = ctx.teamAccessPolicy;
  if (!policy || !ctx.processLeader || policy.accountId !== ctx.processLeader.processLeaderId ||
    policy.companyId !== targetCompanyId || ctx.processLeader.companyId !== targetCompanyId ||
    !hasTeamAccess(policy.moduleAccess[module], mode) || (module === "organization_personnel" && mode === "write")) {
    throw new TRPCError({ code: "FORBIDDEN", message: mode === "write" ? "Este Jefe de Proceso puede consultar el módulo, pero no modificarlo. El Gerente debe autorizar el permiso de edición para este módulo." : "No tiene acceso a este módulo." });
  }
}

const CORPORATE_ROUTER_MODULES: Readonly<Record<string, TeamModuleKey>> = {
  companyInfo: "strategy", companyValues: "strategy", values: "strategy",
  policies: "strategy", policy: "strategy", policyObjectives: "strategy",
  strategicObjectives: "strategy", strategicTrends: "strategy",
  auditsInspections: "management_systems", managementSystemChecklist: "management_systems",
  managementPrograms: "management_systems", companyCompliances: "management_systems",
  companyCompliancesLegacy: "management_systems", companyTrainings: "management_systems",
  trainingSchedules: "management_systems", trainingBackups: "management_systems",
  operationalFindings: "management_systems",
  changeManagement: "change_management",
  fodasRouter: "company_foda", companyFODA: "company_foda",
  organizationChart: "organization_personnel", payroll: "organization_personnel",
  jobDescriptions: "organization_personnel",
};
const CORPORATE_SOURCE_METHODS = new Set(["listSourceProgress", "listSourceEvidence", "createLinks"]);
/** Use the actual registered tRPC path, not screen labels or annual namespaces. */
export function resolveTeamAccessModule(path: string, rawInput?: unknown): TeamModuleKey | undefined {
  const [name, method] = path.split(".");
  const root = rawInput && typeof rawInput === "object" ? rawInput as Record<string, unknown> : {};
  const body = root.json && typeof root.json === "object" ? root.json as Record<string, unknown> : root;
  if (name === "documents") {
    const documentType = body.documentType ?? (method === "uploadPolicyDocument" ? "Policy" : undefined);
    if (["Policy", "Values", "StrategicObjectives", "Politica", "Programa"].includes(String(documentType))) return "strategy";
    // ProcessMap / Indicators / ambiguous legacy Varios require record-specific ACLs.
    return undefined;
  }
  if (name === "linkedCommitments" && CORPORATE_SOURCE_METHODS.has(method)) {
    if (body.sourceType === "change_action") return "change_management";
    if (["checklist_action", "checklist_vigency", "program_action", "company_compliance", "audit_finding", "inspection_finding"].includes(String(body.sourceType))) return "management_systems";
    // meeting_agreement and process-owned commitments retain process ACLs.
    return undefined;
  }
  return CORPORATE_ROUTER_MODULES[name];
}

/** Never mutate the Express batch context; every procedure gets its own mode/policy. */
export async function hydrateTeamAccessContext(ctx: TrpcContext, options: {
  companyId?: number; mode: TeamRequestMode; path?: string; module?: TeamModuleKey; rawInput?: unknown;
}): Promise<TrpcContext> {
  const module = options.module ?? (options.path ? resolveTeamAccessModule(options.path, options.rawInput) : undefined);
  const companyId = options.companyId ?? ctx.manager?.companyId ?? ctx.processLeader?.companyId;
  const independentCoursePath = options.path !== undefined && (
    ["onlineCourses", "courseRegCodes"].includes(options.path.split(".")[0]) ||
    options.path === "teamAccess.getMyOnlineCourseManagementAccess"
  );
  // Gerencia/admin retain existing guards and need no extra SQL for ordinary
  // requests; getMyDetailedAccess hydrates their explicit full-access response.
  const policy = ctx.processLeader && !ctx.manager && ctx.user?.role !== "admin" && !independentCoursePath
    ? await hydrateTeamAccessPolicy(ctx, companyId) : undefined;
  const cloned = { ...ctx, requestMode: options.mode, teamAccessModule: module, teamAccessPolicy: policy };
  // A process-owned suggestion is not corporate change administration. Keep
  // actual write mode for year/process guards; module none still denies it.
  const moduleMode = options.path === "changeManagement.suggest" ? "read" : options.mode;
  if (module) assertModuleAccess(cloned, module, moduleMode, companyId);
  return cloned;
}
