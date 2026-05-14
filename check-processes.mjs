import { getDb } from "./server/db.ts";
import { processes as processes_table, companies } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";

const db = await getDb();
if (!db) {
  console.log("DB not available");
  process.exit(1);
}

// Get Lalita S.A. company ID
const lalita = await db.select().from(companies).where(eq(companies.name, "Lalita S.A.")).limit(1);
console.log("Lalita S.A.:", lalita);

if (lalita.length > 0) {
  const companyId = lalita[0].id;
  const processes = await db.select().from(processes_table).where(eq(processes_table.companyId, companyId));
  console.log(`Procesos para Lalita S.A. (ID ${companyId}):`, processes);
  console.log(`Total procesos: ${processes.length}`);
} else {
  console.log("Lalita S.A. not found");
}

process.exit(0);
