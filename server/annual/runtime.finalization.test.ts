import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import type { Pool } from "mysql2/promise";
import { policies, policyObjectives, processes } from "../../drizzle/schema";
import type { AnnualWorkspaceRecord } from "./store";

const f = vi.hoisted(() => ({ pool: { getConnection: vi.fn() }, events: [] as string[], connections: [] as any[] }));
vi.mock("../db", () => ({ getDatabasePool: () => f.pool }));
import { createAnnualClientProxy, getAnnualScope, runInAnnualScope, runWithAnnualInputValidation, validateAnnualRequestInput, validateAnnualWriteAccess } from "./runtime";

const workspace = (overrides: Partial<AnnualWorkspaceRecord> = {}): AnnualWorkspaceRecord => ({
  id: 907, companyId: 778, year: 2027, sourceYear: 2026, status: "open", storage: "namespace",
  strategy: { purpose: true, mission: true, vision: true, values: true, policy: true, strategicObjectives: true }, ...overrides,
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
function connection() {
  let active = true;
  const c = {
    query: vi.fn(async (sql: string | { sql: string }) => {
      if (!active) throw new Error("SQL en conexión devuelta al pool");
      const text = typeof sql === "string" ? sql : sql.sql;
      if (text.includes("GET_LOCK")) { f.events.push("lock"); return [[{ acquired: 1 }], []]; }
      if (text.includes("RELEASE_LOCK")) { f.events.push("unlock"); return [[{ released: 1 }], []]; }
      if (text.includes("annualWorkspaces")) return [[workspace()], []];
      f.events.push(text);
      return [[], []];
    }),
    execute: vi.fn(async (sql: string) => { if (!active) throw new Error("SQL en conexión devuelta al pool"); f.events.push(sql); return [[], []]; }),
    rollback: vi.fn(async () => { f.events.push("rollback"); }),
    release: vi.fn(() => { active = false; f.events.push("release"); }),
    destroy: vi.fn(() => { active = false; f.events.push("destroy"); }),
  };
  f.connections.push(c);
  return c;
}
beforeEach(() => {
  vi.clearAllMocks(); f.events = []; f.connections = [];
  f.pool.getConnection.mockImplementation(async () => connection());
});

describe("finalización anual: reproducción propia sin BD", () => {
  it("un parse síncrono aborta el arreglo antes de Promise.all; la lectura hermana encadenada sigue siendo readable", async () => {
    const continueRead = deferred();
    const driver = { query: vi.fn(async (options: { sql: string }) => {
      f.events.push(`pool:${options.sql}`);
      return [[[999822010, 1, "objetivo", "descripción"]], []];
    }) };
    const db = drizzle(createAnnualClientProxy(driver as unknown as Pool, workspace()));
    let sibling!: Promise<unknown>;
    let constructed = false;
    const original = new SyntaxError("amenazas históricas inválidas");
    const normalize = async () => {
      await db.select({ id: policies.id }).from(policies).where(eq(policies.companyId, 778));
      await continueRead.promise;
      return db.select({ id: policyObjectives.id, policyId: policyObjectives.policyId, objective: policyObjectives.objective, description: policyObjectives.description })
        .from(policyObjectives).where(inArray(policyObjectives.id, [999822010, 999822012]));
    };
    const parse = (): never => { throw original; };
    const request = runInAnnualScope(workspace(), async () => {
      await validateAnnualWriteAccess();
      const entries = [sibling = normalize(), parse()];
      constructed = true;
      return Promise.all(entries);
    });
    await expect(request).rejects.toBe(original);
    expect(constructed).toBe(false);
    expect(f.events).toContain("release");
    // Attach a consumer here so the original failure is deterministic rather
    // than deliberately creating an unhandled rejection in the test runner.
    const result = expect(sibling).resolves.toEqual([{ id: 999822010, policyId: 1, objective: "objetivo", description: "descripción" }]);
    continueRead.resolve();
    await result;
    expect(driver.query).toHaveBeenCalledOnce();
    expect(driver.query.mock.calls[0][0].sql).toContain("aw_907_policyObjectives");
    expect(f.events.filter(e => e === "lock")).toHaveLength(1);
  });

  it("lectura iniciada durante drain de escritura usa pool, nunca una conexión ya liberada", async () => {
    const validation = deferred(), admitted = deferred(), continueRead = deferred(), readReady = deferred();
    const driver = { query: vi.fn(async () => { readReady.resolve(); return [[], []]; }) };
    let write!: Promise<unknown>, read!: Promise<unknown>;
    const request = runInAnnualScope(workspace(), async () => {
      await validateAnnualWriteAccess();
      const writer = createAnnualClientProxy(driver, workspace(), () => validation.promise);
      const reader = createAnnualClientProxy(driver, workspace());
      write = writer.query("UPDATE processes SET name='admitido'");
      read = (async () => { await continueRead.promise; return reader.query("SELECT * FROM processes"); })();
      admitted.resolve();
    });
    await admitted.promise;
    await new Promise(resolve => setImmediate(resolve));
    continueRead.resolve(); await readReady.promise; await read;
    expect(f.events).not.toContain("unlock");
    expect(driver.query).toHaveBeenCalledOnce();
    validation.resolve(); await write; await request;
    expect(f.events).toContain("release");
  });
});

describe("límites de lectura vs capacidad de escritura", () => {
  it("Promise.all realmente construido rechaza temprano y su hermano Drizzle aún puede completar lecturas", async () => {
    const proceed = deferred();
    const driver = { query: vi.fn(async () => [[[31]], []]) };
    const db = drizzle(createAnnualClientProxy(driver as unknown as Pool, workspace()));
    let sibling!: Promise<unknown>;
    const request = runInAnnualScope(workspace(), async () => {
      await validateAnnualWriteAccess();
      sibling = (async () => { await proceed.promise; return db.select({ id: processes.id }).from(processes); })();
      return Promise.all([sibling, Promise.reject(new Error("rechazo temprano"))]);
    });
    await expect(request).rejects.toThrow("rechazo temprano");
    proceed.resolve();
    expect(await sibling).toEqual([{ id: 31 }]);
    expect(driver.query).toHaveBeenCalledOnce();
    expect(f.events.filter(e => e === "lock")).toHaveLength(1);
  });

  it("validación de input anidada puede leer durante drain sin reabrir autorización ni escribir tarde", async () => {
    const gate = deferred(), submitted = deferred(), nestedRead = deferred();
    const driver = { query: vi.fn(async () => { nestedRead.resolve(); return [[], []]; }) };
    let write!: Promise<unknown>;
    const request = runInAnnualScope(workspace(), () => runWithAnnualInputValidation(async () => {
      await gate.promise;
      const acl = createAnnualClientProxy(driver, workspace(), validateAnnualRequestInput);
      await runWithAnnualInputValidation(async () => {}, () => acl.query("SELECT * FROM processes WHERE id=31"));
    }, async () => {
      await validateAnnualWriteAccess();
      write = createAnnualClientProxy(driver, workspace(), validateAnnualRequestInput).query("UPDATE processes SET name='validado'");
      submitted.resolve();
    }));
    await submitted.promise;
    await new Promise(resolve => setImmediate(resolve));
    gate.resolve(); await nestedRead.promise; await write; await request;
    expect(driver.query).toHaveBeenCalledOnce();
    expect(f.events.some(e => e.includes("UPDATE `aw_907_processes`"))).toBe(true);
    expect(f.events.filter(e => e === "lock")).toHaveLength(1);
  });

  it("handles pinned leen después de release usando pool original, pero rechazan writes y getConnection", async () => {
    const proceed = deferred();
    const pool = { getConnection: vi.fn(async () => connection()), query: vi.fn(async () => [[], []]), execute: vi.fn(async () => [[], []]) };
    const proxy = createAnnualClientProxy(pool, workspace());
    let late!: Promise<void>;
    await runInAnnualScope(workspace(), async () => {
      const conn = await proxy.getConnection();
      late = (async () => {
        await proceed.promise;
        await conn.query("SELECT * FROM processes");
        await conn.execute("SELECT REPLACE(name,'x','y') FROM processes");
        await expect(conn.query("UPDATE processes SET name='tarde'")).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(proxy.getConnection()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(validateAnnualWriteAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(getAnnualScope()?.workspace.id).toBe(907);
        expect(Object.isFrozen(getAnnualScope()?.workspace.strategy)).toBe(true);
      })();
    });
    proceed.resolve(); await late;
    expect(pool.query).toHaveBeenCalledOnce(); expect(pool.execute).toHaveBeenCalledOnce();
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(f.events.filter(e => e === "lock")).toHaveLength(1);
  });

  it("un handle pinned detached conserva el límite después de su propio release incluso sin ALS", async () => {
    const pool = { getConnection: vi.fn(async () => connection()), query: vi.fn(async () => [[], []]) };
    const conn = await createAnnualClientProxy(pool, workspace()).getConnection();
    await conn.release();
    await conn.query("SELECT COUNT(*) FROM processes");
    await expect(conn.query("DELETE FROM processes")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(pool.query).toHaveBeenCalledOnce();
    expect(f.events.filter(e => e === "lock")).toHaveLength(1);
  });

  it.each([
    "INSERT INTO processes(name) VALUES('tarde')", "UPDATE processes SET name='tarde'", "DELETE FROM processes",
    "BEGIN", "START TRANSACTION", "SET TRANSACTION ISOLATION LEVEL READ COMMITTED", "COMMIT", "ROLLBACK", "SAVEPOINT sp1", "RELEASE SAVEPOINT sp1",
    "SELECT unknown_writer() FROM processes", "SELECT custom.COUNT(*) FROM processes", "SELECT `COUNT`(*) FROM processes",
    "SELECT * FROM processes FOR UPDATE", "SELECT @v:=1", "SELECT * INTO OUTFILE '/tmp/no' FROM processes",
    "SELECT * FROM processes; COMMIT", "SELECT * FROM processes; UPDATE processes SET name='tarde'",
  ])("SQL tardío no reconocido como lectura jamás toca driver/lease: %s", async sql => {
    const proceed = deferred();
    const driver = { query: vi.fn(async () => [[], []]) };
    let late!: Promise<unknown>;
    await runInAnnualScope(workspace(), async () => {
      late = (async () => { await proceed.promise; return createAnnualClientProxy(driver, workspace()).query(sql); })();
    });
    const rejected = expect(late).rejects.toMatchObject({ code: "FORBIDDEN" });
    proceed.resolve(); await rejected;
    expect(driver.query).not.toHaveBeenCalled(); expect(f.pool.getConnection).not.toHaveBeenCalled();
  });

  it("closed sigue readable tras scope y getConnection valida antes de adquirir; DML y control tardíos fallan", async () => {
    const closed = workspace({ status: "closed" });
    const proceed = deferred();
    const pool = { getConnection: vi.fn(async () => connection()), query: vi.fn(async () => [[], []]) };
    const check = vi.fn(async () => {});
    const proxy = createAnnualClientProxy(pool, closed, validateAnnualRequestInput);
    let late!: Promise<void>;
    await runInAnnualScope(closed, () => runWithAnnualInputValidation(check, async () => {
      late = (async () => {
        await proceed.promise;
        await proxy.query("SHOW CREATE TABLE processes");
        const c = await proxy.getConnection();
        await c.query("SELECT * FROM processes");
        expect(() => c.query("INSERT INTO processes(name) VALUES('no')")).toThrow("solo lectura");
        await expect(c.query("COMMIT")).rejects.toMatchObject({ code: "FORBIDDEN" });
        c.release();
      })();
    }));
    proceed.resolve(); await late;
    expect(check).toHaveBeenCalledTimes(3);
    expect(f.pool.getConnection).not.toHaveBeenCalled();
    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(f.events).not.toContain("lock");
  });

  it("lectura tardía conserva validación fallida y nunca llega al pool", async () => {
    const proceed = deferred();
    const driver = { query: vi.fn(async () => [[], []]) };
    const denied = new Error("input no autorizado");
    let late!: Promise<unknown>;
    await runInAnnualScope(workspace(), () => runWithAnnualInputValidation(async () => { throw denied; }, async () => {
      late = (async () => { await proceed.promise; return createAnnualClientProxy(driver, workspace(), validateAnnualRequestInput).query("SELECT * FROM processes"); })();
    }));
    const rejected = expect(late).rejects.toBe(denied); proceed.resolve(); await rejected;
    expect(driver.query).not.toHaveBeenCalled(); expect(f.pool.getConnection).not.toHaveBeenCalled();
  });
});

describe("thenables y callbacks no amplían el lease", () => {
  it("un thenable Drizzle de escritura construido pero no consumido se rechaza después del scope", async () => {
    const proceed = deferred();
    const driver = { query: vi.fn(async () => [[], []]) };
    const db = drizzle(createAnnualClientProxy(driver as unknown as Pool, workspace()));
    let late!: Promise<unknown>;
    await runInAnnualScope(workspace(), async () => {
      const statement = db.update(processes).set({ name: "no-fire-and-forget" }).where(eq(processes.id, 31));
      late = (async () => { await proceed.promise; return statement; })();
    });
    const rejected = expect(late).rejects.toMatchObject({ cause: { code: "FORBIDDEN" } });
    proceed.resolve(); await rejected;
    expect(driver.query).not.toHaveBeenCalled(); expect(f.pool.getConnection).not.toHaveBeenCalled();
  });

  it("callback de conexión pinned devuelta no reutiliza driver aunque SELECT parezca seguro", async () => {
    const callback = { query: vi.fn(() => "stream") };
    f.pool.getConnection.mockImplementation(async () => Object.assign(connection(), { connection: callback }));
    const pool = { getConnection: vi.fn(async () => connection()), query: vi.fn(async () => [[], []]) };
    const conn = await createAnnualClientProxy(pool, workspace()).getConnection();
    const escaped = (conn as any).connection;
    expect(escaped.query("SELECT * FROM processes")).toBe("stream");
    await conn.release();
    for (const sql of ["SELECT * FROM processes", "UPDATE processes SET name='callback'", "COMMIT"]) {
      expect(() => escaped.query(sql)).toThrow("SQL callback anual sin lease activo");
    }
    expect(callback.query).toHaveBeenCalledOnce(); expect(pool.query).not.toHaveBeenCalled();
  });

  it("callback de pool sin pin sí permite known read tardío; DML no puede escapar con lease terminado", async () => {
    const proceed = deferred();
    const callback = { query: vi.fn(() => "stream") };
    const driver = { query: vi.fn(async () => [[], []]), connection: callback };
    let late!: Promise<void>;
    await runInAnnualScope(workspace(), async () => {
      const client = createAnnualClientProxy(driver, workspace());
      late = (async () => {
        await proceed.promise;
        expect(client.connection.query("SELECT COUNT(*) FROM processes")).toBe("stream");
        expect(() => client.connection.query("UPDATE processes SET name='tarde'")).toThrow("SQL callback anual sin lease activo");
        expect(() => client.connection.query("SELECT unknown_writer() FROM processes")).toThrow("SQL callback anual sin lease activo");
      })();
    });
    proceed.resolve(); await late;
    expect(callback.query).toHaveBeenCalledOnce(); expect(f.pool.getConnection).not.toHaveBeenCalled();
  });
});
