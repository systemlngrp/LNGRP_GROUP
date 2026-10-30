import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config();
let db;
try {
  db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });
  const [rows] = await db.query("SELECT (SELECT COUNT(*) FROM productions WHERE scheduleId IS NOT NULL AND LEFT(date,10)>='2026-04-01') jobs, (SELECT COUNT(*) FROM productions WHERE scheduleId IS NOT NULL AND LEFT(date,10)>='2026-04-01' AND status='Pending Consumption') pendingJobs, (SELECT COUNT(*) FROM productions p LEFT JOIN orders_schedule s ON s.id=p.scheduleId WHERE p.scheduleId IS NOT NULL AND LEFT(p.date,10)>='2026-04-01' AND s.id IS NULL) orphanJobs, (SELECT COUNT(*) FROM productions p JOIN orders_schedule s ON s.id=p.scheduleId WHERE LEFT(p.date,10)>='2026-04-01' AND ABS(COALESCE(p.qty,0)-COALESCE(s.qty,0))>0.01) qtyMismatch, (SELECT COUNT(*) FROM productions p JOIN orders_schedule s ON s.id=p.scheduleId WHERE LEFT(p.date,10)>='2026-04-01' AND LEFT(p.date,10)<>LEFT(s.scheduledDate,10)) dateMismatch");
  console.log(JSON.stringify(rows[0]));
  await db.end();
} catch (e) {
  console.error(JSON.stringify({ error: e.message, code: e.code }));
  process.exit(1);
}
