import { and, asc, desc, eq } from "drizzle-orm";
import {
  strategicObjectives,
  strategicObjectiveMeasurementConfigs,
  strategicObjectiveMeasurements,
  type StrategicObjective,
  type StrategicObjectiveMeasurementConfigRow,
  type StrategicObjectiveMeasurementRow,
} from "../../drizzle/schema";
import {
  calculateStrategicObjectiveProgress,
  isStrategicMeasurementConfigured,
  type StrategicMeasuredObjective,
  type StrategicMeasurement,
  type StrategicMeasurementConfig,
} from "../../shared/strategicObjectiveMeasurement";
import type { getDb } from "../db";

export type StrategicMeasurementDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type StrategicMeasurementTransaction = Parameters<Parameters<StrategicMeasurementDb["transaction"]>[0]>[0];
export type StrategicMeasurementReader = StrategicMeasurementDb | StrategicMeasurementTransaction;

/** Strict calendar date validation, without Date's silent day/month rollover. */
export function isValidStrategicMeasurementDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1000-01-01") return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function strategicMeasurementToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function toStrategicMeasurementConfig(row: StrategicObjectiveMeasurementConfigRow): StrategicMeasurementConfig {
  return {
    initialSituation: row.initialSituation,
    expectedResult: row.expectedResult,
    indicator: row.indicator,
    weight: row.weight,
    baseline: row.baseline,
    goal: row.goal,
    unit: row.unit,
    deadline: row.deadline,
  };
}

export function toStrategicMeasurement(row: StrategicObjectiveMeasurementRow): StrategicMeasurement {
  return {
    id: row.id,
    objectiveId: row.objectiveId,
    measurementDate: row.measurementDate,
    value: row.value,
    observation: row.observation,
    evidence: row.evidence,
    // Historical progress is persisted against the definition used that day.
    percent: row.percent,
  };
}

export function toStrategicMeasuredObjective(
  row: StrategicObjective,
  config: StrategicMeasurementConfig | null,
  latestMeasurement: StrategicMeasurement | null,
): StrategicMeasuredObjective {
  const percent = calculateStrategicObjectiveProgress(config, latestMeasurement?.value);
  const configured = isStrategicMeasurementConfigured(config);
  return {
    id: row.id,
    objective: row.objective,
    name: row.objective,
    description: row.description || "",
    target: row.target || "",
    responsible: row.generalManagerName || "",
    // Keep the exact existing derivation only when there is no measurement config.
    deadline: config ? config.deadline : new Date(row.startYear, 0, 1).toISOString().split("T")[0],
    orderIndex: row.orderIndex,
    measurementConfig: config,
    measurementStatus: !configured ? "pending_configuration" : percent === null ? "unmeasured" : "measured",
    percent,
    latestMeasurement,
  };
}

/** Only OE rows are loaded here. OTE/FODA data is deliberately never imported. */
export async function getStrategicMeasuredObjectives(
  db: StrategicMeasurementReader,
  companyId: number,
): Promise<StrategicMeasuredObjective[]> {
  const objectives = await db.select().from(strategicObjectives)
    .where(eq(strategicObjectives.companyId, companyId))
    .orderBy(asc(strategicObjectives.orderIndex), asc(strategicObjectives.id));
  if (objectives.length === 0) return [];
  const configs = await db.select().from(strategicObjectiveMeasurementConfigs)
    .where(eq(strategicObjectiveMeasurementConfigs.companyId, companyId));
  const measurements = await db.select().from(strategicObjectiveMeasurements)
    .where(eq(strategicObjectiveMeasurements.companyId, companyId))
    .orderBy(desc(strategicObjectiveMeasurements.measurementDate), desc(strategicObjectiveMeasurements.id));
  const configByObjective = new Map(configs.map(row => [row.objectiveId, toStrategicMeasurementConfig(row)]));
  const latestByObjective = new Map<number, StrategicMeasurement>();
  for (const row of measurements) {
    if (!latestByObjective.has(row.objectiveId)) latestByObjective.set(row.objectiveId, toStrategicMeasurement(row));
  }
  return objectives.map(row => toStrategicMeasuredObjective(
    row, configByObjective.get(row.id) ?? null, latestByObjective.get(row.id) ?? null,
  ));
}

export async function getStrategicObjectiveMeasurementRows(
  db: StrategicMeasurementReader,
  companyId: number,
  objectiveId: number,
): Promise<StrategicMeasurement[]> {
  const rows = await db.select().from(strategicObjectiveMeasurements)
    .where(and(eq(strategicObjectiveMeasurements.companyId, companyId), eq(strategicObjectiveMeasurements.objectiveId, objectiveId)))
    .orderBy(desc(strategicObjectiveMeasurements.measurementDate), desc(strategicObjectiveMeasurements.id));
  return rows.map(toStrategicMeasurement);
}
