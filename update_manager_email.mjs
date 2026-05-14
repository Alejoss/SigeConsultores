import { drizzle } from "drizzle-orm/mysql2";
import { companyManagerCredentials } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

async function updateEmail() {
  try {
    const result = await db
      .update(companyManagerCredentials)
      .set({ managerEmail: "alvaro@agrogana.com" })
      .where(eq(companyManagerCredentials.managerEmail, "lalitera@yahoo.com"));
    
    console.log("Update result:", result);
    console.log("Email updated successfully");
  } catch (error) {
    console.error("Error updating email:", error);
  }
}

updateEmail();
