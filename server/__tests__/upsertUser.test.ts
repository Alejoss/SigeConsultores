import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, upsertUser } from "../db";
import { accounts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  deleteTestAccountsByEmails,
  ensurePlatformRoles,
  getPlatformRoleSlug,
} from "./helpers/accounts";

const CLEANUP_EMAILS = [
  "test-oauth@example.com",
  "test-setup@example.com",
  "test-preserve-role@example.com",
  "test-lastsignedin@example.com",
];

describe("upsertUser - Email-based lookup for OAuth flow", () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available for tests");
    await ensurePlatformRoles(db);
  });

  afterAll(async () => {
    if (db) {
      await deleteTestAccountsByEmails(db, CLEANUP_EMAILS);
    }
  });

  it("should create a new account when neither openId nor email exists", async () => {
    const newOpenId = "oauth-unique-id-" + Date.now();
    await upsertUser({
      openId: newOpenId,
      email: "test-oauth@example.com",
      name: "Test User",
      loginMethod: "oauth",
    });

    const result = await db!.select().from(accounts).where(eq(accounts.openId, newOpenId)).limit(1);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("test-oauth@example.com");
    expect(result[0].name).toBe("Test User");
    expect(await getPlatformRoleSlug(db!, result[0].id)).toBe("platform_user");
  });

  it("should find account by email when openId doesn't exist (OAuth login after setup)", async () => {
    const setupOpenId = "local-test-setup@example.com";
    await upsertUser({
      openId: setupOpenId,
      email: "test-setup@example.com",
      name: "Setup User",
      loginMethod: "setup",
    });

    let setupAccount = await db!.select().from(accounts).where(eq(accounts.email, "test-setup@example.com")).limit(1);
    expect(setupAccount).toHaveLength(1);
    expect(await getPlatformRoleSlug(db!, setupAccount[0].id)).toBe("platform_user");
    expect(setupAccount[0].openId).toBe(setupOpenId);

    const oauthOpenId = "oauth-unique-id-" + Date.now();
    await upsertUser({
      openId: oauthOpenId,
      email: "test-setup@example.com",
      name: "Setup User",
      loginMethod: "oauth",
    });

    const oauthAccount = await db!.select().from(accounts).where(eq(accounts.openId, oauthOpenId)).limit(1);
    expect(oauthAccount).toHaveLength(1);
    expect(oauthAccount[0].email).toBe("test-setup@example.com");
    expect(await getPlatformRoleSlug(db!, oauthAccount[0].id)).toBe("platform_user");
    expect(oauthAccount[0].loginMethod).toBe("oauth");

    const oldOpenIdAccount = await db!.select().from(accounts).where(eq(accounts.openId, setupOpenId)).limit(1);
    expect(oldOpenIdAccount).toHaveLength(0);

    const allWithEmail = await db!.select().from(accounts).where(eq(accounts.email, "test-setup@example.com"));
    expect(allWithEmail).toHaveLength(1);
  });

  it("should preserve platform role when updating existing account", async () => {
    const setupOpenId = "local-preserve-role-" + Date.now();
    const email = "test-preserve-role@example.com";

    await upsertUser({
      openId: setupOpenId,
      email,
      name: "Original Name",
    });

    let account = await db!.select().from(accounts).where(eq(accounts.email, email)).limit(1);
    expect(await getPlatformRoleSlug(db!, account[0].id)).toBe("platform_user");

    const oauthOpenId = "oauth-preserve-role-" + Date.now();
    await upsertUser({
      openId: oauthOpenId,
      email,
      name: "Updated Name",
    });

    account = await db!.select().from(accounts).where(eq(accounts.openId, oauthOpenId)).limit(1);
    expect(account).toHaveLength(1);
    expect(await getPlatformRoleSlug(db!, account[0].id)).toBe("platform_user");
    expect(account[0].name).toBe("Updated Name");
  });

  it("should update lastSignedIn on each login", async () => {
    const openId = "oauth-lastsignedin-" + Date.now();
    const email = "test-lastsignedin@example.com";

    const now1 = new Date();
    await upsertUser({
      openId,
      email,
      name: "Test User",
      lastSignedIn: now1,
    });

    let account = await db!.select().from(accounts).where(eq(accounts.openId, openId)).limit(1);
    const firstLogin = account[0].lastSignedIn;

    await new Promise((resolve) => setTimeout(resolve, 100));
    const now2 = new Date();
    await upsertUser({
      openId,
      email,
      lastSignedIn: now2,
    });

    account = await db!.select().from(accounts).where(eq(accounts.openId, openId)).limit(1);
    expect(account[0].lastSignedIn.getTime()).toBeGreaterThan(firstLogin.getTime());
  });

  it("should handle null email gracefully", async () => {
    const openId = "oauth-null-email-" + Date.now();

    await upsertUser({
      openId,
      email: null,
      name: "No Email User",
    });

    const account = await db!.select().from(accounts).where(eq(accounts.openId, openId)).limit(1);
    expect(account).toHaveLength(1);
    expect(account[0].email).toBeNull();
  });
});
