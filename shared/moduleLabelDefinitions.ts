/**
 * Canonical moduleName keys for companyModuleCustomization (one customLabel per key per company).
 * Used by admin personalization, dashboards, and CompanyInfo tab titles.
 */
export type ModuleLabelDefinition = {
  /** Stable key stored in DB `moduleName` */
  moduleName: string;
  /** Human-readable section in the admin UI */
  group: string;
  /** Shown when there is no custom value */
  defaultLabel: string;
  /** Short hint for administrators */
  description: string;
};

export const MODULE_LABEL_DEFINITIONS: ModuleLabelDefinition[] = [
  {
    group: "Panel principal (SIGE)",
    moduleName: "sige_company_info",
    defaultLabel: "Propósito, Misión, Visión",
    description: "Tarjeta del dashboard hacia fundamentos estratégicos",
  },
  {
    group: "Panel principal (SIGE)",
    moduleName: "sige_corporate_values",
    defaultLabel: "Valores Empresariales",
    description: "Tarjeta del dashboard hacia valores",
  },
  {
    group: "Panel principal (SIGE)",
    moduleName: "sige_policy",
    defaultLabel: "Política",
    description: "Tarjeta del dashboard hacia política SIGE",
  },
  {
    group: "Panel principal (SIGE)",
    moduleName: "sige_organization_chart",
    defaultLabel: "Organigrama",
    description: "Tarjeta del dashboard hacia organigrama",
  },
  {
    group: "Panel principal (SIGE)",
    moduleName: "sige_process_map",
    defaultLabel: "Mapa de Procesos",
    description: "Tarjeta del dashboard hacia mapa de procesos",
  },
  {
    group: "Panel principal (SIGE)",
    moduleName: "sige_strategic_objectives",
    defaultLabel: "Objetivos Estratégicos",
    description: "Tarjeta del dashboard hacia objetivos estratégicos",
  },
  {
    group: "Panel principal (SIGE)",
    moduleName: "sige_indicators",
    defaultLabel: "Indicadores",
    description: "Tarjeta hacia indicadores del SIGE",
  },
  {
    group: "Propósito, Misión y Visión (página)",
    moduleName: "purpose_proposito",
    defaultLabel: "Propósito",
    description: "Título de la sección de propósito en la página de fundamentos",
  },
  {
    group: "Propósito, Misión y Visión (página)",
    moduleName: "purpose_mision",
    defaultLabel: "Misión",
    description: "Título de la sección de misión",
  },
  {
    group: "Propósito, Misión y Visión (página)",
    moduleName: "purpose_vision",
    defaultLabel: "Visión",
    description: "Título de la sección de visión",
  },
];

export const MODULE_LABEL_DEFAULTS: Record<string, string> = Object.fromEntries(
  MODULE_LABEL_DEFINITIONS.map((d) => [d.moduleName, d.defaultLabel])
);
