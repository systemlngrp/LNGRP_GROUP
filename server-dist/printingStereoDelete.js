export function createPrintingStereoDeleteHandler(deps) {
    return async (req, res) => {
        try {
            const user = await deps.getUser(req);
            if (!user)
                return res.status(401).json({ error: "Unauthorized" });
            if (!deps.canManage(user) || !deps.hasAccess(user))
                return res.status(403).json({ error: "Forbidden" });
            const id = String(req.params.id || "").trim();
            const pool = await deps.getPool();
            if (!pool)
                return res.status(503).json({ error: "DB connection not available" });
            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                // Match the lock order used by paired creation.
                const blockId = /^STEREO-BLOCK-[a-f0-9-]{36}$/i.test(id) ? id.slice("STEREO-".length) : null;
                if (blockId)
                    await conn.query("SELECT id FROM `qc_block_records` WHERE id = ? FOR UPDATE", [blockId]);
                const [rows] = await conn.query("SELECT id FROM `printing_stereo_records` WHERE id = ? FOR UPDATE", [id]);
                if (!rows.length) {
                    await conn.rollback();
                    return res.status(404).json({ error: "Printing Stereo record not found." });
                }
                await conn.query("DELETE FROM `printing_stereo_records` WHERE id = ?", [id]);
                if (blockId)
                    await conn.query("DELETE FROM `qc_block_records` WHERE id = ?", [blockId]);
                await conn.commit();
                return res.json({ ok: true });
            }
            catch (error) {
                await conn.rollback();
                throw error;
            }
            finally {
                conn.release();
            }
        }
        catch (error) {
            console.error("[PRINTING_STEREO] delete failed:", error);
            return res.status(500).json({ error: "Unable to delete Printing Stereo and linked Block Record." });
        }
    };
}
