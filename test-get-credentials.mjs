// Test the getManagerCredentialsByEmail function
import { getDb } from './server/db.ts';
import { companyManagerCredentials } from './drizzle/schema.ts';
import { eq, and } from 'drizzle-orm';

async function testGetCredentials() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    return;
  }

  try {
    // Test 1: Get all credentials
    console.log('=== All credentials ===');
    const all = await db.select().from(companyManagerCredentials);
    console.log('Total:', all.length);
    all.forEach(cred => {
      console.log(`- ${cred.managerEmail} (company: ${cred.companyId}, active: ${cred.isActive})`);
    });
    console.log('');

    // Test 2: Get Ángela's credentials
    console.log('=== Ángela\'s credentials ===');
    const angela = await db
      .select()
      .from(companyManagerCredentials)
      .where(eq(companyManagerCredentials.managerEmail, 'angess22@gmail.com'));
    
    if (angela.length > 0) {
      console.log('Found:', angela[0]);
    } else {
      console.log('Not found');
    }
    console.log('');

    // Test 3: Get active credentials for Ángela
    console.log('=== Ángela\'s active credentials ===');
    const angelaActive = await db
      .select()
      .from(companyManagerCredentials)
      .where(
        and(
          eq(companyManagerCredentials.managerEmail, 'angess22@gmail.com'),
          eq(companyManagerCredentials.isActive, true)
        )
      );
    
    if (angelaActive.length > 0) {
      console.log('Found:', angelaActive[0]);
    } else {
      console.log('Not found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testGetCredentials();
