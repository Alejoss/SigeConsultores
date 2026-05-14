const mysql = require('mysql2/promise');

const url = new URL(process.env.DATABASE_URL);

async function findLalita() {
  const connection = await mysql.createConnection({
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: 'Amazon RDS'
  });

  const [rows] = await connection.execute('SELECT id, name FROM companies WHERE name LIKE ?', ['%Lalita%']);
  console.log('Lalita S.A. found:', JSON.stringify(rows, null, 2));
  
  await connection.end();
}

findLalita().catch(err => console.error('Error:', err.message));
