import { describe, expect, it } from "vitest";
import {
  calculateStakeholderActionProgress,
  latestStakeholderActionRows,
} from "@shared/stakeholderActionProgress";

describe("progreso de acciones de partes interesadas", () => {
  it("calcula únicamente las acciones planificadas y realizadas", () => {
    const result = calculateStakeholderActionProgress([
      { stakeholderId: 1, actionToTake: "Confirmar requisitos", implementationStatus: true },
      { stakeholderId: 2, actionToTake: "Capacitar al equipo", implementationStatus: false },
      { stakeholderId: 3, actionToTake: "   ", implementationStatus: true },
      { stakeholderId: 4, actionToTake: null, implementationStatus: false },
    ]);

    expect(result).toEqual({
      total: 4,
      planned: 2,
      completed: 1,
      percentage: 50,
    });
  });

  it("no asigna 0 % cuando todavía no hay acciones planificadas", () => {
    const result = calculateStakeholderActionProgress([
      { stakeholderId: 1, actionToTake: null, implementationStatus: false },
      { stakeholderId: 2, actionToTake: "", implementationStatus: true },
    ]);

    expect(result.planned).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.percentage).toBeNull();
  });

  it("conserva sólo el último registro por parte interesada", () => {
    const rows = latestStakeholderActionRows([
      { id: 10, stakeholderId: 1, createdAt: "2026-01-01", actionToTake: "Acción anterior", implementationStatus: false },
      { id: 11, stakeholderId: 1, createdAt: "2026-02-01", actionToTake: "Acción vigente", implementationStatus: true },
      { id: 12, stakeholderId: 2, createdAt: "2026-02-01", actionToTake: "Otra acción", implementationStatus: false },
    ]);

    expect(rows).toHaveLength(2);
    expect(calculateStakeholderActionProgress(rows)).toMatchObject({
      total: 2,
      planned: 2,
      completed: 1,
      percentage: 50,
    });
  });
});
