import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { loadCliEnv } from "./envForCli.mjs";

loadCliEnv();

function readArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function usage() {
  console.log(
    [
      "Uso:",
      "  pnpm run admin:create -- --email admin@empresa.com --password 'TuPassword123!' [--name 'Administrador'] [--openid local-admin-001]",
      "",
      "Notas:",
      "  - Conexión: DATABASE_URL explícita, o MYSQL_USER + MYSQL_PASSWORD + MYSQL_DATABASE (+ MYSQL_HOST, MYSQL_PORT opcionales).",
      "  - Carga: .env → .env.local (como herramientas Django/manage).",
      "  - Si la cuenta ya existe por email, actualiza passwordHash y garantiza rol platform_admin.",
    ].join("\n")
  );
}

const email = readArg("--email")?.trim().toLowerCase();
const password = readArg("--password");
const name = readArg("--name") ?? "Administrador";
const openId = readArg("--openid") ?? `local-admin-${Date.now()}`;

if (!email || !password) {
  usage();
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "No hay conexión a la base: define DATABASE_URL o MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE (y MYSQL_HOST / MYSQL_PORT si aplica)."
  );
  process.exit(1);
}

if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [accountColumns] = await connection.query("SHOW COLUMNS FROM accounts LIKE 'passwordHash'");
  if (!Array.isArray(accountColumns) || accountColumns.length === 0) {
    console.error("La columna accounts.passwordHash no existe aún. Ejecuta primero: pnpm run db:push");
    process.exit(1);
  }

  const [rolesTable] = await connection.query("SHOW TABLES LIKE 'roles'");
  const [accountRolesTable] = await connection.query("SHOW TABLES LIKE 'account_roles'");
  if (!Array.isArray(rolesTable) || rolesTable.length === 0 || !Array.isArray(accountRolesTable) || accountRolesTable.length === 0) {
    console.error("Las tablas roles/account_roles no existen aún. Ejecuta primero: pnpm run db:push");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [existingRows] = await connection.query(
    "SELECT id, openId FROM accounts WHERE LOWER(email) = ? LIMIT 1",
    [email]
  );

  let accountId;
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    const existing = existingRows[0];
    const nextOpenId = existing.openId || openId;

    await connection.query(
      "UPDATE accounts SET passwordHash=?, loginMethod='local', name=?, openId=?, status='active', lastSignedIn=NOW(), updatedAt=NOW() WHERE id=?",
      [passwordHash, name, nextOpenId, existing.id]
    );
    accountId = existing.id;
    console.log(`Cuenta actualizada: ${email} (id=${existing.id})`);
  } else {
    await connection.query(
      "INSERT INTO accounts (openId, name, email, passwordHash, loginMethod, status, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, 'local', 'active', NOW(), NOW(), NOW())",
      [openId, name, email, passwordHash]
    );
    const [createdRows] = await connection.query(
      "SELECT id FROM accounts WHERE openId = ? LIMIT 1",
      [openId]
    );
    if (!Array.isArray(createdRows) || createdRows.length === 0) {
      console.error("No se pudo recuperar la cuenta recién creada.");
      process.exit(1);
    }
    accountId = createdRows[0].id;
    console.log(`Cuenta creada: ${email} (openId=${openId})`);
  }

  const [roleRows] = await connection.query(
    "SELECT id FROM roles WHERE slug = 'platform_admin' LIMIT 1"
  );
  if (!Array.isArray(roleRows) || roleRows.length === 0) {
    console.error("No existe el rol 'platform_admin'. Ejecuta primero: npm run roles:seed");
    process.exit(1);
  }
  const roleId = roleRows[0].id;

  const [assignRows] = await connection.query(
    "SELECT id FROM account_roles WHERE accountId=? AND roleId=? AND companyId=0 AND processId=0 LIMIT 1",
    [accountId, roleId]
  );
  if (!Array.isArray(assignRows) || assignRows.length === 0) {
    await connection.query(
      "INSERT INTO account_roles (accountId, roleId, companyId, processId, createdAt) VALUES (?, ?, 0, 0, NOW())",
      [accountId, roleId]
    );
  }

  console.log(`Rol platform_admin asegurado para ${email} (accountId=${accountId})`);
} finally {
  await connection.end();
}

