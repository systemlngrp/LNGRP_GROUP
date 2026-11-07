// Secondary indexes on the columns screens filter and join by. Each entry is
// added only when the table and column exist, the column type can be indexed
// and no index already starts with that column. Runs once in the background
// after startup, one index at a time, so it never blocks the app.
export const PERFORMANCE_INDEXES = [
    ["productions", "status"],
    ["productions", "scheduleId"],
    ["productions", "orderId"],
    ["productions", "date"],
    ["productions", "npdId"],
    ["productions", "phpScheduledJobId"],
    ["productions", "plateScheduledJobId"],
    ["production_processing", "productionId"],
    ["production_processing", "status"],
    ["orders", "status"],
    ["orders", "companyId"],
    ["orders", "orderFirmId"],
    ["orders_schedule", "orderId"],
    ["orders_schedule", "status"],
    ["dispatch_plans", "orderId"],
    ["dispatch_plans", "productionId"],
    ["dispatch_plans", "scheduleId"],
    ["dispatch_plans", "status"],
    ["loading_slips", "dispatchPlanId"],
    ["loading_slips", "invoiceId"],
    ["loading_slips", "date"],
    ["loading_slips", "companyId"],
    ["loading_slips", "status"],
    ["php_loading_slips", "loadingSlipId"],
    ["php_loading_slips", "parentLoadingSlipId"],
    ["plate_loading_slips", "loadingSlipId"],
    ["plate_loading_slips", "parentLoadingSlipId"],
    ["invoices", "date"],
    ["invoices", "companyId"],
    ["invoices", "sourceTransactionId"],
    ["invoice_line_items", "invoiceId"],
    ["invoice_line_items", "loadingSlipId"],
    ["invoice_line_items", "sourceTransactionId"],
    ["inter_firm_pending_invoices", "sourceTransactionId"],
    ["material_in", "status"],
    ["material_in", "mrrType"],
    ["material_in", "date"],
    ["material_in", "gateEntryId"],
    ["material_in_packing_slips", "materialInId"],
    ["material_in_packing_slips", "ourReelNo"],
    ["material_issues", "productionId"],
    ["material_issues", "date"],
    ["material_issue_lines", "issueId"],
    ["material_issue_lines", "productionId"],
    ["material_issue_reel_lines", "issueId"],
    ["material_issue_reel_lines", "productionId"],
    ["material_issue_reel_lines", "ourReelNo"],
    ["material_returns", "productionId"],
    ["material_return_lines", "returnId"],
    ["material_return_reel_lines", "returnId"],
    ["material_return_reel_lines", "productionId"],
    ["material_return_reel_lines", "ourReelNo"],
    ["gate_entries", "status"],
    ["gate_entries", "poId"],
    ["indent_lines", "indentId"],
    ["purchase_order_lines", "purchaseOrderId"],
    ["purchase_order_lines", "indentLineId"],
    ["consumptions", "productionId"],
    ["npd", "npdId"],
    ["npd", "erp"],
    ["npd_firm_openings", "npdId"],
];
const INDEXABLE_TYPES = new Set(["varchar", "char", "int", "bigint", "smallint", "tinyint", "mediumint", "decimal", "date", "datetime", "timestamp"]);
export async function ensurePerformanceIndexes(db, database, log = console.log) {
    let added = 0;
    // Use one dedicated connection with a short lock wait: if a table is busy,
    // skip its index this time instead of making every other query queue
    // behind the index build (metadata-lock pile-up).
    const connection = await db.getConnection();
    try {
        await connection.query("SET SESSION lock_wait_timeout = 3");
    }
    catch { /* older servers: keep the default */ }
    try {
        for (const [table, column] of PERFORMANCE_INDEXES) {
            try {
                const [columns] = await connection.query("SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", [database, table, column]);
                const info = columns[0];
                if (!info)
                    continue;
                const dataType = String(info.DATA_TYPE || "").toLowerCase();
                if (!INDEXABLE_TYPES.has(dataType))
                    continue;
                if ((dataType === "varchar" || dataType === "char") && Number(info.CHARACTER_MAXIMUM_LENGTH || 0) > 255)
                    continue;
                const [existing] = await connection.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND SEQ_IN_INDEX = 1 LIMIT 1", [database, table, column]);
                if (existing.length)
                    continue;
                const indexName = `idx_perf_${table}_${column}`.slice(0, 64);
                await connection.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (\`${column}\`), ALGORITHM=INPLACE, LOCK=NONE`);
                added += 1;
                log(`[DB] Added performance index ${indexName}`);
            }
            catch (error) {
                log(`[DB] Skipped performance index ${table}(${column}): ${error.message}`);
            }
        }
    }
    finally {
        connection.release();
    }
    log(`[DB] Performance indexes checked (${PERFORMANCE_INDEXES.length}), added ${added}`);
    return added;
}
