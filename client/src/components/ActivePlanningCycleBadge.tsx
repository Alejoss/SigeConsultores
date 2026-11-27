import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSelectedManagementYear } from "@/lib/annualWorkspace";
import { useAnnualWorkspace } from "@/contexts/AnnualWorkspaceContext";
export function ActivePlanningCycleBadge({ companyId, className = "" }: { companyId?: number | null; className?: string }) {
  const context = useAnnualWorkspace();
  const year = getSelectedManagementYear(companyId);
  const closed = context.companyId === companyId && context.closed;
  return <Badge className={`gap-1.5 border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800 ${className}`}><CalendarDays size={15} />Año de gestión {year}{closed ? " · Cerrado" : ""}</Badge>;
}
