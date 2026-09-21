export type ActivityScheduleType = "once" | "weekly" | "monthly";
export type ActivityTrackingType =
  | "puntual"
  | "mensual_sumatoria"
  | "mensual_promedio"
  | "mensual_checklist";

export type ActivityOccurrence = {
  date: string;
  completed: boolean;
};

const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function dateOnly(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

export function dateAtNoon(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function toDateValue(value: string | null): Date | null {
  if (!value) return null;
  const date = dateAtNoon(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeScheduleType(value: unknown): ActivityScheduleType {
  return value === "weekly" || value === "monthly" ? value : "once";
}

export function normalizeTrackingType(value: unknown): ActivityTrackingType {
  if (
    value === "mensual_sumatoria" ||
    value === "mensual_promedio" ||
    value === "mensual_checklist"
  ) {
    return value;
  }
  return "puntual";
}

function progressFromValues(start: number, target: number, current: number): number {
  if (target === start) return current >= target ? 100 : 0;
  return clampPercentage(((current - start) / (target - start)) * 100);
}

/**
 * Devuelve el porcentaje de una Actividad sin depender de la interfaz.
 * Los registros históricos, que no tienen tipo de seguimiento nuevo, conservan
 * el porcentaje/estado que ya tenían antes de esta mejora.
 */
export function calculateActivityProgress(activity: Record<string, unknown>): number {
  const legacyPercentage = clampPercentage(numberValue(activity.completionPercentage));
  const hasTrackingData =
    activity.trackingType !== null && activity.trackingType !== undefined;

  if (!hasTrackingData) {
    if (activity.evaluationMode === "meses") {
      const planned = String(activity.plannedMonths || "")
        .split(",")
        .map(Number)
        .filter(value => value >= 1 && value <= 12);
      const completed = String(activity.completedMonths || "")
        .split(",")
        .map(Number)
        .filter(value => value >= 1 && value <= 12);
      if (planned.length > 0) {
        return clampPercentage(
          (completed.filter(value => planned.includes(value)).length / planned.length) * 100
        );
      }
    }
    if (activity.evaluationMode === "vigencia") {
      const validUntil = dateOnly(activity.validUntil);
      if (validUntil) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return dateAtNoon(validUntil) >= now ? 100 : 0;
      }
    }
    return activity.completed === "SI" ? 100 : legacyPercentage;
  }

  const trackingType = normalizeTrackingType(activity.trackingType);
  const start = numberValue(activity.trackingStartValue);
  const target = numberValue(activity.trackingTargetValue, 100);

  if (trackingType === "mensual_checklist") {
    const values = parseJsonArray<boolean>(activity.monthlyChecklistValues, []);
    const completedMonths = values.slice(0, 12).filter(Boolean).length;
    return clampPercentage((completedMonths / 12) * 100);
  }

  if (trackingType === "mensual_sumatoria") {
    const values = parseJsonArray<number>(activity.monthlyTrackingValues, []);
    const total = values.slice(0, 12).reduce((sum, value) => sum + numberValue(value), 0);
    return progressFromValues(start, target, total);
  }

  if (trackingType === "mensual_promedio") {
    const values = parseJsonArray<number>(activity.monthlyTrackingValues, []);
    const registered = values
      .slice(0, 12)
      .map(value => numberValue(value))
      .filter(value => value !== 0);
    const average =
      registered.length > 0
        ? registered.reduce((sum, value) => sum + value, 0) / registered.length
        : 0;
    return progressFromValues(start, target, average);
  }

  const current = numberValue(activity.trackingCurrentValue, legacyPercentage);
  return progressFromValues(start, target, current);
}

export function getActivityTrackingSummary(activity: Record<string, unknown>): string {
  const type = normalizeTrackingType(activity.trackingType);
  if (type === "puntual") return "Puntual (valor directo)";
  if (type === "mensual_sumatoria") return "Mensual sumatoria (12 meses)";
  if (type === "mensual_promedio") return "Mensual promedio (12 meses)";
  return "Lista de verificación mensual";
}

export function getCompletedOccurrenceDates(activity: Record<string, unknown>): string[] {
  return parseJsonArray<string>(activity.completedOccurrenceDates, []).filter(value =>
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  );
}

/**
 * Genera las fechas reales que el Cronograma debe mostrar. Para recurrencias se
 * limita a 400 eventos para impedir que un registro accidental bloquee la vista.
 */
export function getActivityOccurrences(
  activity: Record<string, unknown>,
  maxOccurrences = 400
): ActivityOccurrence[] {
  const scheduleType = normalizeScheduleType(activity.scheduleType);
  const startText = dateOnly(activity.scheduleStartDate) || dateOnly(activity.dueDate);
  const endText =
    scheduleType === "once"
      ? startText
      : dateOnly(activity.scheduleEndDate);
  const start = toDateValue(startText);
  const end = toDateValue(endText);
  if (!start || !end || start > end) return [];

  const completedDates = new Set(getCompletedOccurrenceDates(activity));
  const occurrences: string[] = [];

  if (scheduleType === "once") {
    occurrences.push(formatDate(start));
  } else if (scheduleType === "weekly") {
    const requestedWeekday = numberValue(activity.scheduleWeekday, start.getDay());
    const weekday = requestedWeekday >= 0 && requestedWeekday <= 6
      ? requestedWeekday
      : start.getDay();
    const cursor = new Date(start);
    while (cursor.getDay() !== weekday) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= end && occurrences.length < maxOccurrences) {
      occurrences.push(formatDate(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    const requestedDay = numberValue(activity.scheduleDayOfMonth, start.getDate());
    const dayOfMonth = Math.max(1, Math.min(31, requestedDay));
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0);
    while (cursor <= end && occurrences.length < maxOccurrences) {
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(dayOfMonth, lastDay), 12, 0, 0);
      if (occurrence >= start && occurrence <= end) occurrences.push(formatDate(occurrence));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const directCompletion = calculateActivityProgress(activity) >= 100;
  return occurrences.map(date => ({
    date,
    completed:
      scheduleType === "once"
        ? directCompletion || completedDates.has(date)
        : completedDates.has(date),
  }));
}

export function getActivityScheduleSummary(activity: Record<string, unknown>): string {
  const type = normalizeScheduleType(activity.scheduleType);
  const start = dateOnly(activity.scheduleStartDate) || dateOnly(activity.dueDate);
  const end = dateOnly(activity.scheduleEndDate);
  if (type === "once") return start ? `Puntual: ${start}` : "Sin fecha programada";
  if (type === "weekly") {
    const weekday = numberValue(activity.scheduleWeekday, 1);
    const day = DAY_NAMES[weekday] || DAY_NAMES[1];
    return `Semanal (${day})${start ? `, desde ${start}` : ""}${end ? ` hasta ${end}` : ""}`;
  }
  const day = numberValue(activity.scheduleDayOfMonth, 1);
  return `Mensual (día ${day})${start ? `, desde ${start}` : ""}${end ? ` hasta ${end}` : ""}`;
}

export function asActivityView<T extends Record<string, unknown>>(activity: T) {
  const occurrences = getActivityOccurrences(activity);
  const occurrenceCompleted = occurrences.filter(item => item.completed).length;
  const hasTrackingData =
    activity.trackingType !== null && activity.trackingType !== undefined;
  const progress = calculateActivityProgress(activity);
  return {
    ...activity,
    dueDate: dateOnly(activity.dueDate),
    scheduleStartDate: dateOnly(activity.scheduleStartDate),
    scheduleEndDate: dateOnly(activity.scheduleEndDate),
    validFrom: dateOnly(activity.validFrom),
    validUntil: dateOnly(activity.validUntil),
    trackingType: normalizeTrackingType(activity.trackingType),
    trackingStartValue: hasTrackingData ? activity.trackingStartValue : "0",
    trackingTargetValue: hasTrackingData ? activity.trackingTargetValue : "100",
    trackingCurrentValue: hasTrackingData
      ? activity.trackingCurrentValue
      : String(progress),
    trackingUnit: activity.trackingUnit || "%",
    progress,
    isCompleted: progress >= 100,
    trackingSummary: getActivityTrackingSummary(activity),
    scheduleSummary: getActivityScheduleSummary(activity),
    occurrences,
    occurrenceCompleted,
    occurrenceTotal: occurrences.length,
  };
}
