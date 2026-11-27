import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

vi.mock("../../annual/requestScope", () => ({ runInAnnualRequestScope: async (_options: unknown, operation: () => unknown) => operation() }));
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), rows: [] as any[][], where: vi.fn(), insert: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("../../db", () => ({ getDb: mocks.getDb, getProcessMapImageDocument: vi.fn(), deleteProcessMapImageDocument: vi.fn(), replaceProcessMapImageDocument: vi.fn() }));
vi.mock("../../storage", () => ({ storagePut: vi.fn(), storageGet: vi.fn(), storageDelete: vi.fn() }));
// Exercise real policy calculation/guards; only per-call DB hydration is stubbed.
vi.mock("../../_core/teamAccessPolicy", async importOriginal => {
  const actual = await importOriginal<typeof import("../../_core/teamAccessPolicy")>();
  return { ...actual, hydrateTeamAccessContext: async (ctx: TrpcContext, opts: any) => {
    const module = opts.module ?? actual.resolveTeamAccessModule(opts.path ?? "", opts.rawInput);
    const next = { ...ctx, requestMode: opts.mode, teamAccessModule: module };
    if (module) actual.assertModuleAccess(next, module, opts.mode, opts.companyId);
    return next;
  } };
});
import { buildTeamAccessPolicy } from "../../_core/teamAccessPolicy";
import { processMapRouter } from "../processMap";
import { meetingsRouter } from "../meetings";
import { linkedCommitmentsRouter } from "../linkedCommitments";
import { assertLegacyProcessRecordAccess, assertLegacyTacticalObjectiveReference } from "../processRecordAccess";

const C = 71, OWN = 81, READ = 82, WRITE = 83, NONE = 84;
function context(mode: "read" | "write" = "read"): TrpcContext {
  return {
    req: { headers: {} } as never, res: {} as never, user: null, manager: null,
    processLeader: { companyId: C, processId: OWN, processLeaderId: 91, leaderName: "Synthetic", leaderEmail: "fixture@example.invalid", companyName: "Synthetic" },
    requestMode: mode,
    teamAccessPolicy: buildTeamAccessPolicy({ companyId: C, accountId: 91, ownProcessId: OWN, companyProcessIds: [OWN, READ, WRITE, NONE], processGrants: [{ companyId: C, accountId: 91, processId: READ, accessLevel: "read" }, { companyId: C, accountId: 91, processId: WRITE, accessLevel: "write" }] }),
  };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows = [];
  const select = vi.fn(() => {
    const rows = mocks.rows.shift() ?? [];
    const result = Promise.resolve(rows) as any;
    result.limit = vi.fn(async () => rows); result.orderBy = vi.fn(async () => rows);
    return { from: vi.fn(() => ({ where: mocks.where.mockImplementation(() => result) })) };
  });
  mocks.getDb.mockResolvedValue({ select, insert: mocks.insert, update: mocks.update, delete: mocks.remove });
});

describe("process routers honor granular canonical policy", () => {
  it("list returns own plus explicit grants, never the arbitrary URL filter process", async () => {
    mocks.rows.push([OWN, READ, WRITE, NONE].map(id => ({ id, companyId: C, description: `private ${id}` })));
    expect((await processMapRouter.createCaller(context()).list({ companyId: C, filterProcessId: NONE })).map(row => row.id)).toEqual([OWN, READ, WRITE]);
  });
  it("selected read process detail succeeds while nonselected and foreign process fail", async () => {
    mocks.rows.push([{ id: READ, companyId: C }], [{ id: NONE, companyId: C }], [{ id: READ, companyId: C + 1 }]);
    const caller = processMapRouter.createCaller(context());
    await expect(caller.get({ processId: READ })).resolves.toMatchObject({ id: READ });
    await expect(caller.get({ processId: NONE })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.get({ processId: READ })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("map management stays Gerencia-only even with explicit process write", async () => {
    await expect(processMapRouter.createCaller(context()).rename({ companyId: C, processId: WRITE, name: "Denied", processType: "soporte" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("meeting mutation rejects a read-only process before content or write I/O", async () => {
    await expect(meetingsRouter.createCaller(context()).createType({ companyId: C, processId: READ, name: "Denied" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("meeting query accepts selected read but rejects unselected before I/O", async () => {
    mocks.rows.push([{ id: READ }], []);
    await expect(meetingsRouter.createCaller(context()).list({ companyId: C, processId: READ })).resolves.toEqual([]);
    mocks.getDb.mockClear();
    await expect(meetingsRouter.createCaller(context()).list({ companyId: C, processId: NONE })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each(["training", "schedule", "indicator"] as const)("legacy %s ID-only mutation resolves actual ownership and denies read grants", async source => {
    mocks.rows.push([{ processId: READ }], [{ id: READ, companyId: C }]);
    await expect(assertLegacyProcessRecordAccess(context("write"), source, 999)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("legacy ID-only record denies foreign ownership even if its numeric ID was granted", async () => {
    mocks.rows.push([{ processId: READ }], [{ id: READ, companyId: C + 1 }]);
    await expect(assertLegacyProcessRecordAccess(context("read"), "training", 999)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("own process ID-only mutation is allowed and cannot reference an unrelated objective", async () => {
    mocks.rows.push([{ processId: OWN }], [{ id: OWN, companyId: C }], []);
    await expect(assertLegacyProcessRecordAccess(context("write"), "indicator", 999)).resolves.toBe(OWN);
    await expect(assertLegacyTacticalObjectiveReference(OWN, 123)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("SG-denied own and delegated responsibilities remain queryable", async () => {
    const ctx = context();
    ctx.teamAccessPolicy!.moduleAccess.management_systems = "none";
    mocks.rows.push([{ id: READ, name: "Delegated" }], []);
    await expect(linkedCommitmentsRouter.createCaller(ctx).listByProcess({ companyId: C, processId: READ })).resolves.toEqual([]);
  });
  it("linked commitment read grant never allows writing own commitments to that process", async () => {
    await expect(linkedCommitmentsRouter.createCaller(context()).createOwn({ companyId: C, processId: READ, title: "Denied write" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("corporate directory denies SG-none before resolving a source", async () => {
    const ctx = context();
    ctx.teamAccessPolicy!.moduleAccess.management_systems = "none";
    await expect(linkedCommitmentsRouter.createCaller(ctx).listAssignableComplianceProcesses({ companyId: C, sourceId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("SG management directory requires write and exposes identity only, never process contents", async () => {
    await expect(linkedCommitmentsRouter.createCaller(context()).listAssignableComplianceProcesses({ companyId: C, sourceId: 999 })).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(mocks.getDb).not.toHaveBeenCalled();
    mocks.rows.push([{ id: 999, requirement: "Synthetic compliance", obligationType: "Legal" }], [{ id: NONE, name: "Target", processType: "soporte" }]);
    const authorized = context();
    authorized.teamAccessPolicy!.moduleAccess.management_systems = "write";
    const result = await linkedCommitmentsRouter.createCaller(authorized).listAssignableComplianceProcesses({ companyId: C, sourceId: 999 });
    expect(result).toEqual([{ id: NONE, name: "Target", processType: "soporte" }]);
    expect(result[0]).not.toHaveProperty("description");
  });
});
