import { calculateCompanyComplianceSummary, parseComplianceMonths, type CompanyComplianceProgressInput } from "./companyComplianceProgress";

export type OtgAreaSummary = { totalOTG: number; logrados: number; percent: number };
export function calculateOtgOverviewSummary(areas: readonly OtgAreaSummary[]) {
  const totalOTG = areas.reduce((sum, area) => sum + area.totalOTG, 0);
  const totalLogrados = areas.reduce((sum, area) => sum + area.logrados, 0);
  const globalPct = totalOTG > 0 ? Math.round((totalLogrados / totalOTG) * 100) : 0;
  return { totalOTG, totalLogrados, globalPct, hasEvaluableData: totalOTG > 0 };
}

export type StakeholderAreaSummary = {
  totalStakeholders: number; implemented: number; internalCount: number; externalCount: number;
  plannedActions: number;
};
export function calculateStakeholderOverviewSummary(areas: readonly StakeholderAreaSummary[]) {
  const totalSt = areas.reduce((sum, area) => sum + area.totalStakeholders, 0);
  const totalImpl = areas.reduce((sum, area) => sum + area.implemented, 0);
  const globalPct = totalSt > 0 ? Math.round((totalImpl / totalSt) * 100) : 0;
  const totalInternal = areas.reduce((sum, area) => sum + area.internalCount, 0);
  const totalExternal = areas.reduce((sum, area) => sum + area.externalCount, 0);
  return { totalSt, totalImpl, globalPct, totalInternal, totalExternal,
    hasEvaluableData: totalSt > 0 && areas.some(area => area.plannedActions > 0) };
}

type Program = { plannedActions: number; completedActions: number };
type Audit = {
  findingsMajorNC?: number | null; findingsMinorNC?: number | null;
  findingsObservations?: number | null; findingsOM?: number | null;
  closuresMajorNC?: number | null; closuresMinorNC?: number | null;
  closuresObservations?: number | null; closuresOM?: number | null;
};
type Inspection = { findings?: number | null; closures?: number | null };
type Training = { completed?: string | null };
const auditFindings = (audit: Audit) => (audit.findingsMajorNC || 0) + (audit.findingsMinorNC || 0) + (audit.findingsObservations || 0) + (audit.findingsOM || 0);

/** Fórmulas extraídas del resumen SGI existente, no un promedio alternativo. */
export function calculateManagementOverviewSummary(input: {
  programs: readonly Program[]; audits: readonly Audit[]; inspections: readonly Inspection[];
  companyCompliances: CompanyComplianceProgressInput[]; companyTrainings: readonly Training[];
}, today?: Date) {
  const { programs, audits, inspections, companyCompliances, companyTrainings } = input;
  const programsCompliance = programs.length
    ? Math.round(programs.reduce((sum, program) => sum + (program.plannedActions > 0 ? Math.min(100, Math.round((program.completedActions / program.plannedActions) * 100)) : 0), 0) / programs.length) : 0;
  let auditCount = 0;
  const auditTotal = audits.reduce((sum, audit) => {
    const findings = auditFindings(audit);
    if (findings === 0) return sum;
    const closures = (audit.closuresMajorNC || 0) + (audit.closuresMinorNC || 0) + (audit.closuresObservations || 0) + (audit.closuresOM || 0);
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
  const avgCompliances = calculateCompanyComplianceSummary(companyCompliances, today).averageCompliance;
  const avgTrainings = companyTrainings.length
    ? Math.round((companyTrainings.filter(training => training.completed === "SI").length / companyTrainings.length) * 100) : 0;
  const metrics = [
    { label: "Programas", value: programsCompliance, count: programs.length, color: "#3b82f6" },
    { label: "Cumplimientos", value: avgCompliances, count: null, color: "#10b981" },
    { label: "Auditorías", value: auditsCompliance, count: audits.length, color: "#8b5cf6" },
    { label: "Inspecciones", value: inspectionsCompliance, count: inspections.length, color: "#f59e0b" },
    { label: "Capacitaciones", value: avgTrainings, count: null, color: "#ec4899" },
  ];
  const avgTotal = Math.round(metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length);
  const hasEvaluableData = programs.some(program => program.plannedActions > 0)
    || audits.some(audit => auditFindings(audit) > 0)
    || inspections.some(inspection => (inspection.findings ?? 0) > 0)
    || companyCompliances.some(compliance => compliance.evaluationMode === "vigencia"
      ? Boolean(compliance.validUntil && Number.isFinite(new Date(compliance.validUntil).getTime()))
      : parseComplianceMonths(compliance.plannedMonths).length > 0)
    || companyTrainings.some(training => training.completed === "SI" || training.completed === "NO");
  return { metrics, avgTotal, hasEvaluableData };
}

/** Nunca mostrar un cero creado por ausencia, carga, errores o datos no finitos. */
export function availablePerformancePercent(query: {
  isLoading?: boolean; isFetching?: boolean; error?: unknown; isPlaceholderData?: boolean;
}, value: number | null | undefined, hasEvaluableData = true): number | null {
  return query.isLoading || query.error || query.isPlaceholderData || !hasEvaluableData
    || typeof value !== "number" || !Number.isFinite(value) ? null : value;
}
