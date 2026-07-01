/**
 * Restaura criticalityMatrix del backup especificando las columnas originales
 * (sin actionSource ni surveyId que agregamos nosotros).
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

async function main() {
  const sql = fs.readFileSync('/tmp/sige_backup_full.sql', 'utf8');
  
  // Extraer el INSERT de criticalityMatrix
  const lines = sql.split('\n');
  const insertLines = lines.filter(l => l.startsWith('INSERT INTO `criticalityMatrix`'));
  
  if (!insertLines.length) {
    console.log('No se encontraron datos de criticalityMatrix en el backup');
    return;
  }
  
  console.log(`Encontradas ${insertLines.length} sentencias INSERT para criticalityMatrix`);
  
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
  await conn.execute('TRUNCATE TABLE `criticalityMatrix`');
  
  // Las columnas originales del backup (sin las nuevas que agregamos)
  const originalCols = '`id`, `processId`, `stakeholderId`, `incidence`, `risk`, `criticality`, `existingDefenses`, `actionToTake`, `observations`, `startDate`, `endDate`, `implementationStatus`, `completionPercentage`, `createdAt`, `updatedAt`';
  
  let count = 0;
  for (const insertLine of insertLines) {
    // Reemplazar "INSERT INTO `criticalityMatrix` VALUES" con INSERT especificando columnas
    const modified = insertLine.replace(
      'INSERT INTO `criticalityMatrix` VALUES',
      `INSERT INTO \`criticalityMatrix\` (${originalCols}) VALUES`
    );
    
    try {
      await conn.execute(modified);
      count++;
    } catch (err) {
      console.error('Error:', err.message);
      console.error('SQL:', modified.substring(0, 200));
    }
  }
  
  await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
  
  const [result] = await conn.execute('SELECT COUNT(*) as n FROM `criticalityMatrix`');
  console.log(`✓ criticalityMatrix: ${result[0].n} registros restaurados`);
  
  await conn.end();
}

main().catch(console.error);
