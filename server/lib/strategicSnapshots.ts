import cron from "node-cron";
import { eq } from "drizzle-orm";
import {
  companies,
  companyTrends,
  criticalityMatrix,
  processes,
  processTacticalObjectives,
  strategicObjectives,
} from "../../drizzle/schema";
import { getDb } from "../db";

export interface StrategicSnapshot {
  year: number;
  month: number;
  otePercent: number;
  otgPercent: number;
  stakeholderPercent: number;
  oteMeta: number;
  otgMeta: number;
  stakeholderMeta: number;
  oePercents: Record<string, number>;
}

function toNumber(value: unknown): number {
  const result = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(result) ? result : 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function monthlyValues(values: unknown): number[] {
  // Desempeño interpreta los seguimientos mensuales modernos como arrays 0-based.
  return Array.isArray(values) ? values.map(toNumber) : [];
}

/** Misma regla de cálculo utilizada por los módulos de Indicadores y Desempeño. */
export function calculateOTEPercent(planningData: any): number {
  const pointOfDeparture = toNumber(planningData?.puntoPartida);
  const target = toNumber(planningData?.metaLlegada);
  const progress = toNumber(planningData?.avanceMeta);
  const trackingType = planningData?.trackingType || "puntual";

  if (trackingType === "mensual_checklist") {
    const values = Array.isArray(planningData?.checklistValues) ? planningData.checklistValues : [];
    return clampPercent((values.filter(Boolean).length / 12) * 100);
  }

  if (trackingType === "mensual_sumatoria") {
    const total = monthlyValues(planningData?.monthlyValues).reduce((sum, value) => sum + value, 0);
    if (target === pointOfDeparture) return 0;
    return clampPercent(((total - pointOfDeparture) / (target - pointOfDeparture)) * 100);
  }

  if (trackingType === "mensual_promedio") {
    const values = monthlyValues(planningData?.monthlyValues).filter((value) => value !== 0);
    const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    if (target === pointOfDeparture) return 0;
    return clampPercent(((average - pointOfDeparture) / (target - pointOfDeparture)) * 100);
  }

  if (target === pointOfDeparture) return 0;
  return clampPercent(((progress - pointOfDeparture) / (target - pointOfDeparture)) * 100);
}

function calculateResultKeysPercent(resultKeys: any[]): number {
  if (!Array.isArray(resultKeys) || resultKeys.length === 0) return 0;
  const totalWeight = resultKeys.reduce((sum, rk) => sum + toNumber(rk?.ponderacion), 0);
  if (totalWeight > 0) {
    return clampPercent(resultKeys.reduce((sum, rk) => (
      sum + toNumber(rk?.porcentajeAlcanzado) * (toNumber(rk?.ponderacion) / totalWeight)
    ), 0));
  }
  return clampPercent(resultKeys.reduce((sum, rk) => sum + toNumber(rk?.porcentajeAlcanzado), 0) / resultKeys.length);
}

function calculateObjectivePercent(planningData: any): number {
  if (
    planningData?.trackingType ||
    planningData?.puntoPartida !== undefined ||
    planningData?.metaLlegada !== undefined
  ) {
    return calculateOTEPercent(planningData);
  }
  return calculateResultKeysPercent(Array.isArray(planningData?.resultKeys) ? planningData.resultKeys : []);
}

/** Calcula el estado actual de una empresa, incluido el porcentaje independiente de cada OE. */
export async function calculateCompanyStrategicSnapshot(companyId: number, date = new Date()): Promise<StrategicSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const companyProcesses = await db.select().from(processes).where(eq(processes.companyId, companyId));
  // Cada OTE se conserva con su OE textual; el agrupamiento final replica exactamente
  // la coincidencia flexible usada por Desempeño → Avance por OE.
  const allOTE: Array<{ percent: number; weight: number; strategicObjective: string }> = [];
  let stakeholderTotal = 0;

  for (const process of companyProcesses as any[]) {
    const objectives = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.processId, process.id));

    for (const objective of objectives as any[]) {
      try {
        const planningData = typeof objective.planningData === "string"
          ? JSON.parse(objective.planningData || "{}")
          : (objective.planningData || {});
        const percent = calculateObjectivePercent(planningData);
        const weight = toNumber(planningData.ponderacion);
        const oeName = String(objective.strategicObjective || "Sin OE").trim() || "Sin OE";

        allOTE.push({ percent, weight, strategicObjective: oeName });
      } catch {
        // Se omite únicamente el OTE con datos no legibles; los demás siguen contabilizándose.
      }
    }

    const criticalityRows = await db
      .select()
      .from(criticalityMatrix)
      .where(eq(criticalityMatrix.processId, process.id));
    if (criticalityRows.length > 0) {
      const implemented = (criticalityRows as any[]).filter((row) => row.implementationStatus === true || row.implementationStatus === 1).length;
      stakeholderTotal += (implemented / criticalityRows.length) * 100;
    }
  }

  const totalWeight = allOTE.reduce((sum, item) => sum + item.weight, 0);
  const otePercent = totalWeight > 0
    ? clampPercent(allOTE.reduce((sum, item) => sum + item.percent * (item.weight / totalWeight), 0))
    : (allOTE.length > 0 ? clampPercent(allOTE.reduce((sum, item) => sum + item.percent, 0) / allOTE.length) : 0);

  const oeList = await db
    .select()
    .from(strategicObjectives)
    .where(eq(strategicObjectives.companyId, companyId));
  const oePercents: Record<string, number> = {};

  for (let index = 0; index < oeList.length; index++) {
    const oe = oeList[index];
    const oeLabel = oe.objective || `OE ${index + 1}`;
    const normalizedLabel = oeLabel.toLowerCase().trim();
    const matchingOTE = allOTE.filter((item) => {
      const normalizedObjective = (item.strategicObjective || "").toLowerCase().trim();
      return normalizedObjective === normalizedLabel
        || normalizedObjective.includes(normalizedLabel.slice(0, 20))
        || normalizedLabel.includes(normalizedObjective.slice(0, 20));
    });
    const oeWeight = matchingOTE.reduce((sum, item) => sum + item.weight, 0);
    oePercents[oeLabel] = oeWeight > 0
      ? clampPercent(matchingOTE.reduce((sum, item) => sum + item.percent * (item.weight / oeWeight), 0))
      : (matchingOTE.length > 0 ? clampPercent(matchingOTE.reduce((sum, item) => sum + item.percent, 0) / matchingOTE.length) : 0);
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    otePercent,
    otgPercent: 0,
    stakeholderPercent: companyProcesses.length > 0 ? clampPercent(stakeholderTotal / companyProcesses.length) : 0,
    oteMeta: 100,
    otgMeta: 100,
    stakeholderMeta: 100,
    oePercents,
  };
}

/** Guarda el estado de un mes; si ya existe, actualiza el mismo registro sin duplicarlo. */
export async function saveCompanyStrategicSnapshot(companyId: number, date = new Date()): Promise<StrategicSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const snapshot = await calculateCompanyStrategicSnapshot(companyId, date);
  await db
    .insert(companyTrends)
    .values({
      companyId,
      year: snapshot.year,
      month: snapshot.month,
      otePercent: String(snapshot.otePercent),
      otgPercent: String(snapshot.otgPercent),
      stakeholderPercent: String(snapshot.stakeholderPercent),
      oteMeta: String(snapshot.oteMeta),
      otgMeta: String(snapshot.otgMeta),
      stakeholderMeta: String(snapshot.stakeholderMeta),
      oePercentsJson: JSON.stringify(snapshot.oePercents),
    } as any)
    .onDuplicateKeyUpdate({
      set: {
        otePercent: String(snapshot.otePercent),
        otgPercent: String(snapshot.otgPercent),
        stakeholderPercent: String(snapshot.stakeholderPercent),
        oteMeta: String(snapshot.oteMeta),
        otgMeta: String(snapshot.otgMeta),
        stakeholderMeta: String(snapshot.stakeholderMeta),
        oePercentsJson: JSON.stringify(snapshot.oePercents),
        updatedAt: new Date(),
      } as any,
    });

  return snapshot;
}

export async function saveSnapshotsForAllCompanies(date = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[StrategicSnapshots] Base de datos no disponible, omitiendo snapshot mensual.");
    return;
  }

  const allCompanies = await db.select({ id: companies.id }).from(companies);
  for (const company of allCompanies) {
    try {
      await saveCompanyStrategicSnapshot(company.id, date);
      console.log(`[StrategicSnapshots] Snapshot guardado: empresa ${company.id}, ${date.getFullYear()}-${date.getMonth() + 1}.`);
    } catch (error) {
      console.error(`[StrategicSnapshots] Error al guardar snapshot para empresa ${company.id}:`, error);
    }
  }
}

/** Registra un cierre automático el día 1 de cada mes a las 00:05 (Ecuador). */
export function registerStrategicSnapshotsCron(): void {
  cron.schedule("5 0 1 * *", () => {
    saveSnapshotsForAllCompanies().catch((error) => {
      console.error("[StrategicSnapshots] Error en cron mensual:", error);
    });
  }, { timezone: "America/Guayaquil" });
  console.log("[StrategicSnapshots] Cron mensual registrado: día 1, 00:05 (Ecuador).");
}
