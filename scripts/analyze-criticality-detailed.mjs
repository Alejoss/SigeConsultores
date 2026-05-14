import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function analyzeCriticality() {
  const pool = mysql.createPool(process.env.DATABASE_URL);
  const connection = await pool.getConnection();

  try {
    console.log('\n=== ANALYZING CRITICALITY DATA ===\n');

    // Get all criticality records for Postcosecha La Esperanza
    const query = `
      SELECT 
        cm.id,
        cm.processId,
        p.name as processName,
        cm.stakeholderId,
        s.name as stakeholderName,
        cm.actionToTake,
        cm.endDate,
        cm.implementationStatus,
        cm.createdAt,
        cm.updatedAt
      FROM criticalityMatrix cm
      LEFT JOIN processes p ON cm.processId = p.id
      LEFT JOIN stakeholders s ON cm.stakeholderId = s.id
      WHERE p.name LIKE '%Postcosecha%'
      ORDER BY cm.stakeholderId, cm.actionToTake, cm.endDate DESC
    `;

    const [rows] = await connection.execute(query);
    
    console.log(`Total criticality records for Postcosecha: ${rows.length}\n`);
    
    // Group by stakeholder and action
    const grouped = {};
    rows.forEach(row => {
      const key = `${row.stakeholderId}|${row.actionToTake}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(row);
    });

    console.log(`Unique stakeholder+action combinations: ${Object.keys(grouped).length}\n`);

    // Show duplicates
    console.log('=== DUPLICATES FOUND ===\n');
    let totalDuplicates = 0;
    Object.entries(grouped).forEach(([key, records]) => {
      if (records.length > 1) {
        console.log(`Key: ${key}`);
        console.log(`  Count: ${records.length}`);
        records.forEach((r, i) => {
          console.log(`    [${i}] ID=${r.id}, endDate=${r.endDate}, status=${r.implementationStatus}`);
        });
        totalDuplicates += records.length - 1;
        console.log('');
      }
    });

    console.log(`Total duplicate records to remove: ${totalDuplicates}\n`);

    // Show records by end date
    console.log('=== RECORDS BY END DATE ===\n');
    const byDate = {};
    rows.forEach(row => {
      const dateStr = row.endDate ? row.endDate.toISOString().split('T')[0] : 'null';
      if (!byDate[dateStr]) byDate[dateStr] = 0;
      byDate[dateStr]++;
    });

    Object.entries(byDate).sort().forEach(([date, count]) => {
      console.log(`${date}: ${count} records`);
    });

    console.log('\n=== DETAILED RECORDS ===\n');
    rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`  Stakeholder: ${row.stakeholderName}`);
      console.log(`  Action: ${row.actionToTake}`);
      console.log(`  End Date: ${row.endDate}`);
      console.log(`  Status: ${row.implementationStatus}`);
      console.log('');
    });

  } finally {
    await connection.end();
  }
}

analyzeCriticality().catch(console.error);
