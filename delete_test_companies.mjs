import { drizzle } from "drizzle-orm/mysql2";
import { like } from "drizzle-orm";
import { companies } from "./drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

async function deleteTestCompanies() {
  try {
    console.log("Deleting Test Company entries...");
    
    const result = await db
      .delete(companies)
      .where(like(companies.name, "%Test Company%"));
    
    console.log("Test Company entries deleted successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error deleting Test Company entries:", error);
    process.exit(1);
  }
}

deleteTestCompanies();
