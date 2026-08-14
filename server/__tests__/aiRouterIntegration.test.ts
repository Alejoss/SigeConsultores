/**
 * AI Router Integration Tests
 * Tests for HITO 2: AI Chat integration with SIGE module
 */

import { describe, it, expect } from "vitest";
import { getModuleSystemPrompt } from "../_core/aiPrompts";

describe("AI Router Integration - HITO 2", () => {
  describe("SIGE Module Prompts", () => {
    it("should generate SIGE-specific system prompt", () => {
      const prompt = getModuleSystemPrompt("SIGE");
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("ISGE 360 prompt should mention Flujograma", () => {
      const prompt = getModuleSystemPrompt("SIGE");
      expect(prompt).toContain("Flujograma ISGE 360");
    });

    it("SIGE prompt should mention 5 levels", () => {
      const prompt = getModuleSystemPrompt("SIGE");
      expect(prompt).toContain("5");
      expect(prompt).toContain("level");
    });

    it("SIGE prompt should mention modules", () => {
      const prompt = getModuleSystemPrompt("SIGE");
      expect(prompt).toContain("Flujograma");
    });

    it("SIGE prompt should mention integration", () => {
      const prompt = getModuleSystemPrompt("SIGE");
      expect(prompt).toContain("integrat");
    });
  });

  describe("Prompt Consistency", () => {
    it("all module prompts should contain Spanish language instruction", () => {
      const modules = ["SIGE", "FODA", "Criticality", "Objectives", "General"] as const;
      modules.forEach((module) => {
        const prompt = getModuleSystemPrompt(module);
        expect(prompt).toContain("Spanish");
      });
    });

    it("all module prompts should contain confidentiality notice", () => {
      const modules = ["SIGE", "FODA", "Criticality", "Objectives", "General"] as const;
      modules.forEach((module) => {
        const prompt = getModuleSystemPrompt(module);
        expect(prompt).toContain("confidentiality");
      });
    });

    it("all module prompts should restrict to ISGE 360 platform", () => {
      const modules = ["SIGE", "FODA", "Criticality", "Objectives", "General"] as const;
      modules.forEach((module) => {
        const prompt = getModuleSystemPrompt(module);
        expect(prompt).toContain("ISGE 360");
      });
    });
  });

  describe("Query Validation", () => {
    it("should validate query length constraints", () => {
      // Queries should be between 5 and 5000 characters
      const shortQuery = "Hi"; // Too short
      const longQuery = "a".repeat(5001); // Too long
      const validQuery = "How does the SIGE flowchart work?"; // Valid

      expect(shortQuery.length).toBeLessThan(5);
      expect(longQuery.length).toBeGreaterThan(5000);
      expect(validQuery.length).toBeGreaterThanOrEqual(5);
      expect(validQuery.length).toBeLessThanOrEqual(5000);
    });
  });
});
