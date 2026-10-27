import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authSessions } from "../drizzle/schema";
import { getDb } from "./db";

export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashSessionToken(plainToken: string): string {
  return createHash("sha256").update(plainToken, "utf8").digest("hex");
}

export function newSessionPlainToken(): string {
  return randomBytes(32).toString("hex");
}

export type CreateAuthSessionInput = {
  accountId: number;
};

export async function createAuthSession(
  input: CreateAuthSessionInput
): Promise<{ plainToken: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const plainToken = newSessionPlainToken();
  const tokenHash = hashSessionToken(plainToken);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);

  await db.insert(authSessions).values({
    tokenHash,
    expiresAt,
    accountId: input.accountId,
  });

  return { plainToken };
}

export async function findActiveAuthSessionByPlainToken(
  plainToken: string
): Promise<typeof authSessions.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const tokenHash = hashSessionToken(plainToken);
  const rows = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Stores only the course-panel company selected by an already authenticated
 * account. Authorization for that company is checked by the course service on
 * every request; this value never grants access by itself.
 */
export async function setAuthSessionCourseCompany(
  plainToken: string,
  companyId: number | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(authSessions)
    .set({ courseCompanyId: companyId })
    .where(eq(authSessions.tokenHash, hashSessionToken(plainToken)));
}

export async function revokeAuthSessionByPlainToken(
  plainToken: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const tokenHash = hashSessionToken(plainToken);
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.tokenHash, tokenHash));
}
