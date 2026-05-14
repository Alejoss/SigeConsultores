/**
 * AI Service
 * Handles all interactions with LLM via Manus Forge
 * Manages API calls, error handling, and response formatting
 */

import { getDb } from "../db";
import { aiQueryAudit } from "../../drizzle/schema";
import { getModuleSystemPrompt, getUserPrompt, ModuleType } from "./aiPrompts";
import { invokeLLM } from "./llm";

interface AIQueryOptions {
  companyId: number;
  userId: number;
  moduleType: ModuleType;
  query: string;
  contextData?: Record<string, unknown>;
  systemPrompt?: string; // Override default system prompt
}

interface AIResponse {
  success: boolean;
  response: string;
  tokensUsed?: number;
  responseTimeMs: number;
  error?: string;
}

/**
 * Query LLM via Manus Forge with proper error handling and logging
 */
export async function queryAI(options: AIQueryOptions): Promise<AIResponse> {
  const startTime = Date.now();
  const db = await getDb();

  try {
    // Prepare prompts
    const systemPrompt = options.systemPrompt || getModuleSystemPrompt(options.moduleType);
    const userPrompt = getUserPrompt(options.query, options.moduleType, {
      moduleType: options.moduleType,
      additionalContext: options.contextData,
    });

    // Call LLM via Manus Forge
    const message = await invokeLLM({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Extract response
    const responseText =
      message.choices[0]?.message?.content || "No response";

    const responseTimeMs = Date.now() - startTime;

    // Log to audit table
    if (db) {
      try {
        await db.insert(aiQueryAudit).values({
          companyId: options.companyId,
          userId: options.userId,
          moduleType: options.moduleType,
          query: options.query,
          response: typeof responseText === 'string' ? responseText : JSON.stringify(responseText),
          contextData: options.contextData ? JSON.stringify(options.contextData) : null,
          model: "gemini-2.5-flash",
          tokensUsed: (message.usage?.prompt_tokens || 0) + (message.usage?.completion_tokens || 0),
          responseTimeMs,
          status: "success",
        });
      } catch (auditError) {
        console.warn("[AI Service] Failed to log to audit table:", auditError);
        // Don't fail the request if audit logging fails
      }
    }

    return {
      success: true,
      response: typeof responseText === 'string' ? responseText : JSON.stringify(responseText),
      tokensUsed: (message.usage?.prompt_tokens || 0) + (message.usage?.completion_tokens || 0),
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log error to audit table
    if (db) {
      try {
        await db.insert(aiQueryAudit).values({
          companyId: options.companyId,
          userId: options.userId,
          moduleType: options.moduleType,
          query: options.query,
          response: "", // Empty response on error
          contextData: options.contextData ? JSON.stringify(options.contextData) : null,
          model: "gemini-2.5-flash",
          responseTimeMs,
          status: "error",
          errorMessage,
        });
      } catch (auditError) {
        console.warn("[AI Service] Failed to log error to audit table:", auditError);
      }
    }

    console.error("[AI Service] Error querying LLM:", error);

    return {
      success: false,
      response: "",
      responseTimeMs,
      error: `Failed to get AI response: ${errorMessage}`,
    };
  }
}

/**
 * Improve text using AI (for professional redaction)
 */
export async function improveText(
  text: string,
  companyId: number,
  userId: number
): Promise<AIResponse> {
  return queryAI({
    companyId,
    userId,
    moduleType: "General",
    query: `Mejora el siguiente texto para uso profesional:\n\n${text}`,
  });
}

/**
 * Explain a module and its integration
 */
export async function explainModule(
  moduleType: ModuleType,
  moduleContent: string,
  companyId: number,
  userId: number
): Promise<AIResponse> {
  return queryAI({
    companyId,
    userId,
    moduleType,
    query: `Explica el siguiente contenido del módulo ${moduleType} y cómo se integra con otros módulos de la plataforma:\n\n${moduleContent}`,
  });
}

/**
 * Get contextual advice for a module
 */
export async function getContextualAdvice(
  moduleType: ModuleType,
  question: string,
  contextData: Record<string, unknown>,
  companyId: number,
  userId: number
): Promise<AIResponse> {
  return queryAI({
    companyId,
    userId,
    moduleType,
    query: question,
    contextData,
  });
}
