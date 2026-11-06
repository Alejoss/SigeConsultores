export type AnswerValue = "yes" | "partial" | "no";

export type AssessmentAnswers = Partial<Record<string, AnswerValue>>;

export type AssessmentLevel = "fragmented" | "developing" | "integrated";

export interface AssessmentQuestion {
  id: string;
  label: string;
  question: string;
  strength: string;
  recommendation: string;
}

export const ASSESSMENT_QUESTIONS = [
  {
    id: "visibility",
    label: "Visibilidad",
    question:
      "¿Gerencia puede consultar el avance de los objetivos y compromisos sin reunir información de diferentes archivos?",
    strength:
      "Gerencia puede consultar el avance de los objetivos y compromisos sin reunir información de diferentes archivos.",
    recommendation:
      "Reunir el avance de los objetivos y compromisos en una vista común que gerencia pueda consultar y mantener actualizada.",
  },
  {
    id: "alignment",
    label: "Alineación",
    question:
      "¿Las acciones de los procesos y de los sistemas de gestión contribuyen a la estrategia de la empresa?",
    strength:
      "Las acciones de los procesos y de los sistemas de gestión contribuyen a la estrategia de la empresa.",
    recommendation:
      "Vincular las acciones de los procesos y de los sistemas de gestión con los objetivos estratégicos de la empresa.",
  },
  {
    id: "responsibilities",
    label: "Responsabilidades",
    question:
      "¿Cada compromiso tiene un responsable claramente identificado y una fecha de cumplimiento?",
    strength:
      "Cada compromiso tiene un responsable claramente identificado y una fecha de cumplimiento.",
    recommendation:
      "Definir un responsable y una fecha de cumplimiento para cada compromiso, y hacerlos visibles para las áreas involucradas.",
  },
  {
    id: "integration",
    label: "Integración",
    question:
      "¿Las áreas aprovechan información y controles comunes, evitando registrar lo mismo varias veces?",
    strength:
      "Las áreas aprovechan información y controles comunes, evitando registros duplicados.",
    recommendation:
      "Identificar información y controles que las áreas puedan compartir para reducir los registros duplicados.",
  },
  {
    id: "monitoring",
    label: "Seguimiento",
    question:
      "¿Pueden identificar oportunamente pendientes, atrasos y desviaciones?",
    strength:
      "Se identifican oportunamente los pendientes, atrasos y desviaciones.",
    recommendation:
      "Establecer una revisión periódica de pendientes, atrasos y desviaciones, con acuerdos de acción y seguimiento.",
  },
  {
    id: "outputQuality",
    label: "Calidad de las salidas",
    question:
      "¿Los procesos tienen criterios para comprobar que sus resultados cumplen lo esperado y actuar cuando no cumplen?",
    strength:
      "Los procesos tienen criterios para comprobar sus resultados y actuar cuando no cumplen lo esperado.",
    recommendation:
      "Definir criterios para comprobar los resultados de los procesos y acordar cómo actuar cuando no cumplen lo esperado.",
  },
] as const satisfies readonly AssessmentQuestion[];

export const ANSWER_OPTIONS = [
  { value: "yes", label: "Sí", points: 2 },
  { value: "partial", label: "Parcialmente", points: 1 },
  { value: "no", label: "No", points: 0 },
] as const satisfies readonly {
  value: AnswerValue;
  label: string;
  points: number;
}[];

export interface AssessmentResult {
  score: number;
  maxScore: 12;
  level: AssessmentLevel;
  title: string;
  description: string;
  recommendation: string;
  strengths: string[];
  opportunities: string[];
  /** Question labels and human-readable answer labels, in questionnaire order. */
  responses: { label: string; answer: string }[];
}

const LEVEL_CONTENT: Record<
  AssessmentLevel,
  { title: string; description: string }
> = {
  fragmented: {
    title: "Gestión fragmentada",
    description:
      "Tus respuestas sugieren oportunidades para conectar la información, los compromisos y las prácticas de gestión entre áreas. Puedes avanzar de forma gradual, empezando por los aspectos señalados en tus respuestas.",
  },
  developing: {
    title: "Gestión en proceso de integración",
    description:
      "Tus respuestas muestran avances en la integración de la gestión y aspectos que todavía pueden consolidarse. Las respuestas parciales o negativas ayudan a orientar los siguientes pasos.",
  },
  integrated: {
    title: "Gestión integrada",
    description:
      "Tus respuestas muestran una base de prácticas de gestión integradas. Este resultado es una referencia para seguir revisando y mejorando esas prácticas.",
  },
};

const ASSESSMENT_SCOPE =
  "Esta autoevaluación es orientativa; no verifica certificaciones ni cumplimiento normativo.";

/** Pure, local calculation: no result until all six questions have valid answers. */
export function calculateAssessment(
  answers: AssessmentAnswers
): AssessmentResult | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return null;
  }

  const selections: {
    question: (typeof ASSESSMENT_QUESTIONS)[number];
    option: (typeof ANSWER_OPTIONS)[number];
  }[] = [];

  for (const question of ASSESSMENT_QUESTIONS) {
    if (!Object.prototype.hasOwnProperty.call(answers, question.id)) {
      return null;
    }

    const option = ANSWER_OPTIONS.find(
      candidate => candidate.value === answers[question.id]
    );
    if (!option) return null;
    selections.push({ question, option });
  }

  const score = selections.reduce(
    (total, { option }) => total + option.points,
    0
  );
  const level: AssessmentLevel =
    score <= 4 ? "fragmented" : score <= 8 ? "developing" : "integrated";
  const strengths = selections
    .filter(({ option }) => option.value === "yes")
    .map(({ question }) => question.strength);
  const opportunities = selections
    .filter(({ option }) => option.value !== "yes")
    .map(({ question }) => question.recommendation);
  const gapNote =
    level === "integrated" && opportunities.length > 0
      ? " Aun con este puntaje, las respuestas parciales o negativas señalan oportunidades concretas que conviene revisar."
      : "";

  return {
    score,
    maxScore: 12,
    level,
    title: LEVEL_CONTENT[level].title,
    description: `${LEVEL_CONTENT[level].description}${gapNote} ${ASSESSMENT_SCOPE}`,
    recommendation:
      opportunities.length > 0
        ? `Puedes empezar por una mejora concreta: ${opportunities[0]} Acuerda con tu equipo un responsable, una fecha y cómo comprobar el avance. Después, continúa con las otras oportunidades identificadas.`
        : "Mantener las prácticas que señalaste como fortalezas y revisarlas periódicamente con las áreas para encontrar nuevas oportunidades de mejora.",
    strengths,
    opportunities,
    responses: selections.map(({ question, option }) => ({
      label: question.label,
      answer: option.label,
    })),
  };
}

/** Builds only a draft URL. Opening it and sending the message require user action. */
export function buildAssessmentWhatsAppUrl(result: AssessmentResult): string {
  const draft = [
    "Hola ISGE 360, realicé la autoevaluación orientativa de gestión de mi empresa.",
    `Nivel: ${result.title}`,
    `Puntaje: ${result.score}/12`,
    "Respuestas:",
    ...result.responses.map(({ label, answer }) => `${label}: ${answer}`),
    "Me gustaría conversar sobre oportunidades de mejora para mi empresa.",
  ].join("\n");

  return `https://wa.me/593987298644?text=${encodeURIComponent(draft)}`;
}
