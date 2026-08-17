import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
const db = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await db.execute("SELECT p.id, p.name FROM processes p JOIN companies c ON c.id=p.companyId WHERE c.name='Masa Viva' ORDER BY p.name");
  console.log(JSON.stringify(rows, null, 2));
} finally { await db.end(); }
