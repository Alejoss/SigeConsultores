const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
  const email = 'Sigecons@gmail.com';
  const password = 'Admins1234';
  
  const passwordHash = await bcrypt.hash(password, 10);
  console.log('Hash generado:', passwordHash.substring(0, 20) + '...');
  
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar si ya existe
  const [existing] = await conn.execute('SELECT id FROM accounts WHERE email = ?', [email]);
  
  if (existing.length > 0) {
    // Actualizar contraseña
    await conn.execute(
      'UPDATE accounts SET passwordHash = ?, status = ?, updatedAt = NOW() WHERE email = ?',
      [passwordHash, 'active', email]
    );
    console.log('✓ Contraseña actualizada para:', email);
  } else {
    // Crear nueva cuenta
    const openId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    await conn.execute(
      `INSERT INTO accounts (openId, email, passwordHash, loginMethod, status, createdAt, updatedAt) 
       VALUES (?, ?, ?, 'password', 'active', NOW(), NOW())`,
      [openId, email, passwordHash]
    );
    console.log('✓ Cuenta creada:', email);
  }
  
  // Verificar resultado
  const [rows] = await conn.execute('SELECT id, email, status, loginMethod FROM accounts WHERE email = ?', [email]);
  console.log('Cuenta en BD:', JSON.stringify(rows[0]));
  
  await conn.end();
}

main().catch(console.error);
