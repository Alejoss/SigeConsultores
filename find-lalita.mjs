import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// Import schema
import { companies, processes } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

// Find Lalita company
const lalitaCompany = await db.select().from(companies).where(eq(companies.name, "Lalita S.A."));
console.log("Lalita Company:", lalitaCompany);

if (lalitaCompany.length > 0) {
  const companyId = lalitaCompany[0].id;
  
  // Find processes for Lalita
  const lalitaProcesses = await db.select().from(processes).where(eq(processes.companyId, companyId));
  console.log("Lalita Processes:", lalitaProcesses);
}

await connection.end();
