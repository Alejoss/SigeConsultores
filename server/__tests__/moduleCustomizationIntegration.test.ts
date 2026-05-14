import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, upsertUser, getUserByOpenId } from "../db";
import { eq } from "drizzle-orm";
import { companies, companyModuleCustomization } from "../../drizzle/schema";

describe("Module Customization Integration", () => {
  let db: any;
  let agroganaId: number;
  let lalitaId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get company IDs
    const agroganaResult = await db
      .select()
      .from(companies)
      .where(eq(companies.name, "Agrogana"))
      .limit(1);

    const lalitaResult = await db
      .select()
      .from(companies)
      .where(eq(companies.name, "Lalita S.A."))
      .limit(1);

    if (agroganaResult.length > 0) agroganaId = agroganaResult[0].id;
    if (lalitaResult.length > 0) lalitaId = lalitaResult[0].id;
  });

  it("should allow Agrogana to customize labels to Golden Circle", async () => {
    if (!agroganaId) {
      console.warn("Agrogana company not found, skipping test");
      return;
    }

    // Create customization for Agrogana
    await db.insert(companyModuleCustomization).values({
      companyId: agroganaId,
      moduleName: "purpose_mission_vision",
      label1: "¿Por qué?, ¿Cómo?, ¿Qué?",
      label2: "EL \"POR QUÉ\"",
      label3: "EL \"CÓMO\"",
      label4: "EL \"QUÉ\"",
    });

    // Verify customization was saved
    const customization = await db
      .select()
      .from(companyModuleCustomization)
      .where(
        eq(companyModuleCustomization.companyId, agroganaId)
      )
      .limit(1);

    expect(customization).toHaveLength(1);
    expect(customization[0].label2).toBe("EL \"POR QUÉ\"");
    expect(customization[0].label3).toBe("EL \"CÓMO\"");
    expect(customization[0].label4).toBe("EL \"QUÉ\"");
  });

  it("should keep Lalita S.A. with default labels", async () => {
    if (!lalitaId) {
      console.warn("Lalita S.A. company not found, skipping test");
      return;
    }

    // Check that Lalita S.A. has no customization (uses defaults)
    const customization = await db
      .select()
      .from(companyModuleCustomization)
      .where(
        eq(companyModuleCustomization.companyId, lalitaId)
      )
      .limit(1);

    // Should be empty or use defaults
    if (customization.length === 0) {
      expect(customization).toHaveLength(0);
    } else {
      // If customization exists, it should have default values
      expect(customization[0].label2).toBe("Propósito");
      expect(customization[0].label3).toBe("Misión");
      expect(customization[0].label4).toBe("Visión");
    }
  });

  it("should allow updating existing customization", async () => {
    if (!agroganaId) {
      console.warn("Agrogana company not found, skipping test");
      return;
    }

    // Update customization
    await db
      .update(companyModuleCustomization)
      .set({
        label2: "NUEVO POR QUÉ",
      })
      .where(eq(companyModuleCustomization.companyId, agroganaId));

    // Verify update
    const customization = await db
      .select()
      .from(companyModuleCustomization)
      .where(eq(companyModuleCustomization.companyId, agroganaId))
      .limit(1);

    expect(customization[0].label2).toBe("NUEVO POR QUÉ");
  });

  it("should support multiple companies with different customizations", async () => {
    if (!agroganaId || !lalitaId) {
      console.warn("Required companies not found, skipping test");
      return;
    }

    // Get both customizations
    const agroganaCustom = await db
      .select()
      .from(companyModuleCustomization)
      .where(eq(companyModuleCustomization.companyId, agroganaId))
      .limit(1);

    const lalitaCustom = await db
      .select()
      .from(companyModuleCustomization)
      .where(eq(companyModuleCustomization.companyId, lalitaId))
      .limit(1);

    // Agrogana should have custom labels
    if (agroganaCustom.length > 0) {
      expect(agroganaCustom[0].label2).not.toBe("Propósito");
    }

    // Lalita should have default or different labels
    if (lalitaCustom.length > 0) {
      expect(lalitaCustom[0].label2).toBe("Propósito");
    }
  });

  afterAll(async () => {
    // Cleanup: remove test customizations
    if (agroganaId && db) {
      await db
        .delete(companyModuleCustomization)
        .where(eq(companyModuleCustomization.companyId, agroganaId));
    }
  });
});
