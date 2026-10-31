export type JobDescriptionProcessType = "estrategico" | "misional" | "soporte";

const processTypeLabels: Record<JobDescriptionProcessType, string> = {
  estrategico: "Estratégico",
  misional: "Misional",
  soporte: "Soporte",
};

/**
 * El tipo oficial se guarda en el Mapa de Procesos y es la única fuente
 * canónica para clasificar un proceso en Descriptivos de cargo.
 */
export function getJobDescriptionProcessTypeLabel(
  processType: JobDescriptionProcessType
) {
  return processTypeLabels[processType];
}
