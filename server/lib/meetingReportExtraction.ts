import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_EXTRACTED_REPORT_CHARS = 500_000;
const TEMPLATE_MARKER = "plantilla de acta de reunión isge";

type UploadLike = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

export type ImportedMeetingTaskPreview = {
  description: string;
  responsibleName: string;
  targetProcessName: string;
  dueDate: string;
  notes: string;
};

export type IsgeMeetingTemplatePreview = {
  title: string;
  meetingDate: string;
  locationOrMedium: string;
  objective: string;
  participants: string;
  notes: string;
  agreements: ImportedMeetingTaskPreview[];
};

export type MeetingReportPreview = {
  reportText: string;
  templateDraft: IsgeMeetingTemplatePreview | null;
};

function truncate(text: string) {
  const normalized = text.replace(/\u0000/g, "").trim();
  if (normalized.length <= MAX_EXTRACTED_REPORT_CHARS) return normalized;
  return normalized.slice(0, MAX_EXTRACTED_REPORT_CHARS);
}

function textFromPlainFile(file: UploadLike) {
  return truncate(new TextDecoder("utf-8", { fatal: false }).decode(file.buffer));
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTemplateValue(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || /^\[.*\]$/.test(cleaned)) return "";
  if (/^(?:dd\/mm\/aaaa|hh:mm|nombre completo|sin asignar)$/i.test(cleaned)) return "";
  return cleaned;
}

function toIsoDate(value: string) {
  const numeric = value.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (numeric) {
    const [, year, month, day, localDay, localMonth, localYear] = numeric;
    const yyyy = year || localYear;
    const mm = month || localMonth;
    const dd = day || localDay;
    if (yyyy && mm && dd && Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  const months: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12,
  };
  const words = value.toLocaleLowerCase().match(/\b(\d{1,2})\s+de\s+([a-záéíóúüñ]+)\s+de\s+(\d{4})\b/i);
  if (!words) return "";
  const month = months[words[2].toLocaleLowerCase()];
  if (!month || Number(words[1]) < 1 || Number(words[1]) > 31) return "";
  return `${words[3]}-${String(month).padStart(2, "0")}-${String(words[1]).padStart(2, "0")}`;
}

function htmlTableRows(html: string) {
  return Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map(row =>
    Array.from(row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(cell => decodeHtml(cell[1]))
  ).filter(row => row.length);
}

function matchesLabel(label: string, expected: string[]) {
  const normalized = normalize(label).replace(/:$/, "");
  return expected.some(value => normalized === normalize(value));
}

/**
 * Lee únicamente la plantilla oficial. No intenta inferir compromisos desde un
 * Word libre: con la plantilla, cada celda ya declara qué información contiene.
 */
export function parseIsgeMeetingTemplateHtml(html: string): IsgeMeetingTemplatePreview | null {
  const plain = decodeHtml(html);
  if (!normalize(plain).includes(normalize(TEMPLATE_MARKER))) return null;

  const result: IsgeMeetingTemplatePreview = {
    title: "",
    meetingDate: "",
    locationOrMedium: "",
    objective: "",
    participants: "",
    notes: "",
    agreements: [],
  };
  const rows = htmlTableRows(html);
  let agreementHeaderIndex = -1;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const label = row[0] || "";
    if (row.some(cell => normalize(cell) === "accion o acuerdo")) {
      agreementHeaderIndex = index;
      break;
    }
    if (row.length < 2) continue;
    const value = cleanTemplateValue(row.slice(1).join(" "));
    if (matchesLabel(label, ["Nombre de la reunión", "Título de la reunión", "Tema de la reunión"])) result.title = value;
    if (matchesLabel(label, ["Fecha"])) result.meetingDate = toIsoDate(value);
    if (matchesLabel(label, ["Lugar o medio", "Lugar", "Modalidad"])) result.locationOrMedium = value;
    if (matchesLabel(label, ["Objetivo"])) result.objective = value;
    if (matchesLabel(label, ["Participantes"])) result.participants = value;
    if (matchesLabel(label, ["Resumen, desarrollo o decisiones", "Resumen", "Desarrollo o decisiones"])) result.notes = value;
  }

  if (agreementHeaderIndex >= 0) {
    for (const row of rows.slice(agreementHeaderIndex + 1)) {
      if (row.length < 1) continue;
      const description = cleanTemplateValue(row[0] || "");
      if (!description || /^accion o acuerdo$/i.test(description)) continue;
      result.agreements.push({
        description,
        responsibleName: cleanTemplateValue(row[1] || ""),
        targetProcessName: cleanTemplateValue(row[2] || ""),
        dueDate: toIsoDate(cleanTemplateValue(row[3] || "")),
        notes: cleanTemplateValue(row[4] || ""),
      });
    }
  }

  return result;
}

async function previewDocx(file: UploadLike): Promise<MeetingReportPreview> {
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer: file.buffer }),
    mammoth.convertToHtml({ buffer: file.buffer }),
  ]);
  return {
    reportText: truncate(textResult.value),
    templateDraft: parseIsgeMeetingTemplateHtml(htmlResult.value),
  };
}

/**
 * Extrae sólo texto y, cuando corresponde, los campos de la plantilla oficial
 * que el propio usuario completó. No llama a IA ni conserva el archivo.
 */
export async function extractMeetingReportPreview(file: UploadLike): Promise<MeetingReportPreview> {
  if (file.mimetype === "text/plain") {
    return { reportText: textFromPlainFile(file), templateDraft: null };
  }

  if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return previewDocx(file);
  }

  if (file.mimetype === "application/pdf") {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      return { reportText: truncate(result.text), templateDraft: null };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  throw new Error("Formato no compatible para lectura. Use PDF, Word (.docx) o texto (.txt).");
}

/** Compatibilidad con usos anteriores que solo requieren el contenido textual. */
export async function extractMeetingReportText(file: UploadLike): Promise<string> {
  return (await extractMeetingReportPreview(file)).reportText;
}
