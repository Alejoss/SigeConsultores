import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
} from "../db";

const COMPANY = 777;

describe("Module customization isolation", () => {
  beforeAll(async () => {
    await deleteModuleCustomization(COMPANY, "purpose_proposito").catch(() => {});
    await deleteModuleCustomization(COMPANY, "sige_organization_chart").catch(() => {});
  });
  afterAll(async () => {
    await deleteModuleCustomization(COMPANY, "purpose_proposito").catch(() => {});
    await deleteModuleCustomization(COMPANY, "sige_organization_chart").catch(() => {});
  });

  it("keeps organigrama title independent from propósito label", async () => {
    await upsertModuleCustomization(COMPANY, "purpose_proposito", { label: "¿Por qué?" });
    await upsertModuleCustomization(COMPANY, "sige_organization_chart", { label: "Organigrama" });

    const p = await getModuleCustomization(COMPANY, "purpose_proposito");
    const o = await getModuleCustomization(COMPANY, "sige_organization_chart");

    expect(p?.customLabel).toBe("¿Por qué?");
    expect(o?.customLabel).toBe("Organigrama");
  });
});
