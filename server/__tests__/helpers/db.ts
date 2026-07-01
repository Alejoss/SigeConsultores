import { describe } from "vitest";

export function isDbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Skip the whole suite when DATABASE_URL is not configured. */
export const describeWithDb = isDbAvailable() ? describe : describe.skip;

export function requireDb(): void {
  if (!isDbAvailable()) {
    throw new Error(
      "DATABASE_URL is required for integration tests. Start MySQL (docker compose up -d mysql) and set DATABASE_URL in .env.local."
    );
  }
}
