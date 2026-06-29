// Script para agregar las nuevas columnas y tabla de encuestas directamente
const mysql = require('mysql2/promise');
require('dotenv').config();

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(url);

  const statements = [
    // 1. Agregar columna actionSource a criticalityMatrix (si no existe)
    `ALTER TABLE criticalityMatrix ADD COLUMN IF NOT EXISTS actionSource VARCHAR(100) DEFAULT 'Iniciativa propia'`,
    
    // 2. Agregar columna surveyId a criticalityMatrix (si no existe)
    `ALTER TABLE criticalityMatrix ADD COLUMN IF NOT EXISTS surveyId INT DEFAULT NULL`,

    // 3. Crear tabla stakeholderSurveys (si no existe)
    `CREATE TABLE IF NOT EXISTS stakeholderSurveys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      processId INT NOT NULL,
      surveyName VARCHAR(500) NOT NULL DEFAULT '',
      segment ENUM('Clientes','Proveedores Externos','Proveedores Internos','Mixto') NOT NULL DEFAULT 'Clientes',
      surveyDate VARCHAR(20) DEFAULT '',
      sentCount INT DEFAULT 0,
      respondedCount INT DEFAULT 0,
      nps INT DEFAULT NULL,
      csat INT DEFAULT NULL,
      avgRating VARCHAR(20) DEFAULT '',
      topStrengths TEXT DEFAULT NULL,
      topWeaknesses TEXT DEFAULT NULL,
      mainFindings TEXT DEFAULT NULL,
      linkedActionIds TEXT DEFAULT NULL,
      orderIndex INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  ];

  for (const sql of statements) {
    try {
      await conn.execute(sql);
      console.log('✓ OK:', sql.substring(0, 70).trim());
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠ Columna ya existe (ignorado):', sql.substring(0, 70).trim());
      } else {
        console.error('✗ Error:', err.message, '\n  SQL:', sql.substring(0, 80));
      }
    }
  }

  await conn.end();
  console.log('\nMigración completada.');
}

main().catch(console.error);
