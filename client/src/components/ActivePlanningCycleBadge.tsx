import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

interface ActivePlanningCycleBadgeProps {
  companyId?: number | null;
  className?: string;
}

export function ActivePlanningCycleBadge({ companyId, className = "" }: ActivePlanningCycleBadgeProps) {
  const enabled = Boolean(companyId && companyId > 0);
  const { data } = trpc.planningCycles.activeYear.useQuery(
    { companyId: companyId || 0 },
    { enabled },
  );
  const year = data?.year || new Date().getFullYear();
  const label = data?.isActive ? `Planificación activa ${year}` : `Planificación ${year}`;

  return (
    <Badge className={`gap-1.5 border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800 ${className}`}>
      <CalendarDays size={15} />
      {label}
    </Badge>
  );
}
