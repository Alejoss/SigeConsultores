import { UserRound, UserRoundX } from "lucide-react";
import { useLocation } from "wouter";

export type PayrollSection = "active" | "inactive";

type PayrollSectionTabsProps = {
  active: PayrollSection;
  companyId: number;
};

const sections: Array<{
  id: PayrollSection;
  label: string;
  path: string;
  icon: typeof UserRound;
}> = [
  { id: "active", label: "Personal activo", path: "/payroll", icon: UserRound },
  {
    id: "inactive",
    label: "Personal pasivo",
    path: "/payroll-inactive",
    icon: UserRoundX,
  },
];

export function PayrollSectionTabs({
  active,
  companyId,
}: PayrollSectionTabsProps) {
  const [, setLocation] = useLocation();

  return (
    <nav aria-label="Secciones de Nómina">
      <div
        role="tablist"
        aria-label="Secciones de Nómina"
        className="flex w-full flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
      >
        {sections.map(section => {
          const Icon = section.icon;
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() =>
                setLocation(
                  `${section.path}?companyId=${encodeURIComponent(String(companyId))}`
                )
              }
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:flex-none ${
                isActive
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
