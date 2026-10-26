/** Online courses: content shape, grading, and public host. */

export const COURSE_COOKIE = "course_sid";
export const COURSE_SESSION_HOURS = 12;
export const PASS_RATIO = 0.8;
export const COURSE_TIME_ZONE = "America/Guayaquil";
export const DEFAULT_COURSE_HOSTS = ["capacitaciones.isge360.com"];
export const COURSE_PUBLIC_ORIGIN = "https://capacitaciones.isge360.com";

export type LessonOption = { id: string; text: string };
export type LessonQuestion = { q: string; orden: LessonOption[]; correct: string };
export type LessonBlock = { t: string; html: string };
export type LessonContent = {
  objetivo: string;
  icono: string;
  intro: string;
  bloques: LessonBlock[];
  cierre: string;
  ejemplo: string;
  lecturas: string;
  nota: string;
};
export type PublicQuestion = { q: string; orden: LessonOption[] };

export type ParsedLessonFile = {
  title: string;
  content: LessonContent;
  questions: LessonQuestion[];
};

export function isCourseHostname(hostname: string, configured: string[] = DEFAULT_COURSE_HOSTS): boolean {
  const host = hostname.split(":")[0].trim().toLowerCase();
  return configured.some(item => item.trim().toLowerCase() === host);
}

/** Where the "Capacitaciones On line" button sends the user. */
export function courseEntryUrl(
  path: string,
  opts: { publicUrl?: string; hostname?: string } = {}
): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const configured = opts.publicUrl?.trim();
  if (configured) return `${configured.replace(/\/$/, "")}${suffix}`;
  return `${COURSE_PUBLIC_ORIGIN}${suffix}`;
}

export function gradeAnswers(questions: LessonQuestion[], answers: string[]) {
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    throw new Error("Solicitud no válida.");
  }
  const total = questions.length;
  if (!total) throw new Error("La capacitación no tiene preguntas.");
  const correct = questions.filter((question, index) => answers[index] === question.correct).length;
  const scoreTenths = Math.round((correct / total) * 100);
  return {
    correct,
    total,
    scoreTenths,
    passed: correct / total >= PASS_RATIO,
  };
}

export function toPublicQuestions(questions: LessonQuestion[]): PublicQuestion[] {
  return questions.map(question => ({
    q: question.q,
    orden: question.orden.map(option => ({ id: option.id, text: option.text })),
  }));
}

export function validateLessonFile(input: unknown): ParsedLessonFile {
  if (!input || typeof input !== "object") {
    throw new Error("El archivo no tiene el formato esperado.");
  }
  const data = input as Record<string, unknown>;
  if (typeof data.title !== "string" || !data.title.trim()) {
    throw new Error('Falta el campo "title" en el archivo.');
  }
  if (!Array.isArray(data.preguntas) || data.preguntas.length < 2) {
    throw new Error("El archivo debe traer al menos 2 preguntas.");
  }
  const questions: LessonQuestion[] = data.preguntas.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Pregunta ${index + 1} incompleta.`);
    const question = raw as Record<string, unknown>;
    if (typeof question.q !== "string" || !question.q.trim() || !Array.isArray(question.orden) || question.orden.length === 0) {
      throw new Error(`Pregunta ${index + 1} incompleta.`);
    }
    const orden: LessonOption[] = question.orden.map(option => {
      if (!option || typeof option !== "object") throw new Error(`Pregunta ${index + 1} incompleta.`);
      const row = option as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.text !== "string") {
        throw new Error(`Pregunta ${index + 1} incompleta.`);
      }
      return { id: row.id, text: row.text };
    });
    if (typeof question.correct !== "string" || !orden.some(option => option.id === question.correct)) {
      throw new Error(`Pregunta ${index + 1}: la respuesta correcta no coincide con ninguna opción.`);
    }
    return { q: question.q, orden, correct: question.correct };
  });
  const blocks = Array.isArray(data.bloques)
    ? data.bloques.filter(block => block && typeof block === "object").map(block => {
        const row = block as Record<string, unknown>;
        return { t: String(row.t || ""), html: String(row.html || "") };
      })
    : [];
  return {
    title: data.title.trim().slice(0, 160),
    content: {
      objetivo: stringField(data.objetivo),
      icono: stringField(data.icono),
      intro: stringField(data.intro),
      bloques: blocks,
      cierre: stringField(data.cierre),
      ejemplo: stringField(data.ejemplo),
      lecturas: stringField(data.lecturas),
      nota: stringField(data.nota),
    },
    questions,
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function formatCourseScore(scoreTenths: number): string {
  return `${(scoreTenths / 10).toFixed(1)}/10`;
}

/** Value for `<input type="datetime-local">` in the course time zone. */
export function courseDateTimeLocalValue(iso: string | null | undefined, timeZone = COURSE_TIME_ZONE): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

/**
 * A datetime-local value is a wall clock in the course time zone, not the server's zone.
 * 18:00 in Guayaquil is 23:00 UTC.
 */
export function courseDateTimeLocalToDate(value: string | null | undefined, timeZone = COURSE_TIME_ZONE): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(trimmed);
  if (!match) return null;
  const wallAsUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const offset = timeZoneOffsetMs(timeZone, wallAsUtc);
  const instant = new Date(wallAsUtc - offset);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(hour), Number(map.minute), Number(map.second));
  return asUtc - utcMs;
}
