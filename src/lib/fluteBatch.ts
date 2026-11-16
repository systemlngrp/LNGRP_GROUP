import { FluteMaster } from "../types";

// Mapping used when the Flute Master has no rows yet (same values the
// Production Form used before the master existed).
export const DEFAULT_FLUTE_BATCHES: Record<string, string> = {
  A: "1",
  B: "2",
  "B+C": "3",
  C: "4",
  E: "5",
};

export function normalizeFlute(value: unknown) {
  return String(value ?? "").toUpperCase().trim().replace(/\s+/g, "");
}

export function buildFluteBatchMap(masters: FluteMaster[] | null | undefined): Record<string, string> {
  const rows = (masters || []).filter((row) => normalizeFlute(row.flute) && String(row.batchNo ?? "").trim() !== "");
  if (rows.length === 0) return { ...DEFAULT_FLUTE_BATCHES };
  const map: Record<string, string> = {};
  rows.forEach((row) => {
    map[normalizeFlute(row.flute)] = String(row.batchNo).trim();
  });
  return map;
}

// Batch for a job: from the Flute Master by the job's flute; falls back to the
// value saved on the job when its flute is not in the master.
export function resolveFluteBatch(flute: unknown, map: Record<string, string>, stored?: unknown) {
  const fromMaster = map[normalizeFlute(flute)];
  if (fromMaster) return fromMaster;
  return String(stored ?? "").trim();
}
