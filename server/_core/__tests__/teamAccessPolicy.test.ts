import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../db", () => ({ getDb: vi.fn() }));
import { getDb } from "../../db";
import { buildTeamAccessPolicy, canAccessProcess, assertModuleAccess, resolveTeamAccessModule, hydrateTeamAccessContext, getDetailedTeamAccess } from "../teamAccessPolicy";
import { assertProcessAccess as companyProcessAccess, assertCompanyManagementAccess } from "../companyPermissions";
import { assertProcessAccess as sessionProcessAccess } from "../sessionScope";
import type { TrpcContext } from "../context";
import type { TeamModuleKey, TeamAccessLevel } from "../../../shared/teamAccess";
const base = { companyId: 1, accountId: 10, ownProcessId: 100, companyProcessIds: [100, 101, 102] };
const moduleGrant = (module: TeamModuleKey, accessLevel: TeamAccessLevel, accountId = 10, companyId = 1) => ({ module, accessLevel, accountId, companyId });
const grant = (processId: number, accessLevel: "read" | "write", accountId = 10, companyId = 1) => ({ processId, accessLevel, accountId, companyId });
function ctx(options: Partial<TrpcContext> = {}): TrpcContext {
  return { user: null, manager: null, processLeader: { processLeaderId: 10, processId: 100, companyId: 1, companyName: "Synthetic", leaderName: "Test", leaderEmail: "test@example.test" }, req: {} as never, res: {} as never, ...options };
}
beforeEach(() => vi.clearAllMocks());
describe("canonical granular team access policy", () => {
  it("standard reads all corporate modules and only writes own process", () => {
    const policy = buildTeamAccessPolicy(base);
    expect(Object.values(policy.moduleAccess)).toEqual(["read", "read", "read", "read", "read"]);
    expect(canAccessProcess(policy, 100, "write", 1)).toBe(true);
    expect(canAccessProcess(policy, 101, "read", 1)).toBe(false);
  });
  it("legacy coordinator writes corporate modules but never acquires other processes or personnel writes", () => {
    const policy = buildTeamAccessPolicy({ ...base, coordinator: true });
    expect(policy.moduleAccess.strategy).toBe("write");
    expect(policy.moduleAccess.management_systems).toBe("write");
    expect(policy.moduleAccess.organization_personnel).toBe("read");
    expect(canAccessProcess(policy, 101)).toBe(false);
  });
  it("explicit none overrides coordinator and own process survives denied SIG", () => {
    const policy = buildTeamAccessPolicy({ ...base, coordinator: true, moduleGrants: [moduleGrant("management_systems", "none")] });
    expect(() => assertModuleAccess(ctx({ teamAccessPolicy: policy }), "management_systems", "read", 1)).toThrow();
    expect(canAccessProcess(policy, 100, "write", 1)).toBe(true);
  });
  it("strategy inherits to children but explicit child none wins regardless of input order", () => {
    const policy = buildTeamAccessPolicy({ ...base, moduleGrants: [moduleGrant("company_foda", "none"), moduleGrant("strategy", "write")] });
    expect(policy.moduleAccess.change_management).toBe("write");
    expect(policy.moduleAccess.company_foda).toBe("none");
    expect(policy.moduleAccess.management_systems).toBe("read");
  });
  it("strategy none denies implicit children while a touched child can explicitly remain read", () => {
    const policy = buildTeamAccessPolicy({ ...base, coordinator: true, moduleGrants: [moduleGrant("strategy", "none"), moduleGrant("change_management", "read")] });
    expect(policy.moduleAccess.company_foda).toBe("none");
    expect(policy.moduleAccess.change_management).toBe("read");
  });
  it("isolates grants per account and company even with identical own process", () => {
    const policy = buildTeamAccessPolicy({ ...base, moduleGrants: [moduleGrant("strategy", "write", 11), moduleGrant("strategy", "write", 10, 2)], processGrants: [grant(101, "write", 11), grant(102, "write", 10, 2)] });
    expect(policy.moduleAccess.strategy).toBe("read");
    expect(policy.processAccess).toEqual([]);
  });
  it("rejects grant rows whose process belongs outside canonical company catalog", () => {
    const policy = buildTeamAccessPolicy({ ...base, processGrants: [grant(999, "write"), grant(100, "read"), grant(101, "read"), grant(102, "write")] });
    expect(policy.processAccess).toEqual([{ processId: 101, accessLevel: "read" }, { processId: 102, accessLevel: "write" }]);
    expect(canAccessProcess(policy, 999, "write")).toBe(false);
    expect(canAccessProcess(policy, 101, "read", 2)).toBe(false);
  });
  it("both synchronous guards reject mutations to selected read-only process", () => {
    const policy = buildTeamAccessPolicy({ ...base, processGrants: [grant(101, "read"), grant(102, "write")] });
    const read = ctx({ teamAccessPolicy: policy, requestMode: "read" });
    const write = ctx({ teamAccessPolicy: policy, requestMode: "write" });
    expect(() => companyProcessAccess(read, { id: 101, companyId: 1 })).not.toThrow();
    expect(() => sessionProcessAccess(read, 101)).not.toThrow();
    expect(() => companyProcessAccess(write, { id: 101, companyId: 1 })).toThrow();
    expect(() => sessionProcessAccess(write, 101)).toThrow();
    expect(() => sessionProcessAccess(write, 102)).not.toThrow();
    expect(() => companyProcessAccess(write, { id: 102, companyId: 2 })).toThrow();
  });
  it("policy from another account cannot be reused with the current leader", () => {
    const policy = buildTeamAccessPolicy({ ...base, accountId: 11, processGrants: [grant(101, "write", 11)] });
    expect(() => sessionProcessAccess(ctx({ teamAccessPolicy: policy }), 101)).toThrow();
  });
  it("manager/admin full access is unchanged and ignores explicit grants", () => {
    const policy = buildTeamAccessPolicy({ ...base, fullAccess: true, moduleGrants: [moduleGrant("strategy", "none")] });
    expect(policy.moduleAccess.strategy).toBe("write");
    expect(canAccessProcess(policy, 102, "write", 1)).toBe(true);
    expect(canAccessProcess(policy, 999, "read", 1)).toBe(false);
    expect(getDetailedTeamAccess(policy).fullAccess).toBe(true);
  });
  it("stored personnel write never delegates manager-only mutation", () => {
    const policy = buildTeamAccessPolicy({ ...base, moduleGrants: [moduleGrant("organization_personnel", "write")] });
    expect(policy.moduleAccess.organization_personnel).toBe("read");
    expect(() => assertModuleAccess(ctx({ teamAccessPolicy: policy }), "organization_personnel", "write", 1)).toThrow();
  });
  it("legacy corporate write guard permits only the correctly identified module", async () => {
    const policy = buildTeamAccessPolicy({ ...base, moduleGrants: [moduleGrant("strategy", "write")] });
    await expect(assertCompanyManagementAccess(ctx({ teamAccessPolicy: policy, teamAccessModule: "strategy" }), 1)).resolves.toBeUndefined();
    await expect(assertCompanyManagementAccess(ctx({ teamAccessPolicy: policy, teamAccessModule: "management_systems" }), 1)).rejects.toThrow();
    await expect(assertCompanyManagementAccess(ctx({ teamAccessPolicy: policy }), 1)).rejects.toThrow();
    expect(getDb).not.toHaveBeenCalled();
  });
  it.each([
    ["companyInfo.get", "strategy"], ["companyValues.list", "strategy"], ["policies.get", "strategy"],
    ["strategicObjectives.list", "strategy"], ["policyObjectives.list", "strategy"],
    ["fodasRouter.getCompanyFODA", "company_foda"], ["changeManagement.get", "change_management"],
    ["organizationChart.getNodes", "organization_personnel"], ["payroll.jobDescriptions", "organization_personnel"],
    ["auditsInspections.listManagementSystems", "management_systems"], ["auditsInspections.listAudits", "management_systems"],
    ["auditsInspections.listInspections", "management_systems"], ["managementSystemChecklist.getChecklist", "management_systems"],
    ["managementPrograms.list", "management_systems"], ["companyCompliances.list", "management_systems"],
    ["companyCompliancesLegacy.delete", "management_systems"], ["companyTrainings.list", "management_systems"],
    ["trainingSchedules.get", "management_systems"], ["trainingBackups.list", "management_systems"],
    ["operationalFindings.list", "management_systems"],
  ])("maps actual corporate path %s", (path, module) => expect(resolveTeamAccessModule(path)).toBe(module));
  it.each(["processMap.get", "processFODA.get", "processCompliances.list", "processTrainings.create", "processOutputRelease.update", "meetings.list", "linkedCommitments.listByProcess", "onlineCourses.list", "courseRegCodes.list"])("preserves independent process/course path %s", path => expect(resolveTeamAccessModule(path)).toBeUndefined());
  it("maps corporate source methods by sourceType without denying own responsibilities", () => {
    expect(resolveTeamAccessModule("linkedCommitments.createLinks", { sourceType: "change_action" })).toBe("change_management");
    expect(resolveTeamAccessModule("linkedCommitments.listSourceProgress", { sourceType: "program_action" })).toBe("management_systems");
    expect(resolveTeamAccessModule("linkedCommitments.listByProcess", { sourceType: "program_action" })).toBeUndefined();
  });
  it("maps document types without assigning process map/indicators to Strategy", () => {
    expect(resolveTeamAccessModule("documents.getByCompanyAndType", { documentType: "Values" })).toBe("strategy");
    expect(resolveTeamAccessModule("documents.uploadPolicyDocument", {})).toBe("strategy");
    expect(resolveTeamAccessModule("documents.getByCompanyAndType", { documentType: "ProcessMap" })).toBeUndefined();
    expect(resolveTeamAccessModule("documents.getByCompanyAndType", { documentType: "Indicators" })).toBeUndefined();
    expect(resolveTeamAccessModule("documents.delete", { id: 3 })).toBeUndefined();
  });
  it("clones mode/module for HTTP and never mutates shared batch context", async () => {
    const original = ctx({ processLeader: null, user: { role: "admin" } as never });
    const [read, write] = await Promise.all([
      hydrateTeamAccessContext(original, { mode: "read", path: "companyInfo.get" }),
      hydrateTeamAccessContext(original, { mode: "write", path: "companyTrainings.create" }),
    ]);
    expect(read).not.toBe(original); expect(write).not.toBe(original);
    expect(read.requestMode).toBe("read"); expect(write.requestMode).toBe("write");
    expect(original.requestMode).toBeUndefined(); expect(original.teamAccessPolicy).toBeUndefined();
    expect(read.teamAccessModule).toBe("strategy"); expect(write.teamAccessModule).toBe("management_systems");
  });
  it.each(["read", "none"] as const)("suggestion permits module read but rejects %s restrictions without changing process write mode", async level => {
    const rows = [[{id:100},{id:101},{id:102}], [{id:10}], [{id:900}], [], [moduleGrant("change_management",level)], [grant(101,"read")]];
    let index=0;
    vi.mocked(getDb).mockResolvedValue({select:()=>{
      const result=rows[index++];
      const chain:any={from:()=>chain,where:()=>chain,innerJoin:()=>chain,limit:async()=>result,then:(resolve:any,reject:any)=>Promise.resolve(result).then(resolve,reject)};
      return chain;
    }} as never);
    const pending=hydrateTeamAccessContext(ctx(),{mode:"write",path:"changeManagement.suggest"});
    if(level==="none")await expect(pending).rejects.toMatchObject({code:"FORBIDDEN"});
    else {
      const hydrated=await pending;
      expect(hydrated.requestMode).toBe("write");
      expect(hydrated.teamAccessPolicy?.moduleAccess.change_management).toBe("read");
      expect(canAccessProcess(hydrated.teamAccessPolicy,100,"write",1)).toBe(true);
      expect(canAccessProcess(hydrated.teamAccessPolicy,101,"write",1)).toBe(false);
    }
  });
  it("fails closed when canonical policy DB is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    await expect(hydrateTeamAccessContext(ctx(), { mode: "read", path: "companyInfo.get" })).rejects.toThrow("Base de datos no disponible");
  });
  it("never downgrades to coordinator fallback when canonical policy SQL fails", async () => {
    const failure = new Error("Synthetic missing canonical table");
    vi.mocked(getDb).mockRejectedValue(failure);
    await expect(hydrateTeamAccessContext(ctx(), { mode: "read", path: "companyInfo.get" })).rejects.toBe(failure);
    expect(getDb).toHaveBeenCalledOnce();
  });
  it("independent online-course routes do not depend on ISGE grant table hydration", async () => {
    vi.mocked(getDb).mockRejectedValue(new Error("ISGE tables absent"));
    const course = await hydrateTeamAccessContext(ctx(), { mode: "read", path: "onlineCourses.list" });
    expect(course.teamAccessPolicy).toBeUndefined();
    expect(course.teamAccessModule).toBeUndefined();
    expect(getDb).not.toHaveBeenCalled();
  });
});
