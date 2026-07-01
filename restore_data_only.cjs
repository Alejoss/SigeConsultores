/**
 * Restaura SOLO los datos (INSERT INTO) del backup SQL.
 * NO ejecuta CREATE TABLE, DROP TABLE, ALTER TABLE ni ningún DDL.
 * Las tablas nuevas que hemos creado (stakeholderSurveys, columnas nuevas) se preservan.
 * Los datos existentes se limpian primero con TRUNCATE para evitar duplicados.
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

// Tablas que NO deben restaurarse (las que hemos creado nuevas o que no deben pisarse)
const SKIP_TABLES = new Set([
  'stakeholderSurveys', // tabla nueva que creamos
  'auth_sessions',      // sesiones activas
]);

// Tablas del backup en orden seguro (respetando FK)
const TABLE_ORDER = [
  'roles',
  'accounts',
  'account_roles',
  'companies',
  'companyInfo',
  'companyManagers',
  'companyModuleCustomization',
  'companyValues',
  'companyFODAs',
  'companyFODASelections',
  'processes',
  'stakeholders',
  'criticalityMatrix',
  'processCharacterizations',
  'processCompliances',
  'processParticipants',
  'processResources',
  'processTacticalObjectives',
  'processTrainings',
  'processFODA',
  'strategicObjectives',
  'organizationChart',
  'organizationChartFiles',
  'managementSystems',
  'managementSystemFiles',
  'audits',
  'auditFiles',
  'inspections',
  'inspectionFiles',
  'policies',
  'policyObjectives',
  'procedures',
  'procedureRecords',
  'documents',
  'subprocessMaps',
  'processStakeholderMatrixFiles',
  'accessAuditLog',
  'accessInvitations',
  'auth_invitations',
];

async function main() {
  const sql = fs.readFileSync('/tmp/sige_backup_full.sql', 'utf8');
  
  // Extraer todos los bloques INSERT por tabla
  const insertsByTable = {};
  const lines = sql.split('\n');
  for (const line of lines) {
    if (line.startsWith('INSERT INTO `')) {
      const match = line.match(/^INSERT INTO `([^`]+)`/);
      if (match) {
        const table = match[1];
        if (!insertsByTable[table]) insertsByTable[table] = [];
        insertsByTable[table].push(line);
      }
    }
  }
  
  console.log('Tablas con datos en el backup:', Object.keys(insertsByTable).join(', '));
  
  const conn = await mysql.createConnection({
    ...require('mysql2/promise').createPool,
    uri: process.env.DATABASE_URL,
    multipleStatements: true,
  });
  
  // Usar createConnection directamente con la URL
  const conn2 = await mysql.createConnection(process.env.DATABASE_URL + '?multipleStatements=true');
  
  await conn2.execute('SET FOREIGN_KEY_CHECKS = 0');
  await conn2.execute('SET SQL_MODE = ""');
  
  let totalInserted = 0;
  
  for (const table of TABLE_ORDER) {
    if (SKIP_TABLES.has(table)) {
      console.log(`⏭  Saltando tabla protegida: ${table}`);
      continue;
    }
    
    const inserts = insertsByTable[table];
    if (!inserts || inserts.length === 0) {
      console.log(`⚪ Sin datos: ${table}`);
      continue;
    }
    
    try {
      // Limpiar tabla antes de insertar
      await conn2.execute(`TRUNCATE TABLE \`${table}\``);
      
      // Ejecutar cada INSERT
      for (const insert of inserts) {
        await conn2.execute(insert);
      }
      
      const [count] = await conn2.execute(`SELECT COUNT(*) as n FROM \`${table}\``);
      console.log(`✓ ${table}: ${count[0].n} registros restaurados`);
      totalInserted += count[0].n;
    } catch (err) {
      console.error(`✗ Error en ${table}: ${err.message}`);
    }
  }
  
  await conn2.execute('SET FOREIGN_KEY_CHECKS = 1');
  
  console.log(`\n✅ Restauración completada. Total registros: ${totalInserted}`);
  await conn2.end();
}

main().catch(console.error);
