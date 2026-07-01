export type DashboardModuleDefinition = {
  moduleName: string;
  path: string;
  /** Key in `moduleCustomization`; omit when the title is not customizable */
  labelKey?: string;
  defaultTitle: string;
  description: string;
  icon: string;
  /** Top-level group this module belongs to */
  group: "estrategia" | "gestion" | "desempeno";
};

/** Canonical SIGE dashboard modules — same set for admin, gerente and jefe de proceso */
export const DASHBOARD_MODULES: DashboardModuleDefinition[] = [
  // ── ESTRATEGIA ──────────────────────────────────────────────────────────────
  {
    moduleName: "flowchart",
    path: "/flowchart",
    defaultTitle: "Flujograma SIGE",
    description: "Visualiza la estructura completa del Sistema Integrado de Gestión",
    icon: "🔄",
    group: "estrategia",
  },
  {
    moduleName: "companyInfo",
    path: "/company-info",
    labelKey: "sige_company_info",
    defaultTitle: "Propósito, Misión, Visión",
    description: "Define los fundamentos estratégicos de tu empresa",
    icon: "🎯",
    group: "estrategia",
  },
  {
    moduleName: "values",
    path: "/values",
    labelKey: "sige_corporate_values",
    defaultTitle: "Valores Empresariales",
    description: "Establece los valores que guían tu organización",
    icon: "💎",
    group: "estrategia",
  },
  {
    moduleName: "policy",
    path: "/policy",
    labelKey: "sige_policy",
    defaultTitle: "Política",
    description: "Documenta la política del Sistema Integrado de Gestión",
    icon: "📋",
    group: "estrategia",
  },
  {
    moduleName: "foda",
    path: "/foda",
    defaultTitle: "FODA Empresarial",
    description: "Consolida los FODA de procesos y crea el FODA general de la empresa",
    icon: "📈",
    group: "estrategia",
  },
  {
    moduleName: "strategicObjectives",
    path: "/strategic-objectives",
    labelKey: "sige_strategic_objectives",
    defaultTitle: "Objetivos Estratégicos",
    description: "Define los objetivos a largo plazo de la empresa",
    icon: "🎪",
    group: "estrategia",
  },
  // ── GESTIÓN EMPRESARIAL ─────────────────────────────────────────────────────
  {
    moduleName: "processMap",
    path: "/process-map",
    labelKey: "sige_process_map",
    defaultTitle: "Mapa de Procesos",
    description: "Visualiza y gestiona los procesos empresariales",
    icon: "🗺️",
    group: "gestion",
  },
  {
    moduleName: "managementSystems",
    path: "/audits-inspections",
    defaultTitle: "Sistemas de Gestión",
    description:
      "Gestiona sistemas de gestión, programas, auditorías, inspecciones y cumplimientos.",
    icon: "🔍",
    group: "gestion",
  },
  {
    moduleName: "organizationChart",
    path: "/organization-chart",
    labelKey: "sige_organization_chart",
    defaultTitle: "Organigrama",
    description: "Gestiona la estructura organizacional de tu empresa",
    icon: "🏢",
    group: "gestion",
  },
  // ── DESEMPEÑO ───────────────────────────────────────────────────────────────
  {
    moduleName: "performance",
    path: "/performance",
    defaultTitle: "Desempeño",
    description: "Monitorea el desempeño integral del Sistema Integrado de Gestión",
    icon: "📊",
    group: "desempeno",
  },
];

export const MODULE_GROUPS = [
  {
    id: "estrategia" as const,
    label: "Estrategia",
    description: "Fundamentos estratégicos de la organización",
    icon: "🏛️",
  },
  {
    id: "gestion" as const,
    label: "Gestión Empresarial",
    description: "Operación y gestión de los procesos",
    icon: "⚙️",
  },
  {
    id: "desempeno" as const,
    label: "Desempeño",
    description: "Medición y seguimiento de resultados",
    icon: "📊",
  },
];

export function buildScopedModuleRoute(
  moduleName: string,
  opts: { companyId: number; processId?: number; isManager?: boolean }
): string | null {
  const mod = DASHBOARD_MODULES.find((m) => m.moduleName === moduleName);
  if (!mod) return null;

  const params = new URLSearchParams();
  params.set("companyId", String(opts.companyId));
  if (opts.processId != null) params.set("processId", String(opts.processId));
  if (opts.isManager) params.set("isManager", "true");

  return `${mod.path}?${params.toString()}`;
}
