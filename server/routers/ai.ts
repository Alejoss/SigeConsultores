/**
 * AI Router
 * tRPC procedures for AI-powered features
 * Handles queries, redaction, explanations, and analysis
 */

import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import {
  queryAI,
  improveText,
  explainModule,
  getContextualAdvice,
} from "../_core/aiService";
import { ModuleType } from "../_core/aiPrompts";
import { TRPCError } from "@trpc/server";

/**
 * AI Router - All AI-powered procedures
 */
export const aiRouter = router({
  /**
   * Check if AI service is available
   */
  isAvailable: companyProcedure.query(async () => {
    try {
      // AI service is always available via Manus Forge
      return { available: true };
    } catch (error) {
      console.error("[AI Router] Error checking AI availability:", error);
      return { available: false };
    }
  }),

  /**
   * Query AI with context
   * General-purpose AI query for any module
   */
  query: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        moduleType: z.enum(["SIGE", "FODA", "Criticality", "Objectives", "General"]),
        query: z.string().min(5).max(5000),
        contextData: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx: { user } }) => {
      // Verify user has access to company
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const response = await queryAI({
          companyId: input.companyId,
          userId: user.id,
          moduleType: input.moduleType as ModuleType,
          query: input.query,
          contextData: input.contextData,
        });

        if (!response.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error || "Failed to get AI response",
          });
        }

        return {
          success: true,
          response: response.response,
          tokensUsed: response.tokensUsed,
          responseTimeMs: response.responseTimeMs,
        };
      } catch (error) {
        console.error("[AI Router] Error in query:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }),

  /**
   * Improve text for professional use
   * Enhances writing quality and professionalism
   */
  improveText: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        text: z.string().min(10).max(5000),
      })
    )
    .mutation(async ({ input, ctx: { user } }) => {
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const response = await improveText(input.text, input.companyId, user.id);

        if (!response.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error || "Failed to improve text",
          });
        }

        return {
          success: true,
          improvedText: response.response,
          responseTimeMs: response.responseTimeMs,
        };
      } catch (error) {
        console.error("[AI Router] Error in improveText:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }),

  /**
   * Explain a module
   * Helps users understand a module and how it integrates
   */
  explainModule: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        moduleType: z.enum(["SIGE", "FODA", "Criticality", "Objectives", "General"]),
        moduleContent: z.string().min(10).max(10000),
      })
    )
    .mutation(async ({ input, ctx: { user } }) => {
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const response = await explainModule(
          input.moduleType as ModuleType,
          input.moduleContent,
          input.companyId,
          user.id
        );

        if (!response.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error || "Failed to explain module",
          });
        }

        return {
          success: true,
          explanation: response.response,
          responseTimeMs: response.responseTimeMs,
        };
      } catch (error) {
        console.error("[AI Router] Error in explainModule:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }),

  /**
   * Get contextual advice
   * Provides specific advice based on module context
   */
  getAdvice: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        moduleType: z.enum(["SIGE", "FODA", "Criticality", "Objectives", "General"]),
        question: z.string().min(5).max(5000),
        contextData: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx: { user } }) => {
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const response = await getContextualAdvice(
          input.moduleType as ModuleType,
          input.question,
          input.contextData || {},
          input.companyId,
          user.id
        );

        if (!response.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error || "Failed to get advice",
          });
        }

        return {
          success: true,
          advice: response.response,
          responseTimeMs: response.responseTimeMs,
        };
      } catch (error) {
        console.error("[AI Router] Error in getAdvice:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }),
});
