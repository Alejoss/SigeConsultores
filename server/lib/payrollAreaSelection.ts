export type PayrollAreaSelection =
  | { mode: "none" }
  | { mode: "all" }
  | { mode: "selected"; areas: string[] };

type PersistedPayrollAreaSelection =
  | { mode: "all" }
  | { mode: "selected"; areas: string[] };

/** Normaliza nombres para comparar áreas sin distinguir tildes, mayúsculas ni separadores. */
export const normalizePayrollArea = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export const samePayrollArea = (
  left: string | null | undefined,
  right: string | null | undefined
) => {
  const leftKey = normalizePayrollArea(left);
  const rightKey = normalizePayrollArea(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
};

export function parsePayrollAreaSelection(
  value: string | null | undefined
): PayrollAreaSelection | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("mode" in parsed))
      return null;
    const candidate = parsed as { mode?: unknown; areas?: unknown };
    if (candidate.mode === "all") return { mode: "all" };
    if (
      candidate.mode === "selected" &&
      Array.isArray(candidate.areas) &&
      candidate.areas.length > 0 &&
      candidate.areas.every(area => typeof area === "string")
    ) {
      return { mode: "selected", areas: candidate.areas };
    }
  } catch {
    // Un valor histórico corrupto nunca concede acceso a trabajadores.
  }

  return null;
}

/**
 * Resuelve la selección efectiva sin reescribir la columna histórica payrollArea.
 * El valor único previo solo se usa cuando aún no existe una selección nueva válida.
 */
export function resolvePayrollAreaSelection(
  payrollAreaSelection: string | null | undefined,
  legacyPayrollArea: string | null | undefined
): PayrollAreaSelection {
  const persisted = parsePayrollAreaSelection(payrollAreaSelection);
  if (persisted) return persisted;

  const legacy = legacyPayrollArea?.trim();
  return legacy ? { mode: "selected", areas: [legacy] } : { mode: "none" };
}

export function serializePayrollAreaSelection(
  selection: Exclude<PayrollAreaSelection, { mode: "none" }>
): string {
  const persisted: PersistedPayrollAreaSelection =
    selection.mode === "all"
      ? { mode: "all" }
      : { mode: "selected", areas: selection.areas };
  return JSON.stringify(persisted);
}

export function isPayrollAreaEligible(
  selection: PayrollAreaSelection,
  area: string | null | undefined
): boolean {
  if (selection.mode === "all") return Boolean(normalizePayrollArea(area));
  if (selection.mode !== "selected") return false;
  return selection.areas.some(selected => samePayrollArea(selected, area));
}

/**
 * Convierte nombres recibidos de la interfaz en nombres canónicos de Nómina,
 * conservando el orden de selección y eliminando ambigüedades de tildes/caso.
 */
export function canonicalizePayrollAreas(
  requestedAreas: string[],
  activeAreas: string[]
): string[] {
  const canonicalByKey = new Map<string, string>();
  for (const area of activeAreas) {
    const trimmed = area.trim();
    const key = normalizePayrollArea(trimmed);
    if (key && !canonicalByKey.has(key)) canonicalByKey.set(key, trimmed);
  }

  const selectedKeys = new Set<string>();
  const canonical: string[] = [];
  for (const requested of requestedAreas) {
    const key = normalizePayrollArea(requested);
    if (!key) throw new Error("Selecciona áreas de Nómina válidas.");
    if (selectedKeys.has(key)) {
      throw new Error("No repitas una misma área de Nómina en la selección.");
    }
    const area = canonicalByKey.get(key);
    if (!area) {
      throw new Error(
        "Selecciona únicamente áreas activas existentes en Nómina."
      );
    }
    selectedKeys.add(key);
    canonical.push(area);
  }

  return canonical;
}
