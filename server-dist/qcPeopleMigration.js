import crypto from "node:crypto";
const qcAccess = JSON.stringify(["/quality"]);
export async function migrateQcPeopleToUsers(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS qc_person_user_migrations (
    legacyId VARCHAR(100) PRIMARY KEY,
    userId VARCHAR(100) NOT NULL UNIQUE
  )`);
    const [rows] = await db.query("SELECT id, name, active FROM qc_person_masters ORDER BY name, id");
    let created = 0;
    let reused = 0;
    const failures = [];
    for (const row of rows) {
        const name = String(row.name || "").trim();
        const userId = name.toLowerCase();
        const legacyId = String(row.id || "");
        if (!legacyId || !userId || userId.length > 100) {
            failures.push(`${legacyId || "(missing id)"}: invalid name or username`);
            continue;
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [done] = await conn.query("SELECT legacyId FROM qc_person_user_migrations WHERE legacyId = ?", [legacyId]);
            if (done.length) {
                await conn.commit();
                continue;
            }
            const [claimed] = await conn.query("SELECT legacyId FROM qc_person_user_migrations WHERE LOWER(userId) = ? LIMIT 1", [userId]);
            if (claimed.length)
                throw new Error("duplicate QC person name");
            const [matches] = await conn.query("SELECT id FROM users WHERE LOWER(TRIM(userId)) = ? LIMIT 1 FOR UPDATE", [userId]);
            const existing = matches[0];
            const status = String(row.active || "").toLowerCase() === "no" ? "Inactive" : "Active";
            if (existing) {
                await conn.query("UPDATE users SET name = ?, designation = 'QC Person', status = ? WHERE id = ?", [name, status, existing.id]);
                reused++;
            }
            else {
                await conn.query("INSERT INTO users (id, userId, name, mobile, email, password, designation, role, status, menuAccess, updatedBy, updateTimestamp) VALUES (?, ?, ?, '', NULL, '12345', 'QC Person', 'Employee', ?, ?, 'QC Person migration', ?)", [crypto.randomUUID(), userId, name, status, qcAccess, new Date().toISOString()]);
                created++;
            }
            await conn.query("INSERT INTO qc_person_user_migrations (legacyId, userId) VALUES (?, ?)", [legacyId, userId]);
            await conn.commit();
        }
        catch (error) {
            await conn.rollback();
            failures.push(`${legacyId} (${name}): ${error.message}`);
        }
        finally {
            conn.release();
        }
    }
    console.log(`[DB] QC people migration: ${created} created, ${reused} reused, ${failures.length} failed`);
    for (const failure of failures)
        console.warn(`[DB] QC people migration skipped ${failure}`);
}
