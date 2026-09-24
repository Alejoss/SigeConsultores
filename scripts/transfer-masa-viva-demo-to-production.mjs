import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const allowLocal = args.has('--allow-local');
const payloadArg = process.argv.find(arg => arg.startsWith('--payload='));
const payloadPath = path.resolve(root, payloadArg ? payloadArg.slice('--payload='.length) : 'scripts/data/masa-viva-demo-payload-2026-09-24.json');

dotenv.config({ path: path.join(root, '.env.production') });
dotenv.config({ path: path.join(root, '.env.local'), override: false });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL no está configurada.');
const url = new URL(databaseUrl);
const isLocal = ['localhost', '127.0.0.1', 'mysql'].includes(url.hostname) && url.pathname.includes('sige_working_local');
if (isLocal && !allowLocal) throw new Error('Protección activada: para una prueba local se requiere --allow-local.');
if (!isLocal && process.env.ALLOW_MASA_VIVA_PRODUCTION_TRANSFER !== 'true') {
  throw new Error('Protección activada: Producción requiere ALLOW_MASA_VIVA_PRODUCTION_TRANSFER=true.');
}
if (!execute && !args.has('--preflight')) {
  console.log(JSON.stringify({ success: true, dryRun: true, database: url.pathname.slice(1), payload: path.basename(payloadPath), nextStep: 'Ejecutar con --execute tras respaldo verificado.' }, null, 2));
  process.exit(0);
}

const requiredTables = [
  'companies','companyInfo','companyValues','companyTrends','organizationChart','policies','strategicObjectives','payrollEmployees','payrollEmploymentPeriods',
  'managementSystems','managementSystemChecklistItems','managementPrograms','programActions','programActionBaselines','companyTrainings','companyCompliances',
  'audits','inspections','operationalFindings','operationalFindingBaselines',
  'processes','processCharacterizations','processParticipants','processResources','participantWorkerAssignments','participantWorkerKpis','participantWorkerKpiValues',
  'subprocessMaps','subprocessMapEntries','subprocessMapSubprocesses','subprocessMapOutputs','stakeholders','criticalityMatrix','stakeholderCriticalities',
  'processFODA','processRiskMatrices','processTacticalObjectives','processIndicators','processCompliances','processScheduleActivities','processTrainings','procedures',
  'meetingTypes','processMeetings','meetingAgreements','linkedCommitments','meetingFiles','meetingAgreementEvidence','linkedCommitmentEvidence',
  'managementSystemFiles','managementProgramFiles','auditFiles','inspectionFiles'
];
const copiedCompanyTables = [
  'companyInfo','companyValues','companyTrends','organizationChart','policies','strategicObjectives','payrollEmployees','payrollEmploymentPeriods',
  'managementSystems','managementSystemChecklistItems','managementPrograms','programActions','programActionBaselines','companyTrainings','companyCompliances',
  'audits','inspections','operationalFindings','operationalFindingBaselines'
];
const copiedProcessTables = [
  'processCharacterizations','processParticipants','processResources','participantWorkerAssignments','participantWorkerKpis','participantWorkerKpiValues',
  'subprocessMaps','subprocessMapEntries','subprocessMapSubprocesses','subprocessMapOutputs','stakeholders','criticalityMatrix','stakeholderCriticalities',
  'processFODA','processRiskMatrices','processTacticalObjectives','processIndicators','processCompliances','processScheduleActivities','processTrainings','procedures',
  'meetingTypes','processMeetings','meetingAgreements','linkedCommitments'
];
// Los documentos de proceso y matrices de partes interesadas se conservan: sus
// archivos no se transfieren desde el almacenamiento local. Los adjuntos que
// dependen de reuniones, acuerdos o módulos que sí se sustituyen bloquean la
// operación para que nunca queden referencias huérfanas.
const blockingAttachmentTables = ['meetingFiles','meetingAgreementEvidence','linkedCommitmentEvidence','auditFiles','inspectionFiles','managementSystemFiles','managementProgramFiles'];
const db = await mysql.createConnection(databaseUrl);
const sourceId = row => Number(row?._sourceId);
const mapRequired = (map, oldId, label) => {
  if (oldId === null || oldId === undefined) return null;
  const mapped = map.get(Number(oldId));
  if (!mapped) throw new Error(`Referencia no remapeada: ${label} (${oldId}).`);
  return mapped;
};
const mapOptional = (map, oldId) => {
  if (oldId === null || oldId === undefined) return null;
  return map.get(Number(oldId)) ?? null;
};
const nullable = value => value === undefined ? null : value;
const isDateColumn = type => type === 'date';
const isTimestampColumn = type => /timestamp|datetime/.test(type);
const dateValue = (value, type) => {
  if (value === null || value === undefined || value === '') return value ?? null;
  if (typeof value !== 'string') return value;
  if (isDateColumn(type)) return value.slice(0, 10);
  if (isTimestampColumn(type) && value.includes('T')) return value.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
  return value;
};

async function getTableMeta() {
  const [rows] = await db.query(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()`);
  const meta = new Map();
  for (const row of rows) {
    if (!meta.has(row.tableName)) meta.set(row.tableName, new Map());
    meta.get(row.tableName).set(row.columnName, row.dataType);
  }
  return meta;
}
async function countByCompany(table, companyId) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE companyId=?`, [companyId]);
  return Number(row.count);
}
async function countByProcess(table, processIds) {
  if (!processIds.length) return 0;
  const marks = processIds.map(() => '?').join(',');
  const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE processId IN (${marks})`, processIds);
  return Number(row.count);
}
async function deleteByProcess(table, processIds) {
  if (!processIds.length) return;
  const marks = processIds.map(() => '?').join(',');
  await db.execute(`DELETE FROM \`${table}\` WHERE processId IN (${marks})`, processIds);
}
async function insertRow(meta, table, row, overrides = {}) {
  const tableMeta = meta.get(table);
  if (!tableMeta) throw new Error(`Tabla no encontrada: ${table}.`);
  const merged = { ...row, ...overrides };
  delete merged.id;
  delete merged._sourceId;
  delete merged.createdAt;
  delete merged.updatedAt;
  delete merged.capturedAt;
  const columns = Object.keys(merged).filter(key => tableMeta.has(key));
  if (!columns.length) throw new Error(`No hay columnas insertables para ${table}.`);
  const values = columns.map(column => dateValue(nullable(merged[column]), tableMeta.get(column)));
  const marks = columns.map(() => '?').join(',');
  const [result] = await db.execute(`INSERT INTO \`${table}\` (${columns.map(column => `\`${column}\``).join(',')}) VALUES (${marks})`, values);
  return Number(result.insertId);
}
async function globalNonTargetSummary(targetCompanyId) {
  const [[companies]] = await db.query('SELECT COUNT(*) AS count FROM companies WHERE id<>?', [targetCompanyId]);
  const [[processes]] = await db.query('SELECT COUNT(*) AS count FROM processes WHERE companyId<>?', [targetCompanyId]);
  const [[employees]] = await db.query('SELECT COUNT(*) AS count FROM payrollEmployees WHERE companyId<>?', [targetCompanyId]);
  const [[meetings]] = await db.query('SELECT COUNT(*) AS count FROM processMeetings WHERE companyId<>?', [targetCompanyId]);
  const [[systems]] = await db.query('SELECT COUNT(*) AS count FROM managementSystems WHERE companyId<>?', [targetCompanyId]);
  const [[programs]] = await db.query('SELECT COUNT(*) AS count FROM managementPrograms WHERE companyId<>?', [targetCompanyId]);
  return { companies: Number(companies.count), processes: Number(processes.count), employees: Number(employees.count), meetings: Number(meetings.count), systems: Number(systems.count), programs: Number(programs.count) };
}
function assertSame(a, b, label) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`La verificación de aislamiento falló: ${label}.`);
}

try {
  const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8'));
  if (payload.format !== 'isge360-masa-viva-demo-v1') throw new Error('El formato del paquete de Masa Viva no es válido.');
  const calculatedHash = crypto.createHash('sha256').update(JSON.stringify(payload.data)).digest('hex');
  if (calculatedHash !== payload.sha256) throw new Error('El checksum del paquete no coincide; transferencia abortada.');
  if (payload.data.company?.name !== 'Masa Viva') throw new Error('El paquete no corresponde a Masa Viva.');
  const tables = payload.data.tables;
  for (const table of copiedCompanyTables.concat(copiedProcessTables, ['processes'])) {
    if (!Array.isArray(tables[table])) throw new Error(`El paquete no contiene la tabla requerida ${table}.`);
  }

  const meta = await getTableMeta();
  for (const table of requiredTables) if (!meta.has(table)) throw new Error(`Producción no tiene la tabla requerida ${table}; no se aplicó ningún cambio.`);
  const [[companyCount]] = await db.query("SELECT COUNT(*) AS count FROM companies WHERE name='Masa Viva'");
  if (Number(companyCount.count) !== 1) throw new Error('Protección activada: debe existir exactamente una empresa llamada Masa Viva en el destino.');
  const [[targetCompany]] = await db.query("SELECT * FROM companies WHERE name='Masa Viva'");
  const targetCompanyId = Number(targetCompany.id);
  const [targetProcesses] = await db.query('SELECT id,name FROM processes WHERE companyId=? ORDER BY name', [targetCompanyId]);
  const sourceProcessNames = tables.processes.map(row => row.name).sort();
  const targetProcessNames = targetProcesses.map(row => row.name).sort();
  assertSame(targetProcessNames, sourceProcessNames, 'los procesos de Masa Viva no coinciden entre origen y destino');

  const preflight = {
    destinationDatabase: url.pathname.slice(1),
    targetCompany: { id: targetCompanyId, name: targetCompany.name, status: targetCompany.status },
    processCount: targetProcesses.length,
    payloadSha256: payload.sha256,
    policy: payload.fileTransferPolicy,
    sourceCounts: Object.fromEntries(Object.entries(tables).filter(([, rows]) => Array.isArray(rows)).map(([table, rows]) => [table, rows.length])),
  };
  if (args.has('--preflight')) {
    console.log(JSON.stringify({ success: true, preflight, executed: false }, null, 2));
    process.exit(0);
  }

  const otherBefore = await globalNonTargetSummary(targetCompanyId);
  await db.beginTransaction();
  try {
    const targetProcessIds = targetProcesses.map(row => Number(row.id));
    const processMarks = targetProcessIds.map(() => '?').join(',');
    const [[attachmentsBefore]] = await db.query(`SELECT
      (SELECT COUNT(*) FROM meetingFiles WHERE companyId=?) +
      (SELECT COUNT(*) FROM meetingAgreementEvidence WHERE companyId=?) +
      (SELECT COUNT(*) FROM linkedCommitmentEvidence WHERE companyId=?) +
      (SELECT COUNT(*) FROM auditFiles WHERE companyId=?) +
      (SELECT COUNT(*) FROM inspectionFiles WHERE companyId=?) +
      (SELECT COUNT(*) FROM managementSystemFiles WHERE companyId=?) +
      (SELECT COUNT(*) FROM managementProgramFiles WHERE companyId=?) AS count`, [targetCompanyId, targetCompanyId, targetCompanyId, targetCompanyId, targetCompanyId, targetCompanyId, targetCompanyId]);
    if (Number(attachmentsBefore.count) > 0) {
      throw new Error('Protección activada: Masa Viva de destino contiene adjuntos que no se pueden reemplazar automáticamente. No se modificó ningún dato.');
    }

    // Eliminación en orden hijo→padre. Todas las condiciones se restringen a Masa Viva.
    await db.execute('DELETE FROM linkedCommitmentEvidence WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM meetingAgreementEvidence WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM meetingFiles WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM linkedCommitments WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM meetingAgreements WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM processMeetings WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM meetingTypes WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM operationalFindings WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM operationalFindingBaselines WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM auditFiles WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM inspectionFiles WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM audits WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM inspections WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM managementSystemFiles WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM managementSystemChecklistItems WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM managementProgramFiles WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM programActions WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM programActionBaselines WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM managementPrograms WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM managementSystems WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM companyTrainings WHERE companyId=?', [targetCompanyId]);
    await db.execute('DELETE FROM companyCompliances WHERE companyId=?', [targetCompanyId]);

    const [chars] = await db.query(`SELECT id FROM processCharacterizations WHERE processId IN (${processMarks})`, targetProcessIds);
    const charIds = chars.map(row => Number(row.id));
    if (charIds.length) {
      const charMarks = charIds.map(() => '?').join(',');
      const [participants] = await db.query(`SELECT id FROM processParticipants WHERE processCharacterizationId IN (${charMarks})`, charIds);
      const participantIds = participants.map(row => Number(row.id));
      if (participantIds.length) {
        const participantMarks = participantIds.map(() => '?').join(',');
        const [assignments] = await db.query(`SELECT id FROM participantWorkerAssignments WHERE processParticipantId IN (${participantMarks})`, participantIds);
        const assignmentIds = assignments.map(row => Number(row.id));
        if (assignmentIds.length) {
          const assignmentMarks = assignmentIds.map(() => '?').join(',');
          const [kpis] = await db.query(`SELECT id FROM participantWorkerKpis WHERE participantWorkerAssignmentId IN (${assignmentMarks})`, assignmentIds);
          const kpiIds = kpis.map(row => Number(row.id));
          if (kpiIds.length) await db.query(`DELETE FROM participantWorkerKpiValues WHERE participantWorkerKpiId IN (${kpiIds.map(() => '?').join(',')})`, kpiIds);
          await db.query(`DELETE FROM participantWorkerKpis WHERE participantWorkerAssignmentId IN (${assignmentMarks})`, assignmentIds);
          await db.query(`DELETE FROM participantWorkerAssignments WHERE processParticipantId IN (${participantMarks})`, participantIds);
        }
        await db.query(`DELETE FROM processResources WHERE participantId IN (${participantMarks})`, participantIds);
        await db.query(`DELETE FROM processParticipants WHERE id IN (${participantMarks})`, participantIds);
      }
      await db.query(`DELETE FROM processResources WHERE processCharacterizationId IN (${charMarks})`, charIds);
      await db.query(`DELETE FROM processCharacterizations WHERE id IN (${charMarks})`, charIds);
    }
    const [maps] = await db.query(`SELECT id FROM subprocessMaps WHERE processId IN (${processMarks})`, targetProcessIds);
    const mapIds = maps.map(row => Number(row.id));
    if (mapIds.length) {
      const mapMarks = mapIds.map(() => '?').join(',');
      await db.query(`DELETE FROM subprocessMapEntries WHERE subprocessMapId IN (${mapMarks})`, mapIds);
      await db.query(`DELETE FROM subprocessMapSubprocesses WHERE subprocessMapId IN (${mapMarks})`, mapIds);
      await db.query(`DELETE FROM subprocessMapOutputs WHERE subprocessMapId IN (${mapMarks})`, mapIds);
    }
    for (const table of ['criticalityMatrix','stakeholderCriticalities','stakeholders','processFODA','processRiskMatrices','processIndicators','processCompliances','processScheduleActivities','processTrainings','procedures','subprocessMaps','processTacticalObjectives']) await deleteByProcess(table, targetProcessIds);
    await db.execute('DELETE FROM payrollEmploymentPeriods WHERE payrollEmployeeId IN (SELECT id FROM payrollEmployees WHERE companyId=?)', [targetCompanyId]);
    await db.execute('DELETE FROM payrollEmployees WHERE companyId=?', [targetCompanyId]);
    for (const table of ['companyInfo','companyValues','companyTrends','organizationChart','policies','strategicObjectives']) await db.execute(`DELETE FROM \`${table}\` WHERE companyId=?`, [targetCompanyId]);

    await db.execute('UPDATE companies SET description=?, status=?, storageLimitMb=? WHERE id=?', [payload.data.company.description, payload.data.company.status, payload.data.company.storageLimitMb, targetCompanyId]);
    const processIdMap = new Map(tables.processes.map(row => [sourceId(row), Number(targetProcesses.find(target => target.name === row.name).id)]));
    for (const sourceProcess of tables.processes) {
      await db.execute('UPDATE processes SET macroProcess=?, processType=?, description=? WHERE id=? AND companyId=?', [sourceProcess.macroProcess ?? null, sourceProcess.processType ?? null, sourceProcess.description ?? null, mapRequired(processIdMap, sourceId(sourceProcess), 'proceso'), targetCompanyId]);
    }

    // Datos de empresa sin relaciones entre tablas.
    for (const table of ['companyInfo','companyValues','companyTrends','organizationChart','policies','strategicObjectives','companyTrainings','companyCompliances']) {
      for (const row of tables[table]) await insertRow(meta, table, row, { companyId: targetCompanyId });
    }
    const employeeMap = new Map();
    for (const row of tables.payrollEmployees) {
      const newId = await insertRow(meta, 'payrollEmployees', row, { companyId: targetCompanyId, currentProcessParticipantId: null });
      employeeMap.set(sourceId(row), newId);
    }
    for (const row of tables.payrollEmploymentPeriods) await insertRow(meta, 'payrollEmploymentPeriods', row, { payrollEmployeeId: mapRequired(employeeMap, row.payrollEmployeeId, 'empleado de periodo') });

    const systemMap = new Map();
    for (const row of tables.managementSystems) systemMap.set(sourceId(row), await insertRow(meta, 'managementSystems', row, { companyId: targetCompanyId }));
    for (const row of tables.managementSystemChecklistItems) await insertRow(meta, 'managementSystemChecklistItems', row, { companyId: targetCompanyId, managementSystemId: mapRequired(systemMap, row.managementSystemId, 'sistema de gestión') });
    const programMap = new Map();
    for (const row of tables.managementPrograms) programMap.set(sourceId(row), await insertRow(meta, 'managementPrograms', row, { companyId: targetCompanyId }));
    for (const row of tables.programActions) await insertRow(meta, 'programActions', row, { companyId: targetCompanyId, programId: mapRequired(programMap, row.programId, 'programa') });
    for (const row of tables.programActionBaselines) await insertRow(meta, 'programActionBaselines', row, { companyId: targetCompanyId, programId: mapRequired(programMap, row.programId, 'programa') });

    const auditMap = new Map();
    for (const row of tables.audits) auditMap.set(sourceId(row), await insertRow(meta, 'audits', row, { companyId: targetCompanyId }));
    const inspectionMap = new Map();
    for (const row of tables.inspections) inspectionMap.set(sourceId(row), await insertRow(meta, 'inspections', row, { companyId: targetCompanyId }));
    for (const row of tables.operationalFindings) {
      const mappedSource = row.sourceType === 'audit' ? mapRequired(auditMap, row.sourceId, 'auditoría') : mapRequired(inspectionMap, row.sourceId, 'inspección');
      await insertRow(meta, 'operationalFindings', row, { companyId: targetCompanyId, sourceId: mappedSource });
    }
    for (const row of tables.operationalFindingBaselines) {
      const mappedSource = row.sourceType === 'audit' ? mapRequired(auditMap, row.sourceId, 'auditoría') : mapRequired(inspectionMap, row.sourceId, 'inspección');
      await insertRow(meta, 'operationalFindingBaselines', row, { companyId: targetCompanyId, sourceId: mappedSource });
    }

    const charMap = new Map();
    for (const row of tables.processCharacterizations) charMap.set(sourceId(row), await insertRow(meta, 'processCharacterizations', row, { processId: mapRequired(processIdMap, row.processId, 'proceso de caracterización') }));
    const participantMap = new Map();
    for (const row of tables.processParticipants) participantMap.set(sourceId(row), await insertRow(meta, 'processParticipants', row, { processCharacterizationId: mapRequired(charMap, row.processCharacterizationId, 'caracterización de participante') }));
    for (const row of tables.processResources) await insertRow(meta, 'processResources', row, { processCharacterizationId: mapRequired(charMap, row.processCharacterizationId, 'caracterización de recurso'), participantId: mapRequired(participantMap, row.participantId, 'participante de recurso') });
    const assignmentMap = new Map();
    for (const row of tables.participantWorkerAssignments) assignmentMap.set(sourceId(row), await insertRow(meta, 'participantWorkerAssignments', row, { processParticipantId: mapRequired(participantMap, row.processParticipantId, 'participante de asignación'), payrollEmployeeId: mapRequired(employeeMap, row.payrollEmployeeId, 'empleado de asignación') }));
    const kpiMap = new Map();
    for (const row of tables.participantWorkerKpis) kpiMap.set(sourceId(row), await insertRow(meta, 'participantWorkerKpis', row, { participantWorkerAssignmentId: mapRequired(assignmentMap, row.participantWorkerAssignmentId, 'asignación KPI') }));
    for (const row of tables.participantWorkerKpiValues) await insertRow(meta, 'participantWorkerKpiValues', row, { participantWorkerKpiId: mapRequired(kpiMap, row.participantWorkerKpiId, 'KPI mensual') });
    for (const row of tables.payrollEmployees) {
      if (row.currentProcessParticipantId) await db.execute('UPDATE payrollEmployees SET currentProcessParticipantId=? WHERE id=?', [mapRequired(participantMap, row.currentProcessParticipantId, 'participante actual'), mapRequired(employeeMap, sourceId(row), 'empleado actual')]);
    }

    const mapMap = new Map();
    for (const row of tables.subprocessMaps) mapMap.set(sourceId(row), await insertRow(meta, 'subprocessMaps', row, { processId: mapRequired(processIdMap, row.processId, 'proceso de mapa') }));
    for (const table of ['subprocessMapEntries','subprocessMapSubprocesses','subprocessMapOutputs']) for (const row of tables[table]) await insertRow(meta, table, row, { subprocessMapId: mapRequired(mapMap, row.subprocessMapId, 'mapa de subproceso') });
    const stakeholderMap = new Map();
    for (const row of tables.stakeholders) stakeholderMap.set(sourceId(row), await insertRow(meta, 'stakeholders', row, { processId: mapRequired(processIdMap, row.processId, 'proceso de parte interesada') }));
    for (const row of tables.criticalityMatrix) await insertRow(meta, 'criticalityMatrix', row, { processId: mapRequired(processIdMap, row.processId, 'proceso de criticidad'), stakeholderId: mapRequired(stakeholderMap, row.stakeholderId, 'parte interesada de criticidad') });
    for (const row of tables.stakeholderCriticalities) await insertRow(meta, 'stakeholderCriticalities', row, { processId: mapRequired(processIdMap, row.processId, 'proceso de matriz interesada') });
    for (const table of ['processFODA','processRiskMatrices']) for (const row of tables[table]) await insertRow(meta, table, row, { processId: mapRequired(processIdMap, row.processId, `proceso de ${table}`) });
    const objectiveMap = new Map();
    for (const row of tables.processTacticalObjectives) objectiveMap.set(sourceId(row), await insertRow(meta, 'processTacticalObjectives', row, { processId: mapRequired(processIdMap, row.processId, 'proceso de OTE') }));
    // Algunos indicadores heredados ya apuntan a un OTE que no existe en
    // la fuente. Se conservan como indicadores independientes, sin inventar
    // un vínculo que no formaba parte de Masa Viva.
    for (const table of ['processIndicators','processCompliances','processScheduleActivities']) for (const row of tables[table]) await insertRow(meta, table, row, { processId: mapRequired(processIdMap, row.processId, `proceso de ${table}`), tacticalObjectiveId: mapOptional(objectiveMap, row.tacticalObjectiveId) });
    for (const table of ['processTrainings','procedures']) for (const row of tables[table]) await insertRow(meta, table, row, { processId: mapRequired(processIdMap, row.processId, `proceso de ${table}`) });

    const meetingTypeMap = new Map();
    for (const row of tables.meetingTypes) meetingTypeMap.set(sourceId(row), await insertRow(meta, 'meetingTypes', row, { companyId: targetCompanyId, processId: mapRequired(processIdMap, row.processId, 'proceso de tipo de reunión') }));
    const meetingMap = new Map();
    for (const row of tables.processMeetings) meetingMap.set(sourceId(row), await insertRow(meta, 'processMeetings', row, { companyId: targetCompanyId, processId: mapRequired(processIdMap, row.processId, 'proceso de reunión'), meetingTypeId: mapRequired(meetingTypeMap, row.meetingTypeId, 'tipo de reunión') }));
    const agreementMap = new Map();
    for (const row of tables.meetingAgreements) agreementMap.set(sourceId(row), await insertRow(meta, 'meetingAgreements', row, { companyId: targetCompanyId, processId: mapRequired(processIdMap, row.processId, 'proceso de acuerdo'), meetingId: mapRequired(meetingMap, row.meetingId, 'reunión de acuerdo'), targetProcessId: row.targetProcessId ? mapRequired(processIdMap, row.targetProcessId, 'proceso destino') : null }));
    for (const row of tables.linkedCommitments) {
      if (row.sourceType !== 'meeting_agreement') throw new Error(`Fuente de compromiso no permitida en Masa Viva: ${row.sourceType}.`);
      await insertRow(meta, 'linkedCommitments', row, { companyId: targetCompanyId, processId: mapRequired(processIdMap, row.processId, 'proceso de compromiso'), sourceId: mapRequired(agreementMap, row.sourceId, 'acuerdo de compromiso'), sourceSubId: mapRequired(meetingMap, row.sourceSubId, 'reunión de compromiso') });
    }

    const otherAfter = await globalNonTargetSummary(targetCompanyId);
    assertSame(otherBefore, otherAfter, 'las cantidades de empresas distintas de Masa Viva cambiaron');
    const expected = {
      processes: tables.processes.length,
      activities: tables.processCompliances.length,
      meetings: tables.processMeetings.length,
      agreements: tables.meetingAgreements.length,
      linkedCommitments: tables.linkedCommitments.length,
      employees: tables.payrollEmployees.length,
      managementSystems: tables.managementSystems.length,
      programs: tables.managementPrograms.length,
      findings: tables.operationalFindings.length,
    };
    const actual = {
      processes: await countByCompany('processes', targetCompanyId),
      activities: await countByProcess('processCompliances', targetProcessIds),
      meetings: await countByCompany('processMeetings', targetCompanyId),
      agreements: await countByCompany('meetingAgreements', targetCompanyId),
      linkedCommitments: await countByCompany('linkedCommitments', targetCompanyId),
      employees: await countByCompany('payrollEmployees', targetCompanyId),
      managementSystems: await countByCompany('managementSystems', targetCompanyId),
      programs: await countByCompany('managementPrograms', targetCompanyId),
      findings: await countByCompany('operationalFindings', targetCompanyId),
    };
    assertSame(expected, actual, 'los conteos de Masa Viva no coinciden después de copiar');
    await db.commit();
    console.log(JSON.stringify({ success: true, executed: true, environment: isLocal ? 'local-validation' : 'production', preflight, expected, actual, otherCompaniesUnchanged: otherAfter, attachmentsPolicy: 'No se transfirieron archivos. Los documentos y matrices de proceso existentes se conservaron; los adjuntos dependientes de módulos reemplazados deben estar vacíos o la operación se detiene.' }, null, 2));
  } catch (error) {
    await db.rollback();
    throw error;
  }
} finally {
  await db.end();
}
