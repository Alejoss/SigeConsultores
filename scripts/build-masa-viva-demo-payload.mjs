import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
dotenv.config({ path: path.join(root, '.env.local') });
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', 'mysql'].includes(url.hostname) || !url.pathname.includes('sige_working_local')) {
  throw new Error('Protección activada: el paquete sólo puede construirse desde la base local aislada.');
}

const db = await mysql.createConnection(process.env.DATABASE_URL);
const companyId = 90003;
const processTables = [
  'processCharacterizations','processParticipants','processResources','participantWorkerAssignments','participantWorkerKpis','participantWorkerKpiValues',
  'subprocessMaps','subprocessMapEntries','subprocessMapSubprocesses','subprocessMapOutputs','stakeholders','criticalityMatrix','stakeholderCriticalities',
  'processFODA','processRiskMatrices','processTacticalObjectives','processIndicators','processCompliances','processScheduleActivities','processTrainings',
  'procedures','meetingTypes','processMeetings','meetingAgreements','linkedCommitments'
];
const companyTables = [
  'companyInfo','companyValues','companyTrends','organizationChart','policies','strategicObjectives','payrollEmployees','payrollEmploymentPeriods',
  'managementSystems','managementSystemChecklistItems','managementPrograms','programActions','programActionBaselines','companyTrainings','companyCompliances',
  'audits','inspections','operationalFindings','operationalFindingBaselines'
];
function cleanRows(rows) {
  return rows.map(row => {
    const clean = { ...row, _sourceId: row.id };
    delete clean.id;
    delete clean.createdAt;
    delete clean.updatedAt;
    return clean;
  });
}
async function tableColumns(table) {
  const [rows] = await db.query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
  return new Set(rows.map(row => row.name));
}
async function rowsFor(table, where, params) {
  const columns = await tableColumns(table);
  if (!columns.size) return [];
  const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE ${where}`, params);
  return cleanRows(rows);
}
try {
  const [[company]] = await db.query('SELECT id,name,description,status,storageLimitMb FROM companies WHERE id=? AND name=?', [companyId, 'Masa Viva']);
  if (!company) throw new Error('No se encontró la empresa Masa Viva local esperada.');
  const [processRows] = await db.query('SELECT * FROM `processes` WHERE companyId=? ORDER BY id', [companyId]);
  if (processRows.length < 2) throw new Error('Masa Viva local no contiene procesos suficientes para la demostración.');
  const processIds = processRows.map(row => Number(row.id));
  const processes = cleanRows(processRows);
  const marks = processIds.map(() => '?').join(',');
  const raw = { company: { ...company, id: undefined }, tables: {} };
  for (const table of companyTables) {
    const columns = await tableColumns(table);
    if (!columns.size || !columns.has('companyId')) { raw.tables[table] = []; continue; }
    raw.tables[table] = await rowsFor(table, 'companyId=?', [companyId]);
  }
  raw.tables.processes = processes;
  for (const table of processTables) {
    const columns = await tableColumns(table);
    if (!columns.size) { raw.tables[table] = []; continue; }
    if (columns.has('processId')) {
      raw.tables[table] = await rowsFor(table, `processId IN (${marks})`, processIds);
    } else if (table === 'processParticipants' || table === 'processResources') {
      raw.tables[table] = await rowsFor(table, `processCharacterizationId IN (SELECT id FROM processCharacterizations WHERE processId IN (${marks}))`, processIds);
    } else if (table === 'participantWorkerAssignments') {
      raw.tables[table] = await rowsFor(table, `processParticipantId IN (SELECT id FROM processParticipants WHERE processCharacterizationId IN (SELECT id FROM processCharacterizations WHERE processId IN (${marks})))`, processIds);
    } else if (table === 'participantWorkerKpis') {
      raw.tables[table] = await rowsFor(table, `participantWorkerAssignmentId IN (SELECT pwa.id FROM participantWorkerAssignments pwa JOIN processParticipants pp ON pp.id=pwa.processParticipantId JOIN processCharacterizations pc ON pc.id=pp.processCharacterizationId WHERE pc.processId IN (${marks}))`, processIds);
    } else if (table === 'participantWorkerKpiValues') {
      raw.tables[table] = await rowsFor(table, `participantWorkerKpiId IN (SELECT pwk.id FROM participantWorkerKpis pwk JOIN participantWorkerAssignments pwa ON pwa.id=pwk.participantWorkerAssignmentId JOIN processParticipants pp ON pp.id=pwa.processParticipantId JOIN processCharacterizations pc ON pc.id=pp.processCharacterizationId WHERE pc.processId IN (${marks}))`, processIds);
    } else if (table === 'subprocessMapEntries' || table === 'subprocessMapSubprocesses' || table === 'subprocessMapOutputs') {
      raw.tables[table] = await rowsFor(table, `subprocessMapId IN (SELECT id FROM subprocessMaps WHERE processId IN (${marks}))`, processIds);
    } else {
      raw.tables[table] = [];
    }
  }
  // Nunca se transfieren adjuntos o rutas de almacenamiento local: no existen en Producción.
  // El procedimiento de destino elimina únicamente la metadata que quedaría huérfana al sustituir Masa Viva.
  for (const table of ['documents','processStakeholderMatrixFiles','meetingFiles','meetingAgreementEvidence','linkedCommitmentEvidence','auditFiles','inspectionFiles','managementSystemFiles','managementProgramFiles']) raw.tables[table] = [];
  const canonical = JSON.stringify(raw);
  const payload = {
    format: 'isge360-masa-viva-demo-v1',
    generatedAt: new Date().toISOString(),
    source: { database: url.pathname.slice(1), companyId, companyName: 'Masa Viva' },
    fileTransferPolicy: 'No se transfieren archivos ni referencias de almacenamiento local.',
    sha256: crypto.createHash('sha256').update(canonical).digest('hex'),
    data: raw,
  };
  const out = path.join(root, 'scripts', 'data', 'masa-viva-demo-payload-2026-09-24.json');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ success: true, output: path.relative(root, out), sha256: payload.sha256, processCount: processes.length, tables: Object.fromEntries(Object.entries(raw.tables).map(([name, rows]) => [name, rows.length])) }, null, 2));
} finally {
  await db.end();
}
