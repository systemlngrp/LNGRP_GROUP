import type { BoardLineQcCheck, PrintingQcCheck, ProductionProcessing } from "../types";
import { normalizeMachineName } from "./productionMachineNames";

const INDIA_TIME_ZONE = "Asia/Kolkata";

type ProcessingInput = Pick<ProductionProcessing, "productionId" | "jobNo" | "machineName" | "qty" | "date">;
type QcCheckInput = Pick<BoardLineQcCheck | PrintingQcCheck, "timestamp" | "qcPerson">;

export interface QcScoreRow {
  date: string;
  totalChecksRequired: number;
  boardlineChecksRequired: number;
  boardlineChecksPerformed: number;
  boardlineQcPeople: string[];
  boardlineScore: number | null;
  printingChecksRequired: number;
  printingChecksPerformed: number;
  printingQcPeople: string[];
  printingScore: number | null;
  totalChecksPerformed: number;
  totalScore: number | null;
}

export interface BuildQcScoreRowsInput {
  fromDate: string;
  toDate: string;
  processing: readonly ProcessingInput[];
  boardlineChecks: readonly QcCheckInput[];
  printingChecks: readonly QcCheckInput[];
}

const indiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: INDIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function validDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function qcScoreDateKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (validDateOnly(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = indiaDateFormatter.formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function inclusiveDateKeys(fromDate: string, toDate: string) {
  if (!validDateOnly(fromDate) || !validDateOnly(toDate) || fromDate > toDate) return [];
  const keys: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function score(performed: number, required: number) {
  return required > 0 ? Number(((performed / required) * 100).toFixed(2)) : null;
}

function jobKey(row: ProcessingInput) {
  const value = String(row.productionId || row.jobNo || "").trim().toLowerCase();
  return value;
}

function emptyRow(date: string): QcScoreRow {
  return {
    date,
    totalChecksRequired: 0,
    boardlineChecksRequired: 0,
    boardlineChecksPerformed: 0,
    boardlineQcPeople: [],
    boardlineScore: null,
    printingChecksRequired: 0,
    printingChecksPerformed: 0,
    printingQcPeople: [],
    printingScore: null,
    totalChecksPerformed: 0,
    totalScore: null,
  };
}

export function buildQcScoreRows(input: BuildQcScoreRowsInput): QcScoreRow[] {
  const rows = new Map(inclusiveDateKeys(input.fromDate, input.toDate).map((date) => [date, emptyRow(date)]));
  const required = new Map<string, { boardline: Set<string>; printing: Set<string> }>();
  const people = new Map<string, { boardline: Set<string>; printing: Set<string> }>();

  for (const row of input.processing) {
    if (!(Number(row.qty) > 0)) continue;
    const date = qcScoreDateKey(row.date);
    if (!rows.has(date)) continue;
    const job = jobKey(row);
    if (!job) continue;
    const machine = normalizeMachineName(row.machineName).trim().toLowerCase();
    if (machine !== "corrugation liner" && machine !== "printing") continue;
    const daily = required.get(date) || { boardline: new Set<string>(), printing: new Set<string>() };
    (machine === "corrugation liner" ? daily.boardline : daily.printing).add(job);
    required.set(date, daily);
  }

  const addChecks = (checks: readonly QcCheckInput[], stage: "boardline" | "printing") => {
    for (const check of checks) {
      const date = qcScoreDateKey(check.timestamp);
      const row = rows.get(date);
      if (!row) continue;
      if (stage === "boardline") row.boardlineChecksPerformed += 1;
      else row.printingChecksPerformed += 1;
      const name = String(check.qcPerson || "").trim();
      if (!name) continue;
      const daily = people.get(date) || { boardline: new Set<string>(), printing: new Set<string>() };
      daily[stage].add(name);
      people.set(date, daily);
    }
  };

  addChecks(input.boardlineChecks, "boardline");
  addChecks(input.printingChecks, "printing");

  for (const [date, row] of rows) {
    const dailyRequired = required.get(date);
    const dailyPeople = people.get(date);
    row.boardlineChecksRequired = dailyRequired?.boardline.size || 0;
    row.printingChecksRequired = dailyRequired?.printing.size || 0;
    row.totalChecksRequired = row.boardlineChecksRequired + row.printingChecksRequired;
    row.totalChecksPerformed = row.boardlineChecksPerformed + row.printingChecksPerformed;
    row.boardlineQcPeople = [...(dailyPeople?.boardline || [])].sort((a, b) => a.localeCompare(b));
    row.printingQcPeople = [...(dailyPeople?.printing || [])].sort((a, b) => a.localeCompare(b));
    row.boardlineScore = score(row.boardlineChecksPerformed, row.boardlineChecksRequired);
    row.printingScore = score(row.printingChecksPerformed, row.printingChecksRequired);
    row.totalScore = score(row.totalChecksPerformed, row.totalChecksRequired);
  }

  return [...rows.values()];
}

export function formatQcScorePercent(value: number | null) {
  return value == null ? "" : `${value.toFixed(2)}%`;
}

function displayDate(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

function messageScore(value: number | null) {
  return value == null ? "N/A" : `${value.toFixed(2)}%`;
}

export const QC_SCORE_MENU = "/quality/qc-score";
export const DEFAULT_QC_SCORE_MESSAGE = `*QC ONLINE CHECKING SCORE CARD REPORT*

*Date* - {{date}}

*Boardline QC*
*Total No. of Boardline Checks Required* - {{boardlineChecksRequired}}
*Total No. of Boardline Checks Performed* - {{boardlineChecksPerformed}}
*Total Boardline QC Inspection Score* - {{boardlineScore}}

*Printing QC*
*Total No. of Printing Checks Required* - {{printingChecksRequired}}
*Total No. of Printing Checks Performed* - {{printingChecksPerformed}}
*Total Printing QC Inspection Score* - {{printingScore}}

*Overall QC*
*Total No. of Checks Required* - {{totalChecksRequired}}
*Total No. of Checks Performed* - {{totalChecksPerformed}}
*Total QC Inspection Score* - {{totalScore}}`;

export function resolveQcScoreTemplate(template: string, row: QcScoreRow) {
  const values: Record<string, string> = {
    date: displayDate(row.date),
    boardlineChecksRequired: String(row.boardlineChecksRequired),
    boardlineChecksPerformed: String(row.boardlineChecksPerformed),
    boardlineScore: messageScore(row.boardlineScore),
    printingChecksRequired: String(row.printingChecksRequired),
    printingChecksPerformed: String(row.printingChecksPerformed),
    printingScore: messageScore(row.printingScore),
    totalChecksRequired: String(row.totalChecksRequired),
    totalChecksPerformed: String(row.totalChecksPerformed),
    totalScore: messageScore(row.totalScore),
  };
  return template.replace(/\{\{\s*(date|boardlineChecksRequired|boardlineChecksPerformed|boardlineScore|printingChecksRequired|printingChecksPerformed|printingScore|totalChecksRequired|totalChecksPerformed|totalScore)\s*\}\}/g, (_, key: string) => values[key]);
}

export function buildQcScoreWhatsAppMessage(row: QcScoreRow) {
  return resolveQcScoreTemplate(DEFAULT_QC_SCORE_MESSAGE, row);
}

export function buildQcScoreWhatsAppUrl(row: QcScoreRow) {
  return `https://wa.me/?text=${encodeURIComponent(buildQcScoreWhatsAppMessage(row))}`;
}
