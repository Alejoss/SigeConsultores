import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import { accounts, managerInvitations, companies } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { insertTestAccount } from "../../__tests__/helpers/accounts";

describe("Manager Credentials - Token Validation", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testCompanyId: number;
  let testToken: string;
  let ownerAccountId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    const owner = await insertTestAccount(db, {
      openId: `manager-creds-owner-${Date.now()}`,
      email: `manager-creds-${Date.now()}@example.com`,
    });
    ownerAccountId = owner.id;

    const result = await db.insert(companies).values({
      name: "Test Company for Token Validation",
      ownerAccountId,
    });

    testCompanyId = Number(result[0].insertId);
  });

  afterAll(async () => {
    if (!db) return;
    await db
      .delete(managerInvitations)
      .where(eq(managerInvitations.companyId, testCompanyId));
    await db.delete(companies).where(eq(companies.id, testCompanyId));
    await db.delete(accounts).where(eq(accounts.id, ownerAccountId));
  });

  it("should find a valid invitation token in managerInvitations table", async () => {
    if (!db) throw new Error("Database not available");

    // Create a test invitation
    testToken = "test-token-" + Date.now();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.insert(managerInvitations).values({
      companyId: testCompanyId,
      managerEmail: "test@example.com",
      invitationToken: testToken,
      expiresAt,
      acceptedAt: null,
    });

    // Verify the token can be found
    const invitation = await db
      .select()
      .from(managerInvitations)
      .where(eq(managerInvitations.invitationToken, testToken))
      .limit(1);

    expect(invitation).toHaveLength(1);
    expect(invitation[0].invitationToken).toBe(testToken);
    expect(invitation[0].companyId).toBe(testCompanyId);
  });

  it("should detect expired invitation tokens", async () => {
    if (!db) throw new Error("Database not available");

    // Create an expired invitation
    const expiredToken = "expired-token-" + Date.now();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() - 1); // Yesterday

    await db.insert(managerInvitations).values({
      companyId: testCompanyId,
      managerEmail: "expired@example.com",
      invitationToken: expiredToken,
      expiresAt,
      acceptedAt: null,
    });

    // Verify the token is expired
    const invitation = await db
      .select()
      .from(managerInvitations)
      .where(eq(managerInvitations.invitationToken, expiredToken))
      .limit(1);

    expect(invitation).toHaveLength(1);
    expect(new Date(invitation[0].expiresAt) < new Date()).toBe(true);
  });

  it("should detect already used invitation tokens", async () => {
    if (!db) throw new Error("Database not available");

    // Create a used invitation
    const usedToken = "used-token-" + Date.now();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.insert(managerInvitations).values({
      companyId: testCompanyId,
      managerEmail: "used@example.com",
      invitationToken: usedToken,
      expiresAt,
      acceptedAt: new Date(),
    });

    // Verify the token is marked as used
    const invitation = await db
      .select()
      .from(managerInvitations)
      .where(eq(managerInvitations.invitationToken, usedToken))
      .limit(1);

    expect(invitation).toHaveLength(1);
    expect(invitation[0].acceptedAt).not.toBeNull();
  });
});
