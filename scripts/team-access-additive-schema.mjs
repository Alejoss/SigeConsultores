import { pathToFileURL } from 'node:url';
import { createConnection } from 'mysql2/promise';

export const TEAM_ACCESS_TABLES = {
  companyTeamModuleAccess: {
    columns: ['id', 'companyId', 'accountId', 'module', 'accessLevel', 'grantedByAccountId', 'createdAt', 'updatedAt'],
    sql: `CREATE TABLE IF NOT EXISTS \`companyTeamModuleAccess\` (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL, accountId INT NOT NULL,
      module ENUM('strategy','management_systems','change_management','company_foda','organization_personnel') NOT NULL,
      accessLevel ENUM('none','read','write') NOT NULL DEFAULT 'read',
      grantedByAccountId INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT company_team_module_access_scope UNIQUE(companyId,accountId,module)
    ) ENGINE=InnoDB`,
  },
  companyTeamProcessAccess: {
    columns: ['id', 'companyId', 'accountId', 'processId', 'accessLevel', 'grantedByAccountId', 'createdAt', 'updatedAt'],
    sql: `CREATE TABLE IF NOT EXISTS \`companyTeamProcessAccess\` (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL, accountId INT NOT NULL, processId INT NOT NULL,
      accessLevel ENUM('read','write') NOT NULL DEFAULT 'read',
      grantedByAccountId INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT company_team_process_access_scope UNIQUE(companyId,accountId,processId)
    ) ENGINE=InnoDB`,
  },
  companyTeamAccessAudit: {
    columns: ['id', 'companyId', 'accountId', 'performedByAccountId', 'eventType', 'beforeJson', 'afterJson', 'createdAt'],
    sql: `CREATE TABLE IF NOT EXISTS \`companyTeamAccessAudit\` (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL, accountId INT NOT NULL, performedByAccountId INT NULL,
      eventType VARCHAR(64) NOT NULL, beforeJson LONGTEXT NOT NULL, afterJson LONGTEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX company_team_access_audit_scope(companyId,accountId,createdAt)
    ) ENGINE=InnoDB`,
  },
};

/** Only creates these canonical tables. Never alters/deletes originals or writes rows. */
export async function ensureTeamAccessSchema(connection, report = console.log) {
  let created = 0;
  for (const [name, definition] of Object.entries(TEAM_ACCESS_TABLES)) {
    const [exists] = await connection.query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [name]);
    if (!exists.length) {
      await connection.query(definition.sql);
      created++;
    }
    const [columns] = await connection.query('SELECT COLUMN_NAME name, COLUMN_TYPE type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION', [name]);
    if (columns.length !== definition.columns.length || columns.some((column, index) => column.name !== definition.columns[index])) {
      throw new Error(`Tabla de accesos incompatible: ${name}; se detiene sin alterar datos.`);
    }
    const module = columns.find(column => column.name === 'module');
    if (module && module.type !== "enum('strategy','management_systems','change_management','company_foda','organization_personnel')") throw new Error('Tipos de módulos incompatibles.');
    const level = columns.find(column => column.name === 'accessLevel');
    const expected = name === 'companyTeamModuleAccess' ? "enum('none','read','write')" : "enum('read','write')";
    if (level && level.type !== expected) throw new Error('Niveles de acceso incompatibles.');
  }
  report(`[team-access-schema] 3 tablas canónicas verificadas; ${created} creadas; sin ALTER, DROP ni cambios de registros.`);
  return { checked: 3, created };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL requerido.');
  const url = new URL(process.env.DATABASE_URL);
  const local = url.hostname === '127.0.0.1' && url.port === '3307' && ['/isge_annual_test', '/isge_annual_review'].includes(url.pathname);
  const ci = process.env.CI === 'true' && url.hostname === '127.0.0.1' && url.port === '3306' && url.pathname === '/sige_platform_test';
  if (!local && !ci && process.env.TEAM_ACCESS_BOOTSTRAP_PRODUCTION !== 'true') throw new Error('Bootstrap manual limitado a TEST/revisión local.');
  const connection = await createConnection(process.env.DATABASE_URL);
  try { await ensureTeamAccessSchema(connection); }
  finally { await connection.end(); }
}
