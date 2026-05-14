import { drizzle } from "drizzle-orm/mysql2";
import { companies } from "./drizzle/schema.ts";
import { eq, like } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL);

try {
  const result = await db.select().from(companies).where(like(companies.name, "%Lalita%"));
  console.log("Lalita S.A. found:", JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Error:", error.message);
}

process.exit(0);
