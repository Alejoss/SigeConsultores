export type DashboardModuleDefinition = {
  moduleName: string;
  path: string;
  /** Key in `moduleCustomization`; omit when the title is not customizable */
  labelKey?: string;
  defaultTitle: string;
  description: string;
  icon: string;
};

/** Canonical SIGE dashboard modules — same set for admin, gerente and jefe de proceso */
export const DASHBOARD_MODULES: DashboardModuleDefinition[] = [
  {
    moduleName: "companyInfo",
    path: "/company-info",
    labelKey: "sige_company_info",
    defaultTitle: "Propósito, Misión, Visión",
    description: "Define los fundamentos estratégicos de tu empresa",
    icon: "🎯",
  },
  {
    moduleName: "values",
    path: "/values",
    labelKey: "sige_corporate_values",
    defaultTitle: "Valores Empresariales",
    description: "Establece los valores que guían tu organización",
    icon: "💎",
  },
  {
    moduleName: "policy",
    path: "/policy",
    labelKey: "sige_policy",
    defaultTitle: "Política",
    description: "Documenta la política del Sistema Integrado de Gestión",
    icon: "📋",
  },
  {
    moduleName: "organizationChart",
    path: "/organization-chart",
    labelKey: "sige_organization_chart",
    defaultTitle: "Organigrama",
    description: "Gestiona la estructura organizacional de tu empresa",
    icon: "🏢",
  },
  {
    moduleName: "processMap",
    path: "/process-map",
    labelKey: "sige_process_map",
    defaultTitle: "Mapa de Procesos",
    description: "Visualiza y gestiona los procesos empresariales",
    icon: "🗺️",
  },
  {
    moduleName: "strategicObjectives",
    path: "/strategic-objectives",
    labelKey: "sige_strategic_objectives",
    defaultTitle: "Objetivos Estratégicos",
    description: "Define los objetivos a largo plazo de la empresa",
    icon: "🎪",
  },
  {
    moduleName: "foda",
    path: "/foda",
    defaultTitle: "FODA de Empresa",
    description: "Consolida los FODA de procesos y crea el FODA general de la empresa",
    icon: "📈",
  },
  {
    moduleName: "auditsInspections",
    path: "/audits-inspections",
    defaultTitle: "Auditorías e Inspecciones",
    description:
      "Con ellas se busca garantizar conformidad, mitigar riesgos y mejorar continuamente.",
    icon: "🔍",
  },
  {
    moduleName: "indicators",
    path: "/indicators",
    labelKey: "sige_indicators",
    defaultTitle: "Indicadores",
    description: "Monitorea el desempeño de tu Sistema Integrado de Gestión",
    icon: "📊",
  },
  {
    moduleName: "flowchart",
    path: "/flowchart",
    defaultTitle: "Flujograma SIGE",
    description: "Visualiza la estructura completa del Sistema Integrado de Gestión",
    icon: "🔄",
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
