import { useAnnualWorkspace } from "@/contexts/AnnualWorkspaceContext";
import { groupTrainingOrigins } from "@/lib/annualWorkspace";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { calculateManagementOverviewSummary } from "@/lib/performanceOverviewSummary";

export function useManagementOverviewSummary(companyId: number, enabled = true) {
  const annual = useAnnualWorkspace();
  const options = { enabled: enabled && companyId > 0, placeholderData: () => undefined };
  const programs = trpc.managementPrograms.list.useQuery({ companyId }, options);
  const audits = trpc.auditsInspections.listAudits.useQuery({ companyId }, options);
  const inspections = trpc.auditsInspections.listInspections.useQuery({ companyId }, options);
  const companyCompliances = trpc.companyCompliances.list.useQuery({ companyId }, options);
  const companyTrainings = trpc.companyTrainings.list.useQuery({ companyId }, options);
  const summary = useMemo(() => calculateManagementOverviewSummary({
    programs: programs.data ?? [], audits: audits.data ?? [], inspections: inspections.data ?? [],
    companyCompliances: companyCompliances.data ?? [], companyTrainings: groupTrainingOrigins(annual.year === 2026 || annual.overview ? companyTrainings.data ?? [] : [], annual.overview?.trainingOrigins || {}, annual.year).current,
  }), [programs.data, audits.data, inspections.data, companyCompliances.data, companyTrainings.data, annual.overview, annual.year]);
  const queries = [programs, audits, inspections, companyCompliances, companyTrainings];
  return { ...summary, isLoading: queries.some(query => query.isLoading),
    error: queries.find(query => query.error)?.error,
    isPlaceholderData: queries.some(query => query.isPlaceholderData) };
}
