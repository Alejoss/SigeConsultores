import { describe, expect, it } from "vitest";
import { getJobDescriptionProcessTypeLabel } from "./payrollJobDescriptionLabels";

describe("getJobDescriptionProcessTypeLabel", () => {
  it.each([
    ["estrategico", "Estratégico"],
    ["misional", "Misional"],
    ["soporte", "Soporte"],
  ] as const)("presenta %s como %s", (processType, expectedLabel) => {
    expect(getJobDescriptionProcessTypeLabel(processType)).toBe(expectedLabel);
  });
});
