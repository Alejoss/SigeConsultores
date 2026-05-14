import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, upsertUser } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("upsertUser - Email-based lookup for OAuth flow", () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      throw new Error("Database not available for tests");
    }
  });

  afterAll(async () => {
    // Cleanup test users
    if (db) {
      await db.delete(users).where(eq(users.email, "test-oauth@example.com"));
      await db.delete(users).where(eq(users.email, "test-setup@example.com"));
    }
  });

  it("should create a new user when neither openId nor email exists", async () => {
    const newOpenId = "oauth-unique-id-" + Date.now();
    await upsertUser({
      openId: newOpenId,
      email: "test-oauth@example.com",
      name: "Test User",
      loginMethod: "oauth",
    });

    const result = await db!.select().from(users).where(eq(users.openId, newOpenId)).limit(1);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("test-oauth@example.com");
    expect(result[0].name).toBe("Test User");
    expect(result[0].role).toBe("user"); // Default role for new users
  });

  it("should find user by email when openId doesn't exist (OAuth login after setup)", async () => {
    // Step 1: Create user during setup with local-email openId
    const setupOpenId = "local-test-setup@example.com";
    await upsertUser({
      openId: setupOpenId,
      email: "test-setup@example.com",
      name: "Setup User",
      role: "user", // Explicitly set during setup
      loginMethod: "setup",
    });

    // Verify user was created with role="user"
    let setupUser = await db!.select().from(users).where(eq(users.email, "test-setup@example.com")).limit(1);
    expect(setupUser).toHaveLength(1);
    expect(setupUser[0].role).toBe("user");
    expect(setupUser[0].openId).toBe(setupOpenId);

    // Step 2: OAuth login with different openId but same email
    const oauthOpenId = "oauth-unique-id-" + Date.now();
    await upsertUser({
      openId: oauthOpenId,
      email: "test-setup@example.com",
      name: "Setup User", // Name might come from OAuth
      loginMethod: "oauth",
    });

    // Step 3: Verify user was UPDATED (not created as new)
    const oauthUser = await db!.select().from(users).where(eq(users.openId, oauthOpenId)).limit(1);
    expect(oauthUser).toHaveLength(1);
    expect(oauthUser[0].email).toBe("test-setup@example.com");
    expect(oauthUser[0].role).toBe("user"); // Role should be preserved!
    expect(oauthUser[0].loginMethod).toBe("oauth");

    // Step 4: Verify old openId no longer exists
    const oldOpenIdUser = await db!.select().from(users).where(eq(users.openId, setupOpenId)).limit(1);
    expect(oldOpenIdUser).toHaveLength(0); // Should be deleted or not found

    // Step 5: Verify there's only ONE user with this email
    const allUsersWithEmail = await db!.select().from(users).where(eq(users.email, "test-setup@example.com"));
    expect(allUsersWithEmail).toHaveLength(1);
    expect(allUsersWithEmail[0].role).toBe("user");
  });

  it("should preserve role when updating existing user", async () => {
    const setupOpenId = "local-preserve-role-" + Date.now();
    const email = "test-preserve-role@example.com";

    // Create user with role="user"
    await upsertUser({
      openId: setupOpenId,
      email: email,
      name: "Original Name",
      role: "user",
    });

    let user = await db!.select().from(users).where(eq(users.email, email)).limit(1);
    expect(user[0].role).toBe("user");

    // Update with different openId (OAuth login)
    const oauthOpenId = "oauth-preserve-role-" + Date.now();
    await upsertUser({
      openId: oauthOpenId,
      email: email,
      name: "Updated Name",
      // Note: NOT providing role, so it should be preserved
    });

    // Verify role is still "user"
    user = await db!.select().from(users).where(eq(users.openId, oauthOpenId)).limit(1);
    expect(user).toHaveLength(1);
    expect(user[0].role).toBe("user");
    expect(user[0].name).toBe("Updated Name"); // Name should be updated
  });

  it("should update lastSignedIn on each login", async () => {
    const openId = "oauth-lastsignedin-" + Date.now();
    const email = "test-lastsignedin@example.com";

    const now1 = new Date();
    await upsertUser({
      openId: openId,
      email: email,
      name: "Test User",
      lastSignedIn: now1,
    });

    let user = await db!.select().from(users).where(eq(users.openId, openId)).limit(1);
    const firstLogin = user[0].lastSignedIn;

    // Wait a bit and update
    await new Promise((resolve) => setTimeout(resolve, 100));
    const now2 = new Date();
    await upsertUser({
      openId: openId,
      email: email,
      lastSignedIn: now2,
    });

    user = await db!.select().from(users).where(eq(users.openId, openId)).limit(1);
    expect(user[0].lastSignedIn.getTime()).toBeGreaterThan(firstLogin.getTime());
  });

  it("should handle null email gracefully", async () => {
    const openId = "oauth-null-email-" + Date.now();

    await upsertUser({
      openId: openId,
      email: null,
      name: "No Email User",
    });

    const user = await db!.select().from(users).where(eq(users.openId, openId)).limit(1);
    expect(user).toHaveLength(1);
    expect(user[0].email).toBeNull();
  });
});
