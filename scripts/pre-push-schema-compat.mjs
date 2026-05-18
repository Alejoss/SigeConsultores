/**
 * Prepares legacy MySQL schema before `drizzle-kit push` in Docker.
 * Avoids interactive rename prompts (label1..5 → customLabel) that block the app entrypoint.
 */
import mysql from "mysql2/promise";
import { loadCliEnv } from "./envForCli.mjs";

loadCliEnv();

const LEGACY_SPLITS = [
  {
    legacyModuleName: "purpose_mission_vision",
    targets: [
      { moduleName: "purpose_proposito", labelColumn: "label1" },
      { moduleName: "purpose_mision", labelColumn: "label2" },
      { moduleName: "purpose_vision", labelColumn: "label3" },
    ],
  },
  {
    legacyModuleName: "sige_modules",
    targets: [
      { moduleName: "sige_company_info", labelColumn: "label1" },
      { moduleName: "sige_corporate_values", labelColumn: "label2" },
      { moduleName: "sige_policy", labelColumn: "label3" },
      { moduleName: "sige_organization_chart", labelColumn: "label4" },
      { moduleName: "sige_process_map", labelColumn: "label5" },
    ],
  },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function upsertCustomLabel(conn, companyId, moduleName, customLabel) {
  if (customLabel == null || String(customLabel).trim() === "") return;
  const value = String(customLabel).trim();
  await conn.query(
    `INSERT INTO companyModuleCustomization (companyId, moduleName, customLabel, createdAt, updatedAt)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE customLabel = VALUES(customLabel), updatedAt = NOW()`,
    [companyId, moduleName, value]
  );
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[pre-push] DATABASE_URL missing; skip legacy schema compat.");
    process.exit(0);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const hasLabel1 = await columnExists(conn, "companyModuleCustomization", "label1");
    if (!hasLabel1) {
      console.log("[pre-push] Legacy label columns not found; nothing to migrate.");
      return;
    }

    console.log("[pre-push] Migrating companyModuleCustomization (label1..5 → customLabel)...");

    if (!(await columnExists(conn, "companyModuleCustomization", "customLabel"))) {
      await conn.query(
        "ALTER TABLE companyModuleCustomization ADD COLUMN customLabel VARCHAR(255) NULL"
      );
    }

    for (const { legacyModuleName, targets } of LEGACY_SPLITS) {
      const [rows] = await conn.query(
        `SELECT companyId, label1, label2, label3, label4, label5
         FROM companyModuleCustomization WHERE moduleName = ?`,
        [legacyModuleName]
      );
      for (const row of rows) {
        for (const { moduleName, labelColumn } of targets) {
          await upsertCustomLabel(conn, row.companyId, moduleName, row[labelColumn]);
        }
      }
      if (rows.length > 0) {
        await conn.query(
          "DELETE FROM companyModuleCustomization WHERE moduleName = ?",
          [legacyModuleName]
        );
      }
    }

    const [remaining] = await conn.query(
      `SELECT companyId, moduleName, label1 FROM companyModuleCustomization WHERE label1 IS NOT NULL AND label1 != ''`
    );
    for (const row of remaining) {
      await conn.query(
        `UPDATE companyModuleCustomization SET customLabel = ? WHERE companyId = ? AND moduleName = ?`,
        [row.label1, row.companyId, row.moduleName]
      );
    }

    for (const col of ["label5", "label4", "label3", "label2", "label1"]) {
      if (await columnExists(conn, "companyModuleCustomization", col)) {
        await conn.query(`ALTER TABLE companyModuleCustomization DROP COLUMN ${col}`);
      }
    }

    console.log("[pre-push] Legacy module label migration complete.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[pre-push] Schema compat failed:", err);
  process.exit(1);
});
