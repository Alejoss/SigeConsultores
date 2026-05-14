import { z } from "zod";
import { protectedProcedure, router, companyProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { companyFODAs, companyFODASelections, processFODA, processes } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Helper to get companyId from context
function getCompanyId(ctx: any): number {
  // For manager login
  if (ctx.manager?.companyId) return ctx.manager.companyId;
  // For OAuth users, get from localStorage or session
  if (ctx.user?.companyId) return ctx.user.companyId;
  // If no companyId in context, we need it from the request
  throw new TRPCError({ code: "UNAUTHORIZED", message: "No company context found. Please select a company first." });
}

// Helper to get userId from context
function getUserId(ctx: any): number {
  if (ctx.user?.id) return ctx.user.id;
  if (ctx.manager?.companyId) return 0; // Manager doesn't have user ID
  throw new TRPCError({ code: "UNAUTHORIZED", message: "No user context found" });
}

// Helper to check if user is admin
function isAdmin(ctx: any): boolean {
  return ctx.user?.role === "admin";
}

export const fodasRouter = router({
  /**
   * Get all process FODAs consolidated by type
   * Shows all processes with their FODA elements (empty if not defined)
   */
  listProcessFODAs: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const companyId = input.companyId;

      // Get all processes for this company
      const allProcesses = await db.select().from(processes)
        .where(eq(processes.companyId, companyId));

      // Get all process FODAs
      const allFODAs = await db.select().from(processFODA);

      // Map processes with their FODAs
      const parseFODAArray = (fodaJson: string | null | undefined) => {
        if (!fodaJson) return [];
        try {
          const parsed = JSON.parse(fodaJson);
          return Array.isArray(parsed) ? parsed.map(item => ({
            statement: item.statement || '',
            description: item.description || '',
            subprocess: item.subprocess || '',
            policyObjective: item.policyObjective || '',
            selectedObjectiveContent: item.selectedObjectiveContent || '',
          })) : [];
        } catch (error) {
          return [];
        }
      };
      
      const result = allProcesses.map(process => {
        const processData = allFODAs.find(f => f.processId === process.id);
        
        return {
          processId: process.id,
          processName: process.name,
          strengths: parseFODAArray(processData?.strengths),
          opportunities: parseFODAArray(processData?.opportunities),
          weaknesses: parseFODAArray(processData?.weaknesses),
          threats: parseFODAArray(processData?.threats),
        };
      });

      return result;
    }),

  /**
   * Get company FODA consolidated
   * Returns all selected and edited FODA elements for the company
   */
  getCompanyFODA: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { strengths: [], opportunities: [], weaknesses: [], threats: [] };

      const companyId = input.companyId;

      const fodasByType = await db.select().from(companyFODAs)
        .where(eq(companyFODAs.companyId, companyId));

      return {
        strengths: fodasByType.filter(f => f.type === "Fortaleza"),
        opportunities: fodasByType.filter(f => f.type === "Oportunidad"),
        weaknesses: fodasByType.filter(f => f.type === "Debilidad"),
        threats: fodasByType.filter(f => f.type === "Amenaza"),
      };
    }),

  /**
   * Get selections for a specific process and company
   * Shows which FODA elements from a process have been selected
   */
  getSelections: companyProcedure
    .input(z.object({ companyId: z.number(), processId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const companyId = input.companyId;

      const selections = await db.select().from(companyFODASelections)
        .where(and(
          eq(companyFODASelections.companyId, companyId),
          eq(companyFODASelections.processId, input.processId)
        ));

      return selections;
    }),

  /**
   * Select/deselect a FODA element from a process
   * When selected, creates or updates a companyFODA entry
   */
  toggleSelection: companyProcedure
    .input(z.object({
      companyId: z.number(),
      processId: z.number(),
      type: z.enum(["Fortaleza", "Oportunidad", "Debilidad", "Amenaza"]),
      originalText: z.string(),
      enterpriseVersion: z.string().optional(),
      isSelected: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const companyId = input.companyId;

      // Find or create selection record
      let selection = await db.select().from(companyFODASelections)
        .where(and(
          eq(companyFODASelections.companyId, companyId),
          eq(companyFODASelections.processId, input.processId),
          eq(companyFODASelections.type, input.type),
          eq(companyFODASelections.originalText, input.originalText)
        )).limit(1);

      if (input.isSelected) {
        // Create companyFODA entry with enterprise version
        const descriptionToSave = input.enterpriseVersion?.trim() || input.originalText;
        await db.insert(companyFODAs).values({
          companyId: companyId,
          type: input.type,
          description: descriptionToSave,
          processId: input.processId,
          isCustom: false,
        });

        // Get the inserted ID
        const descriptionToFind = input.enterpriseVersion?.trim() || input.originalText;
        const inserted = await db.select().from(companyFODAs)
          .where(and(
            eq(companyFODAs.companyId, companyId),
            eq(companyFODAs.type, input.type),
            eq(companyFODAs.description, descriptionToFind),
            eq(companyFODAs.processId, input.processId)
          )).limit(1);
        
        const companyFODAId = inserted.length > 0 ? inserted[0].id : null;

        // Create or update selection
        if (selection.length > 0) {
          await db.update(companyFODASelections)
            .set({ isSelected: true, companyFODAId })
            .where(eq(companyFODASelections.id, selection[0].id));
        } else {
          await db.insert(companyFODASelections).values({
            companyId: companyId,
            processId: input.processId,
            type: input.type,
            originalText: input.originalText,
            isSelected: true,
            companyFODAId,
          });
        }
      } else {
        // Deselect: mark as not selected and remove from companyFODA
        if (selection.length > 0 && selection[0].companyFODAId) {
          await db.delete(companyFODAs)
            .where(eq(companyFODAs.id, selection[0].companyFODAId));
          
          await db.update(companyFODASelections)
            .set({ isSelected: false, companyFODAId: null })
            .where(eq(companyFODASelections.id, selection[0].id));
        }
      }

      return { success: true };
    }),

  /**
   * Update a company FODA element (only for admin/manager)
   * Allows editing the description and justification of a selected FODA element
   */
  updateElement: companyProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      description: z.string(),
      justification: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const companyId = input.companyId;
      const userId = getUserId(ctx);

      // Check if user is admin
      if (!isAdmin(ctx)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo gerentes pueden editar el FODA de la empresa",
        });
      }

      await db.update(companyFODAs)
        .set({
          description: input.description,
          justification: input.justification || null,
          editedAt: new Date(),
          editedBy: userId || null,
        })
        .where(and(
          eq(companyFODAs.id, input.id),
          eq(companyFODAs.companyId, companyId)
        ));

      return { success: true };
    }),

  /**
   * Add a custom FODA element (only for admin/manager)
   * Allows manually adding a FODA element not from any process
   */
  addCustomElement: companyProcedure
    .input(z.object({
      companyId: z.number(),
      type: z.enum(["Fortaleza", "Oportunidad", "Debilidad", "Amenaza"]),
      description: z.string(),
      justification: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const companyId = input.companyId;
      const userId = getUserId(ctx);

      // Check if user is admin
      if (!isAdmin(ctx)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo gerentes pueden agregar elementos al FODA de la empresa",
        });
      }

      await db.insert(companyFODAs).values({
        companyId: companyId,
        type: input.type,
        description: input.description,
        justification: input.justification || null,
        isCustom: true,
        editedAt: new Date(),
        editedBy: userId || null,
      });

      // Get the inserted ID
      const inserted = await db.select().from(companyFODAs)
        .where(and(
          eq(companyFODAs.companyId, companyId),
          eq(companyFODAs.type, input.type),
          eq(companyFODAs.description, input.description),
          eq(companyFODAs.isCustom, true)
        )).limit(1);

      return { success: true, id: inserted.length > 0 ? inserted[0].id : 0 };
    }),

  /**
   * Delete a company FODA element (only for admin/manager)
   */
  deleteElement: companyProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const companyId = input.companyId;

      // Check if user is admin
      if (!isAdmin(ctx)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo gerentes pueden eliminar elementos del FODA de la empresa",
        });
      }

      // Get the element to check if it belongs to this company
      const element = await db.select().from(companyFODAs)
        .where(eq(companyFODAs.id, input.id)).limit(1);

      if (element.length === 0 || element[0].companyId !== companyId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Elemento FODA no encontrado",
        });
      }

      // If it's from a selection, update the selection
      if (!element[0].isCustom) {
        await db.update(companyFODASelections)
          .set({ isSelected: false, companyFODAId: null })
          .where(eq(companyFODASelections.companyFODAId, input.id));
      }

      await db.delete(companyFODAs)
        .where(eq(companyFODAs.id, input.id));

      return { success: true };
    }),
});
