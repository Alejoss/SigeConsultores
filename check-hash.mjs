import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DATABASE_URL?.split('://')[1]?.split('@')[1]?.split(':')[0] || 'localhost',
  user: process.env.DATABASE_URL?.split('://')[1]?.split(':')[0] || 'root',
  password: process.env.DATABASE_URL?.split(':')[2]?.split('@')[0] || '',
  database: process.env.DATABASE_URL?.split('/').pop() || 'sige',
});

try {
  const [rows] = await connection.query(
    'SELECT managerEmail, companyId, passwordHash FROM companyManagerCredentials WHERE managerEmail = ?',
    ['angess22@gmail.com']
  );
  
  if (rows.length > 0) {
    console.log('Found credentials:');
    console.log('Email:', rows[0].managerEmail);
    console.log('Company ID:', rows[0].companyId);
    console.log('Password Hash:', rows[0].passwordHash);
  } else {
    console.log('No credentials found for angess22@gmail.com');
  }
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await connection.end();
}
