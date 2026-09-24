import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });
  try {
    await db.beginTransaction();
    const [before] = await db.query<any[]>(
      "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'productions' AND COLUMN_NAME = 'erpCodeReel'",
    );
    if (Number(before[0]?.count || 0) !== 1) throw new Error("productions.erpCodeReel was not found; migration rolled back");
    await db.query("SELECT COUNT(*) FROM productions FOR UPDATE");
    await db.query("ALTER TABLE productions DROP COLUMN erpCodeReel");
    const [after] = await db.query<any[]>(
      "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'productions' AND COLUMN_NAME = 'erpCodeReel'",
    );
    if (Number(after[0]?.count || 0) !== 0) throw new Error("erpCodeReel still exists after DROP COLUMN");
    await db.commit();
    console.log("Dropped productions.erpCodeReel successfully.");
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
