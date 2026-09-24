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
    const [columns] = await db.query<any[]>(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'productions' AND COLUMN_NAME IN ('idToOd17','idToOd2')",
    );
    const names = new Set(columns.map((row) => row.COLUMN_NAME));
    if (!names.has("idToOd17")) throw new Error("productions.idToOd17 is missing");
    if (!names.has("idToOd2")) {
      await db.query("ALTER TABLE productions ADD COLUMN idToOd2 DECIMAL(15,2) NULL");
    }
    await db.beginTransaction();
    const [[countRow]] = await db.query<any[]>("SELECT COUNT(*) AS total, SUM(idToOd17 IS NOT NULL) AS expected FROM productions");
    const expected = Number(countRow.expected || 0);
    const [result] = await db.query<any>("UPDATE productions SET idToOd2 = idToOd17 WHERE idToOd2 IS NULL AND idToOd17 IS NOT NULL");
    if (Number(result.affectedRows) !== expected) throw new Error(`Expected ${expected} rows, updated ${result.affectedRows}`);
    const [[verify]] = await db.query<any>("SELECT COUNT(*) AS total FROM productions WHERE idToOd17 IS NOT NULL AND idToOd2 <> idToOd17");
    if (Number(verify.total) !== 0) throw new Error("ID to OD 2 verification failed");
    await db.commit();
    console.log(`Migrated ${expected} production rows (total ${countRow.total}).`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
