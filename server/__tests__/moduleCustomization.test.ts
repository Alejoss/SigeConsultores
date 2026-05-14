import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
  getAllModuleCustomizations,
} from "../db";

// Test company ID (use a test company)
const TEST_COMPANY_ID = 999;
const TEST_MODULE_NAME = "purpose_mission_vision";

describe("Module Customization", () => {
  beforeAll(async () => {
    // Clean up before tests
    await deleteModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME).catch(() => {});
  });

  afterAll(async () => {
    // Clean up after tests
    await deleteModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME).catch(() => {});
  });

  it("should create a new module customization", async () => {
    const result = await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME, {
      label1: "Por qué",
      label2: "Qué",
      label3: "Cómo",
    });

    expect(result).toBeDefined();
    expect(result.label1).toBe("Por qué");
    expect(result.label2).toBe("Qué");
    expect(result.label3).toBe("Cómo");
  });

  it("should retrieve module customization", async () => {
    // First create one
    await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME, {
      label1: "Por qué",
      label2: "Qué",
      label3: "Cómo",
    });

    // Then retrieve it
    const result = await getModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME);

    expect(result).toBeDefined();
    expect(result?.label1).toBe("Por qué");
    expect(result?.label2).toBe("Qué");
    expect(result?.label3).toBe("Cómo");
  });

  it("should update existing module customization", async () => {
    // Create initial
    await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME, {
      label1: "Propósito",
      label2: "Misión",
      label3: "Visión",
    });

    // Update it
    const updated = await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME, {
      label1: "Por qué",
      label2: "Qué",
      label3: "Cómo",
    });

    expect(updated.label1).toBe("Por qué");
    expect(updated.label2).toBe("Qué");
    expect(updated.label3).toBe("Cómo");
  });

  it("should return undefined for non-existent customization", async () => {
    const result = await getModuleCustomization(999999, "non_existent_module");
    expect(result).toBeUndefined();
  });

  it("should delete module customization", async () => {
    // Create one
    await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME, {
      label1: "Test",
      label2: "Test",
      label3: "Test",
    });

    // Delete it
    await deleteModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME);

    // Verify it's deleted
    const result = await getModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME);
    expect(result).toBeUndefined();
  });

  it("should handle partial label updates", async () => {
    const result = await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE_NAME, {
      label1: "Label 1 Only",
      label2: undefined,
      label3: undefined,
    });

    expect(result.label1).toBe("Label 1 Only");
    expect(result.label2).toBeUndefined();
    expect(result.label3).toBeUndefined();
  });

  it("should support multiple modules per company", async () => {
    const module1 = "purpose_mission_vision";
    const module2 = "strategic_objectives";

    // Create customizations for different modules
    await upsertModuleCustomization(TEST_COMPANY_ID, module1, {
      label1: "Golden Circle - Por qué",
      label2: "Golden Circle - Qué",
      label3: "Golden Circle - Cómo",
    });

    await upsertModuleCustomization(TEST_COMPANY_ID, module2, {
      label1: "Objetivo Corto Plazo",
      label2: "Objetivo Mediano Plazo",
      label3: "Objetivo Largo Plazo",
    });

    // Verify both exist independently
    const custom1 = await getModuleCustomization(TEST_COMPANY_ID, module1);
    const custom2 = await getModuleCustomization(TEST_COMPANY_ID, module2);

    expect(custom1?.label1).toBe("Golden Circle - Por qué");
    expect(custom2?.label1).toBe("Objetivo Corto Plazo");

    // Clean up
    await deleteModuleCustomization(TEST_COMPANY_ID, module1);
    await deleteModuleCustomization(TEST_COMPANY_ID, module2);
  });
});
