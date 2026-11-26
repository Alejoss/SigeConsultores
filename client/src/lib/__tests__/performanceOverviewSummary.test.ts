import { describe, expect, it } from "vitest";
import {
  availablePerformancePercent,
  calculateManagementOverviewSummary,
  calculateOtgOverviewSummary,
  calculateStakeholderOverviewSummary,
} from "../performanceOverviewSummary";
import { calculateCompanyComplianceSummary } from "../companyComplianceProgress";

const TODAY = new Date("2026-11-26T12:00:00Z");
type ManagementInput = Parameters<typeof calculateManagementOverviewSummary>[0];
const emptyManagement = (): ManagementInput => ({
  programs: [], audits: [], inspections: [], companyCompliances: [], companyTrainings: [],
});

/** Reference copied from the pre-extraction SGIView: preserve every rounding stage and /5. */
function legacyManagementValues(input: ManagementInput) {
  const { programs, audits, inspections, companyCompliances, companyTrainings } = input;
  const programsCompliance = programs.length
    ? Math.round(programs.reduce((sum, p) => sum + (p.plannedActions > 0
      ? Math.min(100, Math.round((p.completedActions / p.plannedActions) * 100)) : 0), 0) / programs.length) : 0;
  let auditCount = 0;
  const auditTotal = audits.reduce((sum, a) => {
    const findings = (a.findingsMajorNC || 0) + (a.findingsMinorNC || 0) + (a.findingsObservations || 0) + (a.findingsOM || 0);
    if (findings === 0) return sum;
    const closures = (a.closuresMajorNC || 0) + (a.closuresMinorNC || 0) + (a.closuresObservations || 0) + (a.closuresOM || 0);
    auditCount++;
    return sum + Math.min(100, Math.round((closures / findings) * 100));
  }, 0);
  const auditsCompliance = auditCount > 0 ? Math.round(auditTotal / auditCount) : 0;
  let inspectionCount = 0;
  const inspectionTotal = inspections.reduce((sum, inspection) => {
    if (!inspection.findings || inspection.findings === 0) return sum;
    inspectionCount++;
    return sum + Math.min(100, Math.round(((inspection.closures || 0) / inspection.findings) * 100));
  }, 0);
  const inspectionsCompliance = inspectionCount > 0 ? Math.round(inspectionTotal / inspectionCount) : 0;
  const avgCompliances = calculateCompanyComplianceSummary(companyCompliances, TODAY).averageCompliance;
  const avgTrainings = companyTrainings.length
    ? Math.round((companyTrainings.filter(training => training.completed === "SI").length / companyTrainings.length) * 100) : 0;
  const values = [programsCompliance, avgCompliances, auditsCompliance, inspectionsCompliance, avgTrainings];
  return { values, avgTotal: Math.round(values.reduce((sum, value) => sum + value, 0) / 5) };
}

const heterogeneousManagement: ManagementInput = {
  programs: [
    { plannedActions: 3, completedActions: 1 },
    { plannedActions: 3, completedActions: 2 },
    { plannedActions: 0, completedActions: 7 },
    { plannedActions: 2, completedActions: 3 },
  ],
  audits: [
    { findingsMajorNC: 1, findingsMinorNC: 1, findingsObservations: 1, findingsOM: 1,
      closuresMajorNC: 1, closuresMinorNC: 1, closuresObservations: 0, closuresOM: 0 },
    { findingsMajorNC: 3, closuresMajorNC: 4 },
    { findingsMajorNC: 0, closuresMajorNC: 20 },
    { findingsMajorNC: null, findingsMinorNC: null },
  ],
  inspections: [{ findings: 3, closures: 1 }, { findings: 2, closures: 3 }, { findings: 0, closures: 5 }, { findings: null }],
  companyCompliances: [
    { evaluationMode: "meses", plannedMonths: "1,2,3", completedMonths: "1,9" },
    { evaluationMode: "vigencia", validUntil: "2026-12-31" },
    { evaluationMode: "vigencia", validUntil: "2026-01-01" },
  ],
  companyTrainings: [{ completed: "SI" }, { completed: "NO" }, { completed: null }],
};

describe("performance overview: the detail remains the source of each aggregate", () => {
  it("OTG preserves the old achieved/total formula, not an unweighted average of area percentages", () => {
    const areas = [{ totalOTG: 1, logrados: 1, percent: 100 }, { totalOTG: 9, logrados: 0, percent: 0 }];
    const totalOTG = areas.reduce((sum, area) => sum + area.totalOTG, 0);
    const totalLogrados = areas.reduce((sum, area) => sum + area.logrados, 0);
    const legacyPct = totalOTG > 0 ? Math.round((totalLogrados / totalOTG) * 100) : 0;
    expect(calculateOtgOverviewSummary(areas)).toEqual({ totalOTG, totalLogrados, globalPct: legacyPct, hasEvaluableData: true });
    expect(legacyPct).not.toBe(Math.round(areas.reduce((sum, area) => sum + area.percent, 0) / areas.length));
  });

  it("OTG retains the detail rounding and separates no objectives from an evaluable zero", () => {
    expect(calculateOtgOverviewSummary([{ totalOTG: 3, logrados: 1, percent: 33.333 }]).globalPct).toBe(Math.round(100 / 3));
    expect(calculateOtgOverviewSummary([])).toEqual({ totalOTG: 0, totalLogrados: 0, globalPct: 0, hasEvaluableData: false });
    expect(calculateOtgOverviewSummary([{ totalOTG: 0, logrados: 0, percent: 0 }]).hasEvaluableData).toBe(false);
    expect(calculateOtgOverviewSummary([{ totalOTG: 4, logrados: 0, percent: 0 }])).toMatchObject({ globalPct: 0, hasEvaluableData: true });
  });

  it("GPI preserves implemented/stakeholders and internal/external totals, not action weighting", () => {
    const areas = [
      { totalStakeholders: 1, implemented: 1, internalCount: 1, externalCount: 0, plannedActions: 20 },
      { totalStakeholders: 9, implemented: 0, internalCount: 3, externalCount: 6, plannedActions: 1 },
    ];
    const totalSt = areas.reduce((sum, area) => sum + area.totalStakeholders, 0);
    const totalImpl = areas.reduce((sum, area) => sum + area.implemented, 0);
    expect(calculateStakeholderOverviewSummary(areas)).toEqual({
      totalSt, totalImpl, globalPct: Math.round((totalImpl / totalSt) * 100),
      totalInternal: 4, totalExternal: 6, hasEvaluableData: true,
    });
    const withDifferentPlans = areas.map(area => ({ ...area, plannedActions: 2000 }));
    expect(calculateStakeholderOverviewSummary(withDifferentPlans).globalPct).toBe(calculateStakeholderOverviewSummary(areas).globalPct);
  });

  it("GPI metadata gates absence without changing the old percentage", () => {
    const area = { totalStakeholders: 3, implemented: 1, internalCount: 1, externalCount: 2, plannedActions: 0 };
    expect(calculateStakeholderOverviewSummary([area])).toMatchObject({ globalPct: Math.round(100 / 3), hasEvaluableData: false });
    expect(calculateStakeholderOverviewSummary([{ ...area, implemented: 0, plannedActions: 1 }])).toMatchObject({ globalPct: 0, hasEvaluableData: true });
    expect(calculateStakeholderOverviewSummary([{ ...area, totalStakeholders: 0, implemented: 0, plannedActions: 1 }]).hasEvaluableData).toBe(false);
    expect(calculateStakeholderOverviewSummary([])).toEqual({ totalSt: 0, totalImpl: 0, globalPct: 0, totalInternal: 0, totalExternal: 0, hasEvaluableData: false });
  });

  it("SGI reproduces all five old calculations, nested rounding, category order and caps", () => {
    const reference = legacyManagementValues(heterogeneousManagement);
    const actual = calculateManagementOverviewSummary(heterogeneousManagement, TODAY);
    expect(actual.metrics.map(metric => metric.label)).toEqual(["Programas", "Cumplimientos", "Auditorías", "Inspecciones", "Capacitaciones"]);
    expect(actual.metrics.map(metric => metric.value)).toEqual(reference.values);
    expect(actual.avgTotal).toBe(reference.avgTotal);
    expect(actual.metrics.map(metric => metric.count)).toEqual([4, null, 4, 4, null]);
    expect(actual.hasEvaluableData).toBe(true);
  });

  it("SGI keeps division by five when only one base is evaluable (not a new populated-category average)", () => {
    const input = { ...emptyManagement(), programs: [{ plannedActions: 3, completedActions: 1 }] };
    const result = calculateManagementOverviewSummary(input, TODAY);
    expect(result.metrics.map(metric => metric.value)).toEqual([Math.round(100 / 3), 0, 0, 0, 0]);
    expect(result.avgTotal).toBe(Math.round(Math.round(100 / 3) / 5));
    expect(result.hasEvaluableData).toBe(true);
  });

  it.each([
    ["program actions", { programs: [{ plannedActions: 1, completedActions: 0 }] }],
    ["audit findings", { audits: [{ findingsOM: 1, closuresOM: 0 }] }],
    ["inspection findings", { inspections: [{ findings: 1, closures: 0 }] }],
    ["planned compliance months", { companyCompliances: [{ plannedMonths: "2", completedMonths: null }] }],
    ["an expired valid date", { companyCompliances: [{ evaluationMode: "vigencia", validUntil: "2026-01-01" }] }],
    ["training registration", { companyTrainings: [{ completed: "NO" }] }],
  ])("SGI OR gate preserves a real zero for %s", (_label, override) => {
    const result = calculateManagementOverviewSummary({ ...emptyManagement(), ...override }, TODAY);
    expect(result.hasEvaluableData).toBe(true);
    expect(result.avgTotal).toBe(0);
    expect(availablePerformancePercent({}, result.avgTotal, result.hasEvaluableData)).toBe(0);
  });

  it("SGI hides empty and non-evaluable registrations rather than manufacturing zero", () => {
    for (const input of [emptyManagement(), {
      programs: [{ plannedActions: 0, completedActions: 9 }],
      audits: [{ findingsMajorNC: 0, closuresMajorNC: 9 }],
      inspections: [{ findings: 0, closures: 9 }],
      companyCompliances: [{ plannedMonths: "0,13,invalid" }, { evaluationMode: "vigencia", validUntil: null }, { evaluationMode: "vigencia", validUntil: "not-a-date" }],
      companyTrainings: [{ completed: null }],
    }]) {
      const result = calculateManagementOverviewSummary(input, TODAY);
      expect(result.hasEvaluableData).toBe(false);
      expect(availablePerformancePercent({}, result.avgTotal, result.hasEvaluableData)).toBeNull();
    }
  });
});

describe("availablePerformancePercent", () => {
  it.each([null, undefined, NaN, Infinity, -Infinity])("hides missing/nonfinite %s", value => {
    expect(availablePerformancePercent({}, value)).toBeNull();
  });
  it.each([
    { isLoading: true }, { error: new Error("synthetic failure") }, { isPlaceholderData: true },
  ])("hides unavailable query state %s, even when stale data says zero", query => {
    expect(availablePerformancePercent(query, 0)).toBeNull();
    expect(availablePerformancePercent(query, 72)).toBeNull();
  });
  it("hides no evaluable data but retains measured zero and the unbounded real number", () => {
    expect(availablePerformancePercent({}, 0, false)).toBeNull();
    for (const value of [0, 35.23, -125.75, 250.125]) expect(availablePerformancePercent({}, value, true)).toBe(value);
  });
  it("does not discard ready data for a background refetch alone", () => {
    expect(availablePerformancePercent({ isFetching: true, isLoading: false }, 0)).toBe(0);
  });
});
