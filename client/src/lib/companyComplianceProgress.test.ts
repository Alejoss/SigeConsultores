import { describe, expect, it } from "vitest";
import {
  calculateCompanyCompliancePercentage,
  calculateCompanyComplianceSummary,
  calculateVigenciaProgress,
} from "./companyComplianceProgress";

describe("companyComplianceProgress", () => {
  const today = new Date(2026, 9, 28);

  it("calcula un Cumplimiento por meses sobre los meses planificados", () => {
    expect(
      calculateCompanyCompliancePercentage({
        evaluationMode: "meses",
        plannedMonths: "1,2,3",
        completedMonths: "1,2,8",
      })
    ).toBe(67);
  });

  it("mantiene la regla de vigencia para registros vigente, por vencer y vencido", () => {
    expect(
      calculateVigenciaProgress(new Date(2026, 10, 27), today)
    ).toEqual({ pct: 100, status: "por_vencer", daysLeft: 30 });
    expect(
      calculateCompanyCompliancePercentage(
        { evaluationMode: "vigencia", validUntil: new Date(2026, 11, 15) },
        today
      )
    ).toBe(100);
    expect(
      calculateCompanyCompliancePercentage(
        { evaluationMode: "vigencia", validUntil: new Date(2026, 9, 27) },
        today
      )
    ).toBe(0);
  });

  it("devuelve cero cuando no hay Cumplimientos corporativos", () => {
    expect(calculateCompanyComplianceSummary([], today)).toEqual({
      totalCompliances: 0,
      averageCompliance: 0,
    });
  });

  it("redondea el promedio final exactamente una vez", () => {
    const summary = calculateCompanyComplianceSummary(
      [
        {
          evaluationMode: "meses",
          plannedMonths: "1,2,3",
          completedMonths: "1,2",
        },
        {
          evaluationMode: "vigencia",
          validUntil: new Date(2026, 11, 15),
        },
        {
          evaluationMode: "vigencia",
          validUntil: new Date(2026, 9, 27),
        },
      ],
      today
    );

    expect(summary).toEqual({ totalCompliances: 3, averageCompliance: 56 });
  });
});
