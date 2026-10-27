import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", () => ({ getDb: getDbMock }));

import {
  criticalityMatrix,
  linkedCommitments,
  processCompliances,
  processFODA,
  processTacticalObjectives,
  stakeholders,
} from "../../drizzle/schema";
import { getConsolidatedScheduleActivities } from "./consolidatedScheduleActivities";

describe("getConsolidatedScheduleActivities: navegación", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("conserva la identidad de origen de las cinco clases de actividad", async () => {
    const rowsByTable = new Map<unknown, unknown[]>([
      [criticalityMatrix, [{ id: 101, stakeholderId: 10, actionToTake: "Confirmar requisito", endDate: "2030-02-01", implementationStatus: false, completionPercentage: 0 }]],
      [stakeholders, [{ id: 10, name: "Cliente de prueba" }]],
      [processTacticalObjectives, [{ id: 301, planningData: JSON.stringify({ resultKeys: [{ id: "rk-1", description: "Resultado operativo", endDate: "2030-02-03", tasks: [{ id: "task-1", description: "Ejecutar tarea", date: "2030-02-02", percentageCompleted: 0 }] }] }) }]],
      [processCompliances, [{ id: 77, requirement: "Actividad recurrente", scheduleType: "once", dueDate: "2030-02-04", trackingType: "puntual", trackingStartValue: 0, trackingTargetValue: 100, trackingCurrentValue: 0 }]],
      [linkedCommitments, [{ id: 92, title: "Compromiso recibido", dueDate: "2030-02-05", status: "pending", sourceType: "meeting_agreement", kind: "action" }]],
    ]);
    const latestFoda = {
      id: 401,
      matrixData: JSON.stringify([{ id: "foda-row-1", elemento: "Fortaleza", accionATomar: "Aplicar mejora", fechaFinalPrevista: "2030-02-06", foda: "Fortaleza", objetivoLogrado: "NO" }]),
    };
    const db = {
      select: () => ({
        from: (table: unknown) => {
          if (table === processFODA) {
            return {
              where: () => ({
                orderBy: () => ({ limit: () => [latestFoda] }),
              }),
            };
          }
          return { where: () => rowsByTable.get(table) || [] };
        },
      }),
    };
    getDbMock.mockResolvedValue(db);

    const activities = await getConsolidatedScheduleActivities(44);
    const byDestination = new Map(activities.map(activity => [activity.navigation.destination, activity]));

    expect(byDestination.get("stakeholder")?.navigation).toMatchObject({ criticalityId: 101 });
    expect(byDestination.get("foda")?.navigation).toMatchObject({ fodaRecordId: 401, fodaRowId: "foda-row-1", fodaRowIndex: 0 });
    expect(byDestination.get("objective")?.navigation).toMatchObject({ objectiveId: 301, resultKeyId: "rk-1", taskId: "task-1", resultKeyIndex: 0, taskIndex: 0 });
    expect(byDestination.get("compliance")?.navigation).toMatchObject({ activityId: 77, occurrenceDate: "2030-02-04" });
    expect(byDestination.get("linked_commitment")?.navigation).toMatchObject({ commitmentId: 92 });
  });
});
