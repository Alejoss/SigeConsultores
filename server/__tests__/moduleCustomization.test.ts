import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
  getAllModuleCustomizations,
} from "../db";

const TEST_COMPANY_ID = 999;
const TEST_MODULE = "purpose_proposito";

describe("Module Customization", () => {
  beforeAll(async () => {
    await deleteModuleCustomization(TEST_COMPANY_ID, TEST_MODULE).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, "sige_company_info").catch(() => {});
  });

  afterAll(async () => {
    await deleteModuleCustomization(TEST_COMPANY_ID, TEST_MODULE).catch(() => {});
    await deleteModuleCustomization(TEST_COMPANY_ID, "sige_company_info").catch(() => {});
  });

  it("creates and retrieves a single customLabel per moduleName", async () => {
    const created = await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE, {
      label: "¿Por qué?",
    });
    expect(created?.customLabel).toBe("¿Por qué?");

    const row = await getModuleCustomization(TEST_COMPANY_ID, TEST_MODULE);
    expect(row?.customLabel).toBe("¿Por qué?");
  });

  it("overwrites the previous label for the same moduleName", async () => {
    await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE, { label: "Primero" });
    const second = await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE, { label: "Segundo" });
    expect(second?.customLabel).toBe("Segundo");
  });

  it("clears customization when label is null", async () => {
    await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE, { label: "X" });
    const cleared = await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE, { label: null });
    expect(cleared?.customLabel).toBeNull();
  });

  it("returns undefined for missing row", async () => {
    const result = await getModuleCustomization(999999, "non_existent_module");
    expect(result).toBeUndefined();
  });

  it("deletes a customization row", async () => {
    await upsertModuleCustomization(TEST_COMPANY_ID, TEST_MODULE, { label: "Temp" });
    await deleteModuleCustomization(TEST_COMPANY_ID, TEST_MODULE);
    const result = await getModuleCustomization(TEST_COMPANY_ID, TEST_MODULE);
    expect(result).toBeUndefined();
  });

  it("keeps different moduleName rows independent", async () => {
    await upsertModuleCustomization(TEST_COMPANY_ID, "purpose_proposito", { label: "A" });
    await upsertModuleCustomization(TEST_COMPANY_ID, "sige_company_info", { label: "B" });

    const all = await getAllModuleCustomizations(TEST_COMPANY_ID);
    const byName = Object.fromEntries(all.map((r) => [r.moduleName, r.customLabel]));

    expect(byName.purpose_proposito).toBe("A");
    expect(byName.sige_company_info).toBe("B");

    await deleteModuleCustomization(TEST_COMPANY_ID, "purpose_proposito");
    await deleteModuleCustomization(TEST_COMPANY_ID, "sige_company_info");
  });
});
