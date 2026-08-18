import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");

const db = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [companies] = await db.execute("SELECT id FROM companies WHERE name = 'Masa Viva' LIMIT 1");
  if (!companies.length) throw new Error("No se encontró Masa Viva");
  const companyId = companies[0].id;
  const [processes] = await db.execute(
    "SELECT id FROM processes WHERE companyId = ? AND name = 'Producción y Calidad' LIMIT 1",
    [companyId],
  );
  if (!processes.length) throw new Error("No se encontró el proceso Producción y Calidad");
  const processId = processes[0].id;
  const targetYear = 2027;

  await db.beginTransaction();
  const [cycles] = await db.execute(
    "SELECT id FROM planningCycles WHERE companyId = ? AND processId = ? AND cycleYear = ?",
    [companyId, processId, targetYear],
  );
  if (cycles.length) {
    const cycleIds = cycles.map((cycle) => cycle.id);
    const placeholders = cycleIds.map(() => "?").join(",");
    await db.execute(`DELETE FROM planningCycleDecisions WHERE targetCycleId IN (${placeholders})`, cycleIds);
    await db.execute(`DELETE FROM planningCycles WHERE id IN (${placeholders})`, cycleIds);
  }

  const [remainingCycles] = await db.execute(
    "SELECT COUNT(*) AS total FROM planningCycles WHERE companyId = ? AND cycleYear = ?",
    [companyId, targetYear],
  );
  if (Number(remainingCycles[0].total) === 0) {
    await db.execute(
      "DELETE FROM planningCycleActivations WHERE companyId = ? AND targetYear = ? AND status = 'draft'",
      [companyId, targetYear],
    );
  }
  await db.commit();
  console.log(JSON.stringify({ success: true, companyId, processId, targetYear, removedDrafts: cycles.length }, null, 2));
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
