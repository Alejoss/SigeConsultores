import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getTableName } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { companies, documents, processes } from "../../drizzle/schema";

const { drizzleMock } = vi.hoisted(() => ({ drizzleMock: vi.fn() }));
// Every getDb() in this suite uses this fake driver; no MySQL connection can be opened.
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: drizzleMock }));

const companyId = 101;
const oldDocument = {
  id: 501,
  processId: 201,
  documentName: "Mapa de Procesos - Imagen",
  documentType: "Varios",
  status: "Vigente",
  fileKey: "process-map/101/old-map.png",
  fileUrl: "https://storage.example.test/old-map",
  fileSizeBytes: 10,
};
const newKey = "process-map/101/new-map.png";
const newUrl = "https://storage.example.test/new-map";
type Row = Record<string, unknown>;
type QueryRecord = { table: unknown; condition?: SQL; lock?: string };

function fakeDatabase() {
  const state = {
    companyExists: true,
    processRows: [{ id: 201, name: "Proceso sintético" }] as Row[],
    documentRows: [{ ...oldDocument }] as Row[],
    failUpdate: false,
    failInsert: false,
    failCommit: false,
    failSelect: false,
  };
  const events: string[] = [];
  const queries: QueryRecord[] = [];
  const tx = {
    select: vi.fn(() => {
      const query: QueryRecord = { table: undefined };
      const resolveRows = () => {
        if (state.failSelect) throw new Error("Read failed");
        queries.push({ ...query });
        const name = getTableName(query.table as typeof companies);
        if (name === "companies") return state.companyExists ? [{ id: companyId }] : [];
        if (name === "processes") return state.processRows.map((row) => ({ ...row }));
        if (name === "documents") return state.documentRows.map((row) => ({ ...row }));
        throw new Error("Unexpected table");
      };
      const builder = {
        from(table: unknown) { query.table = table; return builder; },
        where(condition: SQL) { query.condition = condition; return builder; },
        orderBy() { return builder; },
        limit() { return builder; },
        for(lock: string) { query.lock = lock; return builder; },
        then(resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve().then(resolveRows).then(resolve, reject);
        },
      };
      return builder;
    }),
    update: vi.fn((table: unknown) => ({
      set: (values: Row) => ({
        where: async () => {
          if (getTableName(table as typeof documents) !== "documents") throw new Error("Unexpected update");
          events.push("update:document");
          state.documentRows[0] = { ...state.documentRows[0], ...values };
          if (state.failUpdate) throw new Error("Update failed");
          return [{ affectedRows: 1 }];
        },
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: async (values: Row) => {
        if (getTableName(table as typeof processes) === "processes") {
          events.push("insert:process");
          state.processRows.push({ id: 202, ...values });
          return [{ insertId: 202 }];
        }
        if (getTableName(table as typeof documents) !== "documents") throw new Error("Unexpected insert");
        events.push("insert:document");
        state.documentRows.push({ id: 502, ...values });
        if (state.failInsert) throw new Error("Insert failed");
        return [{ insertId: 502 }];
      },
    })),
  };
  const db = {
    select: tx.select,
    update: vi.fn(() => { throw new Error("Write outside transaction"); }),
    insert: vi.fn(() => { throw new Error("Write outside transaction"); }),
    delete: vi.fn(() => { throw new Error("Unexpected deletion"); }),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      const snapshot = structuredClone({ processRows: state.processRows, documentRows: state.documentRows });
      events.push("begin");
      try {
        const result = await callback(tx);
        if (state.failCommit) throw new Error("Commit failed");
        events.push("commit");
        return result;
      } catch (error) {
        state.processRows = snapshot.processRows;
        state.documentRows = snapshot.documentRows;
        events.push("rollback");
        throw error;
      }
    }),
  };
  return { db, tx, state, events, queries };
}

let fake: ReturnType<typeof fakeDatabase>;
let helpers: typeof import("../db");
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "mysql://mock:mock@mock.invalid/mock_only");
  fake = fakeDatabase();
  drizzleMock.mockReturnValue(fake.db);
  helpers = await import("../db");
});
afterEach(() => vi.unstubAllEnvs());

function querySql(query: QueryRecord) {
  return new MySqlDialect().sqlToQuery(query.condition!);
}

function expectOnlyTransactionalWrites() {
  expect(fake.db.transaction).toHaveBeenCalledTimes(1);
  expect(fake.db.update).not.toHaveBeenCalled();
  expect(fake.db.insert).not.toHaveBeenCalled();
  expect(fake.db.delete).not.toHaveBeenCalled();
  expect(getTableName(fake.queries[0].table as typeof companies)).toBe("companies");
  expect(fake.queries[0].lock).toBe("update");
  expect(querySql(fake.queries[0]).params).toEqual([companyId]);
}

describe("getProcessMapImageDocument: mocked database", () => {
  it("throws instead of returning null when the database is unavailable", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(helpers.getProcessMapImageDocument(companyId)).rejects.toThrow("Database not available");
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it("propagates query errors", async () => {
    fake.state.failSelect = true;
    await expect(helpers.getProcessMapImageDocument(companyId)).rejects.toThrow("Read failed");
  });

  it("returns null when the company has no processes", async () => {
    fake.state.processRows = [];
    await expect(helpers.getProcessMapImageDocument(companyId)).resolves.toBeNull();
    expect(fake.queries).toHaveLength(1);
  });

  it("returns null when no map document exists", async () => {
    fake.state.documentRows = [];
    await expect(helpers.getProcessMapImageDocument(companyId)).resolves.toBeNull();
  });

  it("reads only the company's process-map documents", async () => {
    await expect(helpers.getProcessMapImageDocument(companyId)).resolves.toEqual(oldDocument);
    expect(querySql(fake.queries[0]).params).toEqual([companyId]);
    const filter = querySql(fake.queries[1]);
    expect(filter.sql).toContain("`documents`.`processId` in");
    expect(filter.sql).toContain("`documents`.`documentName` =");
    expect(filter.sql).toContain("`documents`.`documentType` =");
    expect(filter.params).toEqual([201, helpers.PROCESS_MAP_IMAGE_DOC_NAME, "Varios"]);
  });
});

describe("replaceProcessMapImageDocument: mocked transaction", () => {
  it("updates the same document atomically and returns the old key only after commit", async () => {
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey, 20))
      .resolves.toEqual({ id: oldDocument.id, fileKey: oldDocument.fileKey });
    expect(fake.events).toEqual(["begin", "update:document", "commit"]);
    expect(fake.state.documentRows).toEqual([{
      ...oldDocument, fileKey: newKey, fileUrl: newUrl, fileSizeBytes: 20, updatedAt: expect.any(Date),
    }]);
    expectOnlyTransactionalWrites();
    expect(querySql(fake.queries[2]).params).toEqual([201, helpers.PROCESS_MAP_IMAGE_DOC_NAME, "Varios"]);
  });

  it("rolls back the previous document when updating fails", async () => {
    fake.state.failUpdate = true;
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey))
      .rejects.toThrow("Update failed");
    expect(fake.state.documentRows).toEqual([oldDocument]);
    expect(fake.events).toEqual(["begin", "update:document", "rollback"]);
    expectOnlyTransactionalWrites();
  });

  it("does not report success or return an old key when commit fails", async () => {
    fake.state.failCommit = true;
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey))
      .rejects.toThrow("Commit failed");
    expect(fake.state.documentRows).toEqual([oldDocument]);
    expect(fake.events).toEqual(["begin", "update:document", "rollback"]);
  });

  it("uses the existing general-documents process for the first map", async () => {
    fake.state.processRows = [{ id: 201, name: "Documentos Generales" }];
    fake.state.documentRows = [];
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey, 20)).resolves.toBeNull();
    expect(fake.events).toEqual(["begin", "insert:document", "commit"]);
    expect(fake.state.documentRows).toEqual([{
      id: 502, processId: 201, documentName: helpers.PROCESS_MAP_IMAGE_DOC_NAME,
      documentType: "Varios", status: "Vigente", fileUrl: newUrl, fileKey: newKey, fileSizeBytes: 20,
    }]);
    expectOnlyTransactionalWrites();
  });

  it("creates the general process and the first map in the same transaction", async () => {
    fake.state.processRows = [];
    fake.state.documentRows = [];
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey)).resolves.toBeNull();
    expect(fake.events).toEqual(["begin", "insert:process", "insert:document", "commit"]);
    expect(fake.state.processRows[0]).toMatchObject({ id: 202, companyId, name: "Documentos Generales" });
    expect(fake.state.documentRows[0]).toMatchObject({ processId: 202, fileKey: newKey });
    expectOnlyTransactionalWrites();
  });

  it("rolls back both the new general process and document if insertion fails", async () => {
    fake.state.processRows = [];
    fake.state.documentRows = [];
    fake.state.failInsert = true;
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey))
      .rejects.toThrow("Insert failed");
    expect(fake.events).toEqual(["begin", "insert:process", "insert:document", "rollback"]);
    expect(fake.state.processRows).toEqual([]);
    expect(fake.state.documentRows).toEqual([]);
    expectOnlyTransactionalWrites();
  });

  it("rejects a missing company before writing", async () => {
    fake.state.companyExists = false;
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey))
      .rejects.toThrow("Company not found");
    expect(fake.tx.update).not.toHaveBeenCalled();
    expect(fake.tx.insert).not.toHaveBeenCalled();
    expect(fake.state.documentRows).toEqual([oldDocument]);
  });

  it("rejects when the database is unavailable without starting a transaction", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(helpers.replaceProcessMapImageDocument(companyId, newUrl, newKey))
      .rejects.toThrow("Database not available");
    expect(fake.db.transaction).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();
  });
});
