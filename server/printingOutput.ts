import type mysql from "mysql2/promise";

/** Printing reports maintain FG totals and linked corrugation output. */
export async function syncLinkedPrintingOutput(db: mysql.Pool | mysql.PoolConnection, productionId: string) {
  if (!productionId) return;
  const [rows] = await db.query(
    `SELECT p.id, p.status, p.phpScheduledJobId, p.plateScheduledJobId,
            COALESCE(php.methodology, plate.methodology, p.methodology) AS sourceMethodology
       FROM productions p
       LEFT JOIN php_job_master php ON php.id = p.phpScheduledJobId
       LEFT JOIN plate_job_master plate ON plate.id = p.plateScheduledJobId
      WHERE p.id = ? LIMIT 1`, [productionId]
  );
  const production = (rows as any[])[0];
  if (!production) return;
  const [totals] = await db.query(
    `SELECT COALESCE(SUM(qty), 0) AS output FROM production_processing
      WHERE productionId = ? AND LOWER(TRIM(machineName)) = 'printing'`, [productionId]
  );
  const output = Number((totals as any[])[0]?.output || 0);
  const linkedCorrugation = (production.phpScheduledJobId || production.plateScheduledJobId) &&
    String(production.sourceMethodology || "").trim().toUpperCase() === "CORRUGATION" &&
    !["cancelled", "canceled"].includes(String(production.status || "").trim().toLowerCase());
  if (!linkedCorrugation) {
    await db.query("UPDATE productions SET prodFromFFG = ? WHERE id = ?", [output, productionId]);
    return;
  }
  const sourceTable = production.phpScheduledJobId ? "php_job_master" : "plate_job_master";
  const sourceId = production.phpScheduledJobId || production.plateScheduledJobId;
  await db.query("UPDATE productions SET prodFromFFG = ?, productionOutputQty = ? WHERE id = ?", [output, output, productionId]);
  await db.query(`UPDATE \`${sourceTable}\` SET productionOutputQty = ? WHERE id = ?`, [output, sourceId]);
}

// Lock parents before changing reports to serialize concurrent totals.
export async function withPrintingOutputTransaction(
  db: mysql.Pool,
  productionIds: string[],
  mutate: (conn: mysql.PoolConnection) => Promise<void>,
) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const ids = [...new Set(productionIds.filter(Boolean))].sort();
    for (const id of ids) await conn.query("SELECT id FROM productions WHERE id = ? FOR UPDATE", [id]);
    await mutate(conn);
    for (const id of ids) await syncLinkedPrintingOutput(conn, id);
    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    conn.release();
  }
}
