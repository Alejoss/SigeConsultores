import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");
const db = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [rows] = await db.execute(`
    SELECT c.id AS companyId, p.id AS processId, pc.id AS characterizationId,
      (SELECT COUNT(*) FROM processParticipants pp WHERE pp.processCharacterizationId = pc.id) AS participantCount,
      (SELECT COUNT(*) FROM processResources pr WHERE pr.processCharacterizationId = pc.id) AS resourceCount,
      (SELECT COUNT(*) FROM processTacticalObjectives pto WHERE pto.processId = p.id) AS oteCount,
      (SELECT COUNT(*) FROM processCompliances pco WHERE pco.processId = p.id) AS complianceCount,
      (SELECT COUNT(*) FROM stakeholders s WHERE s.processId = p.id) AS stakeholderCount
    FROM companies c
    JOIN processes p ON p.companyId = c.id
    LEFT JOIN processCharacterizations pc ON pc.processId = p.id
    WHERE c.name = 'Masa Viva' AND p.name = 'Producción y Calidad'
  `);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await db.end();
}
