import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQcScoreForDate, renderQcScoreWhatsappTemplate, validQcScoreDate } from "./qcScoreWhatsapp";
import { buildQcScoreRows, DEFAULT_QC_SCORE_MESSAGE, resolveQcScoreTemplate } from "../src/lib/qcScore";
import { sendWhatsappTextMessage } from "./whatsappSender";

test("server QC Score matches the visible report and resolves every placeholder", () => {
  const processing = [
    { productionId: "job-1", jobNo: "10612", machineName: "Corrugation Linear", qty: 100, date: "2026-07-21" },
    { productionId: "job-1", jobNo: "10612", machineName: "Corrugation Liner", qty: 50, date: "2026-07-21" },
    { productionId: "job-2", jobNo: "10613", machineName: "Printing", qty: 200, date: "2026-07-21" },
  ];
  const boardline = [{ timestamp: "2026-07-20T18:30:00.000Z", qcPerson: "Asha" }];
  const printing = [{ timestamp: "2026-07-21T10:00:00.000Z", qcPerson: "Sahil" }];
  const serverRow = buildQcScoreForDate("2026-07-21", processing, boardline, printing);
  const [clientRow] = buildQcScoreRows({ fromDate: "2026-07-21", toDate: "2026-07-21", processing, boardlineChecks: boardline, printingChecks: printing });
  for (const key of ["boardlineChecksRequired", "boardlineChecksPerformed", "boardlineScore", "printingChecksRequired", "printingChecksPerformed", "printingScore", "totalChecksRequired", "totalChecksPerformed", "totalScore"] as const) {
    assert.equal(serverRow[key], clientRow[key], key);
  }
  const message = renderQcScoreWhatsappTemplate(DEFAULT_QC_SCORE_MESSAGE, serverRow);
  assert.equal(message, resolveQcScoreTemplate(DEFAULT_QC_SCORE_MESSAGE, clientRow));
  assert.match(message, /\*Date\* - 21\/07\/2026/);
  assert.doesNotMatch(message, /\{\{/);
});

test("zero required checks show N/A and custom text stays intact", () => {
  const row = buildQcScoreForDate("2026-07-21", [], [], []);
  assert.equal(renderQcScoreWhatsappTemplate("Score {{totalScore}} on {{date}}", row), "Score N/A on 21/07/2026");
  assert.equal(validQcScoreDate("2026-07-21"), true);
  assert.equal(validQcScoreDate("2026-02-30"), false);
});

test("group delivery uses the configured credentials without returning them", async () => {
  let request: RequestInit | undefined;
  const config = { loginId: "login", pass: "secret", groupId: "group@g.us", message: "Report {{date}}" };
  const message = renderQcScoreWhatsappTemplate(config.message, buildQcScoreForDate("2026-07-21", [], [], []));
  const result = await sendWhatsappTextMessage(config, message, { fetchImpl: async (_url, init) => { request = init; return new Response("{}", { status: 200 }); } });
  assert.equal(result.status, "Sent");
  assert.deepEqual(JSON.parse(String(request?.body)), { recipientIds: ["group@g.us"], message: ["Report 21/07/2026"] });
  assert.equal((request?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("login:secret").toString("base64")}`);
  assert.doesNotMatch(JSON.stringify(result), /login|secret|Basic/);
});
