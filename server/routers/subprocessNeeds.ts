import { z } from "zod";
import { protectedProcedure, router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { subprocessMaps } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const subprocessNeedsRouter = router({
  /**
   * Extract all "Necesidades" from the subprocess map entrada section
   * Returns a list of unique needs/expectations from stakeholders
   */
  getNeedsFromSubprocess: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { needs: [] };

      const mapResult = await db.select().from(subprocessMaps)
        .where(eq(subprocessMaps.processId, input.processId));

      if (mapResult.length === 0 || !mapResult[0].entrada) {
        return { needs: [] };
      }

      try {
        const entradaData = JSON.parse(mapResult[0].entrada);
        
        // Extract unique needs from entrada table
        const needsSet = new Set<string>();
        
        if (Array.isArray(entradaData)) {
          entradaData.forEach((row: any) => {
            if (row.necesidades && row.necesidades.trim()) {
              needsSet.add(row.necesidades.trim());
            }
          });
        }

        // Convert set to array and return
        const needs = Array.from(needsSet).map((need, index) => ({
          id: index + 1,
          need,
        }));

        return { needs };
      } catch (error) {
        console.error("Error parsing subprocess needs:", error);
        return { needs: [] };
      }
    }),

  /**
   * Get all stakeholder needs with their sources (which subprocess they come from)
   */
  getNeedsWithSources: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { needsWithSources: [] };

      const mapResult = await db.select().from(subprocessMaps)
        .where(eq(subprocessMaps.processId, input.processId));

      if (mapResult.length === 0 || !mapResult[0].entrada) {
        return { needsWithSources: [] };
      }

      try {
        const entradaData = JSON.parse(mapResult[0].entrada);
        
        // Extract needs with their source information
        const needsWithSources: Array<{
          id: number;
          need: string;
          stakeholder: string;
          internalExternal: string;
          clienteProveedor: string;
        }> = [];
        
        if (Array.isArray(entradaData)) {
          entradaData.forEach((row: any, index: number) => {
            if (row.necesidades && row.necesidades.trim()) {
              needsWithSources.push({
                id: index + 1,
                need: row.necesidades.trim(),
                stakeholder: row.partesInteresadas || "",
                internalExternal: row.internoExterno || "",
                clienteProveedor: row.clienteProveedor || "",
              });
            }
          });
        }

        return { needsWithSources };
      } catch (error) {
        console.error("Error parsing subprocess needs with sources:", error);
        return { needsWithSources: [] };
      }
    }),
});
