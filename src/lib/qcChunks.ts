export type QcChunkStatus = "Draft" | "Complete";

export type QcChunkRecord = {
  id: string;
  jobNo?: string | number;
  checkNo?: string | number;
  groupKey?: string;
  chunkNo?: number;
  chunkStatus?: QcChunkStatus | string;
  filledFields?: string[];
  qcPerson?: string;
  timestamp?: string;
  updateTimestamp?: string;
  updatedBy?: string;
};

export function normalizeQcPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function createQcGroupKey(formType: string, jobNo: unknown, checkNo: unknown) {
  return [formType, normalizeQcPart(jobNo), normalizeQcPart(checkNo)].join("|");
}

export function getQcGroupKey(record: QcChunkRecord, formType: string) {
  if (String(record.groupKey || "").trim()) return String(record.groupKey);
  const jobNo = normalizeQcPart(record.jobNo);
  const checkNo = normalizeQcPart(record.checkNo);
  if (!jobNo || !checkNo) return `${formType}|legacy|${record.id}`;
  return createQcGroupKey(formType, jobNo, checkNo);
}

export function getChunkTimestamp(record: QcChunkRecord) {
  return new Date(record.updateTimestamp || record.timestamp || "").getTime() || 0;
}

export function getChunkFilledFields<T extends Record<string, unknown>>(record: T, keys: string[]) {
  return keys.filter((key) => {
    const value = record[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

export function nextQcChunkNo<T extends QcChunkRecord>(records: T[], groupKey: string) {
  return records.reduce((max, record) => {
    if (String(record.groupKey || "") !== groupKey) return max;
    return Math.max(max, Number(record.chunkNo) || 0);
  }, 0) + 1;
}

