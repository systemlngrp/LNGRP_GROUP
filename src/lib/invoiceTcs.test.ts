import assert from "node:assert/strict";
import test from "node:test";
import { companyTcsRate, computeTcsAmount, normalizeTcsRate } from "./invoiceTcs";
import { getInvoiceGrandTotal } from "./gatePasses";

test("TCS is rate % of the taxable value, as in Tally", () => {
  assert.equal(computeTcsAmount(51300, 2), 1026);
  assert.equal(computeTcsAmount(67620, 2), 1352.4);
  assert.equal(computeTcsAmount(46500, ""), 0);
  assert.equal(normalizeTcsRate("-1"), 0);
});

test("company default applies only when TCS is switched on", () => {
  assert.equal(companyTcsRate({ tcsApplicable: "Yes", tcsRate: 2 }), 2);
  assert.equal(companyTcsRate({ tcsApplicable: "No", tcsRate: 2 }), "");
  assert.equal(companyTcsRate(null), "");
});

test("grand total includes TCS (Tally LNCB1/26-27/0423 = 54,891; 0411 = 72,353)", () => {
  const base = { cgst: 0, sgst: 0, igst: 0, gstRate: 0, roundOff: 0 } as any;
  assert.equal(getInvoiceGrandTotal({ ...base, totalBeforeGst: 51300, totalAfterGst: 53865, tcsAmount: 1026 }), 54891);
  assert.equal(Math.round(getInvoiceGrandTotal({ ...base, totalBeforeGst: 67620, totalAfterGst: 71001, tcsAmount: 1352.4, roundOff: -0.4 }) * 100) / 100, 72353);
});
