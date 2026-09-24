import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { assertProcessAccessById } from "../_core/companyPermissions";
import { getProcessIndicatorsList } from "../db";

export const indicatorsRouter = router({
  getConsolidatedIndicators: companyProcedure
    .input(z.object({ processId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertProcessAccessById(ctx, input.processId);
      if (input.processId <= 0) {
        return [];
      }

      try {
        const indicators = await getProcessIndicatorsList(input.processId);
        return indicators.map(indicator => ({
          id: indicator.id,
          name: indicator.name,
          formula: indicator.formula,
          unit: indicator.unit,
          target: indicator.target,
          currentValue: indicator.currentValue,
          frequency: indicator.frequency,
          responsible: indicator.responsible,
          performance: indicator.performance || 0,
          createdAt: indicator.createdAt,
          updatedAt: indicator.updatedAt,
        }));
      } catch (error) {
        console.error("[Indicators] Error fetching consolidated indicators:", error);
        return [];
      }
    }),
});
