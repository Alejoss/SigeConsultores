export type ImportedMeetingTaskDraft = {
  description: string;
  responsibleName: string;
  dueDate: string;
  notes: string;
};

export type AssistantMeetingImportDraft = {
  title: string;
  meetingDate: string;
  objective: string;
  participants: string;
  locationOrMedium: string;
  notes: string;
  agreements: ImportedMeetingTaskDraft[];
};

const DATE_PATTERN = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/;
const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
const AGREEMENT_HEADINGS = [
  "acuerdos y pendientes",
  "acuerdos",
  "pendientes",
  "compromisos",
  "compromisos y responsables",
  "acciones acordadas",
  "acciones a realizar",
  "acciones identificadas",
  "acciones",
  "tareas y acciones",
  "tareas",
  "tareas pendientes",
  "action items",
  "next steps",
  "follow up",
  "follow-up",
  "to do",
  "todo",
];
const REPORT_SECTION_HEADINGS = [
  "resumen",
  "notas",
  "síntesis",
  "sintesis",
  "summary",
  "meeting summary",
  "desarrollo",
  "desarrollo y acuerdos",
  "decisiones",
  "puntos tratados",
  ...AGREEMENT_HEADINGS,
];

function compact(value: string) {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeHeading(value: string) {
  return value
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:\*\*|__|\*|_)+/, "")
    .replace(/(?:\*\*|__|\*|_)+$/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/[:：]+$/, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecognizedHeading(value: string, headings: string[]) {
  const normalized = normalizeHeading(value);
  return headings.some(heading => {
    const normalizedHeading = normalizeHeading(heading);
    return (
      normalized === normalizedHeading ||
      normalized.startsWith(`${normalizedHeading} `) ||
      normalized.startsWith(`${normalizedHeading}:`) ||
      normalized.startsWith(`${normalizedHeading} -`) ||
      (normalized.length <= 48 && normalized.endsWith(` ${normalizedHeading}`))
    );
  });
}

/** Convierte fechas ISO, numéricas latinoamericanas y fechas en español a ISO. */
export function normalizeMeetingDate(text: string): string {
  const numeric = text.match(DATE_PATTERN);
  if (numeric) {
    const [, year, month, day, localDay, localMonth, localYear] = numeric;
    const yyyy = year || localYear;
    const mm = month || localMonth;
    const dd = day || localDay;
    if (yyyy && mm && dd) {
      const parsedMonth = Number(mm);
      const parsedDay = Number(dd);
      if (parsedMonth >= 1 && parsedMonth <= 12 && parsedDay >= 1 && parsedDay <= 31) {
        return `${yyyy}-${String(parsedMonth).padStart(2, "0")}-${String(parsedDay).padStart(2, "0")}`;
      }
    }
  }

  const words = text
    .toLocaleLowerCase()
    .match(/\b(\d{1,2})\s+de\s+([a-záéíóúüñ]+)\s+de\s+(\d{4})\b/i);
  if (!words) return "";
  const month = MONTHS[words[2].toLocaleLowerCase()];
  const day = Number(words[1]);
  if (!month || day < 1 || day > 31) return "";
  return `${words[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextNonEmptyLine(lines: string[], start: number) {
  for (let index = start; index < lines.length; index += 1) {
    const value = lines[index].trim();
    if (value) return value;
  }
  return "";
}

function dateFromMeetingLabel(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
      .trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/^(?:\*\*|__|\*|_)+/, "")
      .replace(/(?:\*\*|__|\*|_)+$/, "");
    const inline = line.match(/^(?:fecha(?: de (?:la )?reunión)?|date(?: of meeting)?|meeting date)\s*[:：\-]\s*(.+)$/i);
    if (inline?.[1]) {
      const parsed = normalizeMeetingDate(inline[1]);
      if (parsed) return parsed;
    }
    if (/^(?:fecha(?: de (?:la )?reunión)?|date(?: of meeting)?|meeting date)\s*[:：]?$/i.test(line)) {
      const parsed = normalizeMeetingDate(nextNonEmptyLine(lines, index + 1));
      if (parsed) return parsed;
    }
  }
  return "";
}

function lineAfterLabel(lines: string[], labels: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    for (const label of labels) {
      const escapedLabel = escapeRegExp(label);
      // Evita que "Objetivos principales" se convierta en un objetivo truncado.
      const expression = new RegExp(`^${escapedLabel}(?![A-Za-zÁÉÍÓÚÜÑáéíóúüñ])(?:\\s*[:：\\-–—]\\s*|\\s+)(.+)$`, "i");
      const inline = line.match(expression);
      if (inline?.[1]?.trim()) return inline[1].trim();
      if (new RegExp(`^${escapedLabel}\\s*[:：]?$`, "i").test(line)) {
        const nextLine = nextNonEmptyLine(lines, index + 1);
        if (nextLine) return nextLine;
      }
    }
  }
  return "";
}

function sectionAfterHeading(lines: string[], headings: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].trim();
    if (!isRecognizedHeading(heading, headings)) continue;

    const section: string[] = [];
    const inlineText = heading.replace(/^.*?[:：]\s*/, "").trim();
    if (inlineText && !isRecognizedHeading(inlineText, headings)) section.push(inlineText);
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next].trim();
      if (!candidate && section.length) break;
      if (isRecognizedHeading(candidate, REPORT_SECTION_HEADINGS)) break;
      if (/^(?:fecha(?: de (?:la )?reunión)?|hora|lugar(?: o medio)?|medio|modalidad|participantes|asistentes|presentes|objetivo|tema|nombre de la reunión|título|titulo)\s*[:：]/i.test(candidate)) break;
      if (/^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{4,}:?$/.test(candidate)) break;
      if (candidate) section.push(candidate);
    }
    if (section.length) return section.join("\n");
  }
  return "";
}

function cleanTaskText(value: string) {
  return value
    .replace(/^(?:[-•●▪–—]|\d+[.)])\s*/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/^(?:\*\*|__|\*|_)+/, "")
    .replace(/(?:\*\*|__|\*|_)+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTaskHeading(value: string) {
  const normalized = normalizeHeading(value);
  return (
    AGREEMENT_HEADINGS.some(heading => normalizeHeading(heading) === normalized) ||
    /^(?:responsable(?:s)?|asignado a|fecha(?: límite| limite| tope| de cumplimiento| de vencimiento)?|plazo|estado|prioridad|proceso responsable|acción|accion|tarea|acuerdo|compromiso|action|task|description)$/i.test(normalized)
  );
}

function isReportNoise(value: string) {
  const normalized = normalizeHeading(value);
  return (
    !normalized ||
    REPORT_SECTION_HEADINGS.some(heading => normalizeHeading(heading) === normalized) ||
    /^(?:fecha(?: de (?:la )?reunión)?|hora|lugar(?: o medio)?|medio|participantes|asistentes|objetivo(?:s)?(?: principales)?|tema|nombre de la reunión|título|titulo)$/i.test(normalized) ||
    /^(?:acta(?: de reunión)?|meeting (?:notes|report)|reunión semanal de gestión)$/i.test(normalized) ||
    /(?:acciones|tareas) identificadas/.test(normalized)
  );
}

function newTask(description: string, responsibleName = "", dueDate = "", notes = ""): ImportedMeetingTaskDraft | null {
  const cleaned = cleanTaskText(description);
  if (cleaned.length < 4 || isTaskHeading(cleaned) || isReportNoise(cleaned)) return null;
  return { description: cleaned, responsibleName: responsibleName.trim(), dueDate, notes: notes.trim() };
}

function taskMarker(value: string): { isMarker: boolean; description: string } {
  const line = cleanTaskText(value);
  const withDescription = line.match(/^(?:acción|accion|tarea|acuerdo|compromiso|action item|task)\s*(?:n[º°o.]?\s*)?(?:\d+|[ivxlcdm]+)?\s*[:：\-–—.]\s*(.+)$/i);
  if (withDescription?.[1]?.trim()) return { isMarker: true, description: withDescription[1].trim() };
  const markerOnly = /^(?:acción|accion|tarea|acuerdo|compromiso|action item|task)\s*(?:n[º°o.]?\s*)?(?:\d+|[ivxlcdm]+)?\s*[:：\-–—.]?$/i.test(line);
  return { isMarker: markerOnly, description: "" };
}

function labelValue(value: string, labels: string[]) {
  for (const label of labels) {
    const match = value.match(new RegExp(`^${escapeRegExp(label)}\\s*[:：\\-–—]\\s*(.+)$`, "i"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function delimitedTask(value: string): ImportedMeetingTaskDraft | null | undefined {
  const separator = value.includes("\t") ? /\t+/ : value.includes("|") ? "|" : null;
  if (!separator) return undefined;
  const cells = value.split(separator).map(cell => cleanTaskText(cell)).filter(Boolean);
  if (!cells.length || /^-+$/.test((cells[0] || "").replace(/\s/g, ""))) return null;

  const description = labelValue(cells[0], ["acción", "accion", "tarea", "acuerdo", "compromiso", "action", "task", "description"]) || cells[0];
  if (!description || isTaskHeading(description) || isReportNoise(description)) return null;

  let responsibleName = "";
  let dueDate = "";
  for (const cell of cells.slice(1)) {
    const labeledResponsible = labelValue(cell, ["responsable", "responsables", "asignado a", "owner", "assignee"]);
    const labeledDate = labelValue(cell, ["fecha límite", "fecha limite", "fecha tope", "fecha de cumplimiento", "fecha de vencimiento", "plazo", "due date"]);
    if (labeledResponsible) responsibleName = labeledResponsible;
    else if (labeledDate) dueDate = normalizeMeetingDate(labeledDate);
    else if (!responsibleName && !normalizeMeetingDate(cell)) responsibleName = cell;
    else if (!dueDate) dueDate = normalizeMeetingDate(cell);
  }
  return newTask(description, responsibleName, dueDate);
}

/**
 * Convierte una lista copiada desde la sección Action Items / Tareas de un
 * asistente. No adivina tareas desde el resumen: el usuario siempre revisa la
 * lista antes de crear compromisos oficiales.
 */
export function deriveTaskDraftsFromActionItems(actionItemsText: string): ImportedMeetingTaskDraft[] {
  const lines = compact(actionItemsText)
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  const tasks: ImportedMeetingTaskDraft[] = [];

  const addTask = (task: ImportedMeetingTaskDraft | null) => {
    if (!task) return;
    const duplicate = tasks.some(existing => existing.description.toLocaleLowerCase() === task.description.toLocaleLowerCase());
    if (!duplicate) tasks.push(task);
  };

  let waitingForMarkedTask = false;
  for (const rawLine of lines) {
    const parsedDelimited = delimitedTask(rawLine);
    if (parsedDelimited !== undefined) {
      addTask(parsedDelimited);
      waitingForMarkedTask = false;
      continue;
    }

    const line = cleanTaskText(rawLine);
    if (!line || isTaskHeading(line) || isReportNoise(line)) continue;

    const responsible = line.match(/^(?:responsable(?:s)?|asignado a|owner|assignee)\s*[:：\-–—]\s*(.+)$/i);
    const lastTask = tasks[tasks.length - 1];
    if (responsible && lastTask) {
      lastTask.responsibleName = responsible[1].trim();
      continue;
    }
    const dueDate = line.match(/^(?:fecha(?: límite| limite| tope| de cumplimiento| de vencimiento)?|plazo|due date)\s*[:：\-–—]\s*(.+)$/i);
    if (dueDate && lastTask) {
      lastTask.dueDate = normalizeMeetingDate(dueDate[1]);
      continue;
    }

    const marked = taskMarker(line);
    if (marked.isMarker) {
      if (marked.description) addTask(newTask(marked.description));
      waitingForMarkedTask = !marked.description;
      continue;
    }
    if (waitingForMarkedTask) {
      addTask(newTask(line));
      waitingForMarkedTask = false;
      continue;
    }

    const taskWithMetadata = line.match(/^(.*?)\s*(?:\||—|–|-)\s*(?:responsable|asignado a)\s*[:：]\s*(.*?)(?:\s*(?:\||—|–|-)\s*(?:fecha(?: límite| limite| tope| de cumplimiento| de vencimiento)?|plazo)\s*[:：]\s*(.+))?$/i);
    if (taskWithMetadata?.[1]) {
      addTask(newTask(taskWithMetadata[1], taskWithMetadata[2].trim(), normalizeMeetingDate(taskWithMetadata[3] || "")));
      continue;
    }
    addTask(newTask(line));
  }

  return tasks.slice(0, 50);
}

function asAgreementList(section: string) {
  return deriveTaskDraftsFromActionItems(section);
}

/**
 * Lectura asistida por reglas locales. No usa IA ni envía contenido a terceros:
 * el usuario siempre puede corregir los campos y aprobar o rechazar cada tarea.
 */
export function deriveMeetingDraftFromAssistantReport(
  reportText: string,
  fallbackDate: string
): AssistantMeetingImportDraft {
  const normalized = compact(reportText);
  const lines = normalized.split("\n").map(line => line.trim());
  const title = lineAfterLabel(lines, [
    "nombre de la reunión",
    "nombre reunión",
    "título de la reunión",
    "titulo de la reunión",
    "meeting title",
  ]);
  const explicitObjective = lineAfterLabel(lines, [
    "objetivo",
    "tema",
    "asunto",
    "meeting objective",
    "subject",
  ]);
  const objectiveFromSection = sectionAfterHeading(lines, [
    "objetivo de la reunión",
    "objetivos principales",
    "objetivos",
    "tema de la reunión",
  ]);
  const objective = explicitObjective || objectiveFromSection || title;
  const participants = lineAfterLabel(lines, [
    "participantes",
    "asistentes",
    "presentes",
    "attendees",
    "participants",
  ]);
  const locationOrMedium = lineAfterLabel(lines, [
    "lugar o medio",
    "lugar",
    "medio",
    "modalidad",
    "plataforma",
    "location",
    "platform",
  ]);
  const notes = sectionAfterHeading(lines, [
    "resumen",
    "notas",
    "síntesis",
    "sintesis",
    "summary",
    "meeting summary",
    "desarrollo",
  ]);
  const agreementsSection = sectionAfterHeading(lines, AGREEMENT_HEADINGS);

  return {
    title: title || objective,
    // Las fechas tope de acuerdos no deben sustituir la fecha de la reunión.
    meetingDate: dateFromMeetingLabel(lines) || fallbackDate,
    objective,
    participants,
    locationOrMedium,
    notes,
    agreements: asAgreementList(agreementsSection),
  };
}
