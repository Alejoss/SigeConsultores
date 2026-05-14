import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { policies, policyObjectives } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const policiesRouter = router({
  get: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(policies)
        .where(eq(policies.companyId, input.companyId));

      return result.length > 0 ? result[0] : null;
    }),

  upsert: companyProcedure
    .input(z.object({
      companyId: z.number(),
      policyText: z.string(),
      versionNo: z.string().optional(),
      versionDate: z.date().optional(),
      generalManagerName: z.string().optional(),
      generalManagerCI: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(policies)
        .where(eq(policies.companyId, input.companyId));

      if (existing.length > 0) {
        await db.update(policies)
          .set({
            policyText: input.policyText,
            versionNo: input.versionNo || existing[0].versionNo,
            versionDate: input.versionDate || existing[0].versionDate,
            generalManagerName: input.generalManagerName || existing[0].generalManagerName,
            generalManagerCI: input.generalManagerCI || existing[0].generalManagerCI,
            updatedAt: new Date(),
          })
          .where(eq(policies.companyId, input.companyId));
      } else {
        await db.insert(policies).values({
          companyId: input.companyId,
          policyText: input.policyText,
          versionNo: input.versionNo || "1.0",
          versionDate: input.versionDate || new Date(),
          generalManagerName: input.generalManagerName || null,
          generalManagerCI: input.generalManagerCI || null,
        });
      }

      return { success: true, message: "Política guardada exitosamente" };
    }),

  // Policy Objectives
  listObjectives: companyProcedure
    .input(z.object({ policyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result = await db.select().from(policyObjectives)
        .where(eq(policyObjectives.policyId, input.policyId));

      return result;
    }),

  addObjective: companyProcedure
    .input(z.object({
      policyId: z.number(),
      objective: z.string(),
      orderIndex: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(policyObjectives).values({
        policyId: input.policyId,
        objective: input.objective,
        orderIndex: input.orderIndex,
      });

      return { success: true, message: "Objetivo agregado exitosamente" };
    }),

  deleteObjective: companyProcedure
    .input(z.object({ objectiveId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(policyObjectives)
        .where(eq(policyObjectives.id, input.objectiveId));

      return { success: true, message: "Objetivo eliminado" };
    }),
});
