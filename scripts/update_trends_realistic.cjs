/**
 * Actualiza los snapshots históricos de SIGE Consultores (id=90002)
 * con datos más realistas que muestren continuidad interanual.
 *
 * Narrativa:
 * - 2024: Empresa en primer año de implementación del sistema. Inicia con objetivos
 *   ambiciosos, avanza progresivamente y cierra el año en ~72%.
 * - 2025: Con la experiencia del año anterior, los nuevos objetivos son más exigentes.
 *   Inicia en ~55% (objetivos nuevos pero con base del año anterior), sube a ~88%.
 * - 2026: Continúa desde ~62%, ya en julio llega a 78% (dato real).
 *
 * La meta OTE refleja el promedio real de metas de los resultKeys (~82%).
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// Datos realistas con continuidad
// Formato: [year, month, otePercent, otgPercent, stakeholderPercent, oteMeta, otgMeta, stakeholderMeta]
const data = [
  // 2024 — Primer año: arranque gradual, cierre sólido
  [2024,  1, 22, 18, 25,  82, 100, 100],
  [2024,  2, 28, 24, 30,  82, 100, 100],
  [2024,  3, 34, 30, 37,  82, 100, 100],
  [2024,  4, 40, 36, 43,  82, 100, 100],
  [2024,  5, 46, 42, 49,  82, 100, 100],
  [2024,  6, 52, 48, 55,  82, 100, 100],
  [2024,  7, 57, 53, 60,  82, 100, 100],
  [2024,  8, 61, 57, 64,  82, 100, 100],
  [2024,  9, 65, 61, 68,  82, 100, 100],
  [2024, 10, 68, 64, 71,  82, 100, 100],
  [2024, 11, 71, 67, 74,  82, 100, 100],
  [2024, 12, 74, 70, 77,  82, 100, 100],

  // 2025 — Segundo año: objetivos más exigentes, inicia ~55% (base del año anterior)
  // La caída refleja que los nuevos OTE son más ambiciosos, no que la empresa retrocedió
  [2025,  1, 55, 50, 58,  85, 100, 100],
  [2025,  2, 59, 54, 62,  85, 100, 100],
  [2025,  3, 63, 58, 66,  85, 100, 100],
  [2025,  4, 67, 62, 70,  85, 100, 100],
  [2025,  5, 70, 65, 73,  85, 100, 100],
  [2025,  6, 73, 68, 76,  85, 100, 100],
  [2025,  7, 76, 71, 79,  85, 100, 100],
  [2025,  8, 79, 74, 82,  85, 100, 100],
  [2025,  9, 81, 76, 84,  85, 100, 100],
  [2025, 10, 83, 78, 86,  85, 100, 100],
  [2025, 11, 85, 80, 88,  85, 100, 100],
  [2025, 12, 87, 82, 90,  85, 100, 100],

  // 2026 — Tercer año: nuevos objetivos aún más exigentes, inicia ~62%
  // Los 6 primeros meses son demo; julio en adelante es dato real (78%)
  [2026,  1, 62, 57, 65,  82, 100, 100],
  [2026,  2, 66, 61, 69,  82, 100, 100],
  [2026,  3, 69, 64, 72,  82, 100, 100],
  [2026,  4, 72, 67, 75,  82, 100, 100],
  [2026,  5, 74, 69, 77,  82, 100, 100],
  [2026,  6, 76, 71, 79,  82, 100, 100],
  // Julio 2026: dato real calculado por el sistema
  [2026,  7, 78, 74, 80,  82, 100, 100],
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const companyId = 90002;

  // Eliminar todos los snapshots existentes de SIGE Consultores
  await conn.execute('DELETE FROM companyTrends WHERE companyId = ?', [companyId]);
  console.log('Snapshots anteriores eliminados.');

  // Insertar los nuevos datos
  for (const [year, month, otePercent, otgPercent, stakeholderPercent, oteMeta, otgMeta, stakeholderMeta] of data) {
    await conn.execute(
      `INSERT INTO companyTrends (companyId, year, month, otePercent, otgPercent, stakeholderPercent, oteMeta, otgMeta, stakeholderMeta, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [companyId, year, month, otePercent, otgPercent, stakeholderPercent, oteMeta, otgMeta, stakeholderMeta]
    );
  }

  console.log(`${data.length} snapshots insertados correctamente.`);
  await conn.end();
}

main().catch(console.error);
