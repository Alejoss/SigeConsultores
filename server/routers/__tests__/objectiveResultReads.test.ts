import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { processTacticalObjectives } from "../../../drizzle/schema";
import { processTacticalObjectivesRouter } from "../processTacticalObjectives";
import { consolidatedIndicatorsRouter } from "../consolidatedIndicators";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  assertProcessAccessById: vi.fn(),
  updateProcessTacticalObjective: vi.fn(),
}));
vi.mock("../../db", () => ({ getDb: mocks.getDb, updateProcessTacticalObjective: mocks.updateProcessTacticalObjective }));
vi.mock("../../_core/companyPermissions", () => ({
  assertProcessAccessById: mocks.assertProcessAccessById,
  assertProcessTacticalObjectiveAccess: vi.fn(),
  assertCompanyManagementFromRawInput: vi.fn(),
  assertCompanyPersonnelManagementFromRawInput: vi.fn(),
  assertCompanyReadFromRawInput: vi.fn(),
}));

const context: TrpcContext = {
  req: {} as any, res: {} as any, user: null, processLeader: null,
  manager: { companyId: 7, companyName: "Empresa ficticia", managerEmail: "manager@example.invalid" },
};
let rows: any[];
let before: string;
const db = {
  select: vi.fn(() => ({
    from: (table: any) => ({
      where: vi.fn(async () => getTableName(table) === getTableName(processTacticalObjectives) ? rows : []),
    }),
  })),
  update: vi.fn(), insert: vi.fn(), delete: vi.fn(), transaction: vi.fn(),
};
function fixture(planningData: Record<string, any>, id = 1) {
  return { id, processId: 21, name: `OTE ficticio ${id}`, avanceMeta: "999", planningData: JSON.stringify(planningData) };
}
function seed(planningData: Record<string, any>) {
  rows = [fixture({ ponderacion: 100, puntoPartida: 160, metaLlegada: 200, avanceMeta: 180, ...planningData })];
  before = JSON.stringify(rows);
}
async function read(source: "planning" | "indicators") {
  if (source === "planning") return (await processTacticalObjectivesRouter.createCaller(context).loadPlanningData({ processId: 21 }))[0];
  const indicators = await consolidatedIndicatorsRouter.createCaller(context).getConsolidatedIndicators({ processId: 21 });
  return indicators.find(item => item.id === "alcanzado")!.oteRows![0];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockResolvedValue(db);
  mocks.assertProcessAccessById.mockResolvedValue({ id: 21, companyId: 7 });
  seed({});
});
afterEach(() => {
  expect(JSON.stringify(rows)).toBe(before);
  expect(db.update).not.toHaveBeenCalled();
  expect(db.insert).not.toHaveBeenCalled();
  expect(db.delete).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
  expect(mocks.updateProcessTacticalObjective).not.toHaveBeenCalled();
});

for (const source of ["planning", "indicators"] as const) {
  describe(`${source}: objective result read metadata`, () => {
    it("distinguishes baseline variation from progress, using JSON rather than stale DB avanceMeta", async () => {
      const row = await read(source);
      expect(row.resultMetrics).toMatchObject({ baseline: 160, goal: 200, currentValue: 180, variationPercent: 12.5, goalProgress: 50 });
      expect(row.porcentajeMetaAlcanzado).toBe(50);
      expect(row.porcentajeMetaAlcanzadoRaw).toBe(50);
      expect(mocks.assertProcessAccessById).toHaveBeenCalledWith(expect.anything(), 21);
    });
    it.each([
      { baseline: 10, goal: 20, current: 25, raw: 150, legacy: 100, variation: 150 },
      { baseline: 10, goal: 20, current: -5, raw: -150, legacy: -100, variation: -150 },
      { baseline: 200, goal: 160, current: 180, raw: 50, legacy: 50, variation: -10 },
    ])("keeps raw $raw alongside legacy $legacy", async ({ baseline, goal, current, raw, legacy, variation }) => {
      seed({ puntoPartida: baseline, metaLlegada: goal, avanceMeta: current });
      const row = await read(source);
      expect(row.resultMetrics).toMatchObject({ goalProgress: raw, variationPercent: variation });
      expect(row.porcentajeMetaAlcanzadoRaw).toBe(raw);
      expect(row.porcentajeMetaAlcanzado).toBe(legacy);
    });
    it.each([
      { baseline: 0, goal: 10, current: 5, reason: "zero_baseline", change: 5 },
      { baseline: -10, goal: 10, current: 0, reason: "negative_baseline", change: 10 },
    ])("marks percentage variation unavailable with $reason, retaining absolute change", async ({ baseline, goal, current, reason, change }) => {
      seed({ puntoPartida: baseline, metaLlegada: goal, avanceMeta: current });
      expect((await read(source)).resultMetrics).toMatchObject({ variationPercent: null, variationUnavailable: reason, absoluteChange: change, goalProgress: 50 });
    });
    it.each([
      { trackingType: "mensual_sumatoria", monthlyValues: [20, 40, 0], expected: 60, raw: 250 },
      { trackingType: "mensual_promedio", monthlyValues: [20, 40, 0], expected: 30, raw: 100 },
      { trackingType: "mensual_promedio", monthlyValues: [], expected: 0, raw: -50 },
    ])("derives $trackingType from monthly sources, preserving nonzero average semantics", async ({ trackingType, monthlyValues, expected, raw }) => {
      seed({ puntoPartida: 10, metaLlegada: 30, avanceMeta: 999, trackingType, monthlyValues });
      const row = await read(source);
      expect(row.resultMetrics).toMatchObject({ currentValue: expected, goalProgress: raw });
      expect(row.porcentajeMetaAlcanzadoRaw).toBe(raw);
    });
    it("uses 12-month checklist completion without pretending it is numeric variation", async () => {
      seed({ puntoPartida: 99, metaLlegada: 99, avanceMeta: 999, trackingType: "mensual_checklist", checklistValues: [true, false, true, true, true, true, true] });
      expect((await read(source)).resultMetrics).toMatchObject({ baseline: 0, goal: 12, currentValue: 6, goalProgress: 50, variationPercent: null, variationUnavailable: "not_numeric" });
    });
    it("retains default tracking and equal baseline/goal legacy zero", async () => {
      seed({ puntoPartida: 10, metaLlegada: 10, avanceMeta: 12 });
      const row = await read(source);
      expect(row.trackingType).toBe("puntual");
      expect(row.porcentajeMetaAlcanzado).toBe(0);
      expect(row.resultMetrics.goalProgress).toBeNull();
    });
    it("adds OO result metadata from tracking sources, not stale saved percentage or current value", async () => {
      seed({ resultKeys: [
        { id: "sum", condicionInicial: 10, meta: 30, condicionActual: 999, porcentajeAlcanzado: 91, ooTrackingType: "mensual_sumatoria", ooMonthlyValues: [20, 40], tasks: [{ id: "task", percentageCompleted: 100, weighting: 100 }] },
        { id: "average", condicionInicial: 10, meta: 30, condicionActual: 999, ooTrackingType: "mensual_promedio", ooMonthlyValues: [20, 40, 0] },
        { id: "check", condicionInicial: 99, meta: 99, ooTrackingType: "mensual_checklist", ooChecklistValues: [true, true, true] },
      ] });
      const row = await read(source);
      const keys = source === "planning" ? row.resultKeys : row.objetivosOperativos;
      expect(keys[0].resultMetrics).toMatchObject({ currentValue: 60, goalProgress: 250, variationPercent: 500 });
      expect(keys[0].porcentajeAlcanzadoRaw).toBe(250);
      expect(keys[0].porcentajeAlcanzado).toBe(source === "planning" ? 91 : 100);
      expect(keys[1].resultMetrics).toMatchObject({ currentValue: 30, goalProgress: 100 });
      expect(keys[2].resultMetrics).toMatchObject({ currentValue: 3, goalProgress: 25, variationUnavailable: "not_numeric" });
      if (source === "indicators") expect(keys[0].tasksAverage).toBe(100);
    });
  });
}

describe("consolidated OTE legacy aggregates", () => {
  it("keeps weighted global OTE based on clipped progress, never raw progress or variation", async () => {
    rows = [
      fixture({ ponderacion: 40, puntoPartida: 10, metaLlegada: 20, avanceMeta: 25 }),
      fixture({ ponderacion: 60, puntoPartida: 160, metaLlegada: 200, avanceMeta: 180 }, 2),
    ];
    before = JSON.stringify(rows);
    const data = await consolidatedIndicatorsRouter.createCaller(context).getConsolidatedIndicators({ processId: 21 });
    const ote = data.find(item => item.id === "alcanzado")!;
    expect(ote.value).toBe(70);
    expect(ote.oteRows![0].resultMetrics.goalProgress).toBe(150);
    expect(ote.oteRows![1].resultMetrics.variationPercent).toBe(12.5);
  });
  it("preserves actual-sum OO weight normalization (distinct from planning's /100 denominator)", async () => {
    seed({ resultKeys: [
      { id: "one", ponderacion: 30, condicionInicial: 0, meta: 100, condicionActual: 0 },
      { id: "two", ponderacion: 50, condicionInicial: 0, meta: 100, condicionActual: 40 },
    ] });
    expect((await read("indicators")).pctOO).toBe(25);
  });
  it("returns empty data on unavailable DB and planning fallback metadata on invalid historical JSON", async () => {
    mocks.getDb.mockResolvedValueOnce(null);
    expect(await processTacticalObjectivesRouter.createCaller(context).loadPlanningData({ processId: 21 })).toEqual([]);
    rows[0].planningData = "{bad-json";
    before = JSON.stringify(rows);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const row = await read("planning");
    expect(row).toMatchObject({ avanceMeta: 0, porcentajeMetaAlcanzado: 0, porcentajeMetaAlcanzadoRaw: null });
    expect(row.resultMetrics).toMatchObject({ baseline: 0, goal: 0, currentValue: 0, goalProgress: null });
    error.mockRestore();
  });
});
