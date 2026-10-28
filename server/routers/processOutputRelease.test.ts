import { describe, expect, it } from "vitest";
import { periodKeyForDate, statusForSummary } from "./processOutputRelease";

const activeControl = (id = 1) => ({
  id,
  isActive: true,
  archivedAt: null,
}) as any;

const period = (
  status: "pending" | "released" | "exception",
  scheduledDate: string,
  releasedAt: Date | null = null
) => ({
  id: 1,
  controlId: 1,
  processId: 1,
  status,
  scheduledDate: new Date(`${scheduledDate}T12:00:00Z`),
  releasedAt,
}) as any;

describe("statusForSummary", () => {
  it("mantiene null cuando aún no hay salidas críticas configuradas", () => {
    expect(statusForSummary([], [])).toMatchObject({
      value: null,
      status: "no_controls",
      scheduledControls: 0,
      assessableControls: 0,
    });
  });

  it("mantiene null cuando hay control pero la liberación es futura", () => {
    expect(statusForSummary([activeControl()], [period("pending", "2099-01-01")])).toMatchObject({
      value: null,
      status: "pending_evaluation",
      scheduledControls: 1,
      assessableControls: 0,
    });
  });

  it("muestra 0 % real cuando ya existe una liberación vencida pendiente", () => {
    expect(statusForSummary([activeControl()], [period("pending", "2020-01-01")])).toMatchObject({
      value: 0,
      status: "measured",
      assessableControls: 1,
      releasedOnTime: 0,
      overdueOpen: 1,
    });
  });

  it("cuenta sólo las liberaciones realizadas dentro del plazo", () => {
    const inTime = period("released", "2020-01-02", new Date("2020-01-02T18:00:00Z"));
    const late = { ...period("released", "2020-01-03", new Date("2020-01-04T08:00:00Z")), id: 2 };
    const exception = { ...period("exception", "2020-01-04"), id: 3 };
    expect(statusForSummary([activeControl()], [inTime, late, exception])).toMatchObject({
      value: 33,
      status: "measured",
      assessableControls: 3,
      releasedOnTime: 1,
      exceptions: 1,
    });
  });

  it("genera una clave de período estable basada en su fecha", () => {
    expect(periodKeyForDate("2026-10-28")).toBe("scheduled:2026-10-28");
  });
});
