import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const url = new URL(dbUrl);
const config = {
  host: url.hostname,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
};

try {
  const connection = await mysql.createConnection(config);
  const [rows] = await connection.query(
    'SELECT invitationToken FROM managerInvitations WHERE managerEmail = ? ORDER BY id DESC LIMIT 1',
    ['angess22@gmail.com']
  );
  
  if (rows.length > 0) {
    console.log(rows[0].invitationToken);
  }
  
  await connection.end();
} catch (error) {
  console.error('Error:', error.message);
}
