/**
 * Legacy script: previously updated `label4` on rows with moduleName `sige_modules`.
 * The schema now stores one `customLabel` per `moduleName` (see shared/moduleLabelDefinitions.ts).
 * Use `server/scripts/migrateLegacyModuleLabels.ts` after applying the DB migration.
 */
console.log(
  "fix-label.ts: el esquema antiguo (label1–label5 en sige_modules) ya no aplica. " +
    "Ejecuta la migración SQL y luego server/scripts/migrateLegacyModuleLabels.ts si aún tienes datos viejos."
);
process.exit(0);
