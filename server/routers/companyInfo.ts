import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { companyInfo } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const companyInfoRouter = router({
  upsert: companyProcedure
    .input(z.object({
      companyId: z.number(),
      proposito: z.string().optional(),
      mision: z.string().optional(),
      vision: z.string().optional(),
      adminAlertEmail: z.string().email().optional().or(z.literal('')),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(companyInfo)
        .where(eq(companyInfo.companyId, input.companyId));

      if (existing.length > 0) {
        const updateData: any = {
          proposito: input.proposito !== undefined ? input.proposito || null : existing[0].proposito,
          mision: input.mision !== undefined ? input.mision || null : existing[0].mision,
          vision: input.vision !== undefined ? input.vision || null : existing[0].vision,
          updatedAt: new Date(),
        };
        if (input.adminAlertEmail !== undefined) {
          updateData.adminAlertEmail = input.adminAlertEmail || null;
        }
        await db.update(companyInfo)
          .set(updateData)
          .where(eq(companyInfo.companyId, input.companyId));
      } else {
        await db.insert(companyInfo).values({
          companyId: input.companyId,
          proposito: input.proposito || null,
          mision: input.mision || null,
          vision: input.vision || null,
          adminAlertEmail: input.adminAlertEmail || null,
        });
      }

      return { success: true };
    }),

  get: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db.select().from(companyInfo)
        .where(eq(companyInfo.companyId, input.companyId));

      return result.length > 0 ? result[0] : null;
    }),
});
