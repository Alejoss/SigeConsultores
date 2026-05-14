import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users } from "./drizzle/schema.ts";
import bcrypt from "bcrypt";

const db = drizzle(process.env.DATABASE_URL);

async function resetPassword() {
  try {
    // Find the admin user (owner)
    const adminUser = await db
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);

    if (!adminUser || adminUser.length === 0) {
      console.error("No admin user found");
      process.exit(1);
    }

    const admin = adminUser[0];
    console.log("Found admin user:", admin.email);

    // Hash the new password
    const hashedPassword = await bcrypt.hash("JeeSa@2348", 10);

    // Update the password in the database
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, admin.id));

    console.log("✅ Password reset successfully!");
    console.log("New password: JeeSa@2348");
    process.exit(0);
  } catch (error) {
    console.error("Error resetting password:", error);
    process.exit(1);
  }
}

resetPassword();
