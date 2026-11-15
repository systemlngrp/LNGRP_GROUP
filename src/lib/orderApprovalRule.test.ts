import assert from "node:assert/strict";
import test from "node:test";
import { autoApprovalReasons, chartRateForDate } from "./orderApprovalRule";

const chart = [
  { dateFrom: "2026-10-01", dateTo: "2026-10-31", realizationRate: 48 },
  { dateFrom: "2026-11-01", dateTo: "2026-11-30", realizationRate: 50 },
  { dateFrom: "2026-11-10", dateTo: "2026-11-20", realizationRate: 52 },
];

test("chart rate: latest period containing the date wins", () => {
  assert.equal(chartRateForDate(chart, "2026-10-15"), 48);
  assert.equal(chartRateForDate(chart, "2026-11-05"), 50);
  assert.equal(chartRateForDate(chart, "2026-11-15"), 52);
  assert.equal(chartRateForDate(chart, "2026-12-01"), undefined);
  assert.equal(chartRateForDate(chart, ""), undefined);
});

test("passes when rate = last billed and RAPC >= chart", () => {
  assert.deepEqual(autoApprovalReasons({ rate: 10.47, billing1: 10.47, chartRate: 50, rapc1: 50 }), []);
});

test("lists every reason it fails", () => {
  assert.deepEqual(autoApprovalReasons({ rate: 10.5, billing1: 10.47, chartRate: 50, rapc1: 45.2 }), ["Rate 10.50 ≠ last billed 10.47", "RAPC 45.20 < chart 50.00"]);
  assert.deepEqual(autoApprovalReasons({ rate: 10 }), ["No billing history", "No realization chart for order date", "No RAPC history"]);
});

import { chartPeriodError } from "./orderApprovalRule";
test("chart period checks dates, rate and overlap", () => {
  const rows = [{ id: "a", dateFrom: "2026-04-01", dateTo: "2026-08-31", realizationRate: 44 }];
  assert.equal(chartPeriodError({ id: "b", dateFrom: "2026-09-01", dateTo: "2027-03-31", realizationRate: 48 }, rows), "");
  assert.match(chartPeriodError({ id: "b", dateFrom: "2026-08-01", dateTo: "2027-03-31", realizationRate: 48 }, rows), /Overlaps/);
  assert.equal(chartPeriodError({ id: "a", dateFrom: "2026-04-01", dateTo: "2026-08-31", realizationRate: 45 }, rows), "");
  assert.match(chartPeriodError({ dateFrom: "2026-09-02", dateTo: "2026-09-01", realizationRate: 48 }, rows), /on or before/);
  assert.match(chartPeriodError({ dateFrom: "2026-09-01", dateTo: "2026-09-30", realizationRate: 0 }, rows), /Rate/);
});
