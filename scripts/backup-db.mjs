#!/usr/bin/env node

/**
 * Database Backup Script
 * 
 * Automatically backs up the SIGE platform database to AWS S3
 * Scheduled to run daily at 2:00 AM UTC via AWS Lambda
 * 
 * Usage:
 *   node scripts/backup-db.mjs
 * 
 * Environment variables required:
 *   - DATABASE_URL: MySQL connection string
 *   - AWS_ACCESS_KEY_ID: AWS credentials
 *   - AWS_SECRET_ACCESS_KEY: AWS credentials
 *   - AWS_REGION: AWS region (default: us-east-2)
 *   - AWS_S3_BUCKET: S3 bucket name (default: sige-backups)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const config = {
  databaseUrl: process.env.DATABASE_URL,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION || 'us-east-2',
  s3Bucket: process.env.AWS_S3_BUCKET || 'sige-backups',
  backupDir: '/tmp',
  retentionDays: 30,
};

// Validate configuration
function validateConfig() {
  const required = ['databaseUrl', 'awsAccessKeyId', 'awsSecretAccessKey'];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Parse database URL to extract connection details
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

// Create backup filename with timestamp
function getBackupFilename() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  
  return `sige-backup-${year}-${month}-${day}T${hours}${minutes}Z.sql.gz`;
}

// Create database backup using mysqldump
async function createBackup(dbConfig, backupPath) {
  console.log(`[Backup] Creating database backup...`);
  
  const mysqldumpCmd = [
    'mysqldump',
    `--host=${dbConfig.host}`,
    `--port=${dbConfig.port}`,
    `--user=${dbConfig.user}`,
    `--password=${dbConfig.password}`,
    `--single-transaction`,
    `--quick`,
    `--lock-tables=false`,
    `--result-file=${backupPath}`,
    dbConfig.database,
  ].join(' ');
  
  try {
    await execAsync(mysqldumpCmd);
    console.log(`[Backup] Database backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    throw new Error(`Failed to create database backup: ${error.message}`);
  }
}

// Compress backup file
async function compressBackup(backupPath) {
  console.log(`[Backup] Compressing backup file...`);
  
  const gzipCmd = `gzip -f ${backupPath}`;
  
  try {
    await execAsync(gzipCmd);
    const compressedPath = `${backupPath}.gz`;
    console.log(`[Backup] Backup compressed: ${compressedPath}`);
    return compressedPath;
  } catch (error) {
    throw new Error(`Failed to compress backup: ${error.message}`);
  }
}

// Upload backup to S3
async function uploadToS3(filePath, s3Key) {
  console.log(`[S3] Uploading backup to S3...`);
  
  const s3Client = new S3Client({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });
  
  try {
    const fileContent = await readFile(filePath);
    
    const command = new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: `backups/${s3Key}`,
      Body: fileContent,
      ContentType: 'application/gzip',
      Metadata: {
        'backup-date': new Date().toISOString(),
        'backup-type': 'full-database',
      },
    });
    
    await s3Client.send(command);
    console.log(`[S3] Backup uploaded successfully: s3://${config.s3Bucket}/backups/${s3Key}`);
  } catch (error) {
    throw new Error(`Failed to upload backup to S3: ${error.message}`);
  }
}

// Clean up local backup files
async function cleanupLocalBackup(filePath) {
  try {
    await unlink(filePath);
    console.log(`[Cleanup] Local backup file removed: ${filePath}`);
  } catch (error) {
    console.warn(`[Cleanup] Warning: Could not remove local backup: ${error.message}`);
  }
}

// Main backup function
async function performBackup() {
  console.log('\n' + '='.repeat(80));
  console.log('SIGE Platform Database Backup');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(80) + '\n');
  
  try {
    // Validate configuration
    validateConfig();
    console.log('[Config] Configuration validated ✓');
    
    // Parse database URL
    const dbConfig = parseDatabaseUrl(config.databaseUrl);
    console.log(`[Config] Database: ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port}`);
    
    // Generate backup filename
    const backupFilename = getBackupFilename();
    const backupPath = path.join(config.backupDir, backupFilename.replace('.gz', ''));
    console.log(`[Config] Backup filename: ${backupFilename}\n`);
    
    // Create backup
    await createBackup(dbConfig, backupPath);
    
    // Compress backup
    const compressedPath = await compressBackup(backupPath);
    
    // Upload to S3
    await uploadToS3(compressedPath, backupFilename);
    
    // Cleanup local files
    await cleanupLocalBackup(compressedPath);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Backup completed successfully');
    console.log(`Completed: ${new Date().toISOString()}`);
    console.log('='.repeat(80) + '\n');
    
    return {
      success: true,
      filename: backupFilename,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ Backup failed');
    console.error(`Error: ${error.message}`);
    console.error('='.repeat(80) + '\n');
    
    throw error;
  }
}

// Execute backup if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  performBackup()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { performBackup };
