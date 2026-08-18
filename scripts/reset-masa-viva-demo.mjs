import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");
const db = await mysql.createConnection(process.env.DATABASE_URL);

const PLACEHOLDER = (count) => Array.from({ length: count }, () => "?").join(",");

async function resetCompany(companyId) {
  const [processRows] = await db.execute("SELECT id FROM processes WHERE companyId = ?", [companyId]);
  const processIds = processRows.map((row) => Number(row.id));

  if (processIds.length) {
    const marks = PLACEHOLDER(processIds.length);
    const [characterizationRows] = await db.execute(`SELECT id FROM processCharacterizations WHERE processId IN (${marks})`, processIds);
    const characterizationIds = characterizationRows.map((row) => Number(row.id));
    const participantRows = characterizationIds.length
      ? (await db.execute(`SELECT id FROM processParticipants WHERE processCharacterizationId IN (${PLACEHOLDER(characterizationIds.length)})`, characterizationIds))[0]
      : [];
    const participantIds = participantRows.map((row) => Number(row.id));
    if (participantIds.length) {
      const participantMarks = PLACEHOLDER(participantIds.length);
      const [assignmentRows] = await db.execute(`SELECT id FROM participantWorkerAssignments WHERE processParticipantId IN (${participantMarks})`, participantIds);
      const assignmentIds = assignmentRows.map((row) => Number(row.id));
      if (assignmentIds.length) {
        const assignmentMarks = PLACEHOLDER(assignmentIds.length);
        const [kpiRows] = await db.execute(`SELECT id FROM participantWorkerKpis WHERE participantWorkerAssignmentId IN (${assignmentMarks})`, assignmentIds);
        const kpiIds = kpiRows.map((row) => Number(row.id));
        if (kpiIds.length) await db.execute(`DELETE FROM participantWorkerKpiValues WHERE participantWorkerKpiId IN (${PLACEHOLDER(kpiIds.length)})`, kpiIds);
        await db.execute(`DELETE FROM participantWorkerKpis WHERE participantWorkerAssignmentId IN (${assignmentMarks})`, assignmentIds);
      }
      await db.execute(`DELETE FROM participantWorkerAssignments WHERE processParticipantId IN (${participantMarks})`, participantIds);
    }

    const [cycleRows] = await db.execute(`SELECT id FROM planningCycles WHERE companyId = ? OR processId IN (${marks})`, [companyId, ...processIds]);
    const cycleIds = cycleRows.map((row) => Number(row.id));
    if (cycleIds.length) {
      const cycleMarks = PLACEHOLDER(cycleIds.length);
      await db.execute(`DELETE FROM planningCycleSnapshots WHERE cycleId IN (${cycleMarks}) OR migratedToCycleId IN (${cycleMarks})`, [...cycleIds, ...cycleIds]);
      await db.execute(`DELETE FROM planningCycleDecisions WHERE targetCycleId IN (${cycleMarks}) OR sourceCycleId IN (${cycleMarks})`, [...cycleIds, ...cycleIds]);
    }
    await db.execute("DELETE FROM planningCycles WHERE companyId = ?", [companyId]);

    // Todas estas tablas contienen processId. La lista se limita a registros de Masa Viva.
    const processTables = [
      "criticalityMatrix", "processStakeholderMatrixFiles", "processFODA", "processRiskMatrices",
      "processCompliances", "processTrainings", "processScheduleActivities", "processIndicators",
      "subprocessMaps", "stakeholders", "fodaAnalysis", "riskMatrix", "tacticalObjectives", "compliances", "trainings",
      "processUsers", "processTacticalObjectives",
    ];
    for (const table of processTables) {
      try {
        await db.execute(`DELETE FROM \`${table}\` WHERE processId IN (${marks})`, processIds);
      } catch (error) {
        // Algunas tablas históricas no forman parte de todas las instalaciones locales.
        if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
      }
    }
    if (characterizationIds.length) {
      const characterizationMarks = PLACEHOLDER(characterizationIds.length);
      await db.execute(`DELETE FROM processResources WHERE processCharacterizationId IN (${characterizationMarks})`, characterizationIds);
      await db.execute(`DELETE FROM processParticipants WHERE processCharacterizationId IN (${characterizationMarks})`, characterizationIds);
      await db.execute(`DELETE FROM processCharacterizations WHERE id IN (${characterizationMarks})`, characterizationIds);
    }
    await db.execute(`DELETE FROM processes WHERE id IN (${marks})`, processIds);
  }

  await db.execute("DELETE FROM payrollEmployees WHERE companyId = ?", [companyId]);
  await db.execute("DELETE FROM planningCycleActivations WHERE companyId = ?", [companyId]);
  await db.execute("DELETE FROM companyInfo WHERE companyId = ?", [companyId]);
  await db.execute("DELETE FROM companyValues WHERE companyId = ?", [companyId]);
}

try {
  await db.beginTransaction();
  const [originalRows] = await db.execute("SELECT id FROM companies WHERE name = 'Masa Viva' ORDER BY id ASC LIMIT 1");
  if (!originalRows[0]) throw new Error("No se encontró la empresa original Masa Viva");
  const originalId = Number(originalRows[0].id);

  const [demoRows] = await db.execute("SELECT id FROM companies WHERE name = 'Masa Viva — DEMO' ORDER BY id ASC LIMIT 1");
  const demoId = demoRows[0] ? Number(demoRows[0].id) : null;

  await resetCompany(originalId);
  if (demoId) {
    await resetCompany(demoId);
    await db.execute("DELETE FROM companies WHERE id = ?", [demoId]);
  }

  await db.execute("UPDATE companies SET description = ?, status = 'Activa' WHERE id = ?", [
    "Empresa demostrativa local de panadería y pastelería artesanal para presentar ISGE 360. Datos ficticios.",
    originalId,
  ]);
  await db.commit();
  console.log(JSON.stringify({ success: true, originalId, removedDuplicateCompanyId: demoId }, null, 2));
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
