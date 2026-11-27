import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import type { Pool } from "mysql2/promise";
import { companyInfo } from "../../drizzle/schema";
import type { AnnualWorkspaceRecord } from "./store";

const f = vi.hoisted(() => ({ pool: { getConnection: vi.fn() }, events: [] as string[], row: {} as any, dataset: [] as string[], snapshot: [] as string[], openConnections: 0, maxConnections: 0 }));
vi.mock("../db", () => ({ getDatabasePool: () => f.pool, getDb: vi.fn() }));
vi.mock("../_core/resolveRequestAuth", () => ({ resolveAuthFromRequest: vi.fn() }));
vi.mock("./migration", () => ({
  prepareNamespace: vi.fn(async () => { f.events.push("prepare"); }),
  copyWorkspaceRows: vi.fn(async () => { f.events.push("snapshot"); f.snapshot = [...f.dataset]; }),
  readCompanyDataset: vi.fn(async () => new Map()), collectAnnualFileKeys: vi.fn(), incorporateProcessRows: vi.fn(),
}));
import { getDb } from "../db";
import { resolveAuthFromRequest } from "../_core/resolveRequestAuth";
import { closeAnnualWorkspace, getWorkspaceForScope, PRESERVE_STRATEGY } from "./store";
import { acquireAnnualCompanyLease } from "./lease";
import { createAnnualClientProxy, getAnnualScope, rewriteAnnualSql, runInAnnualScope, validateAnnualWriteAccess } from "./runtime";
import { annualCorporateHttpScope, runInAnnualRequestScope, usesAnnualBusinessScope } from "./requestScope";
import { companyProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";

const w = (): AnnualWorkspaceRecord => ({ id: 901, companyId: 777, year: 2026, sourceYear: null, status: "open", storage: "base", strategy: { ...PRESERVE_STRATEGY } });
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function ctx(leader = false): TrpcContext {
  return { req: { headers: { "x-isge-company-id": "777", "x-isge-year": "2026" } } as any, res: {} as any, user: null,
    manager: leader ? null : { companyId: 777, companyName: "Test", managerEmail: "local@test.invalid" },
    processLeader: leader ? { companyId: 777, companyName: "Test", processId: 31, processLeaderId: 91, leaderName: "Test", leaderEmail: "local@test.invalid" } : null };
}
function connection() {
  f.openConnections++; f.maxConnections = Math.max(f.maxConnections, f.openConnections);
  let released = false;
  return {
    query: vi.fn(async (sql: string | { sql: string }, values: any[] = []) => {
      const text = typeof sql === "string" ? sql : sql.sql;
      if (text.includes("GET_LOCK")) { f.events.push("lock"); return [[{ acquired: 1 }], []]; }
      if (text.includes("RELEASE_LOCK")) { f.events.push("unlock"); return [[{ released: 1 }], []]; }
      if (text.startsWith("SELECT id FROM companies")) return [[{ id: 777 }], []];
      if (text.startsWith("INSERT INTO annualWorkspaces")) return [{ insertId: 901 }, []];
      if (text.startsWith("SELECT") && text.includes("annualWorkspaces")) return [[{ ...f.row }], []];
      if (text.startsWith("UPDATE annualWorkspaces")) { f.events.push("publish"); f.row.status = "closed"; f.row.storage = "namespace"; return [{ affectedRows: 1 }, []]; }
      if (/^(insert|update) /i.test(text)) { f.events.push("write"); f.dataset.push(String(values[0] ?? text)); return [{ insertId: 1 }, []]; }
      f.events.push(text.toLowerCase()); return [[], []];
    }),
    execute: vi.fn(async () => [[], []]),
    beginTransaction: vi.fn(async () => { f.events.push("begin"); }), commit: vi.fn(async () => { f.events.push("commit"); }), rollback: vi.fn(async () => { f.events.push("rollback"); }),
    release: vi.fn(() => { if (!released) { released = true; f.openConnections--; } }), destroy: vi.fn(() => { if (!released) { released = true; f.openConnections--; } }),
  };
}
beforeEach(() => {
  vi.clearAllMocks(); f.row = { ...w(), strategyJson: JSON.stringify(PRESERVE_STRATEGY) }; f.events = []; f.dataset = []; f.snapshot = []; f.openConnections = 0; f.maxConnections = 0;
  f.pool.getConnection.mockImplementation(async () => connection());
  const chain: any = {}; chain.select = () => chain; chain.from = () => chain; chain.where = () => chain; chain.limit = async () => [{ companyId: 777, processId: 31 }];
  vi.mocked(getDb).mockResolvedValue(chain);
});

describe("lease común de cierre/escritura (sin red)", () => {
  it("deja terminar todos los autosaves admitidos antes de snapshot y rechaza request vieja posterior", async () => {
    const admitted = deferred(), continueWrite = deferred();
    const driver = { query: vi.fn(async () => [[], []]) };
    const cached = createAnnualClientProxy(driver, w());
    const old = await getWorkspaceForScope(777, 2026);
    const request = runInAnnualScope(old, async () => {
      await validateAnnualWriteAccess(); admitted.resolve();
      await cached.query("UPDATE companyInfo SET proposito=? WHERE companyId=777", ["autosave1"]);
      await continueWrite.promise;
      await cached.query("UPDATE companyInfo SET mision=? WHERE companyId=777", ["autosave2"]);
      expect(Object.isFrozen(getAnnualScope()?.workspace)).toBe(true);
    });
    await admitted.promise;
    const closing = closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "manager", companyId: 777 } });
    await new Promise(r => setTimeout(r, 5));
    expect(f.events).not.toContain("snapshot");
    continueWrite.resolve(); await request; const closed = await closing;
    expect(closed).toMatchObject({ status: "closed", storage: "namespace" });
    expect(f.snapshot).toEqual(["autosave1", "autosave2"]);
    expect(f.events.indexOf("snapshot")).toBeGreaterThan(f.events.lastIndexOf("write"));
    await expect(runInAnnualScope(old, () => cached.query("UPDATE companyInfo SET vision=?", ["stale"]))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cached.query("UPDATE companyInfo SET vision=?", ["escaped"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.dataset).toEqual(f.snapshot); expect(driver.query).not.toHaveBeenCalled(); expect(f.openConnections).toBe(0);
  });

  it("requests abiertas pero aún no autorizadas fallan cuando close ganó la cola", async () => {
    const ready = deferred(), proceed = deferred();
    const request = runInAnnualScope(w(), async () => { ready.resolve(); await proceed.promise; await validateAnnualWriteAccess(); });
    await ready.promise;
    await closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } });
    proceed.resolve(); await expect(request).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.dataset).toEqual([]);
  });

  it("20 leases esperan antes de pedir conexión, nunca llenan el pool con GET_LOCK bloqueantes", async () => {
    const first = await acquireAnnualCompanyLease(777);
    const all = Array.from({ length: 20 }, (_, i) => acquireAnnualCompanyLease(778 + i).then(l => l.release()));
    await new Promise(r => setTimeout(r, 5));
    expect(f.pool.getConnection).toHaveBeenCalledOnce();
    await first.release(); await Promise.all(all);
    expect(f.maxConnections).toBe(1); expect(f.openConnections).toBe(0);
    for (const call of f.pool.getConnection.mock.results) {
      const c = await call.value;
      expect(c.query.mock.calls[0][0]).toBe("SELECT GET_LOCK(?,0) acquired");
    }
  });

  it("reintenta lock externo sin retener conexión; no usa timeout SQL de espera", async () => {
    let attempts = 0;
    f.pool.getConnection.mockImplementation(async () => {
      const c = connection(); const original = c.query;
      c.query = vi.fn(async (...args: any[]) => {
        if (String(args[0]).includes("GET_LOCK") && attempts++ === 0) return [[{ acquired: 0 }], []];
        return original(...args as [any, any]);
      });
      return c;
    });
    const lease = await acquireAnnualCompanyLease(777); await lease.release();
    expect(attempts).toBe(2); expect(f.maxConnections).toBe(1); expect(f.openConnections).toBe(0);
  });

  it("transacción Drizzle comparte conexión/lock, commit precede al snapshot", async () => {
    const db = drizzle(createAnnualClientProxy({ getConnection: vi.fn(() => { throw new Error("No debe tomar otra conexión"); }), query: vi.fn() } as unknown as Pool, w()));
    await runInAnnualScope(w(), () => db.transaction(async tx => { await tx.insert(companyInfo).values({ companyId: 777, proposito: "tx" }); await tx.transaction(async nested => { await nested.update(companyInfo).set({ vision: "nested" }).where(eq(companyInfo.companyId, 777)); }); }));
    await closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } });
    expect(f.events.indexOf("commit")).toBeLessThan(f.events.indexOf("snapshot"));
    expect(f.events.join(" ")).toContain("savepoint sp1"); expect(f.openConnections).toBe(0);
  });

  it("close anidado dentro de un lease falla claramente, no se espera a sí mismo", async () => {
    await runInAnnualScope(w(), async () => {
      await validateAnnualWriteAccess();
      await expect(closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } })).rejects.toMatchObject({ code: "CONFLICT" });
    });
    expect(f.openConnections).toBe(0);
    await closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } });
    expect(f.events).toContain("snapshot");
  });

  it("error del job libera lock, rollback y callbacks diferidos no escriben", async () => {
    let delayed!: () => Promise<unknown>;
    await expect(runInAnnualScope(w(), async () => {
      await validateAnnualWriteAccess();
      const cached = createAnnualClientProxy({ query: vi.fn() }, w());
      const late = deferred();
      delayed = async () => { late.resolve(); };
      const child = (async () => { await late.promise; return cached.query("UPDATE companyInfo SET proposito=?", ["late"]); })();
      void child.catch(() => {});
      const release = delayed; delayed = async () => { await release(); return child; };
      throw new Error("fallo job");
    })).rejects.toThrow("fallo job");
    await expect(delayed()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.dataset).toEqual([]); expect(f.events).toContain("rollback"); expect(f.openConnections).toBe(0);
    await closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } });
  });

  it("drena SQL iniciado antes de finalizar incluso si su await de validación sigue pendiente", async () => {
    const validation = deferred(), submitted = deferred();
    let save!: Promise<unknown>;
    const operation = runInAnnualScope(w(), async () => {
      await validateAnnualWriteAccess();
      const cached = createAnnualClientProxy({ query: vi.fn() }, w(), () => validation.promise);
      save = cached.query("UPDATE companyInfo SET proposito=?", ["already-started"]);
      submitted.resolve();
    });
    await submitted.promise;
    const closing = closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } });
    await new Promise(r => setTimeout(r, 5)); expect(f.events).not.toContain("snapshot");
    validation.resolve(); await save; await operation; await closing;
    expect(f.snapshot).toEqual(["already-started"]);
  });

  it("SQL scoped no puede liberar ni sustituir el lock que protege el cierre", () => {
    for (const sql of ["SELECT RELEASE_LOCK('isge:annual:777')", "SELECT RELEASE_ALL_LOCKS()", "SELECT GET_LOCK('isge:annual:777',0)"]) {
      expect(() => rewriteAnnualSql(sql, w())).toThrow("SQL anual");
    }
  });

  it("HTTP multipart conserva lease después de next() hasta finish", async () => {
    vi.mocked(resolveAuthFromRequest).mockResolvedValue(ctx());
    const res: any = Object.assign(new EventEmitter(), { locals: {}, status: vi.fn(() => res), json: vi.fn() });
    const req: any = { headers: ctx().req.headers, method: "POST", query: {} };
    const started = deferred(); let sql!: () => Promise<unknown>;
    const handling = annualCorporateHttpScope(req, res, () => {
      req.body = { companyId: "777", processId: "31" };
      const client = createAnnualClientProxy({ query: vi.fn() }, getAnnualScope()!.workspace);
      sql = () => client.query("UPDATE companyInfo SET proposito=?", ["multipart"]);
      setImmediate(async () => { await sql(); started.resolve(); });
    });
    await started.promise;
    const closing = closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } });
    await new Promise(r => setTimeout(r, 5)); expect(f.events).not.toContain("snapshot");
    res.emit("finish"); await handling; await closing;
    expect(f.snapshot).toEqual(["multipart"]);
  });

  it("tRPC real obtiene lease antes del resolver y cierre espera su autosave", async () => {
    const admitted = deferred(), finish = deferred();
    const app = router({ companyInfo: router({ save: companyProcedure.mutation(async () => {
      admitted.resolve(); await finish.promise;
      await createAnnualClientProxy({ query: vi.fn() }, getAnnualScope()!.workspace).query("UPDATE companyInfo SET proposito=?", ["trpc"]);
    }) }) });
    const request = app.createCaller(ctx()).companyInfo.save(); await admitted.promise;
    const close = closeAnnualWorkspace({ companyId: 777, year: 2026, actor: { role: "admin" } });
    await new Promise(r => setTimeout(r, 5)); expect(f.events).not.toContain("snapshot");
    finish.resolve(); await request; await close; expect(f.snapshot).toEqual(["trpc"]);
    await expect(app.createCaller(ctx()).companyInfo.save()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("scope y lectura histórica seguros", () => {
  it("process usa scope empresarial y closed no admite CRUD; auth/processUser/history siguen canónicos", async () => {
    expect(usesAnnualBusinessScope("process.get")).toBe(true);
    for (const path of ["auth.login", "processUser.get", "annualHistory.list"]) expect(usesAnnualBusinessScope(path)).toBe(false);
    expect(await runInAnnualRequestScope({ ctx: ctx(), path: "process.get", type: "query", rawInput: { companyId: 777 } }, () => getAnnualScope()?.workspace.id)).toBe(901);
    f.row.status = "closed"; f.row.storage = "namespace";
    const operation = vi.fn();
    await expect(runInAnnualRequestScope({ ctx: ctx(), path: "process.update", type: "mutation", rawInput: { id: 777 } }, operation)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(operation).not.toHaveBeenCalled();
  });
  it("destinos de linking no reciben ACL de fuente, pero fuentes y arrays ajenos no se abren", async () => {
    const operation = vi.fn(() => "guardas reales del resolver continúan");
    expect(await runInAnnualRequestScope({ ctx: ctx(true), path: "linkedCommitments.createLinks", type: "mutation", rawInput: { companyId: 777, processIds: [32] } }, operation)).toBe("guardas reales del resolver continúan");
    for (const input of [{ processId: 32 }, { sourceProcessId: 32 }, { processIds: [32] }, { targetProcessIds: [32] }]) {
      await expect(runInAnnualRequestScope({ ctx: ctx(true), path: "processCharacterization.getByProcessId", type: "query", rawInput: input }, operation)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    const chain: any = {}; chain.select = () => chain; chain.from = () => chain; chain.where = () => chain; chain.limit = async () => [{ companyId: 999 }]; vi.mocked(getDb).mockResolvedValue(chain);
    await expect(runInAnnualRequestScope({ ctx: ctx(true), path: "linkedCommitments.createLinks", type: "mutation", rawInput: { processIds: [32] } }, operation)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("SELECT REPLACE y funciones comunes probadas leen; DML y stored funcs desconocidas fallan", () => {
    const closed = { ...w(), status: "closed" as const, storage: "namespace" as const };
    for (const sql of ["SELECT REPLACE(name,'x','y'), COALESCE(name,'') FROM processes", "SELECT JSON_EXTRACT(value,'$.x'), COUNT(*) FROM companyValues", "SELECT DATE_FORMAT(NOW(),'%Y'), IFNULL(name,'') FROM processes", "SHOW CREATE TABLE processes"]) expect(rewriteAnnualSql(sql, closed)).toContain("aw_901_");
    for (const sql of ["REPLACE INTO companyInfo(companyId) VALUES(777)", "SELECT my_unknown_function() FROM processes", "SELECT custom.REPLACE(name,'x','y') FROM processes", "SELECT `REPLACE`(name,'x','y') FROM processes", "WITH x AS (SELECT 1) REPLACE INTO processes(id) VALUES(1)"]) expect(() => rewriteAnnualSql(sql, closed)).toThrow("solo lectura");
  });
});
