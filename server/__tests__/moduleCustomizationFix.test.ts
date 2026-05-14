import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
  getAllModuleCustomizations,
} from "../db";

/**
 * Integration test for module customization data mapping fix
 * 
 * This test verifies that the bug where "Propósito, Misión, Visión" labels
 * were showing mixed data from "Módulos de SIGE" has been fixed.
 * 
 * The issue was:
 * - "Propósito" field showed: "¿Por qué?, ¿Cómo?, ¿Qué?" (should be just "¿Por qué?")
 * - "Misión" field showed: "¿Por qué? Propósito" (should be just "¿Cómo?")
 * - "Visión" field showed: "¿Cómo? Proceso" (should be just "¿Qué?")
 * 
 * Root cause: Data was being mixed between modules in the database or frontend.
 * Fix: Refactored tRPC procedures to use tested database helper functions and
 *      fixed frontend component to properly load and display module-specific data.
 */
describe("Module Customization Fix - Data Mapping Issue", () => {
  const TEST_COMPANY_ID = 777;
  const PURPOSE_MODULE = "purpose_mission_vision";
  const SIGE_MODULES = "sige_modules";
  const VALUES_MODULE = "corporate_values";

  beforeAll(async () => {
    // Clean up before tests
    await deleteModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, VALUES_MODULE).catch(() => {});
  });

  afterAll(async () => {
    // Clean up after tests
    await deleteModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, VALUES_MODULE).catch(() => {});
  });

  it("should correctly save and retrieve purpose_mission_vision labels without mixing", async () => {
    // Simulate user customizing "Propósito, Misión, Visión" to use Golden Circle
    const purposeLabels = {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    };

    // Save the customization
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, purposeLabels);

    // Retrieve it
    const retrieved = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // Verify each label is exactly what was saved
    expect(retrieved?.label1).toBe("¿Por qué?");
    expect(retrieved?.label2).toBe("¿Cómo?");
    expect(retrieved?.label3).toBe("¿Qué?");

    // Verify NO mixing with other data
    expect(retrieved?.label1).not.toContain("Fundamentos");
    expect(retrieved?.label1).not.toContain("Propósito");
    expect(retrieved?.label2).not.toContain("Valores");
    expect(retrieved?.label3).not.toContain("Política");
  });

  it("should correctly save and retrieve sige_modules labels without mixing", async () => {
    // Simulate user customizing main SIGE modules
    const sigeLabels = {
      label1: "Fundamentos",
      label2: "Valores",
      label3: "Política",
      label4: "Objetivos",
      label5: "Procesos",
    };

    // Save the customization
    await upsertModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES, sigeLabels);

    // Retrieve it
    const retrieved = await getModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES);

    // Verify each label is exactly what was saved
    expect(retrieved?.label1).toBe("Fundamentos");
    expect(retrieved?.label2).toBe("Valores");
    expect(retrieved?.label3).toBe("Política");
    expect(retrieved?.label4).toBe("Objetivos");
    expect(retrieved?.label5).toBe("Procesos");

    // Verify NO mixing with purpose_mission_vision data
    expect(retrieved?.label1).not.toBe("¿Por qué?");
    expect(retrieved?.label2).not.toBe("¿Cómo?");
    expect(retrieved?.label3).not.toBe("¿Qué?");
  });

  it("should keep purpose_mission_vision and sige_modules data completely separate", async () => {
    // Create customizations for both modules
    const purposeLabels = {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    };

    const sigeLabels = {
      label1: "Fundamentos",
      label2: "Valores",
      label3: "Política",
      label4: "Objetivos",
      label5: "Procesos",
    };

    // Save both
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, purposeLabels);
    await upsertModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES, sigeLabels);

    // Retrieve both
    const purposeRetrieved = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);
    const sigeRetrieved = await getModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES);

    // Verify they are completely different
    expect(purposeRetrieved?.label1).not.toBe(sigeRetrieved?.label1);
    expect(purposeRetrieved?.label2).not.toBe(sigeRetrieved?.label2);
    expect(purposeRetrieved?.label3).not.toBe(sigeRetrieved?.label3);

    // Verify specific values
    expect(purposeRetrieved?.label1).toBe("¿Por qué?");
    expect(sigeRetrieved?.label1).toBe("Fundamentos");
  });

  it("should handle switching between modules without data corruption", async () => {
    // Simulate user workflow:
    // 1. Edit purpose_mission_vision
    // 2. Switch to sige_modules and edit
    // 3. Switch back to purpose_mission_vision
    // 4. Verify data is still correct

    // Step 1: Edit purpose_mission_vision
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Step 2: Switch to sige_modules and edit
    await upsertModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES, {
      label1: "Fundamentos",
      label2: "Valores",
      label3: "Política",
    });

    // Step 3: Switch back to purpose_mission_vision
    const purposeRetrieved = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // Step 4: Verify data is still correct (not corrupted by editing sige_modules)
    expect(purposeRetrieved?.label1).toBe("¿Por qué?");
    expect(purposeRetrieved?.label2).toBe("¿Cómo?");
    expect(purposeRetrieved?.label3).toBe("¿Qué?");
  });

  it("should retrieve all modules for a company without data mixing", async () => {
    // Create customizations for multiple modules
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    await upsertModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES, {
      label1: "Fundamentos",
      label2: "Valores",
      label3: "Política",
    });

    await upsertModuleCustomization(TEST_COMPANY_ID, VALUES_MODULE, {
      label1: "Valor 1",
      label2: "Valor 2",
      label3: "Valor 3",
    });

    // Get all customizations
    const all = await getAllModuleCustomizations(TEST_COMPANY_ID);

    expect(all.length).toBe(3);

    // Find each module
    const purpose = all.find((c) => c.moduleName === PURPOSE_MODULE);
    const sige = all.find((c) => c.moduleName === SIGE_MODULES);
    const values = all.find((c) => c.moduleName === VALUES_MODULE);

    // Verify each has correct data
    expect(purpose?.label1).toBe("¿Por qué?");
    expect(sige?.label1).toBe("Fundamentos");
    expect(values?.label1).toBe("Valor 1");

    // Verify no mixing
    expect(purpose?.label1).not.toBe(sige?.label1);
    expect(sige?.label1).not.toBe(values?.label1);
    expect(purpose?.label1).not.toBe(values?.label1);
  });

  it("should handle updating one module without affecting others", async () => {
    // Create initial customizations
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    await upsertModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES, {
      label1: "Fundamentos",
      label2: "Valores",
      label3: "Política",
    });

    // Update only purpose_mission_vision
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "Razón de ser",
      label2: "Estrategia",
      label3: "Meta",
    });

    // Verify purpose_mission_vision was updated
    const purposeUpdated = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);
    expect(purposeUpdated?.label1).toBe("Razón de ser");

    // Verify sige_modules was NOT affected
    const sigeUnchanged = await getModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES);
    expect(sigeUnchanged?.label1).toBe("Fundamentos");
  });

  it("should correctly handle the exact scenario from the bug report", async () => {
    // This is the exact scenario that was failing:
    // User customizes "Propósito, Misión, Visión" to use Golden Circle
    // But the fields were showing mixed data

    // Save Golden Circle customization
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Retrieve it
    const result = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // The bug was:
    // - label1 showed: "¿Por qué?, ¿Cómo?, ¿Qué?" (should be just "¿Por qué?")
    // - label2 showed: "¿Por qué? Propósito" (should be just "¿Cómo?")
    // - label3 showed: "¿Cómo? Proceso" (should be just "¿Qué?")

    // Verify the fix
    expect(result?.label1).toBe("¿Por qué?");
    expect(result?.label1).not.toContain("¿Cómo?");
    expect(result?.label1).not.toContain("¿Qué?");

    expect(result?.label2).toBe("¿Cómo?");
    expect(result?.label2).not.toContain("¿Por qué?");
    expect(result?.label2).not.toContain("Propósito");

    expect(result?.label3).toBe("¿Qué?");
    expect(result?.label3).not.toContain("¿Cómo?");
    expect(result?.label3).not.toContain("Proceso");
  });
});
