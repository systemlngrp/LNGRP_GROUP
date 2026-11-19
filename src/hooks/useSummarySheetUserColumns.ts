import { useEffect, useState } from "react";

/** Admin-chosen Summary Sheet ("Dashboard") columns, from GET /api/summary-sheet-user-columns. */
export type SummarySheetUserColumnsState = {
  loaded: boolean;
  admin: boolean;
  /** This user's columns (non-Admin); null = Dashboard not set up. */
  columns: string[] | null;
  /** Admin only: every user's setup. */
  users: Record<string, string[]>;
};

export const SUMMARY_SHEET_COLUMNS_CHANGED = "summary-sheet-user-columns-changed";
const EMPTY: SummarySheetUserColumnsState = { loaded: false, admin: false, columns: null, users: {} };
let cache: SummarySheetUserColumnsState | null = null;
let cacheToken = "";
let inflight: Promise<SummarySheetUserColumnsState> | null = null;

function load(force = false) {
  const token = localStorage.getItem("authToken") || "";
  // Another login on this browser: forget the previous user's setup.
  if (token !== cacheToken) { cache = null; inflight = null; cacheToken = token; }
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = fetch("/api/summary-sheet-user-columns", { headers: { Authorization: `Bearer ${token}` } })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      cache = {
        loaded: true,
        admin: Boolean(payload?.admin),
        columns: Array.isArray(payload?.columns) && payload.columns.length ? payload.columns : null,
        users: payload?.users && typeof payload.users === "object" ? payload.users : {},
      };
      return cache;
    })
    .catch(() => ({ ...EMPTY, loaded: true }))
    .finally(() => { inflight = null; });
  return inflight;
}

/** Call after Admin saves, so the menu and page pick up the new setup. */
export function refreshSummarySheetUserColumns() {
  return load(true).then((state) => {
    window.dispatchEvent(new Event(SUMMARY_SHEET_COLUMNS_CHANGED));
    return state;
  });
}

export function useSummarySheetUserColumns(enabled = true) {
  const [state, setState] = useState<SummarySheetUserColumnsState>(cache || EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const apply = () => load().then((next) => { if (alive) setState(next); });
    apply();
    const onChange = () => { if (alive && cache) setState(cache); };
    window.addEventListener(SUMMARY_SHEET_COLUMNS_CHANGED, onChange);
    return () => { alive = false; window.removeEventListener(SUMMARY_SHEET_COLUMNS_CHANGED, onChange); };
  }, [enabled]);
  return state;
}
