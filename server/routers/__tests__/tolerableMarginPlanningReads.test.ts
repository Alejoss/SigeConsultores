import { beforeEach, describe, expect, it, vi } from "vitest";

// Annual request admission is covered by annual security integration; this unit uses a fake database.
vi.mock("../../annual/requestScope", () => ({ runInAnnualRequestScope: async (_options: unknown, operation: () => unknown) => operation() }));

const mocks = vi.hoisted(() => ({
  rows: [] as any[],
  processAccess: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: async () => mocks.rows,
      }),
    }),
  })),
}));
vi.mock("../../_core/companyPermissions", () => ({
  assertProcessAccessById: mocks.processAccess,
  assertProcessTacticalObjectiveAccess: vi.fn(),
}));

import { processTacticalObjectivesRouter } from "../processTacticalObjectives";

describe("processTacticalObjectives planning reads", () => {
  beforeEach(() => {
    mocks.processAccess.mockReset().mockResolvedValue(undefined);
    mocks.rows = [];
  });

  it("loadPlanningData conserva configuraciones antiguas y calcula margen mensual con signos", async () => {
    const oldPlanningData = { category: "Finanzas", trackingType: "puntual", goal: "Antiguo", avanceMeta: 999, porcentajeMetaAlcanzado: 17 };
    const tolerance = {
      lowerLimit: -20,
      upperLimit: 20,
      idealValue: 0,
      recordingMode: "mensual",
      monthlyValues: [25, -25, 0, 10, null, null, null, null, null, null, null, null],
    } as const;
    mocks.rows = [{
      id: 41,
      processId: 9,
      name: "Objetivo histórico",
      description: null,
      responsible: null,
      policyObjective: null,
      strategicObjective: null,
      planningData: JSON.stringify({ ...oldPlanningData, trackingType: "margen_tolerable", tolerance,
        resultKeys: [{ id: "historical-oo", condicionActual: 888, porcentajeAlcanzado: 13,
          ooTrackingType: "margen_tolerable", ooTolerance: tolerance }] }),
    }];

    const caller = processTacticalObjectivesRouter.createCaller({
      user: null,
      manager: { companyId: 3, companyName: "Empresa de prueba" },
      processLeader: null,
    } as any);
    const result = await caller.loadPlanningData({ processId: 9 });
    const loaded = result[0] as any;

    expect(mocks.processAccess).toHaveBeenCalledWith(expect.anything(), 9);
    expect(loaded.trackingType).toBe("margen_tolerable");
    expect(loaded.category).toBe("Finanzas");
    expect(loaded.goal).toBe("Antiguo");
    expect(loaded.tolerance).toEqual(tolerance);
    expect(loaded.resultMetrics.tolerance.compliancePercent).toBe(50);
    expect(loaded.resultMetrics.tolerance.currentValue).toBe(10);
    expect(loaded.resultMetrics.tolerance.latestMonthIndex).toBe(3);
    expect(loaded.avanceMeta).toBe(999);
    expect(loaded.porcentajeMetaAlcanzado).toBe(17);
    expect(loaded.resultKeys[0]).toMatchObject({ condicionActual: 888, porcentajeAlcanzado: 13 });
    expect(loaded.resultKeys[0].resultMetrics.tolerance.compliancePercent).toBe(50);
  });

  it("devuelve una lectura válida para una configuración histórica sin tolerance", async () => {
    mocks.rows = [{
      id: 42,
      processId: 9,
      name: "Sin margen anterior",
      description: null,
      responsible: null,
      policyObjective: null,
      strategicObjective: null,
      planningData: JSON.stringify({ category: "Operación", trackingType: "puntual", monthlyValues: [5] }),
    }];

    const caller = processTacticalObjectivesRouter.createCaller({
      user: null,
      manager: { companyId: 3, companyName: "Empresa de prueba" },
      processLeader: null,
    } as any);
    const [loaded] = await caller.loadPlanningData({ processId: 9 });

    expect(loaded.trackingType).toBe("puntual");
    expect((loaded as any).tolerance).toBeUndefined();
    expect(loaded.category).toBe("Operación");
  });
});
