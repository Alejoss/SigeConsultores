import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const connection = await mysql.createConnection(dbUrl);

try {
  // Get SIGE Consultores company ID
  const [companies] = await connection.execute('SELECT id, name FROM companies WHERE name LIKE ?', ['%SIGE%']);
  const sigeCompanyId = companies[0].id;
  console.log(`SIGE Consultores ID: ${sigeCompanyId}`);
  
  // Get Issael's company manager
  const [managers] = await connection.execute(
    'SELECT id, companyId FROM companyManagers WHERE id = 90001'
  );
  
  if (managers.length === 0) {
    console.error('Company manager 90001 not found');
    process.exit(1);
  }
  
  console.log(`Current company manager: ID=${managers[0].id}, companyId=${managers[0].companyId}`);
  
  // Update the company manager to point to SIGE Consultores
  const [result] = await connection.execute(
    'UPDATE companyManagers SET companyId = ? WHERE id = 90001',
    [sigeCompanyId]
  );
  
  console.log(`Updated company manager: ${result.changedRows} rows affected`);
  
  // Verify the update
  const [updated] = await connection.execute(
    'SELECT cm.id, cm.companyId, c.name FROM companyManagers cm LEFT JOIN companies c ON cm.companyId = c.id WHERE cm.id = 90001'
  );
  
  console.log('Updated company manager:');
  console.table(updated);
  console.log('✅ Fix complete!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  await connection.end();
}
