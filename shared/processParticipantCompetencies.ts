export const PROCESS_PARTICIPANT_COMPETENCY_TYPES = [
  "transversal",
  "tecnica",
  "liderazgo",
] as const;

export type ProcessParticipantCompetencyType =
  (typeof PROCESS_PARTICIPANT_COMPETENCY_TYPES)[number];

export const PROCESS_PARTICIPANT_COMPETENCY_LEVELS = [
  "basico",
  "intermedio",
  "avanzado",
  "experto",
] as const;

export type ProcessParticipantCompetencyLevel =
  (typeof PROCESS_PARTICIPANT_COMPETENCY_LEVELS)[number];

export const PROCESS_PARTICIPANT_COMPETENCY_TYPE_DETAILS: Record<
  ProcessParticipantCompetencyType,
  { label: string; description: string }
> = {
  transversal: {
    label: "Transversal",
    description:
      "Comportamiento útil en distintos cargos, como comunicación, trabajo en equipo o planificación.",
  },
  tecnica: {
    label: "Técnica",
    description:
      "Conocimiento o habilidad propia del oficio, proceso, método, equipo o herramienta de trabajo.",
  },
  liderazgo: {
    label: "Liderazgo",
    description:
      "Capacidad para orientar personas, tomar decisiones y movilizar resultados cuando el cargo lo requiere.",
  },
};

export const PROCESS_PARTICIPANT_COMPETENCY_LEVEL_DETAILS: Record<
  ProcessParticipantCompetencyLevel,
  { label: string; description: string }
> = {
  basico: {
    label: "Básico",
    description:
      "Aplica instrucciones claras con acompañamiento o supervisión.",
  },
  intermedio: {
    label: "Intermedio",
    description:
      "Aplica la competencia de forma autónoma en situaciones habituales.",
  },
  avanzado: {
    label: "Avanzado",
    description:
      "Resuelve situaciones complejas, mejora la práctica y puede orientar a otras personas.",
  },
  experto: {
    label: "Experto",
    description:
      "Define criterios, lidera decisiones complejas y es referente técnico u organizacional.",
  },
};

/**
 * Sugerencias iniciales, no obligatorias. La primera alternativa siempre es
 * escribir una competencia propia para que cada proceso mantenga su autonomía.
 */
export const PROCESS_PARTICIPANT_COMPETENCY_SUGGESTIONS: Array<{
  name: string;
  type: ProcessParticipantCompetencyType;
}> = [
  { name: "Comunicación efectiva", type: "transversal" },
  { name: "Trabajo en equipo", type: "transversal" },
  { name: "Planificación y organización", type: "transversal" },
  { name: "Orientación al cliente", type: "transversal" },
  { name: "Resolución de problemas", type: "transversal" },
  { name: "Adaptabilidad", type: "transversal" },
  { name: "Ética e integridad", type: "transversal" },
  { name: "Dominio del proceso", type: "tecnica" },
  { name: "Gestión documental", type: "tecnica" },
  { name: "Análisis de datos", type: "tecnica" },
  { name: "Uso de herramientas digitales", type: "tecnica" },
  { name: "Conocimiento normativo", type: "tecnica" },
  { name: "Liderazgo de equipos", type: "liderazgo" },
  { name: "Toma de decisiones", type: "liderazgo" },
  { name: "Delegación y desarrollo", type: "liderazgo" },
  { name: "Gestión del cambio", type: "liderazgo" },
];

export function isProcessParticipantCompetencyType(
  value: unknown
): value is ProcessParticipantCompetencyType {
  return (
    typeof value === "string" &&
    PROCESS_PARTICIPANT_COMPETENCY_TYPES.includes(
      value as ProcessParticipantCompetencyType
    )
  );
}

export function isProcessParticipantCompetencyLevel(
  value: unknown
): value is ProcessParticipantCompetencyLevel {
  return (
    typeof value === "string" &&
    PROCESS_PARTICIPANT_COMPETENCY_LEVELS.includes(
      value as ProcessParticipantCompetencyLevel
    )
  );
}

export function getProcessParticipantCompetencyTypeLabel(
  value: unknown
): string {
  return isProcessParticipantCompetencyType(value)
    ? PROCESS_PARTICIPANT_COMPETENCY_TYPE_DETAILS[value].label
    : "Tipo no definido";
}

export function getProcessParticipantCompetencyLevelLabel(
  value: unknown
): string {
  return isProcessParticipantCompetencyLevel(value)
    ? PROCESS_PARTICIPANT_COMPETENCY_LEVEL_DETAILS[value].label
    : "Nivel no definido";
}
