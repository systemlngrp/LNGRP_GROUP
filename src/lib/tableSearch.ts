// Table search used across the app: a row matches when every word typed is
// found somewhere in the columns that table shows (its header columns), as the
// cells display them. Hidden fields are not searched.
//
// Pages pass, per row, the values of their visible columns (names rather than
// stored IDs, e.g. the party name, the firm short code). Dates match in both
// 09-11-2026 and 2026-11-09 form, numbers with or without thousands commas
// and trailing .00.

import { useMemo } from "react";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_DATE = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;
const NUMBER = /^-?[\d,]*\.?\d+$/;

/** Typed numbers match with or without thousands commas and trailing zeros. */
function normalizeNumberWord(word: string) {
  if (!NUMBER.test(word)) return word;
  let text = word.replace(/,/g, "");
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

/** Words of the search box, lower-cased. Empty when nothing is typed. */
export function searchWords(term: string | null | undefined) {
  return String(term || "").toLowerCase().split(/\s+/).map((word) => normalizeNumberWord(word.trim())).filter(Boolean);
}

// Cheap string work only (no toLocaleString): this runs for every row.
function variants(value: unknown, out: string[]) {
  if (value === null || value === undefined || value === "") return;
  if (Array.isArray(value)) {
    for (const item of value) variants(item, out);
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(String(Math.round(value * 100) / 100));
    return;
  }
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) variants(value.toISOString().slice(0, 10), out);
    return;
  }
  if (typeof value === "object") return; // only shown values are searched
  const text = String(value).trim();
  if (!text) return;
  out.push(text);
  const iso = ISO_DATE.exec(text);
  if (iso) {
    out.push(`${iso[3]}-${iso[2]}-${iso[1]}`, `${iso[3]}/${iso[2]}/${iso[1]}`);
    return;
  }
  const dmy = DMY_DATE.exec(text);
  if (dmy) {
    out.push(`${dmy[3]}-${dmy[2]}-${dmy[1]}`);
    return;
  }
  if (NUMBER.test(text)) {
    const plain = normalizeNumberWord(text);
    if (plain !== text) out.push(plain);
  }
}

/** Search text of one row from its visible column values. */
export function rowSearchText(values: unknown[]) {
  const out: string[] = [];
  values.forEach((value) => variants(value, out));
  return out.join(" \u0001 ").toLowerCase();
}

/** True when every word appears in the row's visible column values. */
export function matchesTableSearch(values: unknown[] | string, words: string[]) {
  if (!words.length) return true;
  const text = typeof values === "string" ? values : rowSearchText(values);
  return words.every((word) => text.includes(word));
}

/**
 * Filters rows by the search box. `cells` returns the row's visible column
 * values (what the table header columns show). The search text of each row is
 * built once per row list, so typing stays fast on long lists.
 */
export function useTableSearch<T>(rows: T[], term: string, cells: (row: T) => unknown[], deps: unknown[] = []) {
  const searching = searchWords(term).length > 0;
  // The index is only built while something is typed, and then once per row list.
  const index = useMemo(
    () => (searching ? rows.map((row) => ({ row, text: rowSearchText(cells(row)) })) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, searching, ...deps],
  );
  return useMemo(() => {
    const words = searchWords(term);
    if (!words.length || !index) return rows;
    return index.filter((entry) => words.every((word) => entry.text.includes(word))).map((entry) => entry.row);
  }, [index, rows, term]);
}
