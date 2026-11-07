import { AsyncLocalStorage } from "async_hooks";

// Tracks which tables each API request writes to, so clients only reload the
// collections that actually changed instead of every table on every save.

type ChangeContext = { tables: Set<string>; unknown: boolean };

const changeContext = new AsyncLocalStorage<ChangeContext>();

export function runWithChangeTracking<T>(fn: () => T): T {
  return changeContext.run({ tables: new Set(), unknown: false }, fn);
}

export function getTrackedChanges(): { tables: string[]; unknown: boolean } | null {
  const store = changeContext.getStore();
  if (!store) return null;
  return { tables: Array.from(store.tables), unknown: store.unknown };
}

const WRITE_PATTERNS: RegExp[] = [
  /\binsert\s+(?:low_priority\s+|delayed\s+|high_priority\s+)?(?:ignore\s+)?into\s+`?([a-z0-9_]+)`?/gi,
  /\breplace\s+(?:low_priority\s+|delayed\s+)?into\s+`?([a-z0-9_]+)`?/gi,
  /\bdelete\s+(?:low_priority\s+|quick\s+|ignore\s+)*from\s+`?([a-z0-9_]+)`?/gi,
  /\btruncate\s+(?:table\s+)?`?([a-z0-9_]+)`?/gi,
];

// Statements whose written tables cannot be read reliably from the SQL text.
const UNKNOWN_WRITE = /\b(?:alter|create|drop|rename)\s+(?:table|index|view)\b|\bdelete\s+(?!(?:low_priority\s+|quick\s+|ignore\s+)*from\b)[a-z0-9_`]+(?:\s*,\s*[a-z0-9_`]+)*\s+from\b|\bcall\s+/i;

function sqlText(sql: unknown): string {
  if (typeof sql === "string") return sql;
  if (sql && typeof sql === "object" && typeof (sql as any).sql === "string") return (sql as any).sql;
  return "";
}

export function extractWrittenTables(sql: unknown): { tables: string[]; unknown: boolean } {
  const text = sqlText(sql).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  if (!text.trim() || /^\s*(?:select|show|set\s|start|commit|rollback|begin|savepoint|release|describe|explain|use\s)/i.test(text)) {
    return { tables: [], unknown: false };
  }
  const tables = new Set<string>();
  for (const pattern of WRITE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) tables.add(match[1].toLowerCase());
  }
  // UPDATE t1 [alias] [JOIN t2 ...] SET ... : multi-table updates may write any
  // joined table, so record every table named before SET.
  const updatePattern = /\bupdate\s+(?:low_priority\s+)?(?:ignore\s+)?([\s\S]*?)\bset\b/gi;
  let updateMatch: RegExpExecArray | null;
  while ((updateMatch = updatePattern.exec(text))) {
    const target = updateMatch[1];
    const first = target.match(/^\s*`?([a-z0-9_]+)`?/i);
    if (first) tables.add(first[1].toLowerCase());
    const joinPattern = /\bjoin\s+`?([a-z0-9_]+)`?/gi;
    let joinMatch: RegExpExecArray | null;
    while ((joinMatch = joinPattern.exec(target))) tables.add(joinMatch[1].toLowerCase());
    const commaPattern = /,\s*`?([a-z0-9_]+)`?/gi;
    let commaMatch: RegExpExecArray | null;
    while ((commaMatch = commaPattern.exec(target))) tables.add(commaMatch[1].toLowerCase());
  }
  // ON DUPLICATE KEY UPDATE col = ... is not a table update.
  tables.delete("duplicate");
  const looksLikeWrite = /\b(?:insert|update|delete|replace|truncate)\b/i.test(text);
  return { tables: Array.from(tables), unknown: UNKNOWN_WRITE.test(text) || (looksLikeWrite && tables.size === 0) };
}

let schemaChangeListener: (() => void) | null = null;
/** Called whenever the app runs ALTER/CREATE/DROP TABLE, so schema caches can reset. */
export function onSchemaChange(listener: () => void) {
  schemaChangeListener = listener;
}
const SCHEMA_CHANGE = /^\s*(?:alter|create|drop|rename)\s+table\b/i;

function record(sql: unknown) {
  if (schemaChangeListener && SCHEMA_CHANGE.test(sqlText(sql))) {
    try { schemaChangeListener(); } catch { /* ignore */ }
  }
  const store = changeContext.getStore();
  if (!store) return;
  try {
    const result = extractWrittenTables(sql);
    result.tables.forEach((table) => store.tables.add(table));
    if (result.unknown) store.unknown = true;
  } catch {
    store.unknown = true;
  }
}

function wrapQueryable<T extends { query: any; execute?: any }>(target: T): T {
  if ((target as any).__changeTracked) return target;
  const originalQuery = target.query.bind(target);
  (target as any).query = (sql: unknown, ...rest: unknown[]) => {
    record(sql);
    return originalQuery(sql, ...rest);
  };
  if (typeof target.execute === "function") {
    const originalExecute = target.execute.bind(target);
    (target as any).execute = (sql: unknown, ...rest: unknown[]) => {
      record(sql);
      return originalExecute(sql, ...rest);
    };
  }
  (target as any).__changeTracked = true;
  return target;
}

export function instrumentPool<P extends { query: any; execute?: any; getConnection: any }>(pool: P): P {
  wrapQueryable(pool);
  const originalGetConnection = pool.getConnection.bind(pool);
  (pool as any).getConnection = async (...args: unknown[]) => {
    const connection = await originalGetConnection(...args);
    return wrapQueryable(connection);
  };
  return pool;
}

// ---- Change log -----------------------------------------------------------

const MAX_LOG_ENTRIES = 1000;
const changeLog: Array<{ version: number; entities: string[] }> = [];
let currentVersion = 0;

export function recordChangeVersion(version: number, entities: string[]) {
  currentVersion = version;
  changeLog.push({ version, entities });
  if (changeLog.length > MAX_LOG_ENTRIES) changeLog.splice(0, changeLog.length - MAX_LOG_ENTRIES);
}

/** Entities changed after `since`, or ["*"] when the log cannot answer. */
export function getChangesSince(since: number, version = currentVersion): string[] {
  if (!Number.isFinite(since) || since < 0 || since > version) return ["*"];
  if (since === version) return [];
  const oldest = changeLog[0]?.version;
  if (oldest === undefined || since < oldest - 1) return ["*"];
  const entities = new Set<string>();
  for (const entry of changeLog) {
    if (entry.version <= since) continue;
    for (const entity of entry.entities) {
      if (entity === "*") return ["*"];
      entities.add(entity);
    }
  }
  return Array.from(entities);
}
