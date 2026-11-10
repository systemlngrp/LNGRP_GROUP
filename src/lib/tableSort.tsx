// Column sorting used by every table: click a header once for ascending (▲),
// twice for descending (▼), a third time for the page's own order.
//
// Sorting runs on the page's whole filtered list, before paging, so it covers
// every row, not just the ones on screen. Values sort by their real type:
// numbers by value (with or without commas / ₹), dates by date (dd-mm-yyyy or
// yyyy-mm-dd), and codes / text naturally (MRR/26-27/00027 after 00021).
// Empty values always go last.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection } | null;

const NUMBER = /^[-+]?[₹$]?\s*[\d,]*\.?\d+\s*%?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;

type SortKey = { kind: 0 | 1 | 2 | 3; num: number; text: string };
// kind: 0 number, 1 date, 2 text, 3 empty (always last)

function toSortKey(value: unknown): SortKey {
  if (value === null || value === undefined) return { kind: 3, num: 0, text: "" };
  if (typeof value === "number") return Number.isFinite(value) ? { kind: 0, num: value, text: "" } : { kind: 3, num: 0, text: "" };
  if (typeof value === "boolean") return { kind: 2, num: 0, text: value ? "yes" : "no" };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? { kind: 3, num: 0, text: "" } : { kind: 1, num: value.getTime(), text: "" };
  const text = String(value).trim();
  if (!text || text === "-" || text === "—") return { kind: 3, num: 0, text: "" };
  const iso = ISO_DATE.exec(text);
  if (iso) return { kind: 1, num: Number(`${iso[1]}${iso[2]}${iso[3]}`), text };
  const dmy = DMY_DATE.exec(text);
  if (dmy) return { kind: 1, num: Number(`${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`), text };
  if (NUMBER.test(text)) {
    const number = Number(text.replace(/[₹$,%\s+]/g, ""));
    if (Number.isFinite(number)) return { kind: 0, num: number, text: "" };
  }
  return { kind: 2, num: 0, text: text.toLowerCase() };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareKeys(a: SortKey, b: SortKey) {
  if (a.kind === 3 || b.kind === 3) return a.kind === b.kind ? 0 : a.kind === 3 ? 1 : -1;
  if (a.kind !== b.kind) return a.kind - b.kind;
  if (a.kind === 2) return collator.compare(a.text, b.text);
  return a.num - b.num;
}

/** Sorts a copy of rows by one value; empty values stay last in both directions. */
export function sortRows<T>(rows: T[], getValue: (row: T) => unknown, direction: SortDirection) {
  const keyed = rows.map((row, index) => ({ row, index, key: toSortKey(getValue(row)) }));
  keyed.sort((a, b) => {
    if (a.key.kind === 3 || b.key.kind === 3) {
      const empty = compareKeys(a.key, b.key);
      return empty !== 0 ? empty : a.index - b.index;
    }
    const result = compareKeys(a.key, b.key);
    return (direction === "asc" ? result : -result) || a.index - b.index;
  });
  return keyed.map((entry) => entry.row);
}

/**
 * Column sorting for a table. `getValue(row, key)` returns the value a column
 * shows (the displayed name, not an ID). Returns the sorted rows, the current
 * sort and `toggle(key)` for the header buttons.
 */
export function useTableSort<T>(rows: T[], getValue: (row: T, key: string) => unknown, deps: unknown[] = []) {
  const [sort, setSort] = useState<SortState>(null);
  const toggle = useCallback((key: string) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }, []);
  const sorted = useMemo(
    () => (sort ? sortRows(rows, (row) => getValue(row, sort.key), sort.direction) : rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort, ...deps],
  );
  return { sorted, sort, toggle, setSort };
}

/**
 * Header label with sort arrows; put it inside the existing <th>. The whole
 * label is the button, so a click anywhere on it sorts.
 */
export function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
}: {
  label: ReactNode;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  align?: "left" | "center" | "right";
}) {
  const active = sort?.key === sortKey ? sort.direction : null;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`app-sort-header inline-flex w-full items-center gap-1 ${justify} uppercase text-inherit`}
      title={active === "asc" ? "Sorted ascending — click for descending" : active === "desc" ? "Sorted descending — click to clear" : "Click to sort"}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
    >
      <span>{label}</span>
      {active === "asc" ? (
        <ChevronUp size={13} strokeWidth={3} className="shrink-0" aria-hidden="true" />
      ) : active === "desc" ? (
        <ChevronDown size={13} strokeWidth={3} className="shrink-0" aria-hidden="true" />
      ) : (
        <ChevronsUpDown size={12} className="shrink-0 opacity-60" aria-hidden="true" />
      )}
    </button>
  );
}
