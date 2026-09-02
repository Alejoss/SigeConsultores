import { and, eq } from "drizzle-orm";
import {
  audits,
  inspections,
  operationalFindingBaselines,
  operationalFindings,
} from "../../drizzle/schema";
import type { getDb } from "../db";

export const findingClassifications = [
  "major_nc",
  "minor_nc",
  "observation",
  "improvement_opportunity",
] as const;

export type FindingClassification = (typeof findingClassifications)[number];
export type FindingSourceType = "audit" | "inspection";
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type FindingTotals = {
  findingsMajorNC: number;
  findingsMinorNC: number;
  findingsObservations: number;
  findingsOM: number;
  closuresMajorNC: number;
  closuresMinorNC: number;
  closuresObservations: number;
  closuresOM: number;
};

function emptyTotals(): FindingTotals {
  return {
    findingsMajorNC: 0,
    findingsMinorNC: 0,
    findingsObservations: 0,
    findingsOM: 0,
    closuresMajorNC: 0,
    closuresMinorNC: 0,
    closuresObservations: 0,
    closuresOM: 0,
  };
}

function addFinding(totals: FindingTotals, finding: {
  classification: FindingClassification;
  completed: boolean;
}) {
  const closure = finding.completed ? 1 : 0;
  if (finding.classification === "major_nc") {
    totals.findingsMajorNC += 1;
    totals.closuresMajorNC += closure;
  } else if (finding.classification === "minor_nc") {
    totals.findingsMinorNC += 1;
    totals.closuresMinorNC += closure;
  } else if (finding.classification === "observation") {
    totals.findingsObservations += 1;
    totals.closuresObservations += closure;
  } else {
    totals.findingsOM += 1;
    totals.closuresOM += closure;
  }
}

function plus(left: FindingTotals, right: FindingTotals): FindingTotals {
  return {
    findingsMajorNC: left.findingsMajorNC + right.findingsMajorNC,
    findingsMinorNC: left.findingsMinorNC + right.findingsMinorNC,
    findingsObservations: left.findingsObservations + right.findingsObservations,
    findingsOM: left.findingsOM + right.findingsOM,
    closuresMajorNC: left.closuresMajorNC + right.closuresMajorNC,
    closuresMinorNC: left.closuresMinorNC + right.closuresMinorNC,
    closuresObservations: left.closuresObservations + right.closuresObservations,
    closuresOM: left.closuresOM + right.closuresOM,
  };
}

/** Captura una única base histórica antes de añadir el primer hallazgo detallado. */
export async function ensureOperationalFindingBaseline(
  db: Db,
  companyId: number,
  sourceType: FindingSourceType,
  sourceId: number
) {
  const [existing] = await db
    .select()
    .from(operationalFindingBaselines)
    .where(
      and(
        eq(operationalFindingBaselines.companyId, companyId),
        eq(operationalFindingBaselines.sourceType, sourceType),
        eq(operationalFindingBaselines.sourceId, sourceId)
      )
    )
    .limit(1);
  if (existing) return existing;

  if (sourceType === "audit") {
    const [audit] = await db
      .select()
      .from(audits)
      .where(and(eq(audits.id, sourceId), eq(audits.companyId, companyId)))
      .limit(1);
    if (!audit) throw new Error("La auditoría no existe en esta empresa.");
    await db.insert(operationalFindingBaselines).values({
      companyId,
      sourceType,
      sourceId,
      findingsMajorNC: audit.findingsMajorNC,
      findingsMinorNC: audit.findingsMinorNC,
      findingsObservations: audit.findingsObservations,
      findingsOM: audit.findingsOM,
      closuresMajorNC: audit.closuresMajorNC,
      closuresMinorNC: audit.closuresMinorNC,
      closuresObservations: audit.closuresObservations,
      closuresOM: audit.closuresOM,
    });
  } else {
    const [inspection] = await db
      .select()
      .from(inspections)
      .where(and(eq(inspections.id, sourceId), eq(inspections.companyId, companyId)))
      .limit(1);
    if (!inspection) throw new Error("La inspección no existe en esta empresa.");
    await db.insert(operationalFindingBaselines).values({
      companyId,
      sourceType,
      sourceId,
      findingsObservations: inspection.findings,
      closuresObservations: inspection.closures,
    });
  }

  const [created] = await db
    .select()
    .from(operationalFindingBaselines)
    .where(
      and(
        eq(operationalFindingBaselines.companyId, companyId),
        eq(operationalFindingBaselines.sourceType, sourceType),
        eq(operationalFindingBaselines.sourceId, sourceId)
      )
    )
    .limit(1);
  if (!created) throw new Error("No se pudo crear la base histórica de hallazgos.");
  return created;
}

/**
 * Recalcula el resumen operativo del origen. El histórico se resguarda para
 * consulta, pero deja de mezclarse con el indicador principal cuando existen
 * hallazgos detallados gestionados dentro de la plataforma.
 */
export async function synchronizeOperationalFindingSummary(
  db: Db,
  companyId: number,
  sourceType: FindingSourceType,
  sourceId: number
) {
  const [baseline] = await db
    .select()
    .from(operationalFindingBaselines)
    .where(
      and(
        eq(operationalFindingBaselines.companyId, companyId),
        eq(operationalFindingBaselines.sourceType, sourceType),
        eq(operationalFindingBaselines.sourceId, sourceId)
      )
    )
    .limit(1);
  if (!baseline) return;

  const details = await db
    .select({
      classification: operationalFindings.classification,
      completed: operationalFindings.completed,
    })
    .from(operationalFindings)
    .where(
      and(
        eq(operationalFindings.companyId, companyId),
        eq(operationalFindings.sourceType, sourceType),
        eq(operationalFindings.sourceId, sourceId)
      )
    );

  const detailed = emptyTotals();
  for (const detail of details) {
    addFinding(detailed, {
      classification: detail.classification as FindingClassification,
      completed: Boolean(detail.completed),
    });
  }
  // Un origen sin detalle conserva su histórico. En cuanto se registra el
  // primer hallazgo operativo, la tarjeta principal pasa a reflejar solamente
  // registros con trazabilidad y cierres confirmados por procesos.
  const summary = details.length > 0 ? detailed : baseline;

  if (sourceType === "audit") {
    await db
      .update(audits)
      .set({
        findingsMajorNC: summary.findingsMajorNC,
        findingsMinorNC: summary.findingsMinorNC,
        findingsObservations: summary.findingsObservations,
        findingsOM: summary.findingsOM,
        closuresMajorNC: summary.closuresMajorNC,
        closuresMinorNC: summary.closuresMinorNC,
        closuresObservations: summary.closuresObservations,
        closuresOM: summary.closuresOM,
      })
      .where(and(eq(audits.id, sourceId), eq(audits.companyId, companyId)));
  } else {
    const totalFindings =
      summary.findingsMajorNC +
      summary.findingsMinorNC +
      summary.findingsObservations +
      summary.findingsOM;
    const totalClosures =
      summary.closuresMajorNC +
      summary.closuresMinorNC +
      summary.closuresObservations +
      summary.closuresOM;
    await db
      .update(inspections)
      .set({ findings: totalFindings, closures: totalClosures })
      .where(and(eq(inspections.id, sourceId), eq(inspections.companyId, companyId)));
  }
}

export function linkedSourceTypeForFinding(sourceType: FindingSourceType) {
  return sourceType === "audit" ? "audit_finding" : "inspection_finding";
}
