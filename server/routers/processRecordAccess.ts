import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { processTrainings, processScheduleActivities, processIndicators, processTacticalObjectives, companyCompliances } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { assertProcessAccessById, assertCompanyManagementAccess } from "../_core/companyPermissions";
import { getDb } from "../db";

/** Resolve only ownership before querying/mutating a legacy ID-only record. */
export async function assertLegacyProcessRecordAccess(
  ctx: TrpcContext,
  source: "training" | "schedule" | "indicator",
  recordId: number,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  const table = source === "training" ? processTrainings : source === "schedule" ? processScheduleActivities : processIndicators;
  const [row] = await db.select({ processId: table.processId }).from(table).where(eq(table.id, recordId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Registro del proceso no encontrado." });
  await assertProcessAccessById(ctx, row.processId);
  return row.processId;
}

/** A writable process cannot smuggle references to another process's objective. */
export async function assertLegacyTacticalObjectiveReference(processId: number, objectiveId?: number) {
  if (objectiveId === undefined) return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  const [row] = await db.select({ id: processTacticalObjectives.id }).from(processTacticalObjectives)
    .where(and(eq(processTacticalObjectives.id, objectiveId), eq(processTacticalObjectives.processId, processId))).limit(1);
  if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "El objetivo no pertenece al proceso autorizado." });
}

export async function assertLegacyCompanyComplianceManagementAccess(ctx: TrpcContext, recordId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  const [row] = await db.select({ companyId: companyCompliances.companyId }).from(companyCompliances)
    .where(eq(companyCompliances.id, recordId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cumplimiento no encontrado." });
  await assertCompanyManagementAccess(ctx, row.companyId);
}
