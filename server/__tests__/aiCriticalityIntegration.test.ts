/**
 * AI Criticality Integration Tests
 * Tests for HITO 4: AI Asesor Contextual - Criticality Module
 */

import { describe, it, expect } from "vitest";
import { getModuleSystemPrompt, getUserPrompt } from "../_core/aiPrompts";

describe("AI Criticality Integration - HITO 4", () => {
  describe("Criticality Module Prompts", () => {
    it("should generate Criticality system prompt", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain("Criticality");
    });

    it("Criticality prompt should mention stakeholder criticality", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("criticality");
      expect(prompt).toContain("stakeholder");
    });

    it("Criticality prompt should mention Incidence and Risk", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("Incidence");
      expect(prompt).toContain("Risk");
    });

    it("Criticality prompt should mention business continuity", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("business continuity");
    });

    it("should generate user prompt for Criticality queries", () => {
      const userPrompt = getUserPrompt(
        "¿Cuál es la criticidad de este stakeholder?",
        "Criticality",
        {
          moduleType: "Criticality",
          additionalContext: {
            stakeholderName: "Proveedor Principal",
            incidence: 3,
            risk: "A",
          },
        }
      );

      expect(userPrompt).toBeDefined();
      expect(userPrompt).toContain("¿Cuál es la criticidad");
      expect(userPrompt).toContain("Proveedor Principal");
    });
  });

  describe("Criticality Context Data", () => {
    it("should handle stakeholder context in prompts", () => {
      const contextData = {
        stakeholderName: "Proveedor de Materia Prima",
        incidence: 2,
        risk: "B",
        actionToTake: "Establecer acuerdos de suministro",
        processName: "Compras",
      };

      const userPrompt = getUserPrompt(
        "¿Qué acciones debo tomar para este stakeholder?",
        "Criticality",
        {
          moduleType: "Criticality",
          additionalContext: contextData,
        }
      );

      expect(userPrompt).toContain("Proveedor de Materia Prima");
      expect(userPrompt).toContain("Compras");
    });

    it("should handle multiple stakeholders context", () => {
      const contextData = {
        stakeholderCount: 5,
        criticalStakeholders: 2,
        averageCriticality: "2B",
        processName: "Ventas",
      };

      const userPrompt = getUserPrompt(
        "¿Cómo debo priorizar mis acciones con estos stakeholders?",
        "Criticality",
        {
          moduleType: "Criticality",
          additionalContext: contextData,
        }
      );

      expect(userPrompt).toContain("Ventas");
      expect(userPrompt).toContain("priorizar");
    });
  });

  describe("Criticality Prompt Consistency", () => {
    it("Criticality prompt should enforce confidentiality", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("confidentiality");
    });

    it("Criticality prompt should be in Spanish", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("Spanish");
    });

    it("Criticality prompt should restrict to SIGE platform", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("SIGE platform");
    });

    it("Criticality prompt should provide actionable recommendations", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("actionable");
    });
  });

  describe("Criticality Analysis Guidance", () => {
    it("should guide analysis of critical stakeholders", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("critical");
      expect(prompt).toContain("stakeholder");
      expect(prompt).toContain("relationship");
    });

    it("should suggest monitoring strategies", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("monitoring");
    });

    it("should help prioritize engagement efforts", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("prioritize");
    });
  });
});
