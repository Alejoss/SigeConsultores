import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

try {
  // Execute raw SQL to add columns
  await connection.execute(`
    ALTER TABLE operationalObjectives 
    ADD COLUMN IF NOT EXISTS ponderacion DECIMAL(5,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS condicionInicial DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS meta DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS condicionActual DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS porcentajeAlcanzado DECIMAL(5,2) DEFAULT 0.00
  `);
  
  console.log('✓ All columns added successfully');
  process.exit(0);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  await connection.end();
}
