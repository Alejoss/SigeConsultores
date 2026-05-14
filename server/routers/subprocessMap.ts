import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { subprocessMaps } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const subprocessMapRouter = router({
  get: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const mapResult = await db.select().from(subprocessMaps)
        .where(eq(subprocessMaps.processId, input.processId));

      if (mapResult.length === 0) return null;

      return {
        entrada: mapResult[0].entrada,
        necesidades: mapResult[0].necesidades,
        subprocesos: mapResult[0].subprocesos,
        salida: mapResult[0].salida,
      };
    }),

  upsert: companyProcedure
    .input(z.object({
      processId: z.number(),
      entrada: z.string(),
      necesidades: z.string().optional(),
      subprocesos: z.string(),
      salida: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(subprocessMaps)
        .where(eq(subprocessMaps.processId, input.processId));

      if (existing.length > 0) {
        // Update existing record
        await db.update(subprocessMaps)
          .set({
            entrada: input.entrada,
            necesidades: input.necesidades || null,
            subprocesos: input.subprocesos,
            salida: input.salida,
            updatedAt: new Date(),
          })
          .where(eq(subprocessMaps.processId, input.processId));
      } else {
        // Create new record
        await db.insert(subprocessMaps).values({
          processId: input.processId,
          entrada: input.entrada,
          necesidades: input.necesidades || null,
          subprocesos: input.subprocesos,
          salida: input.salida,
        });
      }

      return { success: true, message: "Mapa guardado exitosamente" };
    })
});
