import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrintingShiftSummary, DEFAULT_PRINTING_SHIFT_MESSAGE, PREVIOUS_PRINTING_SHIFT_MESSAGE, duePrintingShifts, renderPrintingShiftMessage, shiftDueAt } from "./printingShiftReport";
import { sendWhatsappTextMessage } from "./whatsappSender";

test("formats the supplied 24 October Printing report and hourly rate", () => {
  const quantities = [2300, 728, 4500, 4000, 2941, 6410, 3850, 7520, 3100, 2540, 520];
  const rows = quantities.map((qty, index) => ({ jobNo: [10562, 10568, 10595, 10596, 10599, 10602, 10612, 10613, 10615, 10616, 10617][index], itemName: `Item ${index + 1}`, qty }));
  const summary = buildPrintingShiftSummary(rows);
  assert.equal(summary.totalQty, 38409);
  assert.equal(summary.boxesPerHour, 3200.75);
  const message = renderPrintingShiftMessage(PREVIOUS_PRINTING_SHIFT_MESSAGE, "2026-10-24", "Day", rows);
  assert.match(message, /^\*Printing Report \(7 AM - 7 PM\) 24\/10\/2026\*/);
  assert.match(message, /11\. 10617 \| Item 11 \| 520/);
  assert.match(message, /\*Total Qty in Shift:\* 38409/);
  assert.match(message, /\*Boxes Per Hour:\* 3200\.75/);
});

test("combines duplicate jobs and sorts by job number", () => {
  const message = renderPrintingShiftMessage(PREVIOUS_PRINTING_SHIFT_MESSAGE, "2026-10-24", "Night", [
    { jobNo: "10612", itemName: "Box", qty: 50 },
    { jobNo: "10562", itemName: "Carton", qty: 10 },
    { jobNo: "10612", itemName: "Box", qty: 25 },
  ]);
  assert.match(message, /^\*Printing Report \(7 PM - 7 AM\) 24\/10\/2026\*/);
  assert.match(message, /1\. 10562 \| Carton \| 10\n2\. 10612 \| Box \| 75/);
  assert.match(message, /\*Total Qty in Shift:\* 85/);
});

test("sends zero output and uses India shift deadlines", () => {
  const empty = renderPrintingShiftMessage(DEFAULT_PRINTING_SHIFT_MESSAGE, "2026-10-24", "Day", []);
  assert.match(empty, /No printing output recorded\./);
  assert.match(empty, /\*Total Qty in Shift:\* 0/);
  assert.match(empty, /\*Boxes Per Hour:\* 0\.00/);
  assert.equal(shiftDueAt("2026-10-24", "Day").toISOString(), "2026-10-24T14:00:00.000Z");
  assert.equal(shiftDueAt("2026-10-24", "Night").toISOString(), "2026-10-25T02:00:00.000Z");
  assert.deepEqual(duePrintingShifts(new Date("2026-10-24T13:00:00Z"), new Date("2026-10-24T14:01:00Z")), [{ shiftDate: "2026-10-24", shift: "Day" }]);
  assert.deepEqual(duePrintingShifts(new Date("2026-10-24T14:01:00Z"), new Date("2026-10-25T02:01:00Z")), [{ shiftDate: "2026-10-24", shift: "Night" }]);
});

test("sends the shift report to the configured group without exposing credentials", async () => {
  let request: RequestInit | undefined;
  const result = await sendWhatsappTextMessage(
    { loginId: "shift-user", pass: "private-pass", groupId: "group@g.us", message: "" },
    "Printing report",
    { fetchImpl: async (_url, init) => { request = init; return new Response("{}", { status: 200 }); } },
  );
  assert.equal(result.status, "Sent");
  assert.deepEqual(JSON.parse(String(request?.body)), { recipientIds: ["group@g.us"], message: ["Printing report"] });
  assert.equal((request?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("shift-user:private-pass").toString("base64")}`);
  assert.doesNotMatch(JSON.stringify(result), /private-pass|shift-user|Basic/);
});

test("machine-wise template groups jobs by printer with totals", () => {
  const message = renderPrintingShiftMessage(DEFAULT_PRINTING_SHIFT_MESSAGE, "2026-11-20", "Day", [
    { jobNo: "101", itemName: "Box", qty: 1200, printingMachine: "Big Printer" },
    { jobNo: "100", itemName: "Carton", qty: 2400, printingMachine: "Bobst Printer" },
    { jobNo: "102", itemName: "Tray", qty: 600, printingMachine: "Bobst Printer" },
    { jobNo: "99", itemName: "Old", qty: 100 },
  ]);
  assert.match(message, /\*🖨️ Bobst Printer\* — 3000 \(250\.00\/hr\)\n1\. 100 \| Carton \| 2400\n2\. 102 \| Tray \| 600/);
  assert.match(message, /\*🖨️ Big Printer\* — 1200 \(100\.00\/hr\)/);
  assert.match(message, /\*🖨️ Printer not selected\* — 100/);
  assert.match(message, /\*Bobst Printer:\* 3000\n\*Big Printer:\* 1200\n\*Small Printer:\* 0/);
  assert.match(message, /\*Total Qty in Shift:\* 4300/);
});

test("only today's shift reports are sent, never an older date", () => {
  // Activated two days ago; now 25 Oct 08:00 India (02:30Z): only the 24 Oct night shift (due 07:30 today) is due.
  assert.deepEqual(duePrintingShifts(new Date("2026-10-23T00:00:00Z"), new Date("2026-10-25T02:30:00Z")), [{ shiftDate: "2026-10-24", shift: "Night" }]);
  // Same shift 4 hours after it fell due: no longer sent.
  assert.deepEqual(duePrintingShifts(new Date("2026-10-23T00:00:00Z"), new Date("2026-10-25T06:30:00Z")), []);
});
