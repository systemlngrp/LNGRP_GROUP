import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQcScoreRows, buildQcScoreWhatsAppMessage, buildQcScoreWhatsAppUrl, qcScoreDateKey } from "./qcScore";

const processing = (overrides: Record<string, unknown> = {}) => ({
  productionId: "job-1",
  jobNo: "JOB/1",
  machineName: "Corrugation Liner",
  qty: 100,
  date: "2026-10-10",
  ...overrides,
});

const check = (overrides: Record<string, unknown> = {}) => ({
  timestamp: "2026-10-10T10:00:00.000Z",
  qcPerson: "Asha",
  ...overrides,
});

test("builds every date and deduplicates required jobs by stage and date", () => {
  const rows = buildQcScoreRows({
    fromDate: "2026-10-10",
    toDate: "2026-10-12",
    processing: [
      processing(),
      processing({ qty: 50 }),
      processing({ productionId: "job-2", jobNo: "JOB/2", machineName: "Corrugation Linear" }),
      processing({ productionId: "job-1", machineName: "Printing" }),
      processing({ productionId: "job-1", machineName: "Printing", date: "2026-10-11" }),
      processing({ productionId: "ignored-zero", qty: 0 }),
    ],
    boardlineChecks: [],
    printingChecks: [],
  });

  assert.deepEqual(rows.map((row) => row.date), ["2026-10-10", "2026-10-11", "2026-10-12"]);
  assert.equal(rows[0].boardlineChecksRequired, 2);
  assert.equal(rows[0].printingChecksRequired, 1);
  assert.equal(rows[0].totalChecksRequired, 3);
  assert.equal(rows[1].printingChecksRequired, 1);
  assert.equal(rows[2].totalChecksRequired, 0);
  assert.equal(rows[2].totalScore, null);
});

test("counts every performed check, deduplicates people, and leaves scores uncapped", () => {
  const [row] = buildQcScoreRows({
    fromDate: "2026-10-10",
    toDate: "2026-10-10",
    processing: [processing(), processing({ productionId: "print-1", machineName: "Printing" })],
    boardlineChecks: [check(), check({ qcPerson: "Asha" }), check({ qcPerson: "Bilal" })],
    printingChecks: [],
  });

  assert.equal(row.boardlineChecksPerformed, 3);
  assert.deepEqual(row.boardlineQcPeople, ["Asha", "Bilal"]);
  assert.equal(row.boardlineScore, 300);
  assert.equal(row.printingScore, 0);
  assert.equal(row.totalScore, 150);
});

test("groups timestamps in India while preserving date-only values", () => {
  assert.equal(qcScoreDateKey("2026-10-10"), "2026-10-10");
  assert.equal(qcScoreDateKey("2026-10-10T18:29:59.000Z"), "2026-10-10");
  assert.equal(qcScoreDateKey("2026-10-10T18:30:00.000Z"), "2026-10-11");
  assert.equal(qcScoreDateKey("invalid"), "");
});

test("creates the full WhatsApp score card and encoded share URL", () => {
  const [row] = buildQcScoreRows({
    fromDate: "2026-10-10",
    toDate: "2026-10-10",
    processing: [processing()],
    boardlineChecks: [check()],
    printingChecks: [],
  });
  const message = buildQcScoreWhatsAppMessage(row);
  assert.match(message, /^\*QC ONLINE CHECKING SCORE CARD REPORT\*\n\n\*Date\* - 10\/10\/2026/);
  assert.match(message, /\*Total No\. of Boardline Checks Required\* - 1\n\*Total No\. of Boardline Checks Performed\* - 1\n\*Total Boardline QC Inspection Score\* - 100\.00%/);
  assert.match(message, /\*Total No\. of Printing Checks Required\* - 0\n\*Total No\. of Printing Checks Performed\* - 0\n\*Total Printing QC Inspection Score\* - N\/A/);
  assert.match(message, /\*Total No\. of Checks Required\* - 1\n\*Total No\. of Checks Performed\* - 1\n\*Total QC Inspection Score\* - 100\.00%$/);
  assert.doesNotMatch(message, /Asha/);
  assert.equal(buildQcScoreWhatsAppUrl(row), `https://wa.me/?text=${encodeURIComponent(message)}`);
});

test("formats the supplied Boardline score example", () => {
  const row = {
    date: "2026-07-21",
    boardlineChecksRequired: 48,
    boardlineChecksPerformed: 16,
    boardlineScore: 16 / 48 * 100,
    boardlineQcPeople: [],
    printingChecksRequired: 0,
    printingChecksPerformed: 0,
    printingScore: null,
    printingQcPeople: [],
    totalChecksRequired: 48,
    totalChecksPerformed: 16,
    totalScore: 16 / 48 * 100,
  };
  const message = buildQcScoreWhatsAppMessage(row);
  assert.match(message, /\*Date\* - 21\/07\/2026/);
  assert.match(message, /\*Total No\. of Boardline Checks Required\* - 48/);
  assert.match(message, /\*Total No\. of Boardline Checks Performed\* - 16/);
  assert.match(message, /\*Total Boardline QC Inspection Score\* - 33\.33%/);
  assert.match(message, /\*Total Printing QC Inspection Score\* - N\/A/);
});
