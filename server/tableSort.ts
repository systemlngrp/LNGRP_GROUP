// Server-side column sorting for tables the server pages. The client sends
// ?sortKey=<key>&sortDir=asc|desc; each route passes its own whitelist of keys,
// so an unknown key is ignored (the route's own order stays) and nothing from
// the query string ever reaches SQL. Sorting runs on the whole filtered list
// before the page is sliced.

export type ServerSortDirection = "ASC" | "DESC";
export type ServerSort<K extends string = string> = { key: K; direction: ServerSortDirection } | null;

/** Reads sortKey / sortDir; returns null unless sortKey is one of `allowed`. */
export function readServerSort<K extends string>(query: Record<string, unknown>, allowed: readonly K[] | ReadonlySet<string> | Record<K, unknown>): ServerSort<K> {
  const key = String(query.sortKey ?? "").trim();
  if (!key) return null;
  const ok = Array.isArray(allowed)
    ? allowed.includes(key as K)
    : allowed instanceof Set
      ? allowed.has(key)
      : Object.prototype.hasOwnProperty.call(allowed, key);
  if (!ok) return null;
  const direction: ServerSortDirection = String(query.sortDir ?? "").trim().toLowerCase() === "desc" ? "DESC" : "ASC";
  return { key: key as K, direction };
}

const NUMBER = /^[-+]?[₹$]?\s*[\d,]*\.?\d+\s*%?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const DMY_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;

type Key = { kind: 0 | 1 | 2 | 3; num: number; text: string };
// kind: 0 number, 1 date, 2 text, 3 empty (always last)

function toKey(value: unknown): Key {
  if (value === null || value === undefined) return { kind: 3, num: 0, text: "" };
  if (typeof value === "number") return Number.isFinite(value) ? { kind: 0, num: value, text: "" } : { kind: 3, num: 0, text: "" };
  if (typeof value === "bigint") return { kind: 0, num: Number(value), text: "" };
  if (typeof value === "boolean") return { kind: 2, num: 0, text: value ? "yes" : "no" };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? { kind: 3, num: 0, text: "" } : { kind: 1, num: value.getTime(), text: "" };
  const text = String(value).trim();
  if (!text || text === "-" || text === "—") return { kind: 3, num: 0, text: "" };
  const iso = ISO_DATE.exec(text);
  if (iso) {
    const time = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0));
    return { kind: 1, num: time, text };
  }
  const dmy = DMY_DATE.exec(text);
  if (dmy) return { kind: 1, num: Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])), text };
  if (NUMBER.test(text)) {
    const number = Number(text.replace(/[₹$,%\s+]/g, ""));
    if (Number.isFinite(number)) return { kind: 0, num: number, text: "" };
  }
  return { kind: 2, num: 0, text };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareKeys(a: Key, b: Key) {
  if (a.kind !== b.kind) return a.kind - b.kind;
  if (a.kind === 2) return collator.compare(a.text, b.text);
  return a.num - b.num;
}

/**
 * Sorts a copy of rows by one value: numbers numerically, dates by date, text
 * naturally (localeCompare numeric, case-insensitive). Blank values stay last in
 * both directions; ties keep the existing order.
 */
export function sortRowsInMemory<T>(rows: T[], getValue: (row: T) => unknown, direction: ServerSortDirection): T[] {
  const keyed = rows.map((row, index) => ({ row, index, key: toKey(getValue(row)) }));
  keyed.sort((a, b) => {
    const aEmpty = a.key.kind === 3;
    const bEmpty = b.key.kind === 3;
    if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
    const result = compareKeys(a.key, b.key);
    return (direction === "ASC" ? result : -result) || a.index - b.index;
  });
  return keyed.map((entry) => entry.row);
}

export type SqlSortColumn = { expr: string; type: "text" | "number" | "date" };

/**
 * ORDER BY terms for a whitelisted column (blanks last), or "" when no sort.
 * `columns` holds fixed SQL expressions written in the route; the key only
 * picks one of them. Put the result before the route's own ORDER BY terms.
 */
export function sqlSortTerms(sort: ServerSort, columns: Record<string, SqlSortColumn>): string {
  if (!sort || !Object.prototype.hasOwnProperty.call(columns, sort.key)) return "";
  const column = columns[sort.key];
  const direction = sort.direction === "DESC" ? "DESC" : "ASC";
  const blank = column.type === "text"
    ? `(${column.expr} IS NULL OR TRIM(${column.expr}) = '')`
    : `(${column.expr} IS NULL)`;
  return `${blank} ASC, ${column.expr} ${direction}`;
}

const FIRM_LEGAL_SUFFIXES = new Set(["LLP", "LTD", "LIMITED", "PRIVATE", "PVT", "COMPANY"]);

/** Same text as the client's getFirmDisplayName (src/lib/firmDisplay.ts): short code. */
export function firmDisplayNameForSort(firm?: { firmName?: unknown; shortName?: unknown } | null): string {
  if (!firm) return "Unknown firm";
  const shortName = String(firm.shortName || "").trim();
  if (shortName) return shortName;
  const firmName = String(firm.firmName || "");
  const words = firmName.trim().split(/[^A-Za-z0-9]+/).filter(Boolean).filter((word) => !FIRM_LEGAL_SUFFIXES.has(word.toUpperCase()));
  const initials = words.map((word) => word[0]).join("").toUpperCase();
  return ((initials || firmName.replace(/[^A-Za-z0-9]/g, "").slice(0, 4)).toUpperCase() || "Unknown firm").trim();
}

/**
 * ORDER BY terms that sort by the firm code the pages show (shortName, else
 * generated initials). Built as CASE <column> WHEN ? THEN ? … with bound
 * params, so firm data is never interpolated. `fallbackExpr` is a fixed SQL
 * expression for rows whose firm is not in the list (NULL / '' sort last).
 */
export function sqlFirmCodeOrder(column: string, firms: Array<{ id?: unknown; firmName?: unknown; shortName?: unknown }>, direction: ServerSortDirection, fallbackExpr: string): { sql: string; params: string[] } {
  const caseParams: string[] = [];
  const whens = firms
    .filter((firm) => String(firm.id ?? "").trim())
    .map((firm) => {
      caseParams.push(String(firm.id).trim(), firmDisplayNameForSort(firm));
      return "WHEN ? THEN ?";
    });
  if (!whens.length) return { sql: "", params: [] };
  const dir = direction === "DESC" ? "DESC" : "ASC";
  const expr = `(CASE TRIM(${column}) ${whens.join(" ")} ELSE ${fallbackExpr} END)`;
  return { sql: `(${expr} IS NULL OR ${expr} = '') ASC, ${expr} ${dir}`, params: [...caseParams, ...caseParams, ...caseParams] };
}
