#!/usr/bin/env node
/**
 * Migrate one company's data from a legacy SQL backup into the current database.
 *
 * Reads DATABASE_URL from .env / .env.local / .env.staging (same as the app).
 * Parses the backup, filters rows for the given `companies.id`, remaps legacy
 * columns (userId → accountId), and inserts with INSERT IGNORE (idempotent).
 *
 * Usage:
 *   node scripts/migrate-agrogana-from-backup.mjs
 *   node scripts/migrate-agrogana-from-backup.mjs --company-id=90001
 *   node scripts/migrate-agrogana-from-backup.mjs --backup=/path/to/backup.sql --company-id=90001
 *   node scripts/migrate-agrogana-from-backup.mjs --dry-run
 *   node scripts/migrate-agrogana-from-backup.mjs --dry-run --output preview.sql
 *
 * Default company id is 60001 (Agrogana). Default backup file is `sige-backup.sql` in repo root.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── Load env (same priority chain as the app) ─────────────────────────────
for (const f of [".env.staging", ".env", ".env.local"]) {
  const p = resolve(ROOT, f);
  if (existsSync(p)) loadEnv({ path: p, override: true });
}
if (!process.env.DATABASE_URL) {
  const u = process.env.MYSQL_USER, pw = process.env.MYSQL_PASSWORD ?? "",
        db = process.env.MYSQL_DATABASE,
        h = process.env.MYSQL_HOST || "127.0.0.1",
        port = process.env.MYSQL_PORT || "3306";
  if (u && db) process.env.DATABASE_URL = `mysql://${encodeURIComponent(u)}:${encodeURIComponent(pw)}@${h}:${port}/${db}`;
}

function log(msg) { console.log(msg); }
function die(msg) { console.error(`FATAL: ${msg}`); process.exit(1); }

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const outIdx = args.indexOf("--output");
const OUT_FILE = outIdx !== -1 ? args[outIdx + 1] : null;
if (OUT_FILE) args.push("--dry-run"); // --output implies dry-run

const companyIdArg = args.find((a) => a.startsWith("--company-id="));
const COMPANY_ID = companyIdArg
  ? parseInt(companyIdArg.split("=")[1], 10)
  : 60001;
if (!Number.isFinite(COMPANY_ID) || COMPANY_ID <= 0) {
  die(`Invalid --company-id (use e.g. --company-id=90001)`);
}

const backupArg = args.find((a) => a.startsWith("--backup="));
const BACKUP_FILE = backupArg
  ? backupArg.split("=").slice(1).join("=")
  : "sige-backup.sql";

// ─── 1. Read & parse backup ────────────────────────────────────────────────
const backupPath =
  BACKUP_FILE.startsWith("/") || /^[A-Za-z]:[\\/]/.test(BACKUP_FILE)
    ? resolve(BACKUP_FILE)
    : resolve(ROOT, BACKUP_FILE);
log(`Reading ${BACKUP_FILE} …`);
const raw = readFileSync(backupPath, "utf-8");
const lines = raw.split("\n");
log(`  ${lines.length} lines.`);

// 1a. Table schemas (column names per table)
const schemas = {};
let curCreate = null, buf = [];
for (const ln of lines) {
  const m = ln.match(/^CREATE TABLE `(.+?)`/);
  if (m) { curCreate = m[1]; buf = [ln]; continue; }
  if (curCreate) {
    buf.push(ln);
    if (/^\)/.test(ln)) {
      schemas[curCreate] = buf
        .map(l => l.match(/^\s+`(\w+)`\s+/))
        .filter(Boolean)
        .map(x => x[1]);
      curCreate = null;
    }
  }
}
log(`  ${Object.keys(schemas).length} tables parsed.`);

// 1b. INSERT rows — handles multiline values with quoted strings
const allRows = {};
let curInsert = null, ibuf = [];
for (const ln of lines) {
  const m = ln.match(/^INSERT INTO `(.+?)`/);
  if (m) {
    if (curInsert) { (allRows[curInsert] ??= []).push(...parseInsertBlock(ibuf)); }
    curInsert = m[1]; ibuf = [ln]; continue;
  }
  if (curInsert) {
    ibuf.push(ln);
    if (ln.trimEnd().endsWith(";")) {
      (allRows[curInsert] ??= []).push(...parseInsertBlock(ibuf));
      curInsert = null; ibuf = [];
    }
  }
}
if (curInsert) (allRows[curInsert] ??= []).push(...parseInsertBlock(ibuf));

function parseInsertBlock(block) {
  const text = block.join("\n");
  const vi = text.indexOf("VALUES");
  if (vi === -1) return [];
  const vt = text.substring(vi + 6).trim();
  const rows = [];
  let d = 0, inS = false, sc = null, esc = false, cur = "", started = false;
  for (let i = 0; i < vt.length; i++) {
    const c = vt[i];
    if (esc) { cur += c; esc = false; continue; }
    if (c === "\\") { cur += c; esc = true; continue; }
    if (inS) { cur += c; if (c === sc) { if (vt[i+1] === sc) { cur += vt[++i]; } else { inS = false; } } continue; }
    if (c === "'" || c === '"') { inS = true; sc = c; cur += c; continue; }
    if (c === "(") { d++; if (d === 1) { started = true; cur = ""; continue; } }
    if (c === ")") { d--; if (d === 0 && started) { rows.push(cur); started = false; cur = ""; continue; } }
    if (started) cur += c;
  }
  return rows;
}

function parseFields(row) {
  const f = []; let cur = "", inS = false, sc = null, esc = false, d = 0;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (esc) { cur += c; esc = false; continue; }
    if (c === "\\" && inS) { cur += c; esc = true; continue; }
    if (inS) { if (c === sc) { if (row[i+1] === sc) { cur += c + row[++i]; } else { inS = false; cur += c; } } else cur += c; continue; }
    if (c === "'" || c === '"') { inS = true; sc = c; cur += c; continue; }
    if (c === "(") { d++; cur += c; continue; }
    if (c === ")") { d--; cur += c; continue; }
    if (c === "," && d === 0) { f.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) f.push(cur.trim());
  return f;
}

function fv(fields, cols, col) {
  const i = cols.indexOf(col);
  return i >= 0 && i < fields.length ? fields[i] : "NULL";
}

function fvClean(fields, cols, col) {
  const v = fv(fields, cols, col);
  if (v === "NULL") return null;
  return v.replace(/^['"]|['"]$/g, "");
}

// ─── 2. Identify entity IDs for this company ───────────────────────────────
function collectIds(table, fkCol, validSet) {
  const cols = schemas[table]; if (!cols || !allRows[table]) return new Set();
  const ids = new Set();
  for (const r of allRows[table]) {
    const f = parseFields(r);
    if (validSet.has(fvClean(f, cols, fkCol))) ids.add(fvClean(f, cols, "id"));
  }
  return ids;
}
function filterRows(table, fkCol, validSet) {
  const cols = schemas[table]; if (!cols || !allRows[table]) return [];
  return allRows[table].filter(r => { const f = parseFields(r); return validSet.has(fvClean(f, cols, fkCol)); });
}

const CID = new Set([String(COMPANY_ID)]);

const processIds = collectIds("processes", "companyId", CID);
log(`Company ${COMPANY_ID} — processes (${processIds.size}): ${[...processIds].join(", ")}`);

const charIds     = collectIds("processCharacterizations", "processId", processIds);
const smapIds     = collectIds("subprocessMaps", "processId", processIds);
const procedIds   = collectIds("procedures", "processId", processIds);
const stkIds      = collectIds("stakeholders", "processId", processIds);
const tactObjIds  = collectIds("tacticalObjectives", "processId", processIds);
const procTactIds = collectIds("processTacticalObjectives", "processId", processIds);
const policyIds   = collectIds("policies", "companyId", CID);
const chartIds    = collectIds("organizationChart", "companyId", CID);
const cfodaIds    = collectIds("companyFODAs", "companyId", CID);

// Legacy user IDs (from userCompanyAccess + companies.ownerUserId + companyManagers)
const legacyUserIds = new Set();
for (const r of filterRows("userCompanyAccess", "companyId", CID)) {
  legacyUserIds.add(fvClean(parseFields(r), schemas["userCompanyAccess"], "userId"));
}
if (allRows["companies"]) {
  for (const r of allRows["companies"]) {
    const f = parseFields(r);
    if (fvClean(f, schemas["companies"], "id") === String(COMPANY_ID))
      legacyUserIds.add(fvClean(f, schemas["companies"], "ownerUserId"));
  }
}
for (const r of filterRows("companyManagers", "companyId", CID)) {
  legacyUserIds.add(fvClean(parseFields(r), schemas["companyManagers"], "userId"));
}
log(`Legacy user IDs to migrate as accounts: ${[...legacyUserIds].join(", ")}`);

// ─── 3. Build SQL statements ───────────────────────────────────────────────
const stmts = [];
const summary = [];

function ins(table, cols, rows, { ignore = false } = {}) {
  if (!rows.length) return;
  summary.push({ table, count: rows.length });
  const ign = ignore ? " IGNORE" : "";
  const colList = cols.map(c => `\`${c}\``).join(", ");
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    stmts.push(`INSERT${ign} INTO \`${table}\` (${colList}) VALUES\n${chunk.map(r => `(${r})`).join(",\n")};`);
  }
}

stmts.push("-- ==========================================================================");
stmts.push(
  `-- COMPANY DATA MIGRATION (companies.id=${COMPANY_ID}) — auto-generated ${new Date().toISOString()}`
);
stmts.push("-- ==========================================================================");
stmts.push("SET FOREIGN_KEY_CHECKS = 0;");

// --- accounts (from legacy users) ---
stmts.push("\n-- accounts (from legacy users, IGNORE if id already exists)");
const acctRows = [];
if (allRows["users"] && schemas["users"]) {
  const uc = schemas["users"];
  for (const r of allRows["users"]) {
    const f = parseFields(r);
    if (legacyUserIds.has(fvClean(f, uc, "id"))) {
      acctRows.push([
        fv(f, uc, "id"), fv(f, uc, "openId"), fv(f, uc, "name"), fv(f, uc, "email"),
        "NULL", // passwordHash
        fv(f, uc, "loginMethod"), "'active'", "NULL",
        fv(f, uc, "createdAt"), fv(f, uc, "updatedAt"), fv(f, uc, "lastSignedIn"),
      ].join(", "));
    }
  }
}
ins("accounts",
  ["id","openId","name","email","passwordHash","loginMethod","status","emailVerifiedAt","createdAt","updatedAt","lastSignedIn"],
  acctRows, { ignore: true });

// --- account_roles ---
stmts.push("\n-- account_roles (IGNORE duplicates)");
const arRows = [];
for (const uid of legacyUserIds) arRows.push(`0, ${uid}, 2, 0, 0, NOW()`); // platform_user
for (const r of filterRows("companyManagers", "companyId", CID)) {
  const f = parseFields(r);
  arRows.push(`0, ${fv(f, schemas["companyManagers"], "userId")}, 3, ${COMPANY_ID}, 0, NOW()`);
}
ins("account_roles", ["id","accountId","roleId","companyId","processId","createdAt"], arRows, { ignore: true });

// --- companies ---
stmts.push("\n-- companies");
const compRows = [];
if (allRows["companies"]) {
  const cc = schemas["companies"];
  for (const r of allRows["companies"]) {
    const f = parseFields(r);
    if (fvClean(f, cc, "id") === String(COMPANY_ID)) {
      compRows.push([
        fv(f,cc,"id"), fv(f,cc,"name"), fv(f,cc,"description"),
        fv(f,cc,"ownerUserId"), // maps to ownerAccountId (same ID)
        fv(f,cc,"status"), fv(f,cc,"cancelledAt"), fv(f,cc,"createdAt"), fv(f,cc,"updatedAt"),
      ].join(", "));
    }
  }
}
ins("companies", ["id","name","description","ownerAccountId","status","cancelledAt","createdAt","updatedAt"], compRows, { ignore: true });

// --- Direct-copy tables (companyId filter) ---
function directByCompany(table, opts) {
  const cols = schemas[table]; if (!cols || !allRows[table]) return;
  const rows = filterRows(table, "companyId", CID);
  ins(table, cols, rows, { ignore: true, ...opts });
}

// --- Direct-copy tables (processId filter) ---
function directByProcess(table, opts) {
  const cols = schemas[table]; if (!cols || !allRows[table]) return;
  const rows = filterRows(table, "processId", processIds);
  ins(table, cols, rows, { ignore: true, ...opts });
}

// --- Direct-copy tables (FK filter) ---
function directByFK(table, fkCol, fkSet, opts) {
  const cols = schemas[table]; if (!cols || !allRows[table]) return;
  const rows = filterRows(table, fkCol, fkSet);
  ins(table, cols, rows, { ignore: true, ...opts });
}

stmts.push("\n-- companyInfo");
directByCompany("companyInfo");

stmts.push("\n-- companyValues");
directByCompany("companyValues");

stmts.push("\n-- policies");
directByCompany("policies");

stmts.push("\n-- policyObjectives");
directByFK("policyObjectives", "policyId", policyIds);

stmts.push("\n-- strategicObjectives");
directByCompany("strategicObjectives");

stmts.push("\n-- processes");
directByCompany("processes");

stmts.push("\n-- subprocesses");
directByProcess("subprocesses");

stmts.push("\n-- stakeholders");
directByProcess("stakeholders");

stmts.push("\n-- criticalityMatrix");
directByProcess("criticalityMatrix");

stmts.push("\n-- fodaAnalysis");
directByProcess("fodaAnalysis");

stmts.push("\n-- riskMatrix");
directByProcess("riskMatrix");

stmts.push("\n-- tacticalObjectives");
directByProcess("tacticalObjectives");

stmts.push("\n-- operationalObjectives");
directByFK("operationalObjectives", "tacticalObjectiveId", tactObjIds);

stmts.push("\n-- compliances");
directByProcess("compliances");

stmts.push("\n-- trainings");
directByProcess("trainings");

stmts.push("\n-- documents");
directByProcess("documents");

stmts.push("\n-- indicators");
directByCompany("indicators");

stmts.push("\n-- processCharacterizations");
directByProcess("processCharacterizations");

stmts.push("\n-- processParticipants");
directByFK("processParticipants", "processCharacterizationId", charIds);

stmts.push("\n-- processResources");
directByFK("processResources", "processCharacterizationId", charIds);

stmts.push("\n-- subprocessMaps");
directByProcess("subprocessMaps");

stmts.push("\n-- subprocessMapEntries");
directByFK("subprocessMapEntries", "subprocessMapId", smapIds);

stmts.push("\n-- subprocessMapSubprocesses");
directByFK("subprocessMapSubprocesses", "subprocessMapId", smapIds);

stmts.push("\n-- subprocessMapOutputs");
directByFK("subprocessMapOutputs", "subprocessMapId", smapIds);

// stakeholderCriticalities — remap columns (backup has extra legacy cols)
stmts.push("\n-- stakeholderCriticalities (remapped columns)");
{
  const bkCols = schemas["stakeholderCriticalities"];
  const targetCols = ["id","processId","name","type","influence","dependence","criticality",
                      "accionATomar","fechaInicio","fechaFin","realizado","createdAt","updatedAt"];
  if (bkCols && allRows["stakeholderCriticalities"]) {
    const rows = filterRows("stakeholderCriticalities", "processId", processIds).map(r => {
      const f = parseFields(r);
      return targetCols.map(c => fv(f, bkCols, c)).join(", ");
    });
    ins("stakeholderCriticalities", targetCols, rows, { ignore: true });
  }
}

stmts.push("\n-- processFODA");
directByProcess("processFODA");

stmts.push("\n-- processRiskMatrices");
directByProcess("processRiskMatrices");

stmts.push("\n-- processTacticalObjectives");
directByProcess("processTacticalObjectives");

stmts.push("\n-- processCompliances");
directByProcess("processCompliances");

stmts.push("\n-- processTrainings");
directByProcess("processTrainings");

stmts.push("\n-- processScheduleActivities");
directByProcess("processScheduleActivities");

stmts.push("\n-- processIndicators");
directByProcess("processIndicators");

stmts.push("\n-- procedures");
directByProcess("procedures");

stmts.push("\n-- procedureRecords");
directByFK("procedureRecords", "procedureId", procedIds);

stmts.push("\n-- companyModuleCustomization");
directByCompany("companyModuleCustomization");

// companyManagers — remap userId -> accountId
stmts.push("\n-- companyManagers (userId -> accountId)");
{
  const bk = schemas["companyManagers"];
  if (bk && allRows["companyManagers"]) {
    const rows = filterRows("companyManagers", "companyId", CID).map(r => {
      const f = parseFields(r);
      return [fv(f,bk,"id"), fv(f,bk,"companyId"), fv(f,bk,"userId"), fv(f,bk,"createdAt"), fv(f,bk,"updatedAt")].join(", ");
    });
    ins("companyManagers", ["id","companyId","accountId","createdAt","updatedAt"], rows, { ignore: true });
  }
}

// userCompanyAccess — remap userId -> accountId
stmts.push("\n-- userCompanyAccess (userId -> accountId)");
{
  const bk = schemas["userCompanyAccess"];
  if (bk && allRows["userCompanyAccess"]) {
    const rows = filterRows("userCompanyAccess", "companyId", CID).map(r => {
      const f = parseFields(r);
      return [fv(f,bk,"id"), fv(f,bk,"userId"), fv(f,bk,"companyId"), fv(f,bk,"role"), fv(f,bk,"createdAt"), fv(f,bk,"updatedAt")].join(", ");
    });
    ins("userCompanyAccess", ["id","accountId","companyId","role","createdAt","updatedAt"], rows, { ignore: true });
  }
}

stmts.push("\n-- companyFODAs");
directByCompany("companyFODAs");

stmts.push("\n-- companyFODASelections");
directByCompany("companyFODASelections");

stmts.push("\n-- organizationChart");
directByCompany("organizationChart");

stmts.push("\n-- organizationChartNodes");
directByFK("organizationChartNodes", "chartId", chartIds);

stmts.push("\n-- processOwnerInvitations");
directByCompany("processOwnerInvitations");

// processOwners — remap userId -> accountId, drop legacy status col
stmts.push("\n-- processOwners (userId -> accountId, no status col)");
{
  const bk = schemas["processOwners"];
  if (bk && allRows["processOwners"]) {
    const rows = filterRows("processOwners", "companyId", CID).map(r => {
      const f = parseFields(r);
      return [fv(f,bk,"id"), fv(f,bk,"companyId"), fv(f,bk,"processId"), fv(f,bk,"userId"),
              fv(f,bk,"accessCode"), fv(f,bk,"createdAt"), fv(f,bk,"updatedAt")].join(", ");
    });
    ins("processOwners", ["id","companyId","processId","accountId","accessCode","createdAt","updatedAt"], rows, { ignore: true });
  }
}

stmts.push("\nSET FOREIGN_KEY_CHECKS = 1;");
stmts.push("-- === END MIGRATION ===");

// ─── 4. Output / Execute ───────────────────────────────────────────────────
const fullSQL = stmts.join("\n");

log("\n=== MIGRATION SUMMARY ===");
let total = 0;
for (const s of summary) { log(`  ${s.table}: ${s.count} rows`); total += s.count; }
log(`  TOTAL: ${total} rows across ${summary.length} tables`);

if (DRY || OUT_FILE) {
  if (OUT_FILE) {
    writeFileSync(resolve(ROOT, OUT_FILE), fullSQL, "utf-8");
    log(`\nSQL written to ${OUT_FILE}`);
  } else {
    console.log("\n" + fullSQL);
  }
  process.exit(0);
}

// ─── Execute against DB ─────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) die("DATABASE_URL not set. Check .env files.");

log(`\nConnecting to database…`);
const conn = await mysql.createConnection(dbUrl);

try {
  // Split into individual executable statements
  const execStmts = fullSQL
    .split(/;\s*\n/)
    .map(s => s.replace(/^(\s*--.*\n)*/gm, "").trim()) // strip leading comment lines
    .filter(s => s && !s.startsWith("--"));

  let executed = 0, skipped = 0, errors = 0;

  for (const stmt of execStmts) {
    if (!stmt || stmt.startsWith("--")) continue;
    const sql = stmt.endsWith(";") ? stmt : stmt + ";";
    try {
      const [result] = await conn.execute(sql);
      const affected = result?.affectedRows ?? 0;
      const info = result?.info ?? "";
      if (affected > 0) {
        executed++;
        const tableMatch = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+`(\w+)`/i);
        const tbl = tableMatch ? tableMatch[1] : "?";
        const dupes = info.match(/Duplicates:\s*(\d+)/);
        const dupeCount = dupes ? parseInt(dupes[1]) : 0;
        if (dupeCount > 0) {
          log(`  ✓ ${tbl}: ${affected} inserted, ${dupeCount} duplicates skipped`);
        } else {
          log(`  ✓ ${tbl}: ${affected} inserted`);
        }
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      const preview = sql.substring(0, 120).replace(/\n/g, " ");
      log(`  ✗ ERROR: ${err.message}\n    SQL: ${preview}…`);
    }
  }

  log(`\n=== EXECUTION COMPLETE ===`);
  log(`  Statements executed: ${executed}`);
  log(`  Statements skipped (0 rows / SET): ${skipped}`);
  log(`  Errors: ${errors}`);

  // Quick validation
  log("\n=== VALIDATION ===");
  const checks = [
    ["companies", `SELECT COUNT(*) as c FROM companies WHERE id = ${COMPANY_ID}`],
    ["processes", `SELECT COUNT(*) as c FROM processes WHERE companyId = ${COMPANY_ID}`],
    ["stakeholders", `SELECT COUNT(*) as c FROM stakeholders WHERE processId IN (SELECT id FROM processes WHERE companyId = ${COMPANY_ID})`],
    ["criticalityMatrix", `SELECT COUNT(*) as c FROM criticalityMatrix WHERE processId IN (SELECT id FROM processes WHERE companyId = ${COMPANY_ID})`],
    ["processCharacterizations", `SELECT COUNT(*) as c FROM processCharacterizations WHERE processId IN (SELECT id FROM processes WHERE companyId = ${COMPANY_ID})`],
    ["processTacticalObjectives", `SELECT COUNT(*) as c FROM processTacticalObjectives WHERE processId IN (SELECT id FROM processes WHERE companyId = ${COMPANY_ID})`],
    ["processTrainings", `SELECT COUNT(*) as c FROM processTrainings WHERE processId IN (SELECT id FROM processes WHERE companyId = ${COMPANY_ID})`],
    ["procedures", `SELECT COUNT(*) as c FROM procedures WHERE processId IN (SELECT id FROM processes WHERE companyId = ${COMPANY_ID})`],
    ["policies", `SELECT COUNT(*) as c FROM policies WHERE companyId = ${COMPANY_ID}`],
    ["companyValues", `SELECT COUNT(*) as c FROM companyValues WHERE companyId = ${COMPANY_ID}`],
  ];
  for (const [label, sql] of checks) {
    const [rows] = await conn.execute(sql);
    log(`  ${label}: ${rows[0].c} rows`);
  }
} finally {
  await conn.end();
}
