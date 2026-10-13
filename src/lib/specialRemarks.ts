import type { SpecialRemarkRecord } from "../types";

export type SpecialRemarkGroup = {
  key: string;
  recordIds: string[];
  records: SpecialRemarkRecord[];
  erpCode: string;
  itemName: string;
  specialRemarks: string;
  updatedBy: string;
  updateDate: string;
  searchText: string;
};

const text = (value: unknown) => String(value ?? "").trim();

function timestamp(record: SpecialRemarkRecord) {
  const raw = text(record.updateTimestamp || record.updateDate);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function groupSpecialRemarks(records: SpecialRemarkRecord[]): SpecialRemarkGroup[] {
  const grouped = new Map<string, Array<{ record: SpecialRemarkRecord; index: number }>>();

  records.forEach((record, index) => {
    const erpCode = text(record.erpCode);
    const key = erpCode.toLowerCase() || `record:${record.id}`;
    const current = grouped.get(key) || [];
    current.push({ record, index });
    grouped.set(key, current);
  });

  return [...grouped.entries()].map(([key, entries]) => {
    const sortedEntries = [...entries].sort((a, b) => timestamp(a.record) - timestamp(b.record) || a.index - b.index);
    const sortedRecords = sortedEntries.map(({ record }) => record);
    const latest = sortedRecords[sortedRecords.length - 1];
    const searchableValues = sortedRecords.flatMap((record) => [
      text(record.erpCode),
      text(record.itemName),
      text(record.specialRemarks),
      text(record.updatedBy),
      text(record.updateDate),
    ]);

    return {
      key,
      recordIds: sortedRecords.map((record) => record.id),
      records: sortedRecords,
      erpCode: text(latest?.erpCode),
      itemName: text(latest?.itemName),
      specialRemarks: sortedRecords.map((record) => text(record.specialRemarks)).filter(Boolean).join("\n"),
      updatedBy: text(latest?.updatedBy),
      updateDate: text(latest?.updateDate),
      searchText: searchableValues.join(" ").toLowerCase(),
    };
  });
}
