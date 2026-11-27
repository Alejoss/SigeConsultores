import { createConnection } from 'mysql2/promise';

// Local review/test only. Production receives this schema through the normal
// CI/CD migration after the mandatory production backup, never a local restore.
const url = new URL(process.env.DATABASE_URL ?? '');
if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || url.port !== '3307' || !['/isge_annual_test', '/isge_annual_review'].includes(url.pathname)) {
  throw new Error('Solo se admite TEST o revisión anual local en 127.0.0.1:3307.');
}
const desired = ['ote', 'otg', 'stakeholder_action', 'compliance', 'participant_kpi', 'linked_commitment', 'output_release'];
const tables = ['planningCycleDecisions', 'planningCycleSnapshots', 'planningCycleOperationalItems'];
const apply = process.argv.includes('--apply');
const connection = await createConnection(process.env.DATABASE_URL);
try {
  for (const table of tables) {
    const [columns] = await connection.query('SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [table, 'itemType']);
    if (columns.length !== 1) throw new Error(`Columna itemType ausente o ambigua: ${table}`);
    const column = columns[0];
    const expectedOld = `enum(${desired.slice(0, 5).map(x => `'${x}'`).join(',')})`;
    const expectedNew = `enum(${desired.map(x => `'${x}'`).join(',')})`;
    if (column.COLUMN_TYPE !== expectedOld && column.COLUMN_TYPE !== expectedNew) throw new Error(`ENUM inesperado en ${table}; no se modifica.`);
    if (column.IS_NULLABLE !== 'NO' || column.COLUMN_DEFAULT !== null) throw new Error(`Atributos inesperados en ${table}; no se modifica.`);
    if (column.COLUMN_TYPE === expectedNew) {
      console.log(`${table}: ya actualizado, sin cambios.`);
      continue;
    }
    const sql = `ALTER TABLE \`${table}\` MODIFY COLUMN \`itemType\` ENUM(${desired.map(x => `'${x}'`).join(',')}) NOT NULL`;
    console.log(`${table}: añadir linked_commitment y output_release al final del ENUM (${apply ? 'aplicar' : 'vista previa'}).`);
    if (apply) await connection.query(sql);
  }
} finally {
  await connection.end();
}
