export interface CompanyComplianceProgressInput {
  evaluationMode?: "meses" | "vigencia" | string | null;
  plannedMonths?: string | null;
  completedMonths?: string | null;
  validUntil?: string | Date | null;
}

export interface VigenciaProgress {
  pct: number;
  status: "vigente" | "por_vencer" | "vencido" | "sin_fecha";
  daysLeft: number;
}

export interface CompanyComplianceSummary {
  totalCompliances: number;
  averageCompliance: number;
}

/** Convierte la lista persistida de meses en los números de mes válidos. */
export function parseComplianceMonths(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map(Number)
    .filter(month => month >= 1 && month <= 12);
}

/** Calcula el avance de un Cumplimiento programado por meses. */
export function calculateMonthsCompliancePercentage(
  plannedMonths: number[],
  completedMonths: number[]
): number {
  if (plannedMonths.length === 0) return 0;
  const fulfilled = completedMonths.filter(month => plannedMonths.includes(month)).length;
  return Math.round((fulfilled / plannedMonths.length) * 100);
}

/**
 * Calcula el avance y estado de un Cumplimiento controlado por vigencia.
 * El parámetro `today` permite pruebas deterministas sin alterar el cálculo visual.
 */
export function calculateVigenciaProgress(
  validUntil: string | Date | null | undefined,
  today = new Date()
): VigenciaProgress {
  if (!validUntil) return { pct: 0, status: "sin_fecha", daysLeft: 0 };

  const currentDay = new Date(today);
  currentDay.setHours(0, 0, 0, 0);
  const until = new Date(validUntil);
  until.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil(
    (until.getTime() - currentDay.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) return { pct: 0, status: "vencido", daysLeft };
  if (daysLeft <= 30) return { pct: 100, status: "por_vencer", daysLeft };
  return { pct: 100, status: "vigente", daysLeft };
}

/** Calcula el avance individual con la misma regla de Sistemas de Gestión. */
export function calculateCompanyCompliancePercentage(
  compliance: CompanyComplianceProgressInput,
  today?: Date
): number {
  if (compliance.evaluationMode === "vigencia") {
    return calculateVigenciaProgress(compliance.validUntil, today).pct;
  }

  return calculateMonthsCompliancePercentage(
    parseComplianceMonths(compliance.plannedMonths),
    parseComplianceMonths(compliance.completedMonths)
  );
}

/**
 * Resumen canónico de Cumplimientos corporativos. Debe usarse en toda pantalla
 * que muestre el indicador de Sistemas de Gestión.
 */
export function calculateCompanyComplianceSummary(
  compliances: CompanyComplianceProgressInput[],
  today?: Date
): CompanyComplianceSummary {
  const totalCompliances = compliances.length;
  if (totalCompliances === 0) {
    return { totalCompliances: 0, averageCompliance: 0 };
  }

  const totalPercentage = compliances.reduce(
    (sum, compliance) =>
      sum + calculateCompanyCompliancePercentage(compliance, today),
    0
  );

  return {
    totalCompliances,
    averageCompliance: Math.round(totalPercentage / totalCompliances),
  };
}
