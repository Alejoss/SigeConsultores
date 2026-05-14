import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const connection = await mysql.createConnection(dbUrl);

try {
  const [companies] = await connection.execute('SELECT id, name FROM companies WHERE name LIKE ?', ['%SIGE%']);
  console.log('Companies found:', companies.length);
  
  if (companies.length === 0) {
    console.error('SIGE Consultores company not found');
    process.exit(1);
  }
  
  const sigeCompanyId = companies[0].id;
  console.log(`Found SIGE Consultores with ID: ${sigeCompanyId}, Name: ${companies[0].name}`);
  
  const [managerResult] = await connection.execute(
    'INSERT INTO companyManagers (companyId, userId) VALUES (?, ?)',
    [sigeCompanyId, 1]
  );
  
  const companyManagerId = managerResult.insertId;
  console.log(`Created company manager with ID: ${companyManagerId}`);
  
  const password = 'Issael@2024#';
  const passwordHash = await bcrypt.hash(password, 10);
  
  const [credResult] = await connection.execute(
    'INSERT INTO managerCredentials (companyManagerId, email, passwordHash, isActive) VALUES (?, ?, ?, ?)',
    [companyManagerId, 'issaelg5@gmail.com', passwordHash, true]
  );
  
  console.log(`Created manager credentials with ID: ${credResult.insertId}`);
  console.log('✅ Manager setup complete!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  await connection.end();
}
