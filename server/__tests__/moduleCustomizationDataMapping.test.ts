import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getModuleCustomization,
  upsertModuleCustomization,
  deleteModuleCustomization,
} from "../db";

const COMPANY = 888;

describe("Module customization keys", () => {
  beforeAll(async () => {
    await deleteModuleCustomization(COMPANY, "purpose_proposito").catch(() => {});
    await deleteModuleCustomization(COMPANY, "sige_company_info").catch(() => {});
  });
  afterAll(async () => {
    await deleteModuleCustomization(COMPANY, "purpose_proposito").catch(() => {});
    await deleteModuleCustomization(COMPANY, "sige_company_info").catch(() => {});
  });

  it("does not mix labels between moduleName rows", async () => {
    await upsertModuleCustomization(COMPANY, "purpose_proposito", { label: "PMV-A" });
    await upsertModuleCustomization(COMPANY, "sige_company_info", { label: "SIGE-B" });

    const a = await getModuleCustomization(COMPANY, "purpose_proposito");
    const b = await getModuleCustomization(COMPANY, "sige_company_info");

    expect(a?.customLabel).toBe("PMV-A");
    expect(b?.customLabel).toBe("SIGE-B");
  });
});
