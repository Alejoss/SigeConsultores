import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, sql } from "drizzle-orm";
import type { Pool } from "mysql2/promise";
import type { AnnualWorkspaceRecord } from "./store";
import {
  createAnnualClientProxy, getAnnualScope, rewriteAnnualSql, runInAnnualScope,
  withoutAnnualScope, runWithAnnualInputValidation, validateAnnualRequestInput,
} from "./runtime";
import { processes, companyInfo } from "../../drizzle/schema";

const fakeDriver = vi.hoisted(() => {
  const pool = { query: vi.fn(async () => [[], []]), execute: vi.fn(async () => [[], []]), getConnection: vi.fn() };
  return { pool, createPool: vi.fn(() => pool) };
});
vi.mock("mysql2/promise", () => ({ createPool: fakeDriver.createPool }));

const workspace = (overrides: Partial<AnnualWorkspaceRecord> = {}): AnnualWorkspaceRecord => ({
  id: 7, companyId: 12, year: 2027, sourceYear: 2026, status: "open", storage: "namespace",
  strategy: { purpose: true, mission: true, vision: true, values: true, policy: true, strategicObjectives: true },
  ...overrides,
});

// No real DB. Store/auth/getDb are stubs; SQL assertions use a fake mysql2 pool.
vi.mock("./store", () => ({
  getWorkspaceForScope: vi.fn(async (companyId: number, year: number) => workspace({ companyId, year, storage: year === 2026 ? "base" : "namespace" })),
  getProcessWorkspaceStatus: vi.fn(async () => "pending"),
}));
vi.mock("../_core/resolveRequestAuth", () => ({ resolveAuthFromRequest: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn() }));
// This suite tests lexer/ALS/driver shape, not lock arbitration (covered by
// lease.security.test.ts with the REAL lease and a fake canonical pool).
vi.mock("./lease", () => ({
  runWithAnnualLeaseOwner: (operation: () => unknown) => operation(),
  assertLeaseWorkspaceWritable: vi.fn(async () => {}),
  acquireAnnualCompanyLease: vi.fn(),
}));
import { acquireAnnualCompanyLease } from "./lease";
import { getWorkspaceForScope, getProcessWorkspaceStatus } from "./store";
import { getDb } from "../db";
import { resolveAuthFromRequest } from "../_core/resolveRequestAuth";
import { annualCorporateHttpScope, resolveAnnualRequestWorkspace, runInAnnualRequestScope, usesAnnualBusinessScope } from "./requestScope";
import type { TrpcContext } from "../_core/context";
import { companyProcedure, router } from "../_core/trpc";

function ctx(headers: Record<string, string> = {}, role: "manager" | "leader" | "admin" | "anonymous" = "manager"): TrpcContext {
  return {
    req: { headers } as TrpcContext["req"], res: {} as TrpcContext["res"],
    manager: role === "manager" ? { companyId: 12, companyName: "Fixture", managerEmail: "manager@example.test" } : null,
    processLeader: role === "leader" ? { companyId: 12, companyName: "Fixture", processId: 31, processLeaderId: 98, leaderName: "Fixture", leaderEmail: "leader@example.test" } : null,
    user: role === "admin" ? { id: 1, openId: "fixture", role: "admin", name: "Admin", email: "admin@example.test" } : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(acquireAnnualCompanyLease).mockImplementation(async companyId => {
    const connection: any = {
      query: vi.fn(async () => [[], []]), execute: vi.fn(async () => [[], []]),
      rollback: vi.fn(async () => {}), release: vi.fn(), destroy: vi.fn(),
    };
    return { companyId, connection, active: true, release: vi.fn(async () => {}) };
  });
  vi.mocked(getWorkspaceForScope).mockImplementation(async (companyId, year) => workspace({ companyId, year, storage: year === 2026 ? "base" : "namespace" }));
  vi.mocked(getProcessWorkspaceStatus).mockResolvedValue("pending");
  const chain: any = {};
  chain.select = vi.fn(() => chain); chain.from = vi.fn(() => chain); chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(async () => [{ companyId: 12, processId: 31 }]);
  vi.mocked(getDb).mockResolvedValue(chain);
});

describe("núcleo anual A: lexer sin BD", () => {
  it("preserva literales, comentarios, parámetros, columnas y aliases", () => {
    const input = "SELECT 'processes', \"companyInfo\", `p`.`name` AS `processes`, ? FROM `processes` AS `p` /* processes */ WHERE `p`.`name`='it\\'s processes'";
    expect(rewriteAnnualSql(input, workspace())).toBe(input.replace("FROM `processes`", "FROM `aw_7_processes`"));
  });
  it("mantiene calificadores Drizzle mediante un alias implícito", () => {
    expect(rewriteAnnualSql("select `processes`.`id` from `processes` where `processes`.`id` = ?", workspace()))
      .toBe("select `processes`.`id` from `aw_7_processes` AS `processes` where `processes`.`id` = ?");
  });
  it("reescribe joins, tablas separadas por coma, subqueries y schema raw", () => {
    const result = rewriteAnnualSql("SELECT p.id FROM db.processes p, companyInfo c JOIN (SELECT * FROM processes) x ON p.id=x.id WHERE p.name='companyInfo'", workspace());
    expect(result).toContain("FROM `aw_7_processes` p, `aw_7_companyInfo` c");
    expect(result).toContain("FROM `aw_7_processes` AS `processes`)");
    expect(result).toContain("p.name='companyInfo'");
  });
  it("no reescribe nombres canónicos, auth ni planningCycles", () => {
    const input = "select a.id FROM accounts a JOIN planningCycles c ON c.processId=a.id JOIN courseWorkers w ON w.id=a.id";
    expect(rewriteAnnualSql(input, workspace())).toBe(input);
  });
  it("no confunde columnas de upsert ni FROM de EXTRACT/TRIM con tablas", () => {
    expect(rewriteAnnualSql("insert into companyInfo(companyId, proposito) values (?, ?) ON DUPLICATE KEY UPDATE processes = ?", workspace()))
      .toBe("insert into `aw_7_companyInfo`(companyId, proposito) values (?, ?) ON DUPLICATE KEY UPDATE processes = ?");
    expect(rewriteAnnualSql("select extract(YEAR FROM processes), trim('x' FROM companyInfo) from processes", workspace()))
      .toBe("select extract(YEAR FROM processes), trim('x' FROM companyInfo) from `aw_7_processes` AS `processes`");
    expect(rewriteAnnualSql("SELECT * FROM processes WHERE id IN (SELECT id FROM processes)", workspace()))
      .toBe("SELECT * FROM `aw_7_processes` AS `processes` WHERE id IN (SELECT id FROM `aw_7_processes` AS `processes`)");
    expect(rewriteAnnualSql("REPLACE companyInfo(companyId) VALUES (?)", workspace())).toContain("REPLACE `aw_7_companyInfo`");
    expect(rewriteAnnualSql("INSERT INTO processes (name, companyId) SELECT name, companyId FROM processes WHERE id=?", workspace()))
      .toBe("INSERT INTO `aw_7_processes` (name, companyId) SELECT name, companyId FROM `aw_7_processes` AS `processes` WHERE id=?");
  });
  it("reescribe INSERT/UPDATE/DELETE sin modificar las columnas del SET", () => {
    expect(rewriteAnnualSql("insert into companyInfo (companyId, proposito) values (?, ?)", workspace()))
      .toBe("insert into `aw_7_companyInfo` (companyId, proposito) values (?, ?)");
    expect(rewriteAnnualSql("update processes set name = 'processes' where id = ?", workspace()))
      .toBe("update `aw_7_processes` AS `processes` set name = 'processes' where id = ?");
    expect(rewriteAnnualSql("delete from companyInfo where id = ?", workspace())).toContain("`aw_7_companyInfo`");
  });
  it("base abierto permanece original; namespace inválido y ajeno falla", () => {
    expect(rewriteAnnualSql("select * from processes", workspace({ storage: "base" }))).toBe("select * from processes");
    expect(() => rewriteAnnualSql("select * from processes", workspace({ id: 0 }))).toThrow("Namespace");
    expect(() => rewriteAnnualSql("select * from aw_9_processes", workspace())).toThrow("otro namespace");
  });
  it("namespace ausente propaga error original sin reintento/fallback", async () => {
    const query = vi.fn(async () => { throw new Error("ER_NO_SUCH_TABLE aw_7_processes"); });
    const client = createAnnualClientProxy({ query }, workspace());
    await expect(client.query("select * from processes")).rejects.toThrow("ER_NO_SUCH_TABLE");
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("aw_7_processes");
  });
  it("inspección raw DESCRIBE/SHOW usa namespace, sin alterar nombres de columnas", () => {
    expect(rewriteAnnualSql("DESCRIBE processes", workspace())).toBe("DESCRIBE `aw_7_processes`");
    expect(rewriteAnnualSql("SHOW COLUMNS FROM processes", workspace())).toBe("SHOW COLUMNS FROM `aw_7_processes`");
    expect(rewriteAnnualSql("SHOW CREATE TABLE companyInfo", workspace())).toBe("SHOW CREATE TABLE `aw_7_companyInfo`");
  });
  it("permite lectura closed y transacciones sólo de lectura", () => {
    const closed = workspace({ status: "closed" });
    expect(rewriteAnnualSql("SELECT * FROM processes", closed)).toContain("aw_7_processes");
    for (const statement of ["begin", "commit", "rollback", "savepoint sp1", "release savepoint sp1", "rollback to savepoint sp1", "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"]) {
      expect(rewriteAnnualSql(statement, closed)).toBe(statement);
    }
  });
  it.each([
    "INSERT INTO companyInfo(companyId) VALUES (?)", "UPDATE processes SET name=?", "DELETE FROM processes",
    "TRUNCATE TABLE processes", "CREATE TABLE processes(id int)", "SELECT * FROM processes; UPDATE processes SET name=?",
    "WITH c AS (SELECT 1) DELETE FROM processes", "SELECT * INTO OUTFILE '/tmp/test' FROM processes",
    "SELECT @x := 1", "CALL bootstrap()", "SELECT GET_LOCK('test',1)", "SELECT * FROM processes FOR UPDATE",
    "SELECT bootstrap_that_writes() FROM processes",
  ])("closed rechaza writes incidentales/raw: %s", statement => {
    expect(() => rewriteAnnualSql(statement, workspace({ status: "closed" }))).toThrow(/solo lectura/);
  });
  it("rechaza SQL ejecutable oculto, dinámico y CTE ambiguo, sin fallback", () => {
    for (const statement of ["SELECT 1 /*! UPDATE processes SET name='x' */", "PREPARE p FROM 'SELECT * FROM processes'", "USE other_db", "WITH processes AS (SELECT 1) SELECT * FROM processes"]) {
      expect(() => rewriteAnnualSql(statement, workspace())).toThrow();
    }
  });
});

describe("núcleo anual A: aislamiento ALS y proxy", () => {
  it("getDatabasePool es lazy único; getBaseDb siempre original y cache sólo por metadata", async () => {
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://fake:fake@127.0.0.1:1/unit_never_connect";
    try {
      const actual = await vi.importActual<typeof import("../db")>("../db");
      expect(fakeDriver.createPool).not.toHaveBeenCalled();
      expect(actual.getDatabasePool()).toBe(actual.getDatabasePool());
      expect(fakeDriver.createPool).toHaveBeenCalledOnce();
      const base = await actual.getBaseDb();
      const scoped = await runInAnnualScope(workspace(), () => actual.getDb());
      expect(await runInAnnualScope(workspace(), () => actual.getDb())).toBe(scoped);
      expect(await runInAnnualScope(workspace(), () => actual.getBaseDb())).toBe(base);
      expect(await withoutAnnualScope(() => actual.getDb())).toBe(base);
      expect(await runInAnnualScope(workspace({ status: "closed" }), () => actual.getDb())).not.toBe(scoped);
      expect(await runInAnnualScope(workspace({ companyId: 13 }), () => actual.getDb())).not.toBe(scoped);
      await base!.$client.query("select * from processes");
      expect(fakeDriver.pool.query.mock.calls.at(-1)?.[0]).toBe("select * from processes");
      await scoped!.$client.query("select * from processes");
      expect(fakeDriver.pool.query.mock.calls.at(-1)?.[0]).toContain("aw_7_processes");
      expect(fakeDriver.createPool).toHaveBeenCalledOnce();
    } finally { process.env.DATABASE_URL = originalUrl; }
  });
  it("dos peticiones concurrentes conservan empresa/año, sin fuga ni singleton mutable", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const seen = await Promise.all([
      runInAnnualScope(workspace(), async () => { await barrier; return getAnnualScope()?.workspace.id; }),
      runInAnnualScope(workspace({ id: 8, companyId: 13, year: 2028 }), async () => { release(); await Promise.resolve(); return getAnnualScope()?.workspace.id; }),
    ]);
    expect(seen).toEqual([7, 8]); expect(getAnnualScope()).toBeUndefined();
  });
  it("snapshot inmutable y withoutAnnualScope restaura contexto incluso al fallar", async () => {
    const source = workspace();
    await runInAnnualScope(source, async () => {
      source.id = 999;
      expect(getAnnualScope()?.workspace.id).toBe(7);
      expect(Object.isFrozen(getAnnualScope()?.workspace.strategy)).toBe(true);
      expect(() => withoutAnnualScope(() => { expect(getAnnualScope()).toBeUndefined(); throw new Error("test"); })).toThrow("test");
      expect(getAnnualScope()?.workspace.id).toBe(7);
    });
    expect(getAnnualScope()).toBeUndefined();
  });
  it("preserva query/execute options rowsAsArray, values, typeCast y binding", async () => {
    const typeCast = vi.fn(); const values = [31]; const result = [[{ id: 31 }], []];
    const original = { query: vi.fn(function (this: unknown) { expect(this).toBe(original); return Promise.resolve(result); }), execute: vi.fn(async () => result) };
    const proxy = createAnnualClientProxy(original, workspace());
    const options = { sql: "select * from processes", rowsAsArray: true, typeCast, values };
    expect(await proxy.query(options, values)).toBe(result);
    expect(await proxy.execute("select * from companyInfo", values)).toBe(result);
    expect(original.query.mock.calls[0][0]).toEqual({ ...options, sql: "select * from `aw_7_processes` AS `processes`" });
    expect(options.sql).toBe("select * from processes");
    expect(original.query.mock.calls[0][1]).toBe(values);
  });
  it("getConnection/transactions/nested savepoints y callback iterator siguen scoped", async () => {
    const calls: unknown[] = [];
    const callbackConnection = { query: vi.fn((...args) => { calls.push(args); return "stream"; }) };
    const connection = { query: vi.fn(async (...args) => { calls.push(args); return [[], []]; }), release: vi.fn(), connection: callbackConnection };
    const pool = { query: vi.fn(async () => [[], []]), getConnection: vi.fn(async () => connection) };
    vi.mocked(acquireAnnualCompanyLease).mockImplementation(async companyId => ({ companyId, connection: connection as any, active: true, release: async () => { connection.release(); } }));
    const db = drizzle(createAnnualClientProxy(pool as unknown as Pool, workspace()));
    await db.transaction(async tx => {
      await tx.select().from(processes).where(eq(processes.id, 31));
      await tx.transaction(async nested => { await nested.insert(companyInfo).values({ companyId: 12, proposito: "test" }); });
    });
    expect(calls.map(args => typeof (args as any)[0] === "string" ? (args as any)[0] : (args as any)[0].sql).join("\n")).toContain("aw_7_processes");
    expect(calls.map(args => (args as any)[0].sql).join("\n")).toContain("aw_7_companyInfo");
    expect(connection.release).toHaveBeenCalledOnce();
    const proxyConnection = await createAnnualClientProxy(pool, workspace()).getConnection();
    expect(proxyConnection.connection.query("select * from processes")).toBe("stream");
    expect(callbackConnection.query.mock.calls[0][0]).toContain("aw_7_processes");
    await proxyConnection.release();
  });
  it("closed bloquea query y execute ANTES de invocar driver", () => {
    const original = { query: vi.fn(), execute: vi.fn() };
    const proxy = createAnnualClientProxy(original, workspace({ status: "closed" }));
    expect(() => proxy.query("insert into processes (name) values (?)", ["test"])).toThrow("solo lectura");
    expect(() => proxy.execute({ sql: "update processes set name = ?", rowsAsArray: true }, ["test"])).toThrow("solo lectura");
    expect(original.query).not.toHaveBeenCalled(); expect(original.execute).not.toHaveBeenCalled();
  });
  it("prepare/changeUser no exponen un canal para saltarse la reescritura", () => {
    const original = { prepare: vi.fn(), changeUser: vi.fn(), query: vi.fn() };
    const proxy = createAnnualClientProxy(original, workspace());
    expect(() => proxy.prepare("select * from processes")).toThrow("prepared statements externos");
    expect(() => proxy.changeUser({ database: "other" })).toThrow("cambio de base");
    expect(original.prepare).not.toHaveBeenCalled(); expect(original.changeUser).not.toHaveBeenCalled();
  });
  it("lecturas Drizzle closed mapean filas rowsAsArray sin alterar contrato", async () => {
    const query = vi.fn(async () => [[[31]], []]);
    const db = drizzle(createAnnualClientProxy({ query } as unknown as Pool, workspace({ status: "closed" })));
    expect(await db.select({ id: processes.id }).from(processes).where(eq(processes.id, 31))).toEqual([{ id: 31 }]);
    expect(query.mock.calls[0][0].rowsAsArray).toBe(true);
    expect(query.mock.calls[0][0].sql).toContain("aw_7_processes");
  });
  it("validadores de input permanecen por petición y no dentro del cache metadata", async () => {
    const original = { query: vi.fn(async () => [[], []]) };
    const proxy = createAnnualClientProxy(original, workspace(), validateAnnualRequestInput);
    const checkA = vi.fn(async () => {}); const checkB = vi.fn(async () => {});
    await Promise.all([
      runWithAnnualInputValidation(checkA, () => proxy.query("select * from processes")),
      runWithAnnualInputValidation(checkB, () => proxy.query("select * from processes")),
    ]);
    expect(checkA).toHaveBeenCalledOnce(); expect(checkB).toHaveBeenCalledOnce();
  });
});

describe("núcleo anual A: selección no equivale a permiso", () => {
  it("sin headers gerente/jefe resuelve explícitamente BASE2026; admin global no se redirige", async () => {
    expect((await resolveAnnualRequestWorkspace(ctx(), { companyId: 12 }))?.year).toBe(2026);
    expect((await resolveAnnualRequestWorkspace(ctx({}, "leader"), {}))?.year).toBe(2026);
    expect(await resolveAnnualRequestWorkspace(ctx({}, "admin"), { companyId: 12 })).toBeUndefined();
    expect(getWorkspaceForScope).toHaveBeenCalledWith(12, 2026);
  });
  it("identidad ausente, otra empresa, input real discordante y headers inválidos fallan", async () => {
    const headers = { "x-isge-company-id": "12", "x-isge-year": "2027" };
    await expect(resolveAnnualRequestWorkspace(ctx(headers, "anonymous"), {})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(resolveAnnualRequestWorkspace(ctx({ ...headers, "x-isge-company-id": "13" }), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveAnnualRequestWorkspace(ctx(headers), { json: { companyId: 13 } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveAnnualRequestWorkspace(ctx({ ...headers, "x-isge-year": "2027x" }), {})).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getWorkspaceForScope).not.toHaveBeenCalled();
  });
  it("headers año no existente no crean ni caen a base", async () => {
    vi.mocked(getWorkspaceForScope).mockRejectedValueOnce(new Error("El año no existe"));
    await expect(resolveAnnualRequestWorkspace(ctx({ "x-isge-year": "2029" }), {})).rejects.toThrow("no existe");
    expect(getWorkspaceForScope).toHaveBeenCalledOnce();
  });
  it("tRPC real captura ámbito del resolver y no silencia bootstrap closed capturado", async () => {
    vi.mocked(getWorkspaceForScope).mockResolvedValue(workspace({ status: "closed" }));
    const original = { query: vi.fn() };
    const proxy = createAnnualClientProxy(original, workspace({ status: "closed" }));
    const testRouter = router({
      companyInfo: router({
        read: companyProcedure.query(() => getAnnualScope()?.workspace.id),
        lazyRead: companyProcedure.query(() => {
          try { proxy.query("INSERT INTO processes(name) VALUES ('bootstrap')"); } catch { return []; }
          return [];
        }),
      }),
    });
    const caller = testRouter.createCaller(ctx({ "x-isge-company-id": "12", "x-isge-year": "2027" }));
    expect(await caller.companyInfo.read()).toBe(7);
    await expect(caller.companyInfo.lazyRead()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(original.query).not.toHaveBeenCalled();
    expect(getAnnualScope()).toBeUndefined();
  });
  it("closed detiene resolver mutation, query lee, control/auth/cursos no scope", async () => {
    vi.mocked(getWorkspaceForScope).mockResolvedValue(workspace({ status: "closed" }));
    const resolver = vi.fn(() => getAnnualScope()?.workspace.id);
    await expect(runInAnnualRequestScope({ ctx: ctx(), path: "companyInfo.save", type: "mutation", rawInput: {} }, resolver)).rejects.toThrow("solo lectura");
    expect(resolver).not.toHaveBeenCalled();
    expect(await runInAnnualRequestScope({ ctx: ctx(), path: "companyInfo.get", type: "query", rawInput: {} }, resolver)).toBe(7);
    for (const path of ["annualWorkspaces.close", "planningCycles.activate", "onlineCourses.enroll", "auth.login", "teamAccess.changePassword"]) {
      expect(usesAnnualBusinessScope(path)).toBe(false);
      expect(await runInAnnualRequestScope({ ctx: ctx(), path, type: "mutation", rawInput: {} }, () => getAnnualScope())).toBeUndefined();
    }
  });
  it("valida processId real contra empresa y asignación de jefe", async () => {
    await expect(runInAnnualRequestScope({ ctx: ctx({}, "leader"), path: "processMap.get", type: "query", rawInput: { processId: 32 } }, vi.fn())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const chain: any = {}; chain.select = () => chain; chain.from = () => chain; chain.where = () => chain; chain.limit = async () => [{ companyId: 13 }];
    vi.mocked(getDb).mockResolvedValue(chain);
    await expect(runInAnnualRequestScope({ ctx: ctx(), path: "processMap.get", type: "query", rawInput: { processId: 31 } }, vi.fn())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("pending bloquea caracterización/matrices y conserva listado, catálogo y puestos", async () => {
    vi.mocked(getWorkspaceForScope).mockResolvedValue(workspace());
    const resolver = vi.fn(() => "ok");
    await expect(runInAnnualRequestScope({ ctx: ctx(), path: "processCharacterization.update", type: "mutation", rawInput: { processId: 31 } }, resolver)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(resolver).not.toHaveBeenCalled();
    for (const [path, type] of [["processCharacterization.getByProcessId", "query"], ["processMap.rename", "mutation"], ["processParticipants.create", "mutation"], ["managementPrograms.list", "query"]]) {
      expect(await runInAnnualRequestScope({ ctx: ctx(), path, type, rawInput: { processId: 31 } }, resolver)).toBe("ok");
    }
    vi.mocked(getProcessWorkspaceStatus).mockResolvedValue("incorporated");
    expect(await runInAnnualRequestScope({ ctx: ctx(), path: "processCharacterization.update", type: "mutation", rawInput: { processId: 31 } }, resolver)).toBe("ok");
  });
  it("multipart closed se rechaza antes de next/multer con actor real", async () => {
    vi.mocked(getWorkspaceForScope).mockResolvedValue(workspace({ status: "closed" }));
    vi.mocked(resolveAuthFromRequest).mockResolvedValue(ctx());
    const next = vi.fn(); const res: any = { locals: {}, status: vi.fn(() => res), json: vi.fn() };
    const req: any = { headers: { "x-isge-company-id": "12", "x-isge-year": "2027" }, method: "POST", query: {} };
    await annualCorporateHttpScope(req, res, next);
    expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toContain("solo lectura");
  });
  it("multipart valida el formulario REAL después del parse antes del hook SQL/storage", async () => {
    vi.mocked(getWorkspaceForScope).mockResolvedValue(workspace());
    vi.mocked(resolveAuthFromRequest).mockResolvedValue(ctx());
    const res: any = { locals: {}, status: vi.fn(() => res), json: vi.fn() };
    const req: any = { headers: { "x-isge-company-id": "12", "x-isge-year": "2027" }, method: "POST", query: {} };
    const next = vi.fn(async () => {
      req.body = { companyId: "13", processId: "31" };
      await expect(validateAnnualRequestInput()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(getAnnualScope()?.workspace.id).toBe(7);
    });
    await annualCorporateHttpScope(req, res, next);
    expect(next).toHaveBeenCalledOnce(); expect(getAnnualScope()).toBeUndefined();
  });
});
