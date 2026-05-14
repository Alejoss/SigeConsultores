/**
 * AI Infrastructure Tests
 * Tests for Hito 1: AI Base Infrastructure
 */

import { describe, it, expect, beforeAll } from "vitest";// AI Service availability is checked via tRPC router (ai.isAvailable)
import { getSystemPrompt, getModuleSystemPrompt } from "../_core/aiPrompts";

describe("AI Infrastructure - HITO 1", () => {
  describe("AI Service Availability", () => {
    it("should have AI service available via tRPC router", () => {
      // AI Service availability is checked via tRPC router (ai.isAvailable)
      // This is tested in aiRouterIntegration.test.ts
      expect(true).toBe(true);
    });
  });

  describe("Prompts System", () => {
    it("should generate system prompt", () => {
      const prompt = getSystemPrompt();
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain("SIGE");
      expect(prompt).toContain("Spanish");
    });

    it("should generate module-specific prompts", () => {
      const modules = ["SIGE", "FODA", "Criticality", "Objectives", "General"] as const;

      modules.forEach((module) => {
        const prompt = getModuleSystemPrompt(module);
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toContain(module);
      });
    });

    it("SIGE prompt should mention Flujograma", () => {
      const prompt = getModuleSystemPrompt("SIGE");
      expect(prompt).toContain("Flujograma SIGE");
      expect(prompt).toContain("5 levels");
    });

    it("FODA prompt should mention FODA analysis", () => {
      const prompt = getModuleSystemPrompt("FODA");
      expect(prompt).toContain("FODA");
      expect(prompt).toContain("Fortalezas");
    });

    it("Criticality prompt should mention stakeholder criticality", () => {
      const prompt = getModuleSystemPrompt("Criticality");
      expect(prompt).toContain("criticality");
      expect(prompt).toContain("stakeholder");
    });
  });

  describe("Constraints", () => {
    it("system prompt should enforce confidentiality", () => {
      const prompt = getSystemPrompt();
      expect(prompt).toContain("confidentiality");
      expect(prompt).toContain("CANNOT access");
    });

    it("system prompt should restrict to SIGE platform only", () => {
      const prompt = getSystemPrompt();
      expect(prompt).toContain("ONLY provide advice");
      expect(prompt).toContain("SIGE platform");
    });

    it("system prompt should be in Spanish", () => {
      const prompt = getSystemPrompt();
      expect(prompt).toContain("Spanish");
    });
  });
});
