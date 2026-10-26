export const QC_SCORE_MENU = "/quality/qc-score";

type Processing = { productionId?: unknown; jobNo?: unknown; machineName?: unknown; qty?: unknown; date?: unknown };
type Check = { timestamp?: unknown };

export type QcScoreWhatsAppRow = {
  date: string;
  boardlineChecksRequired: number;
  boardlineChecksPerformed: number;
  boardlineScore: number | null;
  printingChecksRequired: number;
  printingChecksPerformed: number;
  printingScore: number | null;
  totalChecksRequired: number;
  totalChecksPerformed: number;
  totalScore: number | null;
};

const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function validQcScoreDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateKey(value: unknown) {
  const raw = String(value ?? "").trim();
  if (validQcScoreDate(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = Object.fromEntries(formatter.formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function score(performed: number, required: number) {
  return required > 0 ? Number(((performed / required) * 100).toFixed(2)) : null;
}

export function buildQcScoreForDate(date: string, processing: readonly Processing[], boardlineChecks: readonly Check[], printingChecks: readonly Check[]): QcScoreWhatsAppRow {
  const boardlineJobs = new Set<string>();
  const printingJobs = new Set<string>();
  for (const entry of processing) {
    if (dateKey(entry.date) !== date || !(Number(entry.qty) > 0)) continue;
    const job = String(entry.productionId || entry.jobNo || "").trim().toLowerCase();
    if (!job) continue;
    const machine = String(entry.machineName || "").trim().toLowerCase();
    if (machine === "corrugation liner" || machine === "corrugation linear") boardlineJobs.add(job);
    if (machine === "printing") printingJobs.add(job);
  }
  const boardlineChecksPerformed = boardlineChecks.filter((check) => dateKey(check.timestamp) === date).length;
  const printingChecksPerformed = printingChecks.filter((check) => dateKey(check.timestamp) === date).length;
  const boardlineChecksRequired = boardlineJobs.size;
  const printingChecksRequired = printingJobs.size;
  const totalChecksRequired = boardlineChecksRequired + printingChecksRequired;
  const totalChecksPerformed = boardlineChecksPerformed + printingChecksPerformed;
  return {
    date,
    boardlineChecksRequired,
    boardlineChecksPerformed,
    boardlineScore: score(boardlineChecksPerformed, boardlineChecksRequired),
    printingChecksRequired,
    printingChecksPerformed,
    printingScore: score(printingChecksPerformed, printingChecksRequired),
    totalChecksRequired,
    totalChecksPerformed,
    totalScore: score(totalChecksPerformed, totalChecksRequired),
  };
}

export function renderQcScoreWhatsappTemplate(template: string, row: QcScoreWhatsAppRow) {
  const [year, month, day] = row.date.split("-");
  const percent = (value: number | null) => value == null ? "N/A" : `${value.toFixed(2)}%`;
  const values: Record<string, string> = {
    date: `${day}/${month}/${year}`,
    boardlineChecksRequired: String(row.boardlineChecksRequired),
    boardlineChecksPerformed: String(row.boardlineChecksPerformed),
    boardlineScore: percent(row.boardlineScore),
    printingChecksRequired: String(row.printingChecksRequired),
    printingChecksPerformed: String(row.printingChecksPerformed),
    printingScore: percent(row.printingScore),
    totalChecksRequired: String(row.totalChecksRequired),
    totalChecksPerformed: String(row.totalChecksPerformed),
    totalScore: percent(row.totalScore),
  };
  return template.replace(/\{\{\s*(date|boardlineChecksRequired|boardlineChecksPerformed|boardlineScore|printingChecksRequired|printingChecksPerformed|printingScore|totalChecksRequired|totalChecksPerformed|totalScore)\s*\}\}/g, (_, key: string) => values[key]);
}
