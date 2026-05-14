import { describe, it, expect } from 'vitest';
import mysql from 'mysql2/promise';

describe('Criticality Duplication Fix', () => {
  let connection: any;

  async function getConnection() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');

    const urlObj = new URL(url);
    const sslParam = urlObj.searchParams.get('ssl');

    const config = {
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 3306,
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.replace('/', ''),
      ssl: sslParam ? JSON.parse(sslParam) : undefined,
    };

    return mysql.createConnection(config);
  }

  it('should have no duplicate (processId, stakeholderId) pairs', async () => {
    const conn = await getConnection();

    try {
      const [duplicates] = await conn.query(`
        SELECT 
          processId,
          stakeholderId,
          COUNT(*) as count
        FROM criticalityMatrix
        GROUP BY processId, stakeholderId
        HAVING count > 1
      `);

      expect(duplicates).toHaveLength(0);
    } finally {
      await conn.end();
    }
  });

  it('should have exactly 3 criticality records for Postcosecha La Esperanza', async () => {
    const conn = await getConnection();

    try {
      // Get process ID
      const [processes] = await conn.query(
        `SELECT id FROM processes WHERE name LIKE '%Postcosecha%' LIMIT 1`
      );

      if (processes.length === 0) {
        console.log('Process not found, skipping test');
        return;
      }

      const processId = processes[0].id;

      // Get criticality records
      const [records] = await conn.query(
        `SELECT COUNT(*) as count FROM criticalityMatrix WHERE processId = ?`,
        [processId]
      );

      expect(records[0].count).toBe(3);
    } finally {
      await conn.end();
    }
  });

  it('should have all criticality records with actionToTake populated', async () => {
    const conn = await getConnection();

    try {
      const [records] = await conn.query(`
        SELECT id, actionToTake
        FROM criticalityMatrix
        WHERE actionToTake IS NULL OR actionToTake = ''
      `);

      expect(records).toHaveLength(0);
    } finally {
      await conn.end();
    }
  });

  it('should have consolidated schedule showing correct counts per month', async () => {
    const conn = await getConnection();

    try {
      // Get process ID
      const [processes] = await conn.query(
        `SELECT id FROM processes WHERE name LIKE '%Postcosecha%' LIMIT 1`
      );

      if (processes.length === 0) {
        console.log('Process not found, skipping test');
        return;
      }

      const processId = processes[0].id;

      // Count criticality entries by month
      const [monthCounts] = await conn.query(`
        SELECT 
          YEAR(cm.endDate) as year,
          MONTH(cm.endDate) as month,
          COUNT(*) as count
        FROM criticalityMatrix cm
        WHERE cm.processId = ?
        GROUP BY YEAR(cm.endDate), MONTH(cm.endDate)
        ORDER BY year, month
      `, [processId]);

      // Should have entries only in April 2026 (month 4)
      const aprilEntries = monthCounts.filter((m: any) => m.month === 4 && m.year === 2026);
      expect(aprilEntries).toHaveLength(1);
      expect(aprilEntries[0].count).toBe(3);

      // Should have NO entries in May or June
      const mayJuneEntries = monthCounts.filter((m: any) => (m.month === 5 || m.month === 6) && m.year === 2026);
      expect(mayJuneEntries).toHaveLength(0);
    } finally {
      await conn.end();
    }
  });
});
