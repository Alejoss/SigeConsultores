/**
 * Backfill script: obtiene el tamaño real de cada archivo en S3
 * y actualiza la columna fileSizeBytes en la base de datos.
 *
 * Operación segura: solo lectura en S3, solo actualiza un número en BD.
 * No mueve, borra ni modifica ningún archivo.
 *
 * Uso:
 *   node scripts/backfill-file-sizes.mjs
 *   node scripts/backfill-file-sizes.mjs --dry-run   (solo muestra, no actualiza)
 */

import { createRequire } from "module";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const require = createRequire(import.meta.url);
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");
const mysql = require("mysql2/promise");

const DRY_RUN = process.argv.includes("--dry-run");

const s3 = new S3Client({
  region: process.env.AWS_S3_REGION ?? process.env.AWS_REGION ?? "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

async function getS3FileSize(fileKey) {
  if (!fileKey) return null;
  try {
    const cmd = new HeadObjectCommand({ Bucket: BUCKET, Key: fileKey });
    const res = await s3.send(cmd);
    return res.ContentLength ?? 0;
  } catch (e) {
    // Archivo no existe en S3 o error de acceso
    return null;
  }
}

async function main() {
  console.log(`\n🔍 Backfill de tamaños de archivos en S3`);
  console.log(`   Bucket: ${BUCKET}`);
  console.log(`   Modo: ${DRY_RUN ? "DRY RUN (sin cambios)" : "PRODUCCIÓN (actualiza BD)"}\n`);

  const db = await mysql.createConnection(process.env.DATABASE_URL);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // ── 1. procedures (procedureFileKey + flowchartFileKey) ──────────────────
  {
    const [rows] = await db.query(
      "SELECT id, procedureFileKey, flowchartFileKey FROM procedures WHERE procedureFileKey IS NOT NULL OR flowchartFileKey IS NOT NULL"
    );
    console.log(`📄 procedures: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const procSize = await getS3FileSize(row.procedureFileKey);
      const flowSize = await getS3FileSize(row.flowchartFileKey);
      if (procSize !== null || flowSize !== null) {
        if (!DRY_RUN) {
          await db.query(
            "UPDATE procedures SET procedureFileSizeBytes = ?, flowchartFileSizeBytes = ? WHERE id = ?",
            [procSize ?? 0, flowSize ?? 0, row.id]
          );
        }
        console.log(`  ✓ id=${row.id} proc=${procSize ?? "N/A"} B  flow=${flowSize ?? "N/A"} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  // ── 2. procedureRecords (fileKey) ────────────────────────────────────────
  {
    const [rows] = await db.query(
      "SELECT id, fileKey FROM procedureRecords WHERE fileKey IS NOT NULL AND fileKey != ''"
    );
    console.log(`\n📋 procedureRecords: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const size = await getS3FileSize(row.fileKey);
      if (size !== null) {
        if (!DRY_RUN) {
          await db.query("UPDATE procedureRecords SET fileSizeBytes = ? WHERE id = ?", [size, row.id]);
        }
        console.log(`  ✓ id=${row.id} size=${size} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  // ── 3. documents (fileKey) ───────────────────────────────────────────────
  {
    const [rows] = await db.query(
      "SELECT id, fileKey FROM documents WHERE fileKey IS NOT NULL AND fileKey != ''"
    );
    console.log(`\n📁 documents: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const size = await getS3FileSize(row.fileKey);
      if (size !== null) {
        if (!DRY_RUN) {
          await db.query("UPDATE documents SET fileSizeBytes = ? WHERE id = ?", [size, row.id]);
        }
        console.log(`  ✓ id=${row.id} size=${size} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  // ── 4. organizationChartFiles (fileKey) ──────────────────────────────────
  {
    const [rows] = await db.query(
      "SELECT id, fileKey FROM organizationChartFiles WHERE fileKey IS NOT NULL AND fileKey != ''"
    );
    console.log(`\n🏢 organizationChartFiles: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const size = await getS3FileSize(row.fileKey);
      if (size !== null) {
        if (!DRY_RUN) {
          await db.query("UPDATE organizationChartFiles SET fileSizeBytes = ? WHERE id = ?", [size, row.id]);
        }
        console.log(`  ✓ id=${row.id} size=${size} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  // ── 5. managementSystemFiles (fileKey) ───────────────────────────────────
  {
    const [rows] = await db.query(
      "SELECT id, fileKey FROM managementSystemFiles WHERE fileKey IS NOT NULL AND fileKey != ''"
    );
    console.log(`\n📂 managementSystemFiles: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const size = await getS3FileSize(row.fileKey);
      if (size !== null) {
        if (!DRY_RUN) {
          await db.query("UPDATE managementSystemFiles SET fileSizeBytes = ? WHERE id = ?", [size, row.id]);
        }
        console.log(`  ✓ id=${row.id} size=${size} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  // ── 6. auditFiles (fileKey) ──────────────────────────────────────────────
  {
    const [rows] = await db.query(
      "SELECT id, fileKey FROM auditFiles WHERE fileKey IS NOT NULL AND fileKey != ''"
    );
    console.log(`\n🔎 auditFiles: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const size = await getS3FileSize(row.fileKey);
      if (size !== null) {
        if (!DRY_RUN) {
          await db.query("UPDATE auditFiles SET fileSizeBytes = ? WHERE id = ?", [size, row.id]);
        }
        console.log(`  ✓ id=${row.id} size=${size} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  // ── 7. inspectionFiles (fileKey) ─────────────────────────────────────────
  {
    const [rows] = await db.query(
      "SELECT id, fileKey FROM inspectionFiles WHERE fileKey IS NOT NULL AND fileKey != ''"
    );
    console.log(`\n🔬 inspectionFiles: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const size = await getS3FileSize(row.fileKey);
      if (size !== null) {
        if (!DRY_RUN) {
          await db.query("UPDATE inspectionFiles SET fileSizeBytes = ? WHERE id = ?", [size, row.id]);
        }
        console.log(`  ✓ id=${row.id} size=${size} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  // ── 8. processStakeholderMatrixFiles (fileKey) ───────────────────────────
  {
    const [rows] = await db.query(
      "SELECT id, fileKey FROM processStakeholderMatrixFiles WHERE fileKey IS NOT NULL AND fileKey != ''"
    );
    console.log(`\n📊 processStakeholderMatrixFiles: ${rows.length} registros con archivos`);
    for (const row of rows) {
      const size = await getS3FileSize(row.fileKey);
      if (size !== null) {
        if (!DRY_RUN) {
          await db.query("UPDATE processStakeholderMatrixFiles SET fileSizeBytes = ? WHERE id = ?", [size, row.id]);
        }
        console.log(`  ✓ id=${row.id} size=${size} B`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  await db.end();

  console.log(`\n✅ Backfill completado`);
  console.log(`   Actualizados: ${totalUpdated}`);
  console.log(`   Sin archivo en S3: ${totalSkipped}`);
  console.log(`   Errores: ${totalErrors}`);
  if (DRY_RUN) {
    console.log(`\n⚠️  Modo DRY RUN: ningún dato fue modificado en la BD.`);
  }
}

main().catch((err) => {
  console.error("Error en backfill:", err);
  process.exit(1);
});
