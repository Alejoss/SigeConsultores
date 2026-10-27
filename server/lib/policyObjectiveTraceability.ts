import { calculateOtgProgress } from "./otgProgress";

type UnknownRecord = Record<string, unknown>;

export type TraceabilityLinkSource = "id" | "legacy_text";

export type PolicyObjectiveReference = {
  id: number;
  objective: string;
  description?: string | null;
};

export type TraceabilityProcess = {
  id: number;
  name: string;
};

export type PolicyObjectiveApplicability = {
  policyObjectiveId: number;
  processId: number;
  status: "not_applicable";
  justification: string;
  confirmedByName: string | null;
  confirmedByEmail: string | null;
  confirmedAt: Date | string | null;
};

export type PolicyObjectiveTraceabilityInput = {
  objectives: PolicyObjectiveReference[];
  processes: TraceabilityProcess[];
  fodaRecords: Array<{
    processId: number;
    strengths?: string | null;
    opportunities?: string | null;
    weaknesses?: string | null;
    threats?: string | null;
    matrixData?: string | null;
  }>;
  tacticalObjectives: Array<{
    id: number;
    processId: number;
    name: string | null;
    policyObjectiveId?: number | null;
    policyObjective?: string | null;
    planningData?: string | null;
  }>;
  applicability: PolicyObjectiveApplicability[];
};

export type PolicyObjectiveTraceability = ReturnType<
  typeof buildPolicyObjectiveTraceability
>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseArray(value: string | null | undefined): UnknownRecord[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return asArray(parsed)
      .map(asRecord)
      .filter((item): item is UnknownRecord => Boolean(item));
  } catch {
    return [];
  }
}

function parseRecord(value: string | null | undefined): UnknownRecord {
  if (!value) return {};
  try {
    return asRecord(JSON.parse(value)) ?? {};
  } catch {
    return {};
  }
}

function rangePercent(
  start: number,
  target: number,
  current: number
): number | null {
  if (target === start) return null;
  return clampPercent(((current - start) / (target - start)) * 100);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
}

function weightedAverage(
  values: Array<{ percent: number; weight: number | null }>
): number | null {
  if (values.length === 0) return null;
  const totalWeight = values.reduce(
    (sum, item) => sum + Math.max(0, item.weight ?? 0),
    0
  );
  if (totalWeight <= 0) return average(values.map(item => item.percent));
  return Math.round(
    values.reduce(
      (sum, item) =>
        sum + item.percent * (Math.max(0, item.weight ?? 0) / totalWeight),
      0
    )
  );
}

/**
 * Devuelve null cuando el OTE todavía no tiene una medición definida. De ese
 * modo un objetivo recién creado no reduce artificialmente el KPI corporativo.
 */
export function calculateTraceabilityOteProgress(
  planningData: unknown
): number | null {
  const planning =
    typeof planningData === "string"
      ? parseRecord(planningData)
      : (asRecord(planningData) ?? {});
  const trackingType = String(planning.trackingType ?? "puntual");
  const start = asNumber(planning.puntoPartida) ?? 0;
  const target = asNumber(planning.metaLlegada);

  if (
    trackingType === "mensual_checklist" &&
    Array.isArray(planning.checklistValues)
  ) {
    return clampPercent(
      (planning.checklistValues.filter(Boolean).length / 12) * 100
    );
  }

  if (target !== null) {
    if (trackingType === "mensual_sumatoria") {
      const current = asArray(planning.monthlyValues)
        .map(asNumber)
        .filter((value): value is number => value !== null)
        .reduce((sum, value) => sum + value, 0);
      return rangePercent(start, target, current);
    }

    if (trackingType === "mensual_promedio") {
      const values = asArray(planning.monthlyValues)
        .map(asNumber)
        .filter((value): value is number => value !== null && value !== 0);
      const current =
        values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0;
      return rangePercent(start, target, current);
    }

    return rangePercent(start, target, asNumber(planning.avanceMeta) ?? 0);
  }

  const resultKeyMetrics = asArray(planning.resultKeys)
    .map(asRecord)
    .filter((row): row is UnknownRecord => Boolean(row))
    .map(row => {
      const explicitPercent = asNumber(row.porcentajeAlcanzado);
      if (explicitPercent !== null) {
        return {
          percent: clampPercent(explicitPercent),
          weight: asNumber(row.ponderacion),
        };
      }
      const resultStart = asNumber(row.condicionInicial) ?? 0;
      const resultTarget = asNumber(row.meta);
      const resultCurrent = asNumber(row.condicionActual);
      if (resultTarget === null || resultCurrent === null) return null;
      const percent = rangePercent(resultStart, resultTarget, resultCurrent);
      return percent === null
        ? null
        : { percent, weight: asNumber(row.ponderacion) };
    })
    .filter((value): value is { percent: number; weight: number | null } =>
      Boolean(value)
    );

  return weightedAverage(resultKeyMetrics);
}

function hasOtgMeasurement(row: UnknownRecord): boolean {
  if (asArray(row.acciones).length > 0) return true;
  if (
    asNumber(row.porcentajeCumplimiento) !== null ||
    asNumber(row.porcentajeAlcanzadoOTG) !== null
  )
    return true;
  const start = asNumber(row.puntoPartida) ?? 0;
  const target = asNumber(row.puntoLlegada);
  return target !== null && target !== start;
}

function calculateTraceabilityOtgProgress(row: UnknownRecord): number | null {
  if (!hasOtgMeasurement(row)) return null;
  return calculateOtgProgress(row);
}

function resolveObjectiveReference(
  row: UnknownRecord,
  objectivesById: Map<number, PolicyObjectiveReference>,
  objectivesByText: Map<string, PolicyObjectiveReference[]>
): { objectiveId: number; linkSource: TraceabilityLinkSource } | null {
  const explicitId = asNumber(row.policyObjectiveId);
  if (explicitId !== null && objectivesById.has(explicitId)) {
    return { objectiveId: explicitId, linkSource: "id" };
  }

  const matches =
    objectivesByText.get(
      normalizeText(row.policyObjective ?? row.objetivoPolitica)
    ) ?? [];
  return matches.length === 1
    ? { objectiveId: matches[0].id, linkSource: "legacy_text" }
    : null;
}

/**
 * Construye la evidencia de cada Objetivo de la Política a partir de FODA/OTG y
 * OTE. Los textos históricos solo se vinculan si coinciden de forma única; si
 * existen textos duplicados no se asigna ninguna relación automáticamente.
 */
export function buildPolicyObjectiveTraceability(
  input: PolicyObjectiveTraceabilityInput
) {
  const objectivesById = new Map(
    input.objectives.map(objective => [objective.id, objective])
  );
  const objectivesByText = new Map<string, PolicyObjectiveReference[]>();
  for (const objective of input.objectives) {
    const key = normalizeText(objective.objective);
    if (!key) continue;
    objectivesByText.set(key, [
      ...(objectivesByText.get(key) ?? []),
      objective,
    ]);
  }

  type SourceEvidence = {
    foda: Array<{
      type: string;
      subprocess: string;
      statement: string;
      linkSource: TraceabilityLinkSource;
    }>;
    otg: Array<{
      id: string;
      name: string;
      progress: number | null;
      linkSource: TraceabilityLinkSource;
    }>;
    ote: Array<{
      id: number;
      name: string;
      progress: number | null;
      linkSource: TraceabilityLinkSource;
      weight: number | null;
    }>;
  };
  const sources = new Map<string, SourceEvidence>();
  const sourceKey = (objectiveId: number, processId: number) =>
    `${objectiveId}:${processId}`;
  const getSources = (
    objectiveId: number,
    processId: number
  ): SourceEvidence => {
    const key = sourceKey(objectiveId, processId);
    const current = sources.get(key);
    if (current) return current;
    const initial: SourceEvidence = { foda: [], otg: [], ote: [] };
    sources.set(key, initial);
    return initial;
  };

  for (const record of input.fodaRecords) {
    const fodaCollections: Array<[string, string | null | undefined]> = [
      ["Fortaleza", record.strengths],
      ["Oportunidad", record.opportunities],
      ["Debilidad", record.weaknesses],
      ["Amenaza", record.threats],
    ];
    for (const [type, serialized] of fodaCollections) {
      for (const item of parseArray(serialized)) {
        const reference = resolveObjectiveReference(
          item,
          objectivesById,
          objectivesByText
        );
        if (!reference) continue;
        getSources(reference.objectiveId, record.processId).foda.push({
          type,
          subprocess: String(item.subprocess ?? ""),
          statement: String(item.statement ?? ""),
          linkSource: reference.linkSource,
        });
      }
    }

    for (const row of parseArray(record.matrixData)) {
      const reference = resolveObjectiveReference(
        row,
        objectivesById,
        objectivesByText
      );
      if (!reference) continue;
      getSources(reference.objectiveId, record.processId).otg.push({
        id: String(row.id ?? ""),
        name: String(row.objetivoTactico ?? row.elemento ?? "OTG sin nombre"),
        progress: calculateTraceabilityOtgProgress(row),
        linkSource: reference.linkSource,
      });
    }
  }

  for (const objective of input.tacticalObjectives) {
    const reference = resolveObjectiveReference(
      objective as unknown as UnknownRecord,
      objectivesById,
      objectivesByText
    );
    if (!reference) continue;
    const planning = parseRecord(objective.planningData);
    getSources(reference.objectiveId, objective.processId).ote.push({
      id: objective.id,
      name: objective.name ?? "OTE sin nombre",
      progress: calculateTraceabilityOteProgress(planning),
      linkSource: reference.linkSource,
      weight: asNumber(planning.ponderacion),
    });
  }

  const applicabilityByKey = new Map(
    input.applicability.map(item => [
      sourceKey(item.policyObjectiveId, item.processId),
      item,
    ])
  );

  return input.objectives.map(objective => {
    const processDetails = input.processes.map(process => {
      const evidence = getSources(objective.id, process.id);
      const assessment =
        applicabilityByKey.get(sourceKey(objective.id, process.id)) ?? null;
      const otgProgress = average(
        evidence.otg
          .map(item => item.progress)
          .filter((progress): progress is number => progress !== null)
      );
      const oteProgress = weightedAverage(
        evidence.ote
          .filter(item => item.progress !== null)
          .map(item => ({
            percent: item.progress as number,
            weight: item.weight,
          }))
      );
      const kpi =
        otgProgress !== null && oteProgress !== null
          ? Math.round((otgProgress + oteProgress) / 2)
          : (otgProgress ?? oteProgress);
      const hasEvidence =
        evidence.foda.length > 0 ||
        evidence.otg.length > 0 ||
        evidence.ote.length > 0;
      const status: "not_applicable" | "covered" | "pending" = assessment
        ? "not_applicable"
        : hasEvidence
          ? "covered"
          : "pending";
      return {
        processId: process.id,
        processName: process.name,
        status,
        hasEvidence,
        foda: evidence.foda,
        otg: evidence.otg,
        ote: evidence.ote.map(({ weight: _weight, ...item }) => item),
        otgProgress,
        oteProgress,
        kpi,
        notApplicable: assessment
          ? {
              justification: assessment.justification,
              confirmedByName: assessment.confirmedByName,
              confirmedByEmail: assessment.confirmedByEmail,
              confirmedAt: assessment.confirmedAt,
            }
          : null,
      };
    });

    const applicableProcesses = processDetails.filter(
      process => process.status !== "not_applicable"
    );
    const coveredProcesses = applicableProcesses.filter(
      process => process.hasEvidence
    );
    const pendingProcesses = applicableProcesses.filter(
      process => !process.hasEvidence
    );
    const measuredProcesses = applicableProcesses.filter(
      process => process.kpi !== null
    );
    const otgMeasurements = applicableProcesses
      .map(process => process.otgProgress)
      .filter((value): value is number => value !== null);
    const oteMeasurements = applicableProcesses
      .map(process => process.oteProgress)
      .filter((value): value is number => value !== null);

    return {
      objectiveId: objective.id,
      objective: objective.objective,
      description: objective.description ?? null,
      summary: {
        totalProcesses: input.processes.length,
        applicableProcesses: applicableProcesses.length,
        notApplicableProcesses: processDetails.filter(
          process => process.status === "not_applicable"
        ).length,
        coveredProcesses: coveredProcesses.length,
        pendingProcesses: pendingProcesses.length,
        coveragePercentage:
          applicableProcesses.length > 0
            ? Math.round(
                (coveredProcesses.length / applicableProcesses.length) * 100
              )
            : 0,
        processesWithKpi: measuredProcesses.length,
        kpi: average(measuredProcesses.map(process => process.kpi as number)),
        otgProgress: average(otgMeasurements),
        oteProgress: average(oteMeasurements),
      },
      processes: processDetails,
    };
  });
}
