import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { assertCompanyRecordManagementAccess, assertCompanyRecordReadAccess } from "../_core/companyPermissions";
import { getDb } from "../db";
import { policies, policyObjectives } from "../../drizzle/schema";
import { eq, or } from "drizzle-orm";

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
