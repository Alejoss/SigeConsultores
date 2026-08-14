import mysql from "mysql2/promise";

/**
 * Corrige el vacío histórico originado antes de que la Línea de Tiempo guardara
 * el desglose por OE. Para Agrogama, crea el punto base de julio de 2026 usando
 * el snapshot ya existente de agosto, únicamente si julio aún no existe.
 *
 * Es idempotente: nunca sobrescribe un registro histórico real.
 */
const COMPANY_ID = Number.parseInt(process.env.TIMELINE_BACKFILL_COMPANY_ID || "60001", 10);
const YEAR = Number.parseInt(process.env.TIMELINE_BACKFILL_YEAR || "2026", 10);
const SOURCE_MONTH = Number.parseInt(process.env.TIMELINE_BACKFILL_SOURCE_MONTH || "8", 10);
const TARGET_MONTH = Number.parseInt(process.env.TIMELINE_BACKFILL_TARGET_MONTH || "7", 10);

if (!process.env.DATABASE_URL) {
  console.warn("[StrategicTimelineBackfill] DATABASE_URL no disponible; se omite la corrección histórica.");
  process.exit(0);
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const connection = await mysql.createConnection({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.replace(/^\//, ""),
});

try {
  const [existingRows] = await connection.execute(
    "SELECT id FROM companyTrends WHERE companyId = ? AND year = ? AND month = ? LIMIT 1",
    [COMPANY_ID, YEAR, TARGET_MONTH],
  );

  if (Array.isArray(existingRows) && existingRows.length > 0) {
    console.log(`[StrategicTimelineBackfill] ${YEAR}-${TARGET_MONTH} ya existe para empresa ${COMPANY_ID}; no se modifica.`);
    process.exit(0);
  }

  const [sourceRows] = await connection.execute(
    `SELECT otePercent, otgPercent, stakeholderPercent, oteMeta, otgMeta, stakeholderMeta, oePercentsJson
     FROM companyTrends WHERE companyId = ? AND year = ? AND month = ? LIMIT 1`,
    [COMPANY_ID, YEAR, SOURCE_MONTH],
  );
  const source = Array.isArray(sourceRows) ? sourceRows[0] : null;

  if (!source) {
    console.warn(`[StrategicTimelineBackfill] No existe snapshot fuente ${YEAR}-${SOURCE_MONTH} para empresa ${COMPANY_ID}; se omite.`);
    process.exit(0);
  }

  await connection.execute(
    `INSERT INTO companyTrends
      (companyId, year, month, otePercent, otgPercent, stakeholderPercent, oteMeta, otgMeta, stakeholderMeta, oePercentsJson, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      COMPANY_ID,
      YEAR,
      TARGET_MONTH,
      source.otePercent,
      source.otgPercent,
      source.stakeholderPercent,
      source.oteMeta,
      source.otgMeta,
      source.stakeholderMeta,
      source.oePercentsJson || "{}",
    ],
  );

  console.log(`[StrategicTimelineBackfill] Punto base ${YEAR}-${TARGET_MONTH} creado para empresa ${COMPANY_ID} desde ${YEAR}-${SOURCE_MONTH}.`);
} finally {
  await connection.end();
}
