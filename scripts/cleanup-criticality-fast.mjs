#!/usr/bin/env node

/**
 * SIGE Platform - Fast Criticality Cleanup Script
 * 
 * Handles massive duplicates by:
 * 1. Keeping ONLY ONE record per (processId, stakeholderId) pair
 * 2. Merging all data into the FIRST record
 * 3. Deleting all duplicates
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable not set');
  process.exit(1);
}

function parseDatabaseUrl(url) {
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
}

async function cleanupFast() {
  const config = parseDatabaseUrl(DATABASE_URL);
  console.log('🔗 Connecting to database:', config.database);

  const connection = await mysql.createConnection(config);

  try {
    console.log('\n=== CRITICALITY FAST CLEANUP ===\n');

    // Step 1: Get all duplicates
    console.log('Step 1: Finding duplicate groups...');
    const [duplicateGroups] = await connection.query(`
      SELECT 
        processId,
        stakeholderId,
        COUNT(*) as count,
        MIN(id) as keepId,
        GROUP_CONCAT(id ORDER BY id) as allIds
      FROM criticalityMatrix
      GROUP BY processId, stakeholderId
      HAVING count > 1
    `);

    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicates found!');
      await connection.end();
      return;
    }

    console.log(`Found ${duplicateGroups.length} duplicate groups\n`);

    let totalDeleted = 0;

    // Step 2: For each group, keep the first and delete the rest
    for (const group of duplicateGroups) {
      const keepId = group.keepId;
      const allIds = group.allIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      const deleteIds = allIds.filter(id => id !== keepId);
      
      if (allIds.length === 0) continue; // Skip if no valid IDs

      // Get all records to merge data
      const [records] = await connection.query(
        `SELECT * FROM criticalityMatrix WHERE id IN (${allIds.join(',')}) ORDER BY id`
      );

      // Merge: collect all non-null values
      let merged = { ...records[0] };

      for (let i = 1; i < records.length; i++) {
        const rec = records[i];
        if (!merged.actionToTake && rec.actionToTake) merged.actionToTake = rec.actionToTake;
        if (!merged.observations && rec.observations) merged.observations = rec.observations;
        if (!merged.existingDefenses && rec.existingDefenses) merged.existingDefenses = rec.existingDefenses;
        if (rec.completionPercentage > (merged.completionPercentage || 0)) {
          merged.completionPercentage = rec.completionPercentage;
        }
      }

      // Update kept record
      await connection.query(
        `UPDATE criticalityMatrix SET 
          actionToTake = ?, 
          observations = ?, 
          existingDefenses = ?, 
          completionPercentage = ?,
          updatedAt = NOW()
        WHERE id = ?`,
        [
          merged.actionToTake || null,
          merged.observations || null,
          merged.existingDefenses || null,
          merged.completionPercentage || 0,
          keepId
        ]
      );

      // Delete duplicates
      const [result] = await connection.query(
        `DELETE FROM criticalityMatrix WHERE id IN (${deleteIds.join(',')})`
      );

      totalDeleted += deleteIds.length;
      process.stdout.write(`\r  Processed: ${duplicateGroups.indexOf(group) + 1}/${duplicateGroups.length} | Deleted: ${totalDeleted}`);
    }

    console.log(`\n\n=== CLEANUP COMPLETE ===`);
    console.log(`✅ Total duplicate records deleted: ${totalDeleted}`);
    console.log(`✅ Remaining records: Kept only 1 per (processId, stakeholderId)\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

cleanupFast().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
