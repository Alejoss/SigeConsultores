import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");

const db = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await db.execute(`
    SELECT c.id AS companyId, p.id AS processId
    FROM companies c
    JOIN processes p ON p.companyId = c.id
    WHERE c.name = 'Masa Viva' AND p.name = 'Producción y Calidad'
    LIMIT 1
  `);
  if (!rows.length) throw new Error("No se encontró Producción y Calidad de Masa Viva");
  const { companyId, processId } = rows[0];
  const [[sourceCycle]] = await db.execute(
    "SELECT id, status FROM planningCycles WHERE companyId = ? AND processId = ? AND cycleYear = 2026 LIMIT 1",
    [companyId, processId],
  );
  const [[targetCycle]] = await db.execute(
    "SELECT id, status, sourceCycleId FROM planningCycles WHERE companyId = ? AND processId = ? AND cycleYear = 2027 LIMIT 1",
    [companyId, processId],
  );
  const [operationalByType] = await db.execute(
    "SELECT itemType, COUNT(*) AS total FROM planningCycleOperationalItems WHERE targetCycleId = ? GROUP BY itemType ORDER BY itemType",
    [targetCycle?.id || -1],
  );
  const [snapshotByDecision] = await db.execute(
    "SELECT migrationDecision, COUNT(*) AS total FROM planningCycleSnapshots WHERE cycleId = ? GROUP BY migrationDecision ORDER BY migrationDecision",
    [sourceCycle?.id || -1],
  );
  const [kpisByYear] = await db.execute(`
    SELECT k.year, COUNT(*) AS total
    FROM participantWorkerKpis k
    JOIN participantWorkerAssignments a ON a.id = k.participantWorkerAssignmentId
    JOIN processParticipants pp ON pp.id = a.processParticipantId
    JOIN processCharacterizations pc ON pc.id = pp.processCharacterizationId
    WHERE pc.processId = ? AND k.year IN (2026, 2027)
    GROUP BY k.year ORDER BY k.year
  `, [processId]);
  const [targetKpiValues] = await db.execute(`
    SELECT COUNT(*) AS total
    FROM participantWorkerKpiValues v
    JOIN participantWorkerKpis k ON k.id = v.participantWorkerKpiId
    JOIN participantWorkerAssignments a ON a.id = k.participantWorkerAssignmentId
    JOIN processParticipants pp ON pp.id = a.processParticipantId
    JOIN processCharacterizations pc ON pc.id = pp.processCharacterizationId
    WHERE pc.processId = ? AND k.year = 2027
  `, [processId]);
  const [[sourceRecords]] = await db.execute(`
    SELECT
      (SELECT COUNT(*) FROM processTacticalObjectives WHERE processId = ?) AS ote,
      (SELECT COUNT(*) FROM processCompliances WHERE processId = ?) AS compliances,
      (SELECT COUNT(*) FROM criticalityMatrix WHERE processId = ?) AS stakeholderActions
  `, [processId, processId, processId]);

  console.log(JSON.stringify({
    companyId,
    processId,
    sourceCycle,
    targetCycle,
    operationalByType,
    snapshotByDecision,
    kpisByYear,
    targetKpiValues,
    sourceRecords,
  }, null, 2));
} finally {
  await db.end();
}
