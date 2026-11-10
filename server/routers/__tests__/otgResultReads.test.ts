import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { processFODA } from "../../../drizzle/schema";
import { consolidatedIndicatorsRouter } from "../consolidatedIndicators";
import { calculateOtgProgress } from "../../lib/otgProgress";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  assertProcessAccessById: vi.fn(),
}));
vi.mock("../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../_core/companyPermissions", () => ({
  assertProcessAccessById: mocks.assertProcessAccessById,
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
      where: vi.fn(async () => getTableName(table) === getTableName(processFODA) ? rows : []),
    }),
  })),
  update: vi.fn(), insert: vi.fn(), delete: vi.fn(), transaction: vi.fn(), execute: vi.fn(),
};
function source(overrides: Record<string, any> = {}) {
  return {
    id: "otg-1", accionATomar: "Mejorar el resultado empresarial", comunicado: "SI",
    puntoPartida: 160, puntoLlegada: 200, alcanzado: 180, unidadMedida: "unidades",
    porcentajeAlcanzadoOTG: 999, porcentajeCumplimiento: 3,
    resultMetrics: { baseline: 999, currentValue: 999, goalProgress: 100 },
    acciones: [{ id: "task-1", accion: "Preparar el informe", ponderacion: 100, alcanzado: 100 }],
    ...overrides,
  };
}
function seed(matrixRows = [source()]) {
  rows = [{ id: 1, processId: 21, createdAt: new Date("2026-01-01T00:00:00Z"), matrixData: JSON.stringify(matrixRows) }];
  before = JSON.stringify(rows);
}
async function read() {
  const indicators = await consolidatedIndicatorsRouter.createCaller(context).getConsolidatedIndicators({ processId: 21 });
  return indicators.find(item => item.id === "total_alcanzado")!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockResolvedValue(db);
  mocks.assertProcessAccessById.mockResolvedValue({ id: 21, companyId: 7 });
  seed();
});
afterEach(() => {
  expect(JSON.stringify(rows)).toBe(before);
  for (const write of [db.update, db.insert, db.delete, db.transaction, db.execute]) expect(write).not.toHaveBeenCalled();
});

describe("consolidated OTG: read-only business result independent of legacy plan metrics", () => {
  it("derives five result values from row inputs, ignoring bogus stored result and percentages", async () => {
    const data = await read();
    expect(data.otgRows![0].resultMetrics).toMatchObject({
      baseline: 160, goal: 200, currentValue: 180, absoluteChange: 20, variationPercent: 12.5, goalProgress: 50,
    });
    expect(data.otgRows![0].unidadMedida).toBe("unidades");
    expect(data.otgRows![0].pctOTG).toBe(100);
    expect(data.compliance).toBe(100);
    expect(data.value).toBe(1);
    expect(mocks.assertProcessAccessById).toHaveBeenCalledWith(expect.anything(), 21);
  });

  it.each([
    { current: 25, variation: 150, progress: 150 },
    { current: 29, variation: 190, progress: 190 },
    { current: 35, variation: 250, progress: 250 },
    { current: -5, variation: -150, progress: -150 },
  ])("does not clip raw variation $variation or progress $progress", async ({ current, variation, progress }) => {
    seed([source({ puntoPartida: "10", puntoLlegada: "20", alcanzado: String(current), porcentajeAlcanzadoOTG: 100 })]);
    const data = await read();
    expect(data.otgRows![0].resultMetrics).toMatchObject({ variationPercent: variation, goalProgress: progress });
    expect(data.otgRows![0].pctOTG).toBe(100);
  });

  it.each([
    { baseline: 0, goal: 10, current: 5, reason: "zero_baseline", change: 5 },
    { baseline: -10, goal: 10, current: 0, reason: "negative_baseline", change: 10 },
  ])("preserves numeric zero and explains $reason instead of dividing by it", async ({ baseline, goal, current, reason, change }) => {
    seed([source({ puntoPartida: baseline, puntoLlegada: goal, alcanzado: current })]);
    expect((await read()).otgRows![0].resultMetrics).toMatchObject({
      baseline, currentValue: current, variationPercent: null, variationUnavailable: reason, absoluteChange: change, goalProgress: 50,
    });
  });

  it.each([null, undefined, "", "   ", "texto", "Infinity", "NaN", true])("does not manufacture a result for missing or invalid current %s", async current => {
    seed([source({ alcanzado: current })]);
    expect((await read()).otgRows![0].resultMetrics).toMatchObject({
      currentValue: null, absoluteChange: null, variationPercent: null, variationUnavailable: "missing_value", goalProgress: null, goalStatus: "pending",
    });
  });

  it("keeps a missing baseline and goal distinct from zero", async () => {
    seed([source({ puntoPartida: " ", puntoLlegada: undefined, unidadMedida: undefined })]);
    const otg = (await read()).otgRows![0];
    expect(otg.resultMetrics).toMatchObject({ baseline: null, goal: null, currentValue: 180, variationUnavailable: "missing_baseline", goalProgress: null });
    expect(otg.unidadMedida).toBe("");
  });

  it("does not infer a reached result from a completed modern task", async () => {
    const task = { id: "modern", accion: "Acción puntual moderna", ponderacion: 100, tipoSeguimiento: "puntual", puntoPartidaAccion: 2, puntoLlegadaAccion: 10, valorPuntual: 10 };
    const row = source({ puntoPartida: 100, puntoLlegada: 200, alcanzado: 140, acciones: [task] });
    seed([row]);
    const data = await read();
    const otg = data.otgRows![0];
    expect(otg.tareas[0].porcentajeAlcanzado).toBe(calculateOtgProgress({ acciones: [task] }));
    expect(otg.tareas[0].porcentajeAlcanzado).toBe(100);
    expect(otg.pctOTG).toBe(calculateOtgProgress(row));
    expect(otg.objetivoLogrado).toBe(true);
    expect(data.value).toBe(1);
    expect(otg.resultMetrics).toMatchObject({ goalProgress: 40, variationPercent: 40, goalStatus: "in_progress" });
  });

  it("preserves canonical weighted plan aggregation and task weightings", async () => {
    const matrixRows = [
      source({ id: "one", acciones: [
        { id: "half", ponderacion: 30, tipoSeguimiento: "puntual", valorPuntual: 5, puntoLlegadaAccion: 10 },
        { id: "full", ponderacion: 70, tipoSeguimiento: "mensual_checklist", checklistValues: Array(12).fill(true) },
      ] }),
      source({ id: "two", puntoPartida: 10, puntoLlegada: 20, alcanzado: 35 }),
    ];
    seed(matrixRows);
    const data = await read();
    expect(data.otgRows!.map(row => row.pctOTG)).toEqual(matrixRows.map(calculateOtgProgress));
    expect(data.otgRows![0].tareas.map((task: any) => [task.ponderacion, task.porcentajeAlcanzado])).toEqual([[30, 50], [70, 100]]);
    expect(data.compliance).toBe(93);
    expect(data.value).toBe(1);
    expect(data.otgRows![1].resultMetrics.goalProgress).toBe(250);
  });

  it("retains historical plan fallback without inventing tasks or a completed plan", async () => {
    seed([source({ puntoPartida: undefined, puntoLlegada: undefined, alcanzado: undefined, acciones: [], porcentajeCumplimiento: 56 })]);
    const data = await read();
    expect(data.otgRows![0]).toMatchObject({ pctOTG: 56, objetivoLogrado: false, tareas: [], resultMetrics: { baseline: null, goal: null, currentValue: null, goalProgress: null } });
    expect(data.compliance).toBe(56);
    expect(data.value).toBe(0);
  });

  it("uses the latest matrix only, preserving communication and plan counts", async () => {
    rows.push({ id: 2, processId: 21, createdAt: new Date("2026-02-01T00:00:00Z"), matrixData: JSON.stringify([source({ comunicado: "NO", acciones: [], porcentajeCumplimiento: 82 })]) });
    before = JSON.stringify(rows);
    const data = await consolidatedIndicatorsRouter.createCaller(context).getConsolidatedIndicators({ processId: 21 });
    expect(data.find(item => item.id === "total_alcanzado")).toMatchObject({ compliance: 82, value: 0 });
    expect(data.find(item => item.id === "comunicado")!.value).toBe(0);
  });
});
