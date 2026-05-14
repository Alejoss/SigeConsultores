import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const connection = await mysql.createConnection(dbUrl);

try {
  const [results] = await connection.execute(`
    SELECT 
      mc.id, 
      mc.email, 
      mc.companyManagerId, 
      mc.isActive,
      cm.id as cm_id, 
      cm.companyId, 
      cm.userId,
      c.name as companyName
    FROM managerCredentials mc 
    LEFT JOIN companyManagers cm ON mc.companyManagerId = cm.id
    LEFT JOIN companies c ON cm.companyId = c.id
  `);
  
  console.log('Manager Credentials:');
  console.table(results);
  
} finally {
  await connection.end();
}
