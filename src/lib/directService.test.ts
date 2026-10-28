import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateNetSupplierPayable, recalculateMaterialLine, summarizeMaterialInLines, validateTdsAmount } from "./materialInTaxes.js";

describe("Direct Service MRR calculations", () => {
  it("retains the selected GST rate for reference without calculating tax", () => {
    const line = recalculateMaterialLine({
      id: "service-line",
      itemId: "service-1",
      serviceId: "service-1",
      serviceName: "Consulting",
      lineType: "Service",
      qty: 1,
      invoiceQty: 1,
      actualQty: 1,
      uom: "NOS",
      rate: 1250,
      invoiceRate: 1250,
      value: 1250,
      gstRate: 18,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
    });

    assert.equal(line.invoiceQty, 1);
    assert.equal(line.actualQty, 1);
    assert.equal(line.gstRate, 18);
    assert.equal(line.cgstRate, 0);
    assert.equal(line.sgstRate, 0);
    assert.equal(line.igstRate, 0);
    assert.equal(line.gstAmount, 0);
    assert.equal(line.totalAmount, 1250);
  });

  it("keeps the Direct Service gross total unchanged when a GST reference rate is selected", () => {
    const summary = summarizeMaterialInLines([{
      id: "service-line",
      itemId: "service-1",
      serviceId: "service-1",
      serviceName: "Consulting",
      lineType: "Service",
      qty: 1,
      invoiceQty: 1,
      actualQty: 1,
      uom: "NOS",
      rate: 1250,
      invoiceRate: 1250,
      value: 1250,
      gstRate: 18,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
    }]);

    assert.equal(summary.totalInvoiceValue, 1250);
    assert.equal(summary.totalAmount, 1250);
  });

  it("keeps gross total unchanged and calculates net payable after fixed TDS", () => {
    assert.equal(calculateNetSupplierPayable(5000, 450), 4550);
    assert.equal(validateTdsAmount(450, 5000), null);
    assert.equal(validateTdsAmount(-1, 5000), "TDS cannot be negative.");
    assert.equal(validateTdsAmount(5001, 5000), "TDS cannot be greater than the gross Total Amount.");
  });
});
