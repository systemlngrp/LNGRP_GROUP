import type { QcFileNoMaster } from "../types";

export type QcFileNoOption = { value: string; label: string; searchText: string };

const text = (value: unknown) => String(value ?? "").trim();

export function fileNoOptions(rows: QcFileNoMaster[], currentFileNo = ""): QcFileNoOption[] {
  const activeOptions = rows
    .filter(row => text(row.active).toLowerCase() === "yes")
    .map(row => text(row.fileNo))
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex(candidate => candidate.toLowerCase() === value.toLowerCase()) === index)
    .map(value => ({ value, label: value, searchText: value }));
  const current = text(currentFileNo);
  if (!current || activeOptions.some(option => option.value.toLowerCase() === current.toLowerCase())) return activeOptions;
  return [{ value: current, label: `${current} (Legacy)`, searchText: current }, ...activeOptions];
}
