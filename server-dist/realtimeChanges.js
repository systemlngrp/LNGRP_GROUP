import { AsyncLocalStorage } from "async_hooks";
const changeContext = new AsyncLocalStorage();
export function runWithChangeTracking(fn) {
    return changeContext.run({ tables: new Set(), unknown: false }, fn);
}
export function getTrackedChanges() {
    const store = changeContext.getStore();
    if (!store)
        return null;
    return { tables: Array.from(store.tables), unknown: store.unknown };
}
const WRITE_PATTERNS = [
    /\binsert\s+(?:low_priority\s+|delayed\s+|high_priority\s+)?(?:ignore\s+)?into\s+`?([a-z0-9_]+)`?/gi,
    /\breplace\s+(?:low_priority\s+|delayed\s+)?into\s+`?([a-z0-9_]+)`?/gi,
    /\bdelete\s+(?:low_priority\s+|quick\s+|ignore\s+)*from\s+`?([a-z0-9_]+)`?/gi,
    /\btruncate\s+(?:table\s+)?`?([a-z0-9_]+)`?/gi,
];
// Statements whose written tables cannot be read reliably from the SQL text.
const UNKNOWN_WRITE = /\b(?:alter|create|drop|rename)\s+(?:table|index|view)\b|\bdelete\s+(?!(?:low_priority\s+|quick\s+|ignore\s+)*from\b)[a-z0-9_`]+(?:\s*,\s*[a-z0-9_`]+)*\s+from\b|\bcall\s+/i;
function sqlText(sql) {
    if (typeof sql === "string")
        return sql;
    if (sql && typeof sql === "object" && typeof sql.sql === "string")
        return sql.sql;
    return "";
}
export function extractWrittenTables(sql) {
    const text = sqlText(sql).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ");
    if (!text.trim() || /^\s*(?:select|show|set\s|start|commit|rollback|begin|savepoint|release|describe|explain|use\s)/i.test(text)) {
        return { tables: [], unknown: false };
    }
    const tables = new Set();
    for (const pattern of WRITE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)))
            tables.add(match[1].toLowerCase());
    }
    // UPDATE t1 [alias] [JOIN t2 ...] SET ... : multi-table updates may write any
    // joined table, so record every table named before SET.
    const updatePattern = /\bupdate\s+(?:low_priority\s+)?(?:ignore\s+)?([\s\S]*?)\bset\b/gi;
    let updateMatch;
    while ((updateMatch = updatePattern.exec(text))) {
        const target = updateMatch[1];
        const first = target.match(/^\s*`?([a-z0-9_]+)`?/i);
        if (first)
            tables.add(first[1].toLowerCase());
        const joinPattern = /\bjoin\s+`?([a-z0-9_]+)`?/gi;
        let joinMatch;
        while ((joinMatch = joinPattern.exec(target)))
            tables.add(joinMatch[1].toLowerCase());
        const commaPattern = /,\s*`?([a-z0-9_]+)`?/gi;
        let commaMatch;
        while ((commaMatch = commaPattern.exec(target)))
            tables.add(commaMatch[1].toLowerCase());
    }
    // ON DUPLICATE KEY UPDATE col = ... is not a table update.
    tables.delete("duplicate");
    const looksLikeWrite = /\b(?:insert|update|delete|replace|truncate)\b/i.test(text);
    return { tables: Array.from(tables), unknown: UNKNOWN_WRITE.test(text) || (looksLikeWrite && tables.size === 0) };
}
let schemaChangeListener = null;
/** Called whenever the app runs ALTER/CREATE/DROP TABLE, so schema caches can reset. */
export function onSchemaChange(listener) {
    schemaChangeListener = listener;
}
const SCHEMA_CHANGE = /^\s*(?:alter|create|drop|rename)\s+table\b/i;
function record(sql) {
    if (schemaChangeListener && SCHEMA_CHANGE.test(sqlText(sql))) {
        try {
            schemaChangeListener();
        }
        catch { /* ignore */ }
    }
    const store = changeContext.getStore();
    if (!store)
        return;
    try {
        const result = extractWrittenTables(sql);
        result.tables.forEach((table) => store.tables.add(table));
        if (result.unknown)
            store.unknown = true;
    }
    catch {
        store.unknown = true;
    }
}
function wrapQueryable(target) {
    if (target.__changeTracked)
        return target;
    const originalQuery = target.query.bind(target);
    target.query = (sql, ...rest) => {
        record(sql);
        return originalQuery(sql, ...rest);
    };
    if (typeof target.execute === "function") {
        const originalExecute = target.execute.bind(target);
        target.execute = (sql, ...rest) => {
            record(sql);
            return originalExecute(sql, ...rest);
        };
    }
    target.__changeTracked = true;
    return target;
}
export function instrumentPool(pool) {
    wrapQueryable(pool);
    const originalGetConnection = pool.getConnection.bind(pool);
    pool.getConnection = async (...args) => {
        const connection = await originalGetConnection(...args);
        return wrapQueryable(connection);
    };
    return pool;
}
// ---- Change log -----------------------------------------------------------
const MAX_LOG_ENTRIES = 1000;
const changeLog = [];
let currentVersion = 0;
export function recordChangeVersion(version, entities) {
    currentVersion = version;
    changeLog.push({ version, entities });
    if (changeLog.length > MAX_LOG_ENTRIES)
        changeLog.splice(0, changeLog.length - MAX_LOG_ENTRIES);
}
/** Entities changed after `since`, or ["*"] when the log cannot answer. */
export function getChangesSince(since, version = currentVersion) {
    if (!Number.isFinite(since) || since < 0 || since > version)
        return ["*"];
    if (since === version)
        return [];
    const oldest = changeLog[0]?.version;
    if (oldest === undefined || since < oldest - 1)
        return ["*"];
    const entities = new Set();
    for (const entry of changeLog) {
        if (entry.version <= since)
            continue;
        for (const entity of entry.entities) {
            if (entity === "*")
                return ["*"];
            entities.add(entity);
        }
    }
    return Array.from(entities);
}
