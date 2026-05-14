import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
console.log('Database URL:', dbUrl);

// Parse the connection string
const url = new URL(dbUrl);
const config = {
  host: url.hostname,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: 'require',
};

console.log('Connecting to:', config.host, 'database:', config.database);

try {
  const connection = await mysql.createConnection(config);
  
  const [rows] = await connection.query(
    'SELECT id, managerEmail, companyId, isActive, passwordHash FROM companyManagerCredentials WHERE managerEmail = ?',
    ['angess22@gmail.com']
  );
  
  if (rows.length > 0) {
    console.log('Found credentials:');
    console.log('ID:', rows[0].id);
    console.log('Email:', rows[0].managerEmail);
    console.log('Company ID:', rows[0].companyId);
    console.log('Is Active:', rows[0].isActive);
    console.log('Password Hash:', rows[0].passwordHash?.substring(0, 30) + '...');
  } else {
    console.log('No credentials found');
  }
  
  await connection.end();
} catch (error) {
  console.error('Error:', error.message);
}
