import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getDb,
  upsertModuleCustomization,
  deleteModuleCustomization,
  getModuleCustomization,
} from "../db";
import { eq } from "drizzle-orm";
import { companies } from "../../drizzle/schema";

describe("Module Customization Integration", () => {
  let agroganaId: number | undefined;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(companies).where(eq(companies.name, "Agrogana")).limit(1);
    if (rows.length > 0) agroganaId = rows[0].id;
  });

  afterAll(async () => {
    if (!agroganaId) return;
    await deleteModuleCustomization(agroganaId, "purpose_proposito").catch(() => {});
  });

  it("persists one customLabel per moduleName for a real company row", async () => {
    if (!agroganaId) {
      console.warn("Agrogana company not found, skipping");
      return;
    }
    await upsertModuleCustomization(agroganaId, "purpose_proposito", { label: "¿Por qué?" });
    const row = await getModuleCustomization(agroganaId, "purpose_proposito");
    expect(row?.customLabel).toBe("¿Por qué?");
  });
});
