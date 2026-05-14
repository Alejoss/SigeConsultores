import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";
import { users, companies, userCompanyAccess } from "../../drizzle/schema";
import { getUserCompanies } from "../db";
import { eq } from "drizzle-orm";

describe("getUserCompanies Fix", () => {
  let db: any;
  let testUserId: number;
  let ownedCompanyId: number;
  let accessCompanyId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test user
    const userResult = await db.insert(users).values({
      openId: `test-user-${Date.now()}`,
      name: "Test User",
      email: `test-${Date.now()}@example.com`,
      role: "user",
    });
    testUserId = userResult[0].insertId || 1;

    // Create owned company
    const ownedResult = await db.insert(companies).values({
      name: `Owned Company ${Date.now()}`,
      description: "Company owned by test user",
      ownerUserId: testUserId,
    });
    ownedCompanyId = ownedResult[0].insertId || 1;

    // Create separate company with access
    const accessResult = await db.insert(companies).values({
      name: `Access Company ${Date.now()}`,
      description: "Company with access granted to test user",
      ownerUserId: 999, // Different owner
    });
    accessCompanyId = accessResult[0].insertId || 1;

    // Grant user access to the second company
    await db.insert(userCompanyAccess).values({
      userId: testUserId,
      companyId: accessCompanyId,
      role: "manager",
    });
  });

  afterAll(async () => {
    if (!db) return;

    // Cleanup
    try {
      await db.delete(userCompanyAccess).where(eq(userCompanyAccess.userId, testUserId));
      await db.delete(companies).where(eq(companies.ownerUserId, testUserId));
      await db.delete(companies).where(eq(companies.id, accessCompanyId));
      await db.delete(users).where(eq(users.id, testUserId));
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  });

  it("should return owned companies", async () => {
    const result = await getUserCompanies(testUserId);
    const ownedCompany = result.find((c: any) => c.id === ownedCompanyId);
    expect(ownedCompany).toBeDefined();
    expect(ownedCompany?.name).toContain("Owned Company");
  });

  it("should return companies with access via userCompanyAccess", async () => {
    const result = await getUserCompanies(testUserId);
    const accessCompany = result.find((c: any) => c.id === accessCompanyId);
    expect(accessCompany).toBeDefined();
    expect(accessCompany?.name).toContain("Access Company");
  });

  it("should return both owned and access companies", async () => {
    const result = await getUserCompanies(testUserId);
    expect(result.length).toBeGreaterThanOrEqual(2);
    
    const ownedCompany = result.find((c: any) => c.id === ownedCompanyId);
    const accessCompany = result.find((c: any) => c.id === accessCompanyId);
    
    expect(ownedCompany).toBeDefined();
    expect(accessCompany).toBeDefined();
  });

  it("should not have duplicate companies", async () => {
    const result = await getUserCompanies(testUserId);
    const ids = result.map((c: any) => c.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("should return empty array for user with no companies", async () => {
    // Create a user with no companies
    const noCompanyUserResult = await db.insert(users).values({
      openId: `no-company-user-${Date.now()}`,
      name: "No Company User",
      email: `no-company-${Date.now()}@example.com`,
      role: "user",
    });
    const noCompanyUserId = noCompanyUserResult[0].insertId || 1;

    const result = await getUserCompanies(noCompanyUserId);
    expect(result.length).toBe(0);

    // Cleanup
    await db.delete(users).where(eq(users.id, noCompanyUserId));
  });
});
