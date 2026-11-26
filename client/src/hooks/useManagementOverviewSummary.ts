import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { calculateManagementOverviewSummary } from "@/lib/performanceOverviewSummary";

export function useManagementOverviewSummary(companyId: number) {
  const options = { enabled: companyId > 0, placeholderData: () => undefined };
  const programs = trpc.managementPrograms.list.useQuery({ companyId }, options);
  const audits = trpc.auditsInspections.listAudits.useQuery({ companyId }, options);
  const inspections = trpc.auditsInspections.listInspections.useQuery({ companyId }, options);
  const companyCompliances = trpc.companyCompliances.list.useQuery({ companyId }, options);
  const companyTrainings = trpc.companyTrainings.list.useQuery({ companyId }, options);
  const summary = useMemo(() => calculateManagementOverviewSummary({
    programs: programs.data ?? [], audits: audits.data ?? [], inspections: inspections.data ?? [],
    companyCompliances: companyCompliances.data ?? [], companyTrainings: companyTrainings.data ?? [],
  }), [programs.data, audits.data, inspections.data, companyCompliances.data, companyTrainings.data]);
  const queries = [programs, audits, inspections, companyCompliances, companyTrainings];
  return { ...summary, isLoading: queries.some(query => query.isLoading),
    error: queries.find(query => query.error)?.error,
    isPlaceholderData: queries.some(query => query.isPlaceholderData) };
}
