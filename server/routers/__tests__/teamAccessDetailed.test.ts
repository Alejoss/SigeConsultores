import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { accounts, accountRoles, processes, companyTeamModuleAccess, companyTeamProcessAccess, companyTeamAccessAudit, companyManagementAccess } from "../../../drizzle/schema";
vi.mock("../../annual/requestScope", () => ({ runInAnnualRequestScope: async (_: unknown, operation: () => unknown) => operation() }));
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), roleId: vi.fn() }));
vi.mock("../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../accountAuth", () => ({ getRoleIdBySlug: mocks.roleId }));
import { teamAccessRouter } from "../teamAccess";
import { router } from "../../_core/trpc";
import type { TrpcContext } from "../../_core/context";
const api = router({ teamAccess: teamAccessRouter });
const dialect = new MySqlDialect();
type Row = Record<string, any>;
let data: Record<string, Row[]>;
let db: any;
let auditFails: boolean;
const name = (table: any) => getTableName(table);
function matches(row: Row, predicate: any): boolean {
  if (!predicate) return true;
  const query = dialect.sqlToQuery(predicate);
  const fields = Array.from(query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g), match => match[1]);
  return fields.every((field, index) => (field === "slug" ? "process_leader" : row[field]) === query.params[index]);
}
function mockDb() {
  const handle: any = {
    select: (projection?: Row) => {
      let table: any, predicate: any, limit: number | undefined;
      let joined = false;
      const query: any = {
        from(value: any) { table = value; return query; },
        innerJoin() { joined = true; return query; },
        leftJoin() { return query; },
        where(value: any) { predicate = value; return query; },
        orderBy() { return query; },
        for() { return query; },
        limit(value: number) { limit = value; return query; },
        then(resolve: any, reject: any) {
          return Promise.resolve().then(() => {
            let rows = (data[name(table)] ?? []).filter(row => matches(row, predicate));
            if (joined && name(table) === name(accountRoles)) rows = rows.filter(row => data[name(processes)].some(process => process.id === row.processId && process.companyId === row.companyId));
            if (limit !== undefined) rows = rows.slice(0, limit);
            return projection ? rows.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]]))) : rows.map(row => ({ ...row }));
          }).then(resolve, reject);
        },
      };
      return query;
    },
    insert: (table: any) => ({ values: (raw: Row | Row[]) => {
      const save = (update?: Row) => {
        if (name(table) === name(companyTeamAccessAudit) && auditFails) throw new Error("Synthetic audit failure");
        for (const values of Array.isArray(raw) ? raw : [raw]) {
          const rows = data[name(table)] ?? (data[name(table)] = []);
          const existing = rows.find(row => row.companyId === values.companyId && row.accountId === values.accountId && row.module === values.module);
          if (existing && update) Object.assign(existing, update);
          else rows.push({ id: rows.length + 1, ...values });
        }
        return [{ insertId: 1 }];
      };
      return { then: (resolve: any, reject: any) => Promise.resolve().then(() => save()).then(resolve, reject), onDuplicateKeyUpdate: async ({ set }: any) => save(set) };
    } }),
    delete: (table: any) => ({ where: async (predicate: any) => { data[name(table)] = data[name(table)].filter(row => !matches(row, predicate)); } }),
    update: (table: any) => ({ set: (values: Row) => ({ where: async (predicate: any) => {
      const rows = data[name(table)].filter(row => matches(row, predicate));
      rows.forEach(row => Object.assign(row, values));
      return [{ affectedRows: rows.length }];
    } }) }),
    transaction: vi.fn(async (operation: any) => {
      const snapshot = structuredClone(data);
      try { return await operation(handle); } catch (error) { data = snapshot; throw error; }
    }),
  };
  return handle;
}
function context(role: "manager" | "leader" | "admin" = "manager"): TrpcContext {
  return {
    req: {} as never, res: {} as never,
    manager: role === "manager" ? { companyId: 1, companyName: "Synthetic", managerEmail: "manager@example.test" } : null,
    user: role === "admin" ? { id: 1, openId: "admin", name: "Admin", email: null, role: "admin" } : null,
    processLeader: role === "leader" ? { processLeaderId: 10, processId: 100, companyId: 1, companyName: "Synthetic", leaderName: "Test", leaderEmail: "test@example.test" } : null,
  };
}
const caller = (role: Parameters<typeof context>[0] = "manager") => api.createCaller(context(role)).teamAccess;
beforeEach(() => {
  vi.clearAllMocks(); auditFails = false;
  data = {
    [name(accounts)]: [{ id: 1, email: "manager@example.test", status: "active" }, { id: 10, status: "active" }, { id: 11, status: "active" }, { id: 20, status: "active" }],
    [name(accountRoles)]: [{ id: 1, accountId: 10, companyId: 1, processId: 100, roleId: 7, status: "active" }, { id: 2, accountId: 11, companyId: 1, processId: 100, roleId: 7, status: "active" }, { id: 3, accountId: 20, companyId: 2, processId: 200, roleId: 7, status: "active" }],
    [name(processes)]: [{ id: 100, companyId: 1 }, { id: 101, companyId: 1 }, { id: 102, companyId: 1 }, { id: 200, companyId: 2 }],
    [name(companyTeamModuleAccess)]: [{ id: 1, companyId: 1, accountId: 10, module: "strategy", accessLevel: "read" }, { id: 2, companyId: 1, accountId: 10, module: "company_foda", accessLevel: "none" }],
    [name(companyTeamProcessAccess)]: [{ id: 1, companyId: 1, accountId: 10, processId: 101, accessLevel: "write" }, { id: 2, companyId: 1, accountId: 11, processId: 102, accessLevel: "read" }],
    [name(companyTeamAccessAudit)]: [], [name(companyManagementAccess)]: [],
  };
  db = mockDb(); mocks.getDb.mockResolvedValue(db); mocks.roleId.mockResolvedValue(7);
});
describe("teamAccess detailed API", () => {
  it("updates only touched modules and preserves omitted process grants", async () => {
    await expect(caller().setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [{ module: "strategy", accessLevel: "write" }] })).resolves.toEqual({ success: true });
    expect(data[name(companyTeamModuleAccess)]).toEqual(expect.arrayContaining([expect.objectContaining({ module: "company_foda", accessLevel: "none" }), expect.objectContaining({ module: "strategy", accessLevel: "write" })]));
    expect(data[name(companyTeamProcessAccess)]).toHaveLength(2);
    expect(data[name(companyTeamAccessAudit)]).toHaveLength(1);
    expect(data[name(companyTeamAccessAudit)][0].performedByAccountId).toBe(1);
    expect(db.transaction).toHaveBeenCalledOnce();
  });
  it("replaces only this account's extra grants, defaults omitted level to read, preserves implicit own write", async () => {
    await caller().setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [], processAccess: [{ processId: 100 }, { processId: 102 }] });
    expect(data[name(companyTeamProcessAccess)]).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: 11, processId: 102, accessLevel: "read" }), expect.objectContaining({ accountId: 10, processId: 102, accessLevel: "read" })]));
    expect(data[name(companyTeamProcessAccess)].some(row => row.accountId === 10 && row.processId === 100)).toBe(false);
    const access = await caller("leader").getMyDetailedAccess({ companyId: 1 });
    expect(access).toMatchObject({ ownProcessId: 100, fullAccess: false, processAccess: [{ processId: 102, accessLevel: "read" }] });
  });
  it("explicit empty processAccess clears extras only", async () => {
    await caller().setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [], processAccess: [] });
    expect(data[name(companyTeamProcessAccess)]).toEqual([expect.objectContaining({ accountId: 11 })]);
  });
  it("rejects foreign account and foreign process before any audit or change", async () => {
    const before = structuredClone(data);
    await expect(caller().setDetailedAccess({ companyId: 1, accountId: 20, moduleChanges: [{ module: "strategy", accessLevel: "write" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller().setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [], processAccess: [{ processId: 200, accessLevel: "write" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(data).toEqual(before);
  });
  it("rolls back modules and process replacement when audit insert fails", async () => {
    const before = structuredClone(data); auditFails = true;
    await expect(caller().setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [{ module: "strategy", accessLevel: "none" }], processAccess: [] })).rejects.toThrow("Synthetic audit failure");
    expect(data).toEqual(before);
  });
  it("only Gerencia manages grants, never admin or process chiefs", async () => {
    await expect(caller("admin").setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("leader").setDetailedAccess({ companyId: 1, accountId: 11, moduleChanges: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("forbids requesting detailed access for another company", async () => {
    await expect(caller("leader").getMyDetailedAccess({ companyId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects repeated touched module keys and repeated process IDs", async () => {
    await expect(caller().setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [{ module: "strategy", accessLevel: "write" }, { module: "strategy", accessLevel: "none" }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().setDetailedAccess({ companyId: 1, accountId: 10, moduleChanges: [], processAccess: [{ processId: 101 }, { processId: 101 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("suspends and reactivates exactly the selected account among multiple chiefs", async () => {
    await caller().suspendProcessLeader({ companyId: 1, processId: 100, accountId: 10 });
    expect(data[name(accountRoles)][0].status).toBe("suspended"); expect(data[name(accountRoles)][1].status).toBe("active");
    await caller().reactivateProcessLeader({ companyId: 1, processId: 100, accountId: 10 });
    expect(data[name(accountRoles)][0].status).toBe("active");
  });
  it("legacy ambiguous inputs never suspend multiple chiefs", async () => {
    await expect(caller().suspendProcessLeader({ companyId: 1, processId: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(data[name(accountRoles)].every(row => row.status === "active")).toBe(true);
  });
  it("rejects a stale direct leader context immediately after suspension or account disable", async () => {
    const stale = caller("leader");
    await stale.getMyDetailedAccess({ companyId: 1 });
    await caller().suspendProcessLeader({ companyId: 1, processId: 100, accountId: 10 });
    await expect(stale.getMyDetailedAccess({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller().reactivateProcessLeader({ companyId: 1, processId: 100, accountId: 10 });
    data[name(accounts)].find(row => row.id === 10)!.status = "disabled";
    await expect(stale.getMyDetailedAccess({ companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("reassigns selected chief only and validates target company", async () => {
    await expect(caller().reassignProcessLeader({ companyId: 1, fromProcessId: 100, toProcessId: 200, accountId: 10 })).rejects.toThrow();
    await caller().reassignProcessLeader({ companyId: 1, fromProcessId: 100, toProcessId: 102, accountId: 10 });
    expect(data[name(accountRoles)][0].processId).toBe(102); expect(data[name(accountRoles)][1].processId).toBe(100);
  });
});
