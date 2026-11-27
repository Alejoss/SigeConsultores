/** Startup backfills are legacy writers: do not let them bypass annual snapshots. */
export async function hasAnnualWorkspaceMetadata(connection, companyId, year) {
  const [tables] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'annualWorkspaces' LIMIT 1"
  );
  if (!tables.length) return false;
  let query = "SELECT id FROM annualWorkspaces";
  const values = [];
  if (companyId !== undefined) {
    query += " WHERE companyId = ?";
    values.push(companyId);
    if (year !== undefined) { query += " AND year = ?"; values.push(year); }
  }
  query += " LIMIT 1";
  const [rows] = await connection.query(query, values);
  return rows.length > 0;
}
