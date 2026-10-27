import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { companyProcedure, companyReadProcedure, router } from "../_core/trpc";
import { assertCompanyRecordManagementAccess, assertCompanyRecordReadAccess } from "../_core/companyPermissions";
import { getDb } from "../db";
import {
  policies,
  policyObjectives,
  policyObjectiveProcessApplicability,
  processFODA,
  processes,
  processTacticalObjectives,
} from "../../drizzle/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { buildPolicyObjectiveTraceability } from "../lib/policyObjectiveTraceability";

async function listObjectivesForCompany(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number
) {
  const companyPolicies = await db
    .select({ id: policies.id })
    .from(policies)
    .where(eq(policies.companyId, companyId));
  const policyIds = companyPolicies.map(policy => policy.id);
  if (policyIds.length === 0) return [];

  return db
    .select()
    .from(policyObjectives)
    .where(
      or(
        inArray(policyObjectives.policyId, policyIds),
        // Registros históricos: antes se guardaba por error el ID de empresa.
        eq(policyObjectives.policyId, companyId)
      )
    )
    .orderBy(policyObjectives.orderIndex, policyObjectives.id);
}

function assertManagerConfirmation(ctx: {
  user: { role: string; name?: string | null; email?: string | null } | null;
  manager: { companyId: number; managerEmail: string } | null;
}, companyId: number) {
  if (ctx.user?.role === "admin" || ctx.manager?.companyId === companyId) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Solo Gerencia General o Administración puede confirmar que un objetivo no aplica a un proceso.",
  });
}

export const policyObjectivesRouter = router({
  list: companyProcedure
    .input(z.object({ policyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyRecordReadAccess(ctx, "policy", input.policyId);
      const db = await getDb();
      if (!db) return [];

      const [policy] = await db
        .select({ companyId: policies.companyId })
        .from(policies)
        .where(eq(policies.id, input.policyId))
        .limit(1);
      if (!policy) return [];

      const objectives = await db
        .select()
        .from(policyObjectives)
        .where(
          or(
            eq(policyObjectives.policyId, input.policyId),
            // Registros históricos: antes se guardaba por error el ID de empresa.
            eq(policyObjectives.policyId, policy.companyId)
          )
        )
        .orderBy(policyObjectives.orderIndex, policyObjectives.id);

      return objectives;
    }),

  /** Evidencia FODA/OTG/OTE por Objetivo de la Política para una empresa. */
  getTraceability: companyReadProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const objectives = await listObjectivesForCompany(db, input.companyId);
      const companyProcesses = await db
        .select({ id: processes.id, name: processes.name })
        .from(processes)
        .where(eq(processes.companyId, input.companyId));
      const processIds = companyProcesses.map(process => process.id);
      const objectiveIds = objectives.map(objective => objective.id);

      if (objectives.length === 0 || processIds.length === 0) {
        return buildPolicyObjectiveTraceability({
          objectives,
          processes: companyProcesses,
          fodaRecords: [],
          tacticalObjectives: [],
          applicability: [],
        });
      }

      // Si un entorno histórico tiene varias filas FODA, se lee la más reciente
      // por proceso sin borrar ni modificar ninguna fila existente.
      const allFoda = await db
        .select()
        .from(processFODA)
        .where(inArray(processFODA.processId, processIds));
      const latestFodaByProcess = new Map<number, (typeof allFoda)[number]>();
      for (const row of allFoda) {
        const previous = latestFodaByProcess.get(row.processId);
        const isNewer = !previous
          || row.updatedAt.getTime() > previous.updatedAt.getTime()
          || (row.updatedAt.getTime() === previous.updatedAt.getTime() && row.id > previous.id);
        if (isNewer) latestFodaByProcess.set(row.processId, row);
      }

      const [tacticalObjectives, applicability] = await Promise.all([
        db
          .select({
            id: processTacticalObjectives.id,
            processId: processTacticalObjectives.processId,
            name: processTacticalObjectives.name,
            policyObjectiveId: processTacticalObjectives.policyObjectiveId,
            policyObjective: processTacticalObjectives.policyObjective,
            planningData: processTacticalObjectives.planningData,
          })
          .from(processTacticalObjectives)
          .where(inArray(processTacticalObjectives.processId, processIds)),
        db
          .select({
            policyObjectiveId: policyObjectiveProcessApplicability.policyObjectiveId,
            processId: policyObjectiveProcessApplicability.processId,
            status: policyObjectiveProcessApplicability.status,
            justification: policyObjectiveProcessApplicability.justification,
            confirmedByName: policyObjectiveProcessApplicability.confirmedByName,
            confirmedByEmail: policyObjectiveProcessApplicability.confirmedByEmail,
            confirmedAt: policyObjectiveProcessApplicability.confirmedAt,
          })
          .from(policyObjectiveProcessApplicability)
          .where(
            and(
              eq(policyObjectiveProcessApplicability.companyId, input.companyId),
              inArray(policyObjectiveProcessApplicability.policyObjectiveId, objectiveIds)
            )
          ),
      ]);

      return buildPolicyObjectiveTraceability({
        objectives,
        processes: companyProcesses,
        fodaRecords: Array.from(latestFodaByProcess.values()),
        tacticalObjectives,
        applicability,
      });
    }),

  /** Registra o revoca una excepción explícita; nunca se infiere por falta de evidencia. */
  setProcessApplicability: companyProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      policyObjectiveId: z.number().int().positive(),
      processId: z.number().int().positive(),
      action: z.enum(["not_applicable", "reconsider"]),
      justification: z.string().trim().min(10).max(4000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertManagerConfirmation(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [objective, process] = await Promise.all([
        listObjectivesForCompany(db, input.companyId).then(objectives =>
          objectives.find(item => item.id === input.policyObjectiveId)
        ),
        db
          .select({ id: processes.id })
          .from(processes)
          .where(and(eq(processes.id, input.processId), eq(processes.companyId, input.companyId)))
          .limit(1),
      ]);
      if (!objective || !process[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "El objetivo o el proceso no pertenece a esta empresa." });
      }

      if (input.action === "reconsider") {
        await db
          .delete(policyObjectiveProcessApplicability)
          .where(
            and(
              eq(policyObjectiveProcessApplicability.companyId, input.companyId),
              eq(policyObjectiveProcessApplicability.policyObjectiveId, input.policyObjectiveId),
              eq(policyObjectiveProcessApplicability.processId, input.processId)
            )
          );
        return { success: true };
      }

      const justification = input.justification?.trim();
      if (!justification) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La justificación es obligatoria para marcar un objetivo como no aplicable." });
      }
      const confirmedByName = ctx.user?.role === "admin"
        ? (ctx.user.name || "Administración de plataforma")
        : "Gerencia General";
      const confirmedByEmail = ctx.user?.role === "admin"
        ? (ctx.user.email || null)
        : (ctx.manager?.managerEmail || null);
      const now = new Date();
      await db
        .insert(policyObjectiveProcessApplicability)
        .values({
          companyId: input.companyId,
          policyObjectiveId: input.policyObjectiveId,
          processId: input.processId,
          status: "not_applicable",
          justification,
          confirmedByName,
          confirmedByEmail,
          confirmedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            justification,
            confirmedByName,
            confirmedByEmail,
            confirmedAt: now,
            updatedAt: now,
          },
        });
      return { success: true };
    }),

  create: companyProcedure
    .input(z.object({
      policyId: z.number(),
      objective: z.string(),
      description: z.string().optional(),
      orderIndex: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyRecordManagementAccess(ctx, "policy", input.policyId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(policyObjectives).values({
        policyId: input.policyId,
        objective: input.objective,
        description: input.description || null,
        orderIndex: input.orderIndex,
      });

      return { success: true };
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      objective: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyRecordManagementAccess(ctx, "policyObjective", input.id);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(policyObjectives)
        .set({
          objective: input.objective,
          description: input.description || null,
        })
        .where(eq(policyObjectives.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyRecordManagementAccess(ctx, "policyObjective", input.id);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(policyObjectives)
        .where(eq(policyObjectives.id, input.id));

      return { success: true };
    }),
});
