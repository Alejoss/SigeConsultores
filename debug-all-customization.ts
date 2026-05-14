import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./drizzle/schema";

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);

  const customizations = await db
    .select()
    .from(schema.companyModuleCustomization);

  console.log("=== Todas las personalizaciones ===\n");
  customizations.forEach((c) => {
    console.log(`Company: ${c.companyId}, Module: ${c.moduleName}`);
    console.log(`  label1: ${c.label1}`);
    console.log(`  label2: ${c.label2}`);
    console.log(`  label3: ${c.label3}`);
    console.log("");
  });

  process.exit(0);
}

main().catch(console.error);
