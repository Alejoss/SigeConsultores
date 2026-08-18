import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");

const email = "gerente@masaviva.demo";
const password = "MasaViva2027!";
const db = await mysql.createConnection(process.env.DATABASE_URL);

try {
  await db.beginTransaction();
  const [[company]] = await db.execute("SELECT id FROM companies WHERE name = 'Masa Viva' ORDER BY id ASC LIMIT 1");
  if (!company) throw new Error("No se encontró la empresa demostrativa Masa Viva");
  const [[managerRole]] = await db.execute("SELECT id FROM roles WHERE slug = 'company_manager' LIMIT 1");
  if (!managerRole) throw new Error("No se encontró el rol company_manager");

  const hash = await bcrypt.hash(password, 10);
  const [existingRows] = await db.execute("SELECT id FROM accounts WHERE LOWER(email) = ? LIMIT 1", [email]);
  let accountId;
  if (existingRows[0]) {
    accountId = existingRows[0].id;
    await db.execute(
      "UPDATE accounts SET name = ?, passwordHash = ?, loginMethod = 'local', status = 'active', updatedAt = NOW() WHERE id = ?",
      ["Gerente General · Masa Viva", hash, accountId],
    );
  } else {
    const [result] = await db.execute(
      "INSERT INTO accounts (openId, name, email, passwordHash, loginMethod, status, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, 'local', 'active', NOW(), NOW(), NOW())",
      ["masa-viva-manager-local", "Gerente General · Masa Viva", email, hash],
    );
    accountId = result.insertId;
  }

  await db.execute(
    "INSERT INTO account_roles (accountId, roleId, companyId, processId) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE accountId = VALUES(accountId)",
    [accountId, managerRole.id, company.id],
  );
  await db.commit();
  console.log(JSON.stringify({ email, password, companyId: company.id, accountId }, null, 2));
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
