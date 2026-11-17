import { test } from "node:test";
import assert from "node:assert/strict";
import { findInvoiceSupplier, normalizeSupplierName } from "./partyMatch";

const suppliers = [{ id: "s1", name: "SHREE PAWAN KRAFT" }, { id: "s2", name: "ASHOKA KRAFT INDUSTRY L.L.P" }];
const companies = [{ id: "c1", name: "SHREE PAWAN KRAFT PAPER MILLS LLP" }, { id: "c2", name: "M/S PAWAN INDUSTRIES" }];

test("invoice name finds the Supplier Master entry before a company", () => {
  assert.equal(findInvoiceSupplier("SHREE PAWAN KRAFT PAPER MILLS LLP", suppliers, companies)?.id, "s1");
  assert.equal(findInvoiceSupplier("Shri Pawan Kraft Paper Mills L.L.P.", suppliers, companies)?.id, "s1");
  assert.equal(findInvoiceSupplier("SHREE PAWAN KRAFT", suppliers, companies)?.id, "s1");
  assert.equal(findInvoiceSupplier("Ashoka Kraft Industry LLP", suppliers, companies)?.id, "s2");
});

test("falls back to companies, and blank / unknown give nothing", () => {
  assert.equal(findInvoiceSupplier("Pawan Industries", suppliers, companies)?.id, "c2");
  assert.equal(findInvoiceSupplier("", suppliers, companies), null);
  assert.equal(findInvoiceSupplier("Unknown Paper Co", suppliers, companies), null);
  assert.equal(normalizeSupplierName("M/S Shri Ram & Co. Pvt. Ltd."), "shree ram and");
});
