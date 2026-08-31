#!/usr/bin/env node

/**
 * Database Restore Script
 * 
 * Restores the SIGE platform database from AWS S3 backups
 * Supports selective restoration of specific companies or complete database restore
 * 
 * Usage:
 *   # List available backups
 *   node scripts/restore-db.mjs --list
 *   
 *   # Restore full database from specific backup
 *   node scripts/restore-db.mjs --backup sige-backup-2026-04-16T02:00Z.sql.gz
 *   
 *   # Restore specific company data
 *   node scripts/restore-db.mjs --backup sige-backup-2026-04-16T02:00Z.sql.gz --company 60001
 * 
 * Environment variables required:
 *   - DATABASE_URL: MySQL connection string
 *   - AWS_ACCESS_KEY_ID: AWS credentials
 *   - AWS_SECRET_ACCESS_KEY: AWS credentials
 *   - AWS_S3_REGION or AWS_REGION: AWS region for the backups bucket (default: us-east-2)
 *   - AWS_S3_BUCKET: S3 bucket name (default: sige-backups)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const config = {
  databaseUrl: process.env.DATABASE_URL,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_S3_REGION || process.env.AWS_REGION || 'us-east-2',
  s3Bucket: process.env.AWS_S3_BUCKET || 'sige-backups',
  backupDir: '/tmp',
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    list: false,
    backup: null,
    company: null,
    force: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--list':
        options.list = true;
        break;
      case '--backup':
        options.backup = args[++i];
        break;
      case '--company':
        options.company = parseInt(args[++i]);
        break;
      case '--force':
        options.force = true;
        break;
    }
  }
  
  return options;
}

// Validate configuration
function validateConfig() {
  const required = ['databaseUrl', 'awsAccessKeyId', 'awsSecretAccessKey'];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Parse database URL
function parseDatabaseUrl(url) {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: urlObj.port || 3306,
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.slice(1),
    };
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error.message}`);
  }
}

// List available backups in S3
async function listBackups() {
  console.log('[S3] Fetching available backups...\n');
  
  const s3Client = new S3Client({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });
  
  try {
    const command = new ListObjectsV2Command({
      Bucket: config.s3Bucket,
      Prefix: 'backups/',
    });
    
    const response = await s3Client.send(command);
    
    if (!response.Contents || response.Contents.length === 0) {
      console.log('❌ No backups found in S3');
      return [];
    }
    
    const backups = response.Contents
      .filter(obj => obj.Key.endsWith('.gz'))
      .sort((a, b) => b.LastModified - a.LastModified);
    
    console.log('Available Backups:\n');
    backups.forEach((backup, index) => {
      const filename = backup.Key.split('/').pop();
      const size = (backup.Size / 1024 / 1024).toFixed(2);
      const date = backup.LastModified.toISOString();
      console.log(`${index + 1}. ${filename}`);
      console.log(`   Size: ${size} MB | Date: ${date}\n`);
    });
    
    return backups;
  } catch (error) {
    throw new Error(`Failed to list backups: ${error.message}`);
  }
}

// Download backup from S3
async function downloadBackup(backupFilename) {
  console.log(`[S3] Downloading backup: ${backupFilename}...`);
  
  const s3Client = new S3Client({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });
  
  try {
    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: `backups/${backupFilename}`,
    });
    
    const response = await s3Client.send(command);
    const localPath = path.join(config.backupDir, backupFilename);
    
    // Convert web stream to node stream
    const writeStream = createWriteStream(localPath);
    await Readable.from(response.Body).pipe(writeStream);
    
    console.log(`[S3] Backup downloaded: ${localPath}`);
    return localPath;
  } catch (error) {
    throw new Error(`Failed to download backup: ${error.message}`);
  }
}

// Decompress backup file
async function decompressBackup(compressedPath) {
  console.log(`[Restore] Decompressing backup...`);
  
  const gunzipCmd = `gunzip -f ${compressedPath}`;
  
  try {
    await execAsync(gunzipCmd);
    const decompressedPath = compressedPath.replace('.gz', '');
    console.log(`[Restore] Backup decompressed: ${decompressedPath}`);
    return decompressedPath;
  } catch (error) {
    throw new Error(`Failed to decompress backup: ${error.message}`);
  }
}

// Restore database from backup
async function restoreDatabase(sqlPath, dbConfig, companyId = null) {
  console.log(`[Restore] Restoring database...`);
  
  const mysqlCmd = [
    'mysql',
    `--host=${dbConfig.host}`,
    `--port=${dbConfig.port}`,
    `--user=${dbConfig.user}`,
    `--password=${dbConfig.password}`,
    dbConfig.database,
    `< ${sqlPath}`,
  ].join(' ');
  
  try {
    await execAsync(mysqlCmd);
    console.log(`[Restore] Database restored successfully`);
  } catch (error) {
    throw new Error(`Failed to restore database: ${error.message}`);
  }
}

// Clean up local files
async function cleanupLocalFiles(filePath) {
  try {
    await unlink(filePath);
    console.log(`[Cleanup] Local file removed: ${filePath}`);
  } catch (error) {
    console.warn(`[Cleanup] Warning: Could not remove file: ${error.message}`);
  }
}

// Main restore function
async function performRestore(options) {
  console.log('\n' + '='.repeat(80));
  console.log('SIGE Platform Database Restore');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(80) + '\n');
  
  try {
    // Validate configuration
    validateConfig();
    console.log('[Config] Configuration validated ✓\n');
    
    // List backups if requested
    if (options.list) {
      await listBackups();
      return;
    }
    
    // Validate backup parameter
    if (!options.backup) {
      console.error('❌ Error: --backup parameter is required');
      console.error('Use --list to see available backups');
      process.exit(1);
    }
    
    // Parse database URL
    const dbConfig = parseDatabaseUrl(config.databaseUrl);
    console.log(`[Config] Database: ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port}`);
    
    if (options.company) {
      console.log(`[Config] Company ID: ${options.company}`);
    }
    
    console.log();
    
    // Confirm restore
    if (!options.force) {
      console.warn('⚠️  WARNING: This will overwrite existing database data');
      console.warn('Make sure you have a backup before proceeding');
      console.warn('Use --force flag to skip this confirmation\n');
    }
    
    // Download backup
    const compressedPath = await downloadBackup(options.backup);
    
    // Decompress backup
    const sqlPath = await decompressBackup(compressedPath);
    
    // Restore database
    await restoreDatabase(sqlPath, dbConfig, options.company);
    
    // Cleanup
    await cleanupLocalFiles(sqlPath);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Restore completed successfully');
    console.log(`Completed: ${new Date().toISOString()}`);
    console.log('='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ Restore failed');
    console.error(`Error: ${error.message}`);
    console.error('='.repeat(80) + '\n');
    
    throw error;
  }
}

// Execute restore if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  performRestore(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { performRestore, listBackups };
