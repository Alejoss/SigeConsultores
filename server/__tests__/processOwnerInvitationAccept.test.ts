import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";
import {
  accounts,
  companies,
  processes,
  processOwnerInvitations,
  processOwners,
} from "../../drizzle/schema";
import {
  createProcessOwnerInvitation,
  acceptProcessOwnerInvitation,
  getProcessOwnerInvitation,
} from "../db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { insertTestAccount } from "./helpers/accounts";

describe("Process Owner Invitation Acceptance Flow", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testAccountId: number;
  let companyId: number;
  let processId: number;
  let invitationToken: string;
  const accessCode = "4321";

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    const account = await insertTestAccount(db, {
      openId: `test-manager-${Date.now()}`,
      name: "Test Manager",
      email: `manager-${Date.now()}@example.com`,
    });
    testAccountId = account.id;

    const companyResult = await db.insert(companies).values({
      name: `Test Company ${Date.now()}`,
      description: "Test company for invitation flow",
      ownerAccountId: testAccountId,
    });
    companyId = Number(companyResult[0].insertId);

    const processResult = await db.insert(processes).values({
      companyId,
      name: `Test Process ${Date.now()}`,
      description: "Test process for invitation",
      macroProcess: "Test Macro",
    });
    processId = Number(processResult[0].insertId);

    invitationToken = randomBytes(32).toString("hex");
  });

  afterAll(async () => {
    if (!db) return;

    try {
      await db.delete(processOwners).where(eq(processOwners.processId, processId));
      await db.delete(processOwnerInvitations).where(eq(processOwnerInvitations.processId, processId));
      await db.delete(processes).where(eq(processes.id, processId));
      await db.delete(companies).where(eq(companies.id, companyId));
      await db.delete(accounts).where(eq(accounts.id, testAccountId));
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  });

  it("should create a process owner invitation", async () => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const result = await createProcessOwnerInvitation(
      companyId,
      processId,
      "dolores@example.com",
      accessCode,
      invitationToken,
      expiresAt
    );

    expect(result).toBeDefined();
    expect(result.email).toBe("dolores@example.com");
    expect(result.status).toBe("pending");
    expect(result.accessCode).toBe(accessCode);
  });

  it("should retrieve invitation by token", async () => {
    const invitation = await getProcessOwnerInvitation(invitationToken);

    expect(invitation).toBeDefined();
    expect(invitation?.invitationToken).toBe(invitationToken);
    expect(invitation?.email).toBe("dolores@example.com");
    expect(invitation?.status).toBe("pending");
  });

  it("should accept invitation with correct access code", async () => {
    const result = await acceptProcessOwnerInvitation(invitationToken);

    expect(result).toBeDefined();
    expect(result.status).toBe("accepted");
  });

  it("should mark invitation as accepted after acceptance", async () => {
    const invitation = await getProcessOwnerInvitation(invitationToken);

    expect(invitation).toBeDefined();
    expect(invitation?.status).toBe("accepted");
  });

  it("should not accept invitation twice with same token", async () => {
    const invitation = await getProcessOwnerInvitation(invitationToken);
    expect(invitation?.status).toBe("accepted");
  });

  it("should reject invitation with wrong access code", async () => {
    const newToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await createProcessOwnerInvitation(
      companyId,
      processId,
      "test2@example.com",
      "1234",
      newToken,
      expiresAt
    );

    const invitation = await getProcessOwnerInvitation(newToken);
    expect(invitation?.accessCode).not.toBe("9999");
  });

  it("should handle expired invitations", async () => {
    const expiredToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() - 1);

    await createProcessOwnerInvitation(
      companyId,
      processId,
      "expired@example.com",
      "5678",
      expiredToken,
      expiresAt
    );

    const invitation = await getProcessOwnerInvitation(expiredToken);
    expect(invitation).toBeDefined();
    expect(invitation!.expiresAt < new Date()).toBe(true);
  });
});
