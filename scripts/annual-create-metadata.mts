import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import mysql from "mysql2/promise";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema.ts";

const env = parse(readFileSync(resolve(import.meta.dirname, "../.env.local")));
const raw = process.env.DATABASE_URL || env.DATABASE_URL;
const url = new URL(raw);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "3307" || !["/isge_annual_review", "/isge_annual_test"].includes(url.pathname)) {
  throw new Error("Preparación limitada exclusivamente a review/test anuales locales en127.0.0.1:3307");
}
const q = (name: string) => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) throw new Error("Identificador inválido");
  return "`" + name + "`";
};
const names = ["annualWorkspaces", "annualProcessStates", "annualEntityLineage", "annualFileRetentions", "annualHistoricalResolutions"];
const connection = await mysql.createConnection(raw);
try {
  for (const name of names) {
    const table = (schema as Record<string, any>)[name];
    if (!table) continue;
    const cfg = getTableConfig(table);
    const definitions = cfg.columns.map(c => {
      let result = q(c.name) + " " + c.getSQLType();
      if (c.notNull) result += " NOT NULL";
      if (c.primary) result += " PRIMARY KEY";
      if ("autoIncrement" in c && c.autoIncrement) result += " AUTO_INCREMENT";
      if (c.hasDefault && c.default !== undefined) {
        if (["createdAt", "updatedAt"].includes(c.name)) result += " DEFAULT CURRENT_TIMESTAMP";
        else if (typeof c.default === "number") result += " DEFAULT " + c.default;
        else if (typeof c.default === "string") result += " DEFAULT '" + c.default.replaceAll("'", "''") + "'";
        else if (typeof c.default === "boolean") result += " DEFAULT " + (c.default ? 1 : 0);
        else throw new Error(`Revisar default no serializado de ${name}.${c.name}`);
      }
      return result;
    });
    for (const unique of cfg.uniqueConstraints) definitions.push(`CONSTRAINT ${q(unique.name!)} UNIQUE (${unique.columns.map(c => q(c.name)).join(",")})`);
    for (const index of cfg.indexes) {
      const ix = index.config;
      definitions.push(`${ix.unique ? "UNIQUE " : ""}INDEX ${q(ix.name)} (${ix.columns.map(c => {
        if (!("name" in c)) throw new Error("Índice expresivo requiere revisión");
        return q(c.name);
      }).join(",")})`);
    }
    await connection.query(`CREATE TABLE IF NOT EXISTS ${q(cfg.name)} (${definitions.join(",")}) ENGINE=InnoDB`);
    console.log(`Metadatos aditivos preparados: ${cfg.name}`);
  }
  console.log(`Base local: ${url.pathname.slice(1)}; ningún ALTER/DROP/DELETE ni fila original modificada.`);
} finally {
  await connection.end();
}
