import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
  getAllModuleCustomizations,
} from "../db";

export const moduleCustomizationRouter = router({
  /**
   * Get module labels for a specific company (public access)
   * Used by the frontend to display personalized module names
   */
  getLabels: publicProcedure
    .input(
      z.object({
        companyId: z.number(),
      })
    )
    .query(async ({ input }) => {
      try {
        const customizations = await getAllModuleCustomizations(input.companyId);
        const labels: Record<string, any> = {};
        customizations.forEach((item) => {
          labels[item.moduleName] = item;
        });
        return labels;
      } catch (error) {
        console.error("[ModuleCustomization] Get labels error:", error);
        return {};
      }
    }),

  /**
   * Get module customization for a specific company and module
   * Accessible to admins and managers
   */
  get: publicProcedure
    .input(
      z.object({
        companyId: z.number(),
        moduleName: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await getModuleCustomization(input.companyId, input.moduleName);
        return result || null;
      } catch (error) {
        console.error("[ModuleCustomization] Get error:", error);
        throw error;
      }
    }),

  /**
   * Upsert (create or update) module customization
   * Only accessible to admins
   */
  upsert: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        moduleName: z.string(),
        label1: z.string().optional(),
        label2: z.string().optional(),
        label3: z.string().optional(),
        label4: z.string().optional(),
        label5: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await upsertModuleCustomization(input.companyId, input.moduleName, {
          label1: input.label1,
          label2: input.label2,
          label3: input.label3,
          label4: input.label4,
          label5: input.label5,
        });
        return { success: true, data: result };
      } catch (error) {
        console.error("[ModuleCustomization] Upsert error:", error);
        throw error;
      }
    }),

  /**
   * Get all customizations for a company
   * Only accessible to admins
   */
  listByCompany: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      try {
        const result = await getAllModuleCustomizations(input.companyId);
        return result;
      } catch (error) {
        console.error("[ModuleCustomization] List by company error:", error);
        throw error;
      }
    }),

  /**
   * Delete module customization
   * Only accessible to admins
   */
  delete: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        moduleName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await deleteModuleCustomization(input.companyId, input.moduleName);
        return { success: true };
      } catch (error) {
        console.error("[ModuleCustomization] Delete error:", error);
        throw error;
      }
    }),
});
