import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
  getAllModuleCustomizations,
} from "../db";

// Test company ID (use a test company)
const TEST_COMPANY_ID = 888;
const PURPOSE_MODULE = "purpose_mission_vision";
const SIGE_MODULES = "sige_modules";

describe("Module Customization Data Mapping Fix", () => {
  beforeAll(async () => {
    // Clean up before tests
    await deleteModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES).catch(() => {});
  });

  afterAll(async () => {
    // Clean up after tests
    await deleteModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES).catch(() => {});
  });

  it("should store and retrieve purpose_mission_vision labels correctly", async () => {
    // Create customization for purpose_mission_vision
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Retrieve it
    const result = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    expect(result).toBeDefined();
    expect(result?.label1).toBe("¿Por qué?");
    expect(result?.label2).toBe("¿Cómo?");
    expect(result?.label3).toBe("¿Qué?");
  });

  it("should store and retrieve sige_modules labels correctly", async () => {
    // Create customization for sige_modules
    await upsertModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES, {
      label1: "Fundamentos",
      label2: "Valores",
      label3: "Política",
      label4: "Objetivos",
      label5: "Procesos",
    });

    // Retrieve it
    const result = await getModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES);

    expect(result).toBeDefined();
    expect(result?.label1).toBe("Fundamentos");
    expect(result?.label2).toBe("Valores");
    expect(result?.label3).toBe("Política");
    expect(result?.label4).toBe("Objetivos");
    expect(result?.label5).toBe("Procesos");
  });

  it("should NOT mix data between different modules", async () => {
    // Create customization for purpose_mission_vision
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Create customization for sige_modules
    await upsertModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES, {
      label1: "Fundamentos",
      label2: "Valores",
      label3: "Política",
      label4: "Objetivos",
      label5: "Procesos",
    });

    // Retrieve purpose_mission_vision
    const purposeResult = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);

    // Verify it has the correct labels
    expect(purposeResult?.label1).toBe("¿Por qué?");
    expect(purposeResult?.label2).toBe("¿Cómo?");
    expect(purposeResult?.label3).toBe("¿Qué?");

    // Verify it does NOT have sige_modules labels
    expect(purposeResult?.label1).not.toBe("Fundamentos");
    expect(purposeResult?.label2).not.toBe("Valores");

    // Retrieve sige_modules
    const sigeResult = await getModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES);

    // Verify it has the correct labels
    expect(sigeResult?.label1).toBe("Fundamentos");
    expect(sigeResult?.label2).toBe("Valores");
    expect(sigeResult?.label3).toBe("Política");

    // Verify it does NOT have purpose_mission_vision labels
    expect(sigeResult?.label1).not.toBe("¿Por qué?");
    expect(sigeResult?.label2).not.toBe("¿Cómo?");
  });

  it("should retrieve all customizations for a company independently", async () => {
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

    // Get all customizations
    const all = await getAllModuleCustomizations(TEST_COMPANY_ID);

    expect(all.length).toBe(2);

    // Find each module in the results
    const purposeCustom = all.find((c) => c.moduleName === PURPOSE_MODULE);
    const sigeCustom = all.find((c) => c.moduleName === SIGE_MODULES);

    expect(purposeCustom).toBeDefined();
    expect(sigeCustom).toBeDefined();

    // Verify each has the correct labels
    expect(purposeCustom?.label1).toBe("¿Por qué?");
    expect(sigeCustom?.label1).toBe("Fundamentos");
  });

  it("should update only the specified module without affecting others", async () => {
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
    const purposeResult = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);
    expect(purposeResult?.label1).toBe("Razón de ser");
    expect(purposeResult?.label2).toBe("Estrategia");
    expect(purposeResult?.label3).toBe("Meta");

    // Verify sige_modules was NOT affected
    const sigeResult = await getModuleCustomization(TEST_COMPANY_ID, SIGE_MODULES);
    expect(sigeResult?.label1).toBe("Fundamentos");
    expect(sigeResult?.label2).toBe("Valores");
    expect(sigeResult?.label3).toBe("Política");
  });

  it("should handle partial updates correctly", async () => {
    // Create initial customization
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "¿Por qué?",
      label2: "¿Cómo?",
      label3: "¿Qué?",
    });

    // Update only label1
    await upsertModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE, {
      label1: "Propósito",
    });

    // Retrieve and verify
    const result = await getModuleCustomization(TEST_COMPANY_ID, PURPOSE_MODULE);
    expect(result?.label1).toBe("Propósito");
    // label2 and label3 should be undefined after partial update
    expect(result?.label2).toBeUndefined();
    expect(result?.label3).toBeUndefined();
  });

  it("should correctly distinguish between companies", async () => {
    const COMPANY_A = 777;
    const COMPANY_B = 666;

    try {
      // Create customizations for different companies
      await upsertModuleCustomization(COMPANY_A, PURPOSE_MODULE, {
        label1: "Company A - ¿Por qué?",
        label2: "Company A - ¿Cómo?",
        label3: "Company A - ¿Qué?",
      });

      await upsertModuleCustomization(COMPANY_B, PURPOSE_MODULE, {
        label1: "Company B - ¿Por qué?",
        label2: "Company B - ¿Cómo?",
        label3: "Company B - ¿Qué?",
      });

      // Retrieve for each company
      const companyAResult = await getModuleCustomization(COMPANY_A, PURPOSE_MODULE);
      const companyBResult = await getModuleCustomization(COMPANY_B, PURPOSE_MODULE);

      // Verify they have different values
      expect(companyAResult?.label1).toBe("Company A - ¿Por qué?");
      expect(companyBResult?.label1).toBe("Company B - ¿Por qué?");
    } finally {
      // Clean up
      await deleteModuleCustomization(COMPANY_A, PURPOSE_MODULE).catch(() => {});
      await deleteModuleCustomization(COMPANY_B, PURPOSE_MODULE).catch(() => {});
    }
  });
});
