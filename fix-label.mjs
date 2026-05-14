import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import { companyModuleCustomization } from "./drizzle/schema.js";

const db = drizzle(process.env.DATABASE_URL);

async function fixLabel() {
  try {
    console.log("Buscando customizaciones de módulos...");
    
    // Get all sige_modules customizations
    const customizations = await db
      .select()
      .from(companyModuleCustomization)
      .where(eq(companyModuleCustomization.moduleName, "sige_modules"));
    
    console.log("Customizaciones encontradas:", customizations.length);
    
    if (customizations.length === 0) {
      console.log("No se encontraron customizaciones de sige_modules");
      return;
    }
    
    // Update label4 to "Organigrama" for all companies
    for (const customization of customizations) {
      console.log(`Actualizando label4 para companyId: ${customization.companyId}`);
      console.log(`Valor actual de label4: ${customization.label4}`);
      
      await db
        .update(companyModuleCustomization)
        .set({ label4: "Organigrama" })
        .where(
          and(
            eq(companyModuleCustomization.companyId, customization.companyId),
            eq(companyModuleCustomization.moduleName, "sige_modules")
          )
        );
      
      console.log(`✓ Actualizado a: Organigrama`);
    }
    
    console.log("\n✓ Todos los labels han sido actualizados correctamente");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixLabel();
