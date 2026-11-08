import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { MySqlDialect, getTableConfig } from "drizzle-orm/mysql-core";
import {
  companyManagementAccess,
  strategicObjectives,
  strategicObjectiveMeasurementConfigs,
  strategicObjectiveMeasurements,
} from "../../../drizzle/schema";
import { strategicObjectivesRouter } from "../strategicObjectives";
import type { TrpcContext } from "../../_core/context";
import {
  isValidStrategicMeasurementDate,
  strategicMeasurementToday,
} from "../../lib/strategicObjectiveMeasurementData";
import {
  emptyStrategicMeasurementConfig,
  type StrategicMeasurementConfig,
} from "../../../shared/strategicObjectiveMeasurement";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../../db", () => ({ getDb: mocks.getDb }));

const dialect = new MySqlDialect();
const tableName = (table: any) => getTableName(table);
type Row = Record<string, any>;

/** In-memory mock for the limited Drizzle API used here: no actual DB/S3 access. */
function createMockDb() {
  const tables: Record<string, Row[]> = {
    [tableName(strategicObjectives)]: [],
    [tableName(strategicObjectiveMeasurementConfigs)]: [],
    [tableName(strategicObjectiveMeasurements)]: [],
    [tableName(companyManagementAccess)]: [],
  };
  const locks: string[] = [];
  const writes: { table: string; kind: string; values: Row }[] = [];
  const matches = (row: Row, predicate: any) => {
    if (!predicate) return true;
    const query = dialect.sqlToQuery(predicate);
    const fields = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(match => match[1]);
    if (fields.length !== query.params.length) throw new Error(`Unexpected mock SQL: ${query.sql}`);
    return fields.every((field, index) => row[field] === query.params[index]);
  };
  const db: any = {
    select: vi.fn((projection?: Row) => {
      let table: any;
      let predicate: any;
      let limit: number | undefined;
      let ordering: any[] = [];
      let locked = false;
      const result = () => {
        const name = tableName(table);
        if (locked) locks.push(name);
        let rows = tables[name].filter(row => matches(row, predicate)).map(row => ({ ...row }));
        for (const order of [...ordering].reverse()) {
          const query = dialect.sqlToQuery(order.getSQL ? order.getSQL() : order);
          const field = query.sql.match(/`[^`]+`\.`([^`]+)`/)![1];
          const direction = query.sql.endsWith(" desc") ? -1 : 1;
          rows.sort((a, b) => direction * (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0));
        }
        if (limit !== undefined) rows = rows.slice(0, limit);
        return projection ? rows.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]]))) : rows;
      };
      const builder: any = {
        from(value: any) { table = value; return builder; },
        where(value: any) { predicate = value; return builder; },
        limit(value: number) { limit = value; return builder; },
        orderBy(...value: any[]) { ordering = value; return builder; },
        for(value: string) { expect(value).toBe("update"); locked = true; return builder; },
        then(resolve: any, reject: any) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      return builder;
    }),
    insert: vi.fn((table: any) => ({
      values: (values: Row) => {
        const name = tableName(table);
        const save = (update?: Row) => {
          const rows = tables[name];
          const existing = rows.find(row => row.objectiveId === values.objectiveId &&
            (name !== tableName(strategicObjectiveMeasurements) || row.measurementDate === values.measurementDate));
          if (existing && update) {
            Object.assign(existing, update);
            writes.push({ table: name, kind: "upsert", values: update });
            return existing.id;
          }
          const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
          rows.push({ id, createdAt: new Date(), updatedAt: new Date(), ...values });
          writes.push({ table: name, kind: "insert", values });
          return id;
        };
        return {
          then(resolve: any, reject: any) { return Promise.resolve().then(() => [{ insertId: save() }]).then(resolve, reject); },
          async $returningId() { return [{ id: save() }]; },
          async onDuplicateKeyUpdate({ set }: { set: Row }) { return [{ insertId: save(set) }]; },
        };
      },
    })),
    update: vi.fn((table: any) => ({
      set: (values: Row) => ({
        where: async (predicate: any) => {
          const name = tableName(table);
          tables[name].filter(row => matches(row, predicate)).forEach(row => Object.assign(row, values));
          writes.push({ table: name, kind: "update", values });
        },
      }),
    })),
    delete: vi.fn((table: any) => ({
      where: async (predicate: any) => {
        const name = tableName(table);
        tables[name] = tables[name].filter(row => !matches(row, predicate));
        writes.push({ table: name, kind: "delete", values: {} });
      },
    })),
    transaction: vi.fn(async (callback: any) => {
      const previous = structuredClone(tables);
      try { return await callback(db); }
      catch (error) { Object.assign(tables, previous); throw error; }
    }),
  };
  return { db, tables, locks, writes };
}

function context(role: "admin" | "manager" | "chief" | "coordinator" | "user" = "manager", companyId = 1): TrpcContext {
  return {
    req: {} as any,
    res: {} as any,
    user: role === "admin" || role === "user" ? { id: 10, role: role === "admin" ? "admin" : "user", openId: "test", email: "test@example.invalid", name: "Test" } : null,
    manager: role === "manager" ? { companyId, companyName: "Synthetic", managerEmail: "manager@example.invalid" } : null,
    processLeader: role === "chief" || role === "coordinator" ? { companyId, processId: 2, processLeaderId: 20, leaderName: "Test", leaderEmail: "chief@example.invalid", companyName: "Synthetic" } : null,
  };
}
const completeConfig: StrategicMeasurementConfig = {
  initialSituation: "Initial", expectedResult: "Expected", indicator: "Ventas", weight: 100,
  baseline: 10, goal: 30, unit: "USD", deadline: "2027-03-20",
};
const objectiveFixture = {
  id: 1, companyId: 1, objective: "OE histórica", description: "Descripción histórica",
  target: "META legacy íntegra", startYear: 2022, endYear: 2023,
  generalManagerName: "Responsable histórico", generalManagerCI: "CI intacta",
  electronicSignature: "Firma intacta", orderIndex: 1, createdAt: new Date(), updatedAt: new Date(),
};
let mock: ReturnType<typeof createMockDb>;
const caller = (role: Parameters<typeof context>[0] = "manager", companyId = 1) => strategicObjectivesRouter.createCaller(context(role, companyId));
const rows = (table: any) => mock.tables[tableName(table)];
const configure = (config = completeConfig) => rows(strategicObjectiveMeasurementConfigs).push({ id: 1, companyId: 1, objectiveId: 1, ...config });
const measure = (overrides: Row = {}) => rows(strategicObjectiveMeasurements).push({ id: 1, companyId: 1, objectiveId: 1, measurementDate: "2025-01-10", value: 20, observation: "Original observation", evidence: "Informe 123", percent: 50, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  mock = createMockDb();
  rows(strategicObjectives).push({ ...objectiveFixture });
  mocks.getDb.mockResolvedValue(mock.db);
});

describe("Strategic objective measurement: additive schema", () => {
  it("has unique config per OE, unique day per OE, string dates and short FK identifiers", () => {
    const config = getTableConfig(strategicObjectiveMeasurementConfigs);
    const measurements = getTableConfig(strategicObjectiveMeasurements);
    expect(config.uniqueConstraints.map(key => key.columns.map(column => column.name))).toContainEqual(["objectiveId"]);
    expect(measurements.uniqueConstraints.map(key => key.columns.map(column => column.name))).toContainEqual(["objectiveId", "measurementDate"]);
    for (const foreign of [...config.foreignKeys, ...measurements.foreignKeys]) expect(foreign.getName().length).toBeLessThanOrEqual(64);
    expect(strategicObjectiveMeasurements.measurementDate.mapFromDriverValue("2025-01-10")).toBe("2025-01-10");
  });
});

describe("Strategic objective measurement: real company permissions", () => {
  it.each(["admin", "manager", "coordinator"] as const)("allows %s to save a draft", async role => {
    if (role === "coordinator") rows(companyManagementAccess).push({ id: 1, companyId: 1, accountId: 20, accessLevel: "coordinator" });
    await expect(caller(role).saveMeasurementConfig({ companyId: 1, objectiveId: 1, config: emptyStrategicMeasurementConfig() })).resolves.toEqual({ success: true });
    expect(mock.locks).toEqual([tableName(strategicObjectives)]);
  });
  it.each(["chief", "user"] as const)("rejects %s writes", async role => {
    await expect(caller(role).saveMeasurementConfig({ companyId: 1, objectiveId: 1, config: completeConfig })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.writes).toEqual([]);
  });
  it("rejects a chief's measurements and definition patches", async () => {
    configure();
    await expect(caller("chief").saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: "2025-01-01", value: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("chief").update({ id: 1, name: "Forbidden" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.writes).toEqual([]);
  });
  it("allows a chief to read its own company only", async () => {
    await expect(caller("chief").getMeasurementOverview({ companyId: 1 })).resolves.toMatchObject({ totalCount: 1 });
    await expect(caller("chief").list({ companyId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("manager").getMeasurementDetail({ companyId: 2, objectiveId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("cannot attach config/measurement to an OE from another company, even for admin", async () => {
    rows(strategicObjectives)[0].companyId = 2;
    await expect(caller("admin").saveMeasurementConfig({ companyId: 1, objectiveId: 1, config: completeConfig })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller("admin").saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: "2025-01-01", value: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller("admin").getMeasurementDetail({ companyId: 1, objectiveId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mock.writes).toEqual([]);
  });
  it("validates the optional companyId on update", async () => {
    await expect(caller("admin").update({ id: 1, companyId: 2, name: "Bad scope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mock.writes).toEqual([]);
  });
});

describe("Strategic objective measurement: data preservation and drafts", () => {
  it("stores null draft numbers without false zero or changing old OE fields", async () => {
    const before = structuredClone(rows(strategicObjectives));
    await caller().saveMeasurementConfig({ companyId: 1, objectiveId: 1, config: emptyStrategicMeasurementConfig() });
    expect(rows(strategicObjectiveMeasurementConfigs)[0]).toMatchObject({ weight: null, baseline: null, goal: null });
    expect(rows(strategicObjectives)).toEqual(before);
    const overview = await caller().getMeasurementOverview({ companyId: 1 });
    expect(overview).toMatchObject({ status: "pending_configuration", globalPercent: null });
    expect(overview.objectives[0]).toMatchObject({ percent: null, latestMeasurement: null, deadline: "" });
  });
  it("rejects measurements before configuration is complete", async () => {
    configure(emptyStrategicMeasurementConfig());
    await expect(caller().saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: "2025-01-01", value: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rows(strategicObjectiveMeasurements)).toEqual([]);
  });
  it("keeps legacy deadline derivation, then overrides response only with exact config deadline", async () => {
    const [legacy] = await caller().list({ companyId: 1 });
    expect(legacy).toMatchObject({ measurementConfig: null, measurementStatus: "pending_configuration", percent: null, deadline: new Date(2022, 0, 1).toISOString().split("T")[0] });
    await caller().saveMeasurementConfig({ companyId: 1, objectiveId: 1, config: completeConfig });
    const [configured] = await caller().list({ companyId: 1 });
    expect(configured).toMatchObject({ deadline: "2027-03-20", target: "META legacy íntegra", measurementStatus: "unmeasured" });
    expect(rows(strategicObjectives)[0].startYear).toBe(2022);
  });
  it("autosaves only the supplied definition field; omitted narrative, target and years remain intact", async () => {
    await caller().update({ id: 1, description: "Nueva descripción" });
    expect(rows(strategicObjectives)[0]).toMatchObject({ ...objectiveFixture, description: "Nueva descripción" });
    expect(mock.writes[0].values).toEqual({ description: "Nueva descripción" });
    expect(mock.locks).toEqual([tableName(strategicObjectives)]);
  });
  it("preserves arbitrary legacy target text, and allows explicit clearing of a supplied field", async () => {
    await caller().update({ id: 1, responsible: "", name: "Nombre actualizado" });
    expect(rows(strategicObjectives)[0]).toMatchObject({ objective: "Nombre actualizado", generalManagerName: null, target: objectiveFixture.target, description: objectiveFixture.description, startYear: 2022, endYear: 2023 });
  });
  it("changes years only with an explicit deadline patch", async () => {
    await caller().update({ id: 1, deadline: "2030-08-21" });
    expect(rows(strategicObjectives)[0]).toMatchObject({ startYear: 2030, endYear: 2031, target: objectiveFixture.target });
  });
  it("an optional config-only update never writes legacy columns", async () => {
    const before = structuredClone(rows(strategicObjectives));
    await caller().update({ id: 1, measurementConfig: emptyStrategicMeasurementConfig() });
    expect(rows(strategicObjectives)).toEqual(before);
    expect(mock.db.update).not.toHaveBeenCalled();
  });
  it("keeps legacy create without config, but requires completeness when supplied", async () => {
    await expect(caller().create({ companyId: 1, name: "Legacy", orderIndex: 2, measurementConfig: emptyStrategicMeasurementConfig() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rows(strategicObjectives)).toHaveLength(1);
    await caller().create({ companyId: 1, name: "Legacy", orderIndex: 2, target: "Unmodified legacy text" });
    expect(rows(strategicObjectives)).toHaveLength(2);
    expect(rows(strategicObjectiveMeasurementConfigs)).toHaveLength(0);
    expect(mock.locks).toEqual([tableName(strategicObjectives)]);
  });
  it("creates OE and complete config in one transaction, without replacing target/name", async () => {
    const result = await caller().create({ companyId: 1, name: "New OE", target: "Legacy target", orderIndex: 2, measurementConfig: completeConfig });
    expect(result).toEqual({ success: true, objectiveId: 2 });
    expect(mock.db.transaction).toHaveBeenCalledOnce();
    expect(rows(strategicObjectives)[1]).toMatchObject({ objective: "New OE", target: "Legacy target" });
    expect(rows(strategicObjectiveMeasurementConfigs)[0]).toMatchObject({ objectiveId: 2, ...completeConfig });
  });
});

describe("Strategic objective measurement: calculation writes and history", () => {
  it.each([
    { baseline: 10, goal: 30, value: 20, percent: 50 },
    { baseline: 30, goal: 10, value: 20, percent: 50 },
    { baseline: 0, goal: 3, value: 1, percent: 33.33 },
    { baseline: 10, goal: 30, value: 40, percent: 100 },
    { baseline: 10, goal: 30, value: 0, percent: 0 },
  ])("persists progress $percent for $baseline → $goal at value $value", async ({ baseline, goal, value, percent }) => {
    configure({ ...completeConfig, baseline, goal });
    const before = structuredClone(rows(strategicObjectives));
    const result = await caller().saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: "2025-01-01", value, observation: "Real observation", evidence: "Informe / texto libre" });
    expect(result.measurement.percent).toBe(percent);
    const [saved] = rows(strategicObjectiveMeasurements);
    expect(saved).toMatchObject({ value, percent, observation: "Real observation", evidence: "Informe / texto libre" });
    expect(JSON.parse(saved.definitionSnapshot)).toMatchObject({ name: objectiveFixture.objective, target: objectiveFixture.target, config: { baseline, goal } });
    expect(rows(strategicObjectives)).toEqual(before);
    expect(mock.locks).toEqual([tableName(strategicObjectives)]);
  });
  it("upserts a day's autosave instead of duplicating it and preserves omitted observation/evidence", async () => {
    configure();
    measure();
    const result = await caller().saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: "2025-01-10", value: 25 });
    expect(rows(strategicObjectiveMeasurements)).toHaveLength(1);
    expect(result.measurement).toMatchObject({ id: 1, value: 25, percent: 75, observation: "Original observation", evidence: "Informe 123" });
  });
  it("keeps historical percentages while recalculating current against revised definition", async () => {
    configure();
    measure();
    await caller().saveMeasurementConfig({ companyId: 1, objectiveId: 1, config: { ...completeConfig, goal: 50 } });
    const detail = await caller().getMeasurementDetail({ companyId: 1, objectiveId: 1 });
    expect(detail.objective.percent).toBe(25);
    expect(detail.objective.latestMeasurement?.percent).toBe(50);
    expect(detail.measurements[0].percent).toBe(50);
    expect((await caller().getMeasurementOverview({ companyId: 1 })).globalPercent).toBe(25);
  });
  it("chooses the latest calendar date, not insertion ID, with ID as deterministic tie-breaker", async () => {
    configure();
    measure({ id: 9, measurementDate: "2024-01-01", value: 29, percent: 95 });
    measure({ id: 2, measurementDate: "2025-01-01", value: 20, percent: 50 });
    measure({ id: 3, measurementDate: "2025-01-01", value: 25, percent: 75 });
    const [objective] = await caller().list({ companyId: 1 });
    expect(objective.latestMeasurement?.id).toBe(3);
    expect(objective.percent).toBe(75);
    const detail = await caller().getMeasurementDetail({ companyId: 1, objectiveId: 1 });
    expect(detail.measurements.map(row => row.id)).toEqual([3, 2, 9]);
  });
  it("does not create zero progress when a configured OE has never been measured", async () => {
    configure();
    expect(await caller().getMeasurementOverview({ companyId: 1 })).toMatchObject({ globalPercent: null, status: "incomplete_measurements", measuredCount: 0 });
  });
  it("filters all reads to the requested company and ignores orphan/foreign measurement rows", async () => {
    configure();
    measure({ companyId: 2 });
    rows(strategicObjectives).push({ ...objectiveFixture, id: 2, companyId: 2 });
    const overview = await caller().getMeasurementOverview({ companyId: 1 });
    expect(overview.totalCount).toBe(1);
    expect(overview.objectives[0].latestMeasurement).toBeNull();
  });
  it("deletes the OE and only its new dependent rows transactionally", async () => {
    configure();
    measure();
    await caller().delete({ objectiveId: 1 });
    expect(rows(strategicObjectives)).toHaveLength(0);
    expect(rows(strategicObjectiveMeasurementConfigs)).toHaveLength(0);
    expect(rows(strategicObjectiveMeasurements)).toHaveLength(0);
    expect(mock.locks).toEqual([tableName(strategicObjectives)]);
  });
});

describe("Strategic objective measurement: validation", () => {
  it.each(["2025-02-29", "2025-02-30", "2025-13-01", "2025-00-01", "2025-1-01", "not-date", "0999-12-31", "9999-12-31"])("rejects invalid/future measurement date %s", async measurementDate => {
    configure();
    await expect(caller().saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate, value: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.writes).toEqual([]);
  });
  it.each([NaN, Infinity, -Infinity])("rejects non-finite actual value %s", async value => {
    configure();
    await expect(caller().saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: "2025-01-01", value })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.writes).toEqual([]);
  });
  it("rejects malformed config date and oversized evidence", async () => {
    await expect(caller().saveMeasurementConfig({ companyId: 1, objectiveId: 1, config: { ...completeConfig, deadline: "2025-02-30" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    configure();
    await expect(caller().saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: "2025-01-01", value: 20, evidence: "x".repeat(2001) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.writes).toEqual([]);
  });
  it("validates leap days without timezone rollover and computes today in Ecuador", () => {
    expect(isValidStrategicMeasurementDate("2024-02-29")).toBe(true);
    expect(isValidStrategicMeasurementDate("2023-02-29")).toBe(false);
    expect(strategicMeasurementToday(new Date("2026-11-08T04:59:00Z"))).toBe("2026-11-07");
    expect(strategicMeasurementToday(new Date("2026-11-08T05:00:00Z"))).toBe("2026-11-08");
  });
  it("allows today's real measurement", async () => {
    configure();
    await expect(caller().saveMeasurement({ companyId: 1, objectiveId: 1, measurementDate: strategicMeasurementToday(), value: 0 })).resolves.toMatchObject({ measurement: { value: 0, percent: 0 } });
  });
});
