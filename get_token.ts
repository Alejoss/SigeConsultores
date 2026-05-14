import { drizzle } from "drizzle-orm/mysql2";
import { managerInvitations } from "./drizzle/schema";
import { eq } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL as string);

async function getToken() {
  try {
    const result = await db
      .select()
      .from(managerInvitations)
      .where(eq(managerInvitations.acceptedAt, null))
      .limit(1);
    
    if (result && result.length > 0) {
      console.log("Token:", result[0].invitationToken);
      console.log("Email:", result[0].managerEmail);
      console.log("Company ID:", result[0].companyId);
    } else {
      console.log("No pending invitations found");
    }
  } catch (error) {
    console.error("Error:", error);
  }
  process.exit(0);
}

getToken();
