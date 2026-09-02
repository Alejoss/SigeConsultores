import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audits, inspections, linkedCommitments, operationalFindings } from "../../drizzle/schema";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { companyProcedure, router } from "../_core/trpc";
import {
  ensureOperationalFindingBaseline,
  findingClassifications,
  linkedSourceTypeForFinding,
  synchronizeOperationalFindingSummary,
  type FindingSourceType,
} from "../lib/operationalFindings";

const sourceTypeSchema = z.enum(["audit", "inspection"]);
const classificationSchema = z.enum(findingClassifications);
const isoDateSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.literal(""),
]);

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function assertManagementAccess(ctx: TrpcContext, companyId: number) {
  if (ctx.user?.role === "admin" || ctx.manager?.companyId === companyId) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Solo el Gerente de la empresa o el Administrador pueden gestionar hallazgos.",
  });
}

function asDate(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function displayDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function classificationLabel(value: z.infer<typeof classificationSchema>) {
  return {
    major_nc: "No conformidad mayor",
    minor_nc: "No conformidad menor",
    observation: "Observación",
    improvement_opportunity: "Oportunidad de mejora",
  }[value];
}

async function assertSource(db: Db, companyId: number, sourceType: FindingSourceType, sourceId: number) {
  if (sourceType === "audit") {
    const [source] = await db
      .select({ id: audits.id })
      .from(audits)
      .where(and(eq(audits.id, sourceId), eq(audits.companyId, companyId)))
      .limit(1);
    if (source) return;
  } else {
    const [source] = await db
      .select({ id: inspections.id })
      .from(inspections)
      .where(and(eq(inspections.id, sourceId), eq(inspections.companyId, companyId)))
      .limit(1);
    if (source) return;
  }
  throw new TRPCError({
    code: "NOT_FOUND",
    message: sourceType === "audit" ? "La auditoría no existe en esta empresa." : "La inspección o simulacro no existe en esta empresa.",
  });
}

async function findFinding(db: Db, companyId: number, id: number) {
  const [finding] = await db
    .select()
    .from(operationalFindings)
    .where(and(eq(operationalFindings.id, id), eq(operationalFindings.companyId, companyId)))
    .limit(1);
  if (!finding) throw new TRPCError({ code: "NOT_FOUND", message: "Hallazgo no encontrado." });
  return finding;
}

async function activeLinks(db: Db, companyId: number, finding: { id: number; sourceType: FindingSourceType }) {
  return db
    .select({ id: linkedCommitments.id })
    .from(linkedCommitments)
    .where(
      and(
        eq(linkedCommitments.companyId, companyId),
        eq(linkedCommitments.sourceType, linkedSourceTypeForFinding(finding.sourceType)),
        eq(linkedCommitments.sourceId, finding.id),
        eq(linkedCommitments.sourceSubId, finding.id)
      )
    );
}

async function synchronizeLinkedMetadata(
  db: Db,
  companyId: number,
  finding: {
    id: number;
    sourceType: FindingSourceType;
    classification: z.infer<typeof classificationSchema>;
    finding: string;
    closureTask: string;
    referenceResponsible: string | null;
    targetDate: unknown;
  }
) {
  await db
    .update(linkedCommitments)
    .set({
      title: finding.closureTask.slice(0, 500),
      description: `${classificationLabel(finding.classification)} — ${finding.finding}`,
      dueDate: finding.targetDate ? new Date(`${displayDate(finding.targetDate)}T00:00:00.000Z`) : null,
      referenceResponsible: finding.referenceResponsible,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(linkedCommitments.companyId, companyId),
        eq(linkedCommitments.sourceType, linkedSourceTypeForFinding(finding.sourceType)),
        eq(linkedCommitments.sourceId, finding.id),
        eq(linkedCommitments.sourceSubId, finding.id)
      )
    );
}

export const operationalFindingsRouter = router({
  list: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), sourceType: sourceTypeSchema, sourceId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      await assertSource(db, input.companyId, input.sourceType, input.sourceId);
      return db
        .select()
        .from(operationalFindings)
        .where(and(
          eq(operationalFindings.companyId, input.companyId),
          eq(operationalFindings.sourceType, input.sourceType),
          eq(operationalFindings.sourceId, input.sourceId)
        ))
        .orderBy(asc(operationalFindings.orderIndex), asc(operationalFindings.createdAt));
    }),

  create: companyProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      sourceType: sourceTypeSchema,
      sourceId: z.number().int().positive(),
      classification: classificationSchema,
      finding: z.string().trim().min(1).max(500000),
      closureTask: z.string().trim().min(1).max(500000),
      referenceResponsible: z.string().trim().max(255).optional(),
      targetDate: isoDateSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      await assertSource(db, input.companyId, input.sourceType, input.sourceId);
      await ensureOperationalFindingBaseline(db, input.companyId, input.sourceType, input.sourceId);
      const [last] = await db
        .select({ orderIndex: operationalFindings.orderIndex })
        .from(operationalFindings)
        .where(and(
          eq(operationalFindings.companyId, input.companyId),
          eq(operationalFindings.sourceType, input.sourceType),
          eq(operationalFindings.sourceId, input.sourceId)
        ))
        .orderBy(desc(operationalFindings.orderIndex))
        .limit(1);
      const result = await db.insert(operationalFindings).values({
        companyId: input.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        classification: input.classification,
        finding: input.finding,
        closureTask: input.closureTask,
        referenceResponsible: input.referenceResponsible || null,
        targetDate: asDate(input.targetDate),
        orderIndex: (last?.orderIndex ?? -1) + 1,
      });
      await synchronizeOperationalFindingSummary(db, input.companyId, input.sourceType, input.sourceId);
      return { id: Number(result[0].insertId) };
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      classification: classificationSchema.optional(),
      finding: z.string().trim().min(1).max(500000).optional(),
      closureTask: z.string().trim().min(1).max(500000).optional(),
      referenceResponsible: z.string().trim().max(255).nullable().optional(),
      targetDate: isoDateSchema.optional(),
      completed: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      const current = await findFinding(db, input.companyId, input.id);
      const links = await activeLinks(db, input.companyId, current);
      if (input.completed !== undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El cierre del hallazgo se confirma únicamente desde el proceso responsable vinculado.",
        });
      }
      const updateData: Record<string, unknown> = {};
      if (input.classification !== undefined) updateData.classification = input.classification;
      if (input.finding !== undefined) updateData.finding = input.finding;
      if (input.closureTask !== undefined) updateData.closureTask = input.closureTask;
      if (input.referenceResponsible !== undefined) updateData.referenceResponsible = input.referenceResponsible || null;
      if (input.targetDate !== undefined) updateData.targetDate = asDate(input.targetDate);
      if (input.completed !== undefined) {
        updateData.completed = input.completed;
        updateData.completedAt = input.completed ? new Date() : null;
      }
      if (!Object.keys(updateData).length) return { success: true };
      await db.update(operationalFindings).set(updateData).where(eq(operationalFindings.id, current.id));
      const updated = await findFinding(db, input.companyId, current.id);
      if (links.length) await synchronizeLinkedMetadata(db, input.companyId, updated as typeof updated & { sourceType: FindingSourceType; classification: z.infer<typeof classificationSchema> });
      await synchronizeOperationalFindingSummary(db, input.companyId, current.sourceType as FindingSourceType, current.sourceId);
      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      const finding = await findFinding(db, input.companyId, input.id);
      if ((await activeLinks(db, input.companyId, finding)).length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No puede eliminar un hallazgo que tiene procesos vinculados.",
        });
      }
      await db.delete(operationalFindings).where(eq(operationalFindings.id, finding.id));
      await synchronizeOperationalFindingSummary(db, input.companyId, finding.sourceType as FindingSourceType, finding.sourceId);
      return { success: true };
    }),
});
