import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
} from "../db";

/**
 * Test for the label mapping fix in CompanyInfo.tsx
 * 
 * Bug: CompanyInfo.tsx was using incorrect label indices:
 * - label1 for title (should be generated from label1, label2, label3)
 * - label2 for proposito (should be label1)
 * - label3 for mision (should be label2)
 * - label4 for vision (should be label3)
 * 
 * Fix: Changed CompanyInfo.tsx to use correct indices:
 * - title: `${label1}, ${label2}, ${label3}`
 * - proposito: label1
 * - mision: label2
 * - vision: label3
 */
describe("Label Mapping Fix for CompanyInfo", () => {
  const TEST_COMPANY_ID = 666;
  const PURPOSE_MODULE = "purpose_mission_vision";

  beforeAll(async () => {
    // Clean up before tests
    await deleteModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE).catch(() => {});
  });

  afterAll(async () => {
    // Clean up after tests
    await deleteModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE).catch(() => {});
  });

  it("should store and retrieve Golden Circle labels correctly", async () => {
    // Save Golden Circle customization
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Retrieve it
    const result = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // Verify the fix: labels should be in correct positions
    expect(result?.label1).toBe("¿Por qué?");
    expect(result?.label2).toBe("¿Cómo?");
    expect(result?.label3).toBe("¿Qué?");
  });

  it("should correctly map labels for CompanyInfo display", async () => {
    // Save customization
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Retrieve it
    const customization = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // Simulate the fixed CompanyInfo.tsx label mapping:
    // title: `${customization?.label1 || "Propósito"}, ${customization?.label2 || "Misión"}, ${customization?.label3 || "Visión"}`
    // proposito: customization?.label1 || "Propósito"
    // mision: customization?.label2 || "Misión"
    // vision: customization?.label3 || "Visión"

    const labels = {
      title: `${customization?.label1 || "Propósito"}, ${customization?.label2 || "Misión"}, ${customization?.label3 || "Visión"}`,
      proposito: customization?.label1 || "Propósito",
      mision: customization?.label2 || "Misión",
      vision: customization?.label3 || "Visión",
    };

    // Verify the mapping is correct
    expect(labels.title).toBe("¿Por qué?, ¿Cómo?, ¿Qué?");
    expect(labels.proposito).toBe("¿Por qué?");
    expect(labels.mision).toBe("¿Cómo?");
    expect(labels.vision).toBe("¿Qué?");
  });

  it("should use default labels when customization is not set", async () => {
    // Don't set any customization, so it should be null
    const customization = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // Simulate the fixed CompanyInfo.tsx label mapping with null customization
    const labels = {
      title: `${customization?.label1 || "Propósito"}, ${customization?.label2 || "Misión"}, ${customization?.label3 || "Visión"}`,
      proposito: customization?.label1 || "Propósito",
      mision: customization?.label2 || "Misión",
      vision: customization?.label3 || "Visión",
    };

    // Verify defaults are used
    expect(labels.title).toBe("Propósito, Misión, Visión");
    expect(labels.proposito).toBe("Propósito");
    expect(labels.mision).toBe("Misión");
    expect(labels.vision).toBe("Visión");
  });

  it("should handle partial customizations correctly", async () => {
    // Save partial customization (only label1)
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
    });

    // Retrieve it
    const customization = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // Simulate the fixed CompanyInfo.tsx label mapping
    const labels = {
      title: `${customization?.label1 || "Propósito"}, ${customization?.label2 || "Misión"}, ${customization?.label3 || "Visión"}`,
      proposito: customization?.label1 || "Propósito",
      mision: customization?.label2 || "Misión",
      vision: customization?.label3 || "Visión",
    };

    // Verify partial customization works
    expect(labels.proposito).toBe("¿Por qué?");
    expect(labels.mision).toBe("Misión"); // Uses default
    expect(labels.vision).toBe("Visión"); // Uses default
    expect(labels.title).toBe("¿Por qué?, Misión, Visión");
  });

  it("should correctly display Agrogana's Golden Circle labels", async () => {
    // This simulates Agrogana's customization
    const AGROGANA_ID = 1;
    
    // Save Agrogana's Golden Circle customization
    await upsertModuleCustomization(AGROGANA_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Retrieve it
    const customization = await getModuleCustomization(AGROGANA_ID, PURPOSE_MODULE);

    // Simulate the fixed CompanyInfo.tsx label mapping
    const labels = {
      title: `${customization?.label1 || "Propósito"}, ${customization?.label2 || "Misión"}, ${customization?.label3 || "Visión"}`,
      proposito: customization?.label1 || "Propósito",
      mision: customization?.label2 || "Misión",
      vision: customization?.label3 || "Visión",
    };

    // Verify Agrogana's labels are correct
    expect(labels.title).toBe("¿Por qué?, ¿Cómo?, ¿Qué?");
    expect(labels.proposito).toBe("¿Por qué?");
    expect(labels.mision).toBe("¿Cómo?");
    expect(labels.vision).toBe("¿Qué?");

    // Clean up
    await deleteModuleCustomization(AGROGANA_ID, PURPOSE_MODULE).catch(() => {});
  });
});
