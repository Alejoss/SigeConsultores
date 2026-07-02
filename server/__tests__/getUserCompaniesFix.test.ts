import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";
import { accounts, companies, userCompanyAccess } from "../../drizzle/schema";
import { getUserCompanies } from "../db";
import { eq } from "drizzle-orm";
import { insertTestAccount } from "./helpers/accounts";

describe("getUserCompanies Fix", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testAccountId: number;
  let ownedCompanyId: number;
  let accessCompanyId: number;
  let otherOwnerAccountId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    const account = await insertTestAccount(db, {
      openId: `test-user-${Date.now()}`,
      name: "Test User",
      email: `test-${Date.now()}@example.com`,
    });
    testAccountId = account.id;

    const otherOwner = await insertTestAccount(db, {
      openId: `other-owner-${Date.now()}`,
      email: `other-${Date.now()}@example.com`,
    });
    otherOwnerAccountId = otherOwner.id;

    const ownedResult = await db.insert(companies).values({
      name: `Owned Company ${Date.now()}`,
      description: "Company owned by test account",
      ownerAccountId: testAccountId,
    });
    ownedCompanyId = Number(ownedResult[0].insertId);

    const accessResult = await db.insert(companies).values({
      name: `Access Company ${Date.now()}`,
      description: "Company with access granted to test account",
      ownerAccountId: otherOwnerAccountId,
    });
    accessCompanyId = Number(accessResult[0].insertId);

    await db.insert(userCompanyAccess).values({
      accountId: testAccountId,
      companyId: accessCompanyId,
      role: "manager",
    });
  });

  afterAll(async () => {
    if (!db) return;

    try {
      await db.delete(userCompanyAccess).where(eq(userCompanyAccess.accountId, testAccountId));
      await db.delete(companies).where(eq(companies.id, ownedCompanyId));
      await db.delete(companies).where(eq(companies.id, accessCompanyId));
      await db.delete(accounts).where(eq(accounts.id, testAccountId));
      await db.delete(accounts).where(eq(accounts.id, otherOwnerAccountId));
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  });

  it("should return owned companies", async () => {
    const result = await getUserCompanies(testAccountId);
    const ownedCompany = result.find((c) => c.id === ownedCompanyId);
    expect(ownedCompany).toBeDefined();
    expect(ownedCompany?.name).toContain("Owned Company");
  });

  it("should return companies with access via userCompanyAccess", async () => {
    const result = await getUserCompanies(testAccountId);
    const accessCompany = result.find((c) => c.id === accessCompanyId);
    expect(accessCompany).toBeDefined();
    expect(accessCompany?.name).toContain("Access Company");
  });

  it("should return both owned and access companies", async () => {
    const result = await getUserCompanies(testAccountId);
    expect(result.length).toBeGreaterThanOrEqual(2);

    expect(result.find((c) => c.id === ownedCompanyId)).toBeDefined();
    expect(result.find((c) => c.id === accessCompanyId)).toBeDefined();
  });

  it("should not have duplicate companies", async () => {
    const result = await getUserCompanies(testAccountId);
    const ids = result.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("should return empty array for account with no companies", async () => {
    const lonely = await insertTestAccount(db, {
      openId: `no-company-${Date.now()}`,
      email: `no-company-${Date.now()}@example.com`,
    });

    const result = await getUserCompanies(lonely.id);
    expect(result.length).toBe(0);

    await db.delete(accounts).where(eq(accounts.id, lonely.id));
  });
});
