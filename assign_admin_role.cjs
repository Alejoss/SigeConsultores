const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const email = 'Sigecons@gmail.com';
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // 1. Obtener el id de la cuenta
  const [accounts] = await conn.execute('SELECT id FROM accounts WHERE LOWER(email) = ?', [email.toLowerCase()]);
  if (!accounts.length) { console.error('Cuenta no encontrada'); process.exit(1); }
  const accountId = accounts[0].id;
  console.log('Account ID:', accountId);

  // 2. Verificar si existe el rol platform_admin en la tabla roles
  const [existingRoles] = await conn.execute("SELECT id, slug FROM roles WHERE slug = 'platform_admin'");
  let roleId;
  if (existingRoles.length > 0) {
    roleId = existingRoles[0].id;
    console.log('Rol platform_admin encontrado, ID:', roleId);
  } else {
    // Crear el rol si no existe
    const [result] = await conn.execute(
      "INSERT INTO roles (slug, name, createdAt, updatedAt) VALUES ('platform_admin', 'Platform Admin', NOW(), NOW())"
    );
    roleId = result.insertId;
    console.log('Rol platform_admin creado, ID:', roleId);
  }

  // 3. Verificar si ya tiene el rol asignado
  const [existingAssignment] = await conn.execute(
    'SELECT id FROM account_roles WHERE accountId = ? AND roleId = ? AND companyId = 0 AND processId = 0',
    [accountId, roleId]
  );

  if (existingAssignment.length > 0) {
    console.log('El rol ya estaba asignado.');
  } else {
    // 4. Asignar el rol
    await conn.execute(
      'INSERT INTO account_roles (accountId, roleId, companyId, processId, createdAt, updatedAt) VALUES (?, ?, 0, 0, NOW(), NOW())',
      [accountId, roleId]
    );
    console.log('✓ Rol platform_admin asignado correctamente a:', email);
  }

  // 5. Verificar
  const [check] = await conn.execute(
    'SELECT ar.id, r.slug FROM account_roles ar JOIN roles r ON ar.roleId = r.id WHERE ar.accountId = ?',
    [accountId]
  );
  console.log('Roles asignados:', check.map(r => r.slug).join(', '));

  await conn.end();
}

main().catch(console.error);
