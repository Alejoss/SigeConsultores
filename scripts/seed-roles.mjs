import mysql from "mysql2/promise";
import { loadCliEnv } from "./envForCli.mjs";

loadCliEnv();

if (!process.env.DATABASE_URL) {
  console.error(
    "No hay conexión a la base: define DATABASE_URL o MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE (y MYSQL_HOST / MYSQL_PORT si aplica)."
  );
  process.exit(1);
}

const ROLE_DEFINITIONS = [
  { slug: "platform_admin", label: "Platform Admin" },
  { slug: "platform_user", label: "Platform User" },
  { slug: "company_manager", label: "Company Manager" },
  { slug: "process_leader", label: "Process Leader" },
];

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [rolesTable] = await connection.query("SHOW TABLES LIKE 'roles'");
  if (!Array.isArray(rolesTable) || rolesTable.length === 0) {
    console.error("La tabla roles no existe aún. Ejecuta primero: npm run db:push");
    process.exit(1);
  }

  for (const role of ROLE_DEFINITIONS) {
    await connection.query(
      `
      INSERT INTO roles (slug, label, createdAt)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        label = VALUES(label)
      `,
      [role.slug, role.label]
    );
  }

  const [rows] = await connection.query(
    "SELECT id, slug, label FROM roles WHERE slug IN (?, ?, ?, ?) ORDER BY id ASC",
    ROLE_DEFINITIONS.map((r) => r.slug)
  );

  console.log("Roles sembrados/actualizados:");
  for (const row of rows) {
    console.log(`- [${row.id}] ${row.slug} => ${row.label}`);
  }
} finally {
  await connection.end();
}
