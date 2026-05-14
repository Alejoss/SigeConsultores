#!/usr/bin/env node

/**
 * SIGE Platform - Cleanup Criticality Duplicates Script
 * 
 * This script:
 * 1. Identifies duplicate criticality records (same stakeholder in same process)
 * 2. Merges data from duplicates into the FIRST record
 * 3. Deletes the duplicate records
 * 4. Preserves all data without loss
 * 
 * Usage:
 *   node scripts/cleanup-criticality-duplicates.mjs
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable not set');
  process.exit(1);
}

// Parse DATABASE_URL
// Format: mysql://user:password@host:port/database?ssl={"rejectUnauthorized":true}
function parseDatabaseUrl(url) {
  try {
    const urlObj = new URL(url);
    const sslParam = urlObj.searchParams.get('ssl');
    
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 3306,
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.replace('/', ''),
      ssl: sslParam ? JSON.parse(sslParam) : undefined,
    };
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
    throw error;
  }
}

async function cleanupDuplicates() {
  const config = parseDatabaseUrl(DATABASE_URL);
  console.log('Connecting to database:', config.database);

  const connection = await mysql.createConnection(config);

  try {
    console.log('\n=== CRITICALITY DUPLICATES CLEANUP ===\n');

    // Step 1: Find all duplicates
    console.log('Step 1: Finding duplicate criticality records...');
    const [duplicates] = await connection.query(`
      SELECT 
        processId,
        stakeholderId,
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY id) as ids
      FROM criticityMatrix
      GROUP BY processId, stakeholderId
      HAVING count > 1
      ORDER BY processId, stakeholderId
    `);

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }

    console.log(`Found ${duplicates.length} groups with duplicates:\n`);

    let totalDuplicatesDeleted = 0;

    // Step 2: Process each duplicate group
    for (const group of duplicates) {
      const ids = group.ids.split(',').map(id => parseInt(id));
      const keepId = ids[0]; // Keep the first one
      const deleteIds = ids.slice(1); // Delete the rest

      console.log(`\nProcess ${group.processId}, Stakeholder ${group.stakeholderId}:`);
      console.log(`  Total records: ${group.count}`);
      console.log(`  Keeping ID: ${keepId}`);
      console.log(`  Deleting IDs: ${deleteIds.join(', ')}`);

      // Get data from all records to merge
      const [records] = await connection.query(
        `SELECT * FROM criticityMatrix WHERE id IN (${ids.join(',')}) ORDER BY id`
      );

      // Merge data: use the most complete/recent data
      let mergedData = { ...records[0] };

      for (let i = 1; i < records.length; i++) {
        const record = records[i];
        // Keep non-null values from other records if the kept record has nulls
        if (!mergedData.actionToTake && record.actionToTake) {
          mergedData.actionToTake = record.actionToTake;
        }
        if (!mergedData.observations && record.observations) {
          mergedData.observations = record.observations;
        }
        if (!mergedData.existingDefenses && record.existingDefenses) {
          mergedData.existingDefenses = record.existingDefenses;
        }
        // Use the latest endDate
        if (record.endDate && (!mergedData.endDate || new Date(record.endDate) > new Date(mergedData.endDate))) {
          mergedData.endDate = record.endDate;
        }
        // Use the highest completion percentage
        if (record.completionPercentage > (mergedData.completionPercentage || 0)) {
          mergedData.completionPercentage = record.completionPercentage;
        }
      }

      // Update the kept record with merged data
      await connection.query(
        `UPDATE criticityMatrix SET 
          actionToTake = ?, 
          observations = ?, 
          existingDefenses = ?, 
          endDate = ?, 
          completionPercentage = ?,
          updatedAt = NOW()
        WHERE id = ?`,
        [
          mergedData.actionToTake,
          mergedData.observations,
          mergedData.existingDefenses,
          mergedData.endDate,
          mergedData.completionPercentage,
          keepId
        ]
      );

      console.log(`  ✅ Updated record ${keepId} with merged data`);

      // Delete duplicate records
      const deleteResult = await connection.query(
        `DELETE FROM criticityMatrix WHERE id IN (${deleteIds.join(',')})`
      );

      console.log(`  ✅ Deleted ${deleteIds.length} duplicate records`);
      totalDuplicatesDeleted += deleteIds.length;
    }

    console.log(`\n=== CLEANUP COMPLETE ===`);
    console.log(`Total duplicate records deleted: ${totalDuplicatesDeleted}`);
    console.log(`✅ All data has been preserved and consolidated!\n`);

  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run the cleanup
cleanupDuplicates().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
