import { pathToFileURL } from 'node:url';
import { createConnection } from 'mysql2/promise';

/** Add only a nullable origin column; never delete/rename tables or modify rows. */
export async function extendAnnualCommitmentSchema(connection, report = console.log) {
  const [tables] = await connection.query("SELECT TABLE_NAME name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME='linkedCommitments' OR TABLE_NAME LIKE 'aw\\_%\\_linkedCommitments') ORDER BY TABLE_NAME");
  let added = 0;
  for (const { name } of tables) {
    if (!/^(linkedCommitments|aw_[1-9][0-9]*_linkedCommitments)$/.test(name)) throw new Error('Nombre inesperado en esquema anual; se aborta sin modificarlo.');
    const [columns] = await connection.query('SELECT DATA_TYPE,IS_NULLABLE,COLUMN_DEFAULT,COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [name, 'sourceWorkspaceId']);
    if (columns.length) {
      const column = columns[0];
      if (columns.length !== 1 || column.DATA_TYPE !== 'int' || column.IS_NULLABLE !== 'YES' || column.COLUMN_DEFAULT !== null || /unsigned/i.test(column.COLUMN_TYPE)) throw new Error(`Columna histórica incompatible: ${name}.sourceWorkspaceId`);
      continue;
    }
    await connection.query(`ALTER TABLE \`${name}\` ADD COLUMN \`sourceWorkspaceId\` INT NULL`);
    added++;
    if (added % 25 === 0) report(`[annual-schema] Referencia aditiva añadida a ${added} tablas; sin modificar registros.`);
  }
  report(`[annual-schema] ${tables.length} tablas verificadas; ${added} columnas añadidas; sin DROP ni DML.`);
  return { checked: tables.length, added };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL requerido para esquema anual aditivo.');
  const connection = await createConnection(process.env.DATABASE_URL);
  try { await extendAnnualCommitmentSchema(connection); }
  finally { await connection.end(); }
}
