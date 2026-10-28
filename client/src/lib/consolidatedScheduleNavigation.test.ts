import { describe, expect, it } from "vitest";
import { getConsolidatedActivityHref } from "./consolidatedScheduleNavigation";

describe("getConsolidatedActivityHref", () => {
  const scope = { processId: 321, companyId: 654 };

  it("abre una tarea OTE por los identificadores persistentes de su objetivo, resultado y tarea", () => {
    expect(
      getConsolidatedActivityHref(
        {
          id: "objective-task-17-2-3",
          navigation: {
            destination: "objective",
            objectiveId: 17,
            resultKeyId: "resultado-9",
            taskId: "tarea-3",
            resultKeyIndex: 2,
            taskIndex: 3,
          },
        },
        scope.processId,
        scope.companyId
      )
    ).toBe(
      "/tactical-planning?processId=321&companyId=654&focusObjectiveId=17&focusResultKeyId=resultado-9&focusTaskId=tarea-3&focusResultKeyIndex=2&focusTaskIndex=3"
    );
  });

  it("abre una actividad recurrente y conserva la ocurrencia concreta", () => {
    expect(
      getConsolidatedActivityHref(
        {
          id: "activity-88-2026-10-30",
          navigation: {
            destination: "compliance",
            activityId: 88,
            occurrenceDate: "2026-10-30",
          },
        },
        scope.processId,
        scope.companyId
      )
    ).toBe(
      "/process-compliances?processId=321&companyId=654&focusActivityId=88&focusOccurrenceDate=2026-10-30"
    );
  });

  it("abre un compromiso vinculado en la tarjeta del proceso receptor", () => {
    expect(
      getConsolidatedActivityHref(
        {
          id: "linked-commitment-92",
          navigation: { destination: "linked_commitment", commitmentId: 92 },
        },
        scope.processId,
        scope.companyId
      )
    ).toBe(
      "/linked-commitments?processId=321&companyId=654&focusCommitmentId=92"
    );
  });

  it("abre la liberación concreta de una salida crítica", () => {
    expect(
      getConsolidatedActivityHref(
        {
          id: "output-release-73",
          navigation: {
            destination: "output_release",
            controlId: 18,
            periodId: 73,
          },
        },
        scope.processId,
        scope.companyId
      )
    ).toBe(
      "/process-output-release?processId=321&companyId=654&focusControlId=18&focusPeriodId=73"
    );
  });

  it("abre una fila FODA por su identificador persistente y no por coincidencia textual", () => {
    expect(
      getConsolidatedActivityHref(
        {
          id: "foda-9fabcd",
          navigation: {
            destination: "foda",
            fodaRecordId: 50,
            fodaRowId: 18,
            fodaRowIndex: 2,
          },
        },
        scope.processId,
        scope.companyId
      )
    ).toBe(
      "/process-risk-matrix?processId=321&companyId=654&focusFodaRecordId=50&focusFodaRowId=18&focusFodaRowIndex=2"
    );
  });

  it("conserva la posición de una fila FODA histórica aunque todavía no tenga identificador individual", () => {
    expect(
      getConsolidatedActivityHref(
        {
          id: "foda-legacy-4",
          navigation: {
            destination: "foda",
            fodaRecordId: 50,
            fodaRowIndex: 4,
          },
        },
        scope.processId,
        scope.companyId
      )
    ).toBe(
      "/process-risk-matrix?processId=321&companyId=654&focusFodaRecordId=50&focusFodaRowIndex=4"
    );
  });

  it("no construye enlace si la actividad histórica aún no tiene navegación", () => {
    expect(
      getConsolidatedActivityHref({ id: "historica" }, scope.processId, scope.companyId)
    ).toBeNull();
  });
});
