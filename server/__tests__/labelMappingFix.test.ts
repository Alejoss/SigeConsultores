import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getModuleCustomization, upsertModuleCustomization, deleteModuleCustomization } from "../db";

const COMPANY = 666;

describe("CompanyInfo-style label mapping", () => {
  beforeAll(async () => {
    await deleteModuleCustomization(COMPANY, "purpose_proposito").catch(() => {});
    await deleteModuleCustomization(COMPANY, "purpose_mision").catch(() => {});
    await deleteModuleCustomization(COMPANY, "purpose_vision").catch(() => {});
  });
  afterAll(async () => {
    await deleteModuleCustomization(COMPANY, "purpose_proposito").catch(() => {});
    await deleteModuleCustomization(COMPANY, "purpose_mision").catch(() => {});
    await deleteModuleCustomization(COMPANY, "purpose_vision").catch(() => {});
  });

  it("builds title from three independent module rows", async () => {
    await upsertModuleCustomization(COMPANY, "purpose_proposito", { label: "¿Por qué?" });
    await upsertModuleCustomization(COMPANY, "purpose_mision", { label: "¿Cómo?" });
    await upsertModuleCustomization(COMPANY, "purpose_vision", { label: "¿Qué?" });

    const p = await getModuleCustomization(COMPANY, "purpose_proposito");
    const m = await getModuleCustomization(COMPANY, "purpose_mision");
    const v = await getModuleCustomization(COMPANY, "purpose_vision");

    const title = `${p?.customLabel || "Propósito"}, ${m?.customLabel || "Misión"}, ${v?.customLabel || "Visión"}`;
    expect(title).toBe("¿Por qué?, ¿Cómo?, ¿Qué?");
  });
});
