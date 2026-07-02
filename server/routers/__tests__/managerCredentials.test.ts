import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import { accounts, authInvitations, companies } from "../../../drizzle/schema";
import { and, eq } from "drizzle-orm";
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
      .delete(authInvitations)
      .where(eq(authInvitations.companyId, testCompanyId));
    await db.delete(companies).where(eq(companies.id, testCompanyId));
    await db.delete(accounts).where(eq(accounts.id, ownerAccountId));
  });

  it("should find a valid manager invitation token in authInvitations", async () => {
    if (!db) throw new Error("Database not available");

    testToken = "test-token-" + Date.now();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.insert(authInvitations).values({
      kind: "manager",
      email: "test@example.com",
      invitationToken: testToken,
      companyId: testCompanyId,
      expiresAt,
      acceptedAt: null,
    });

    const invitation = await db
      .select()
      .from(authInvitations)
      .where(
        and(
          eq(authInvitations.invitationToken, testToken),
          eq(authInvitations.kind, "manager")
        )
      )
      .limit(1);

    expect(invitation).toHaveLength(1);
    expect(invitation[0].invitationToken).toBe(testToken);
    expect(invitation[0].companyId).toBe(testCompanyId);
  });

  it("should detect expired invitation tokens", async () => {
    if (!db) throw new Error("Database not available");

    const expiredToken = "expired-token-" + Date.now();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() - 1);

    await db.insert(authInvitations).values({
      kind: "manager",
      email: "expired@example.com",
      invitationToken: expiredToken,
      companyId: testCompanyId,
      expiresAt,
      acceptedAt: null,
    });

    const invitation = await db
      .select()
      .from(authInvitations)
      .where(eq(authInvitations.invitationToken, expiredToken))
      .limit(1);

    expect(invitation).toHaveLength(1);
    expect(new Date(invitation[0].expiresAt) < new Date()).toBe(true);
  });

  it("should detect already used invitation tokens", async () => {
    if (!db) throw new Error("Database not available");

    const usedToken = "used-token-" + Date.now();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.insert(authInvitations).values({
      kind: "manager",
      email: "used@example.com",
      invitationToken: usedToken,
      companyId: testCompanyId,
      expiresAt,
      acceptedAt: new Date(),
    });

    const invitation = await db
      .select()
      .from(authInvitations)
      .where(eq(authInvitations.invitationToken, usedToken))
      .limit(1);

    expect(invitation).toHaveLength(1);
    expect(invitation[0].acceptedAt).not.toBeNull();
  });
});
