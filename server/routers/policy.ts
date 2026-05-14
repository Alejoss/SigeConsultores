import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { policies } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const policyRouter = router({
  upsert: publicProcedure
    .input(z.object({
      companyId: z.number(),
      versionNo: z.string(),
      versionDate: z.string().optional(),
      policyText: z.string(),
      generalManagerName: z.string().optional(),
      generalManagerCI: z.string().optional(),
      electronicSignature: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(policies)
        .where(eq(policies.companyId, input.companyId));

      if (existing.length > 0) {
        await db.update(policies)
          .set({
            versionNo: input.versionNo,
            versionDate: input.versionDate ? new Date(input.versionDate) : null,
            policyText: input.policyText,
            generalManagerName: input.generalManagerName || null,
            generalManagerCI: input.generalManagerCI || null,
            electronicSignature: input.electronicSignature || null,
            updatedAt: new Date(),
          })
          .where(eq(policies.companyId, input.companyId));
      } else {
        await db.insert(policies).values({
          companyId: input.companyId,
          versionNo: input.versionNo,
          versionDate: input.versionDate ? new Date(input.versionDate) : null,
          policyText: input.policyText,
          generalManagerName: input.generalManagerName || null,
          generalManagerCI: input.generalManagerCI || null,
          electronicSignature: input.electronicSignature || null,
        });
      }

      return { success: true };
    }),

  get: publicProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(policies)
        .where(eq(policies.companyId, input.companyId));

      return result.length > 0 ? result[0] : null;
    }),
});
