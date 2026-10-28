export type StakeholderActionProgressRow = {
  id?: number | string | null;
  stakeholderId?: number | string | null;
  createdAt?: Date | string | null;
  actionToTake?: string | null;
  implementationStatus?: boolean | number | string | null;
};

export type StakeholderActionProgress = {
  /** Partes interesadas únicas que tienen registro de criticidad. */
  total: number;
  /** Registros con una acción de mejora realmente planificada. */
  planned: number;
  /** Acciones planificadas marcadas como realizadas. */
  completed: number;
  /** `null` cuando aún no existe ninguna acción planificada. */
  percentage: number | null;
};

function comparableDate(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isCompleted(value: StakeholderActionProgressRow["implementationStatus"]): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "SI" || value === "Si";
}

/**
 * Conserva únicamente el registro más reciente de cada parte interesada.
 * Existen datos históricos que pueden contener duplicados; el indicador no
 * debe contarlos más de una vez.
 */
export function latestStakeholderActionRows<T extends StakeholderActionProgressRow>(rows: readonly T[]): T[] {
  const latestByStakeholder = new Map<string, T>();

  rows.forEach((row, index) => {
    const key = row.stakeholderId ?? row.id ?? `row-${index}`;
    const existing = latestByStakeholder.get(String(key));
    if (!existing || comparableDate(row.createdAt) > comparableDate(existing.createdAt)) {
      latestByStakeholder.set(String(key), row);
    }
  });

  return Array.from(latestByStakeholder.values());
}

/**
 * Calcula el avance de Gestión con Partes Interesadas.
 * Solo las filas con texto en “Acción a tomar” forman parte del indicador.
 */
export function calculateStakeholderActionProgress(
  rows: readonly StakeholderActionProgressRow[]
): StakeholderActionProgress {
  const uniqueRows = latestStakeholderActionRows(rows);
  const plannedRows = uniqueRows.filter(row => Boolean(row.actionToTake?.trim()));
  const completed = plannedRows.filter(row => isCompleted(row.implementationStatus)).length;

  return {
    total: uniqueRows.length,
    planned: plannedRows.length,
    completed,
    percentage: plannedRows.length > 0 ? Math.round((completed / plannedRows.length) * 100) : null,
  };
}
