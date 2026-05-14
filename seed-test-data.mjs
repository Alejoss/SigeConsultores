import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'sige_platform',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function seedTestData() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🌱 Starting test data seeding...\n');

    // 1. Insert test company access requests
    console.log('📋 Inserting company access requests...');
    await connection.query(`
      INSERT INTO companyAccessRequests 
      (companyName, rucOrCI, contactName, email, phone, status, approvalDate, createdAt, updatedAt) 
      VALUES 
      ('Empresa Test 1', '12345678', 'Juan García', 'juan@empresa1.com', '+34912345678', 'approved', NOW(), NOW(), NOW()),
      ('Empresa Test 2', '87654321', 'María López', 'maria@empresa2.com', '+34987654321', 'pending', NULL, NOW(), NOW()),
      ('Empresa Test 3', '11223344', 'Carlos Rodríguez', 'carlos@empresa3.com', '+34911223344', 'approved', NOW(), NOW(), NOW())
    `);
    console.log('✓ Company access requests inserted\n');

    // 2. Insert test companies
    console.log('🏢 Inserting companies...');
    await connection.query(`
      INSERT INTO companies 
      (name, ruc, description, createdAt, updatedAt) 
      VALUES 
      ('Empresa Test 1', '12345678', 'Primera empresa de prueba', NOW(), NOW()),
      ('Empresa Test 2', '87654321', 'Segunda empresa de prueba', NOW(), NOW()),
      ('Empresa Test 3', '11223344', 'Tercera empresa de prueba', NOW(), NOW())
    `);
    console.log('✓ Companies inserted\n');

    // 3. Get company IDs
    const [companies] = await connection.query('SELECT id, name FROM companies LIMIT 3');
    console.log('📍 Company IDs:', companies.map(c => `${c.name}: ${c.id}`).join(', '), '\n');

    // 4. Insert test manager credentials
    console.log('👤 Inserting manager credentials...');
    const hashedPassword1 = await bcrypt.hash('Password123!', 10);
    const hashedPassword2 = await bcrypt.hash('Password456!', 10);
    const hashedPassword3 = await bcrypt.hash('Password789!', 10);

    await connection.query(`
      INSERT INTO companyManagerCredentials 
      (companyId, managerEmail, passwordHash, isActive, createdAt, updatedAt, lastPasswordChangeAt, lastLoginAt) 
      VALUES 
      (?, ?, ?, true, NOW(), NOW(), NOW(), NOW()),
      (?, ?, ?, true, NOW(), NOW(), NOW(), NOW()),
      (?, ?, ?, false, NOW(), NOW(), NOW(), NOW())
    `, [
      companies[0].id, 'manager1@empresa1.com', hashedPassword1,
      companies[1].id, 'manager2@empresa2.com', hashedPassword2,
      companies[2].id, 'manager3@empresa3.com', hashedPassword3,
    ]);
    console.log('✓ Manager credentials inserted\n');

    // 5. Get processes
    const [processes] = await connection.query('SELECT id, name FROM processes LIMIT 3');
    console.log('📍 Process IDs:', processes.map(p => `${p.name}: ${p.id}`).join(', '), '\n');

    if (processes.length > 0) {
      // 6. Insert test process leader credentials
      console.log('🔑 Inserting process leader credentials...');
      const hashedPIN1 = await bcrypt.hash('1234', 10);
      const hashedPIN2 = await bcrypt.hash('5678', 10);

      await connection.query(`
        INSERT INTO processLeaderCredentials 
        (processId, leaderEmail, leaderName, pinHash, isActive, createdAt, updatedAt, lastPINChangeAt) 
        VALUES 
        (?, ?, ?, ?, true, NOW(), NOW(), NOW()),
        (?, ?, ?, ?, true, NOW(), NOW(), NOW())
      `, [
        processes[0].id, 'leader1@process1.com', 'Jefe Proceso 1', hashedPIN1,
        processes[1].id, 'leader2@process2.com', 'Jefe Proceso 2', hashedPIN2,
      ]);
      console.log('✓ Process leader credentials inserted\n');

      // 7. Insert test process leader invitations
      console.log('📧 Inserting process leader invitations...');
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      await connection.query(`
        INSERT INTO processLeaderInvitations 
        (processId, companyId, leaderEmail, leaderName, token, expiresAt, createdAt, updatedAt) 
        VALUES 
        (?, ?, ?, ?, ?, ?, NOW(), NOW()),
        (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        processes[0].id, companies[0].id, 'newleader1@process1.com', 'Nuevo Jefe 1', 'token_' + Math.random().toString(36).substring(7), futureDate,
        processes[1].id, companies[1].id, 'newleader2@process2.com', 'Nuevo Jefe 2', 'token_' + Math.random().toString(36).substring(7), futureDate,
      ]);
      console.log('✓ Process leader invitations inserted\n');
    }

    // 8. Insert test audit logs
    console.log('📊 Inserting audit logs...');
    await connection.query(`
      INSERT INTO accessAuditLog 
      (eventType, companyId, description, createdAt) 
      VALUES 
      ('company_approved', ?, 'Empresa Test 1 aprobada por admin', NOW()),
      ('company_manager_password_set', ?, 'Contraseña de gerente establecida', NOW()),
      ('process_leader_invited', ?, 'Jefe de proceso invitado', NOW()),
      ('process_leader_pin_set', ?, 'PIN de jefe de proceso configurado', NOW()),
      ('login_success', ?, 'Gerente inició sesión exitosamente', NOW()),
      ('company_manager_deactivated', ?, 'Gerente desactivado por admin', NOW())
    `, [
      companies[0].id,
      companies[0].id,
      companies[0].id,
      companies[0].id,
      companies[0].id,
      companies[2].id,
    ]);
    console.log('✓ Audit logs inserted\n');

    console.log('✅ Test data seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log('   - 3 Company access requests');
    console.log('   - 3 Manager credentials (2 active, 1 inactive)');
    console.log('   - 2 Process leader credentials (active)');
    console.log('   - 2 Process leader invitations (pending)');
    console.log('   - 6 Audit log entries\n');
    console.log('🎯 Now refresh the admin dashboard to see the test data!\n');

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  } finally {
    await connection.release();
    await pool.end();
  }
}

seedTestData().catch(console.error);
