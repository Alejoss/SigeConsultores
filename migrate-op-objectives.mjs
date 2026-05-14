import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  connectionLimit: 1,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sige'
});

(async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('Connected to database');
    
    const queries = [
      `ALTER TABLE operationalObjectives ADD COLUMN IF NOT EXISTS ponderacion DECIMAL(5,2) DEFAULT 0.00`,
      `ALTER TABLE operationalObjectives ADD COLUMN IF NOT EXISTS condicionInicial DECIMAL(12,2)`,
      `ALTER TABLE operationalObjectives ADD COLUMN IF NOT EXISTS meta DECIMAL(12,2)`,
      `ALTER TABLE operationalObjectives ADD COLUMN IF NOT EXISTS condicionActual DECIMAL(12,2)`,
      `ALTER TABLE operationalObjectives ADD COLUMN IF NOT EXISTS porcentajeAlcanzado DECIMAL(5,2) DEFAULT 0.00`
    ];
    
    for (const query of queries) {
      try {
        await conn.query(query);
        console.log('✓ ' + query.substring(30, 50));
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          console.log('✓ Column already exists');
        }
      }
    }
    
    console.log('✓ Database updated successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
})();
