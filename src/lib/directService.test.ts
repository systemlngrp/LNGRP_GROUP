import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySupplyTypeTaxRates, calculateNetSupplierPayable, recalculateMaterialLine, summarizeMaterialInLines, validateTdsAmount } from "./materialInTaxes.js";

describe("Direct Service MRR calculations", () => {
  it("splits intra-state GST equally into CGST and SGST", () => {
    const line = applySupplyTypeTaxRates(recalculateMaterialLine({
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
    }), "INTRA_STATE", { forceFromGstRate: true });

    assert.equal(line.invoiceQty, 1);
    assert.equal(line.actualQty, 1);
    assert.equal(line.gstRate, 18);
    assert.equal(line.cgstRate, 9);
    assert.equal(line.sgstRate, 9);
    assert.equal(line.igstRate, 0);
    assert.equal(line.gstAmount, 225);
    assert.equal(line.totalAmount, 1475);
  });

  it("applies interstate GST as IGST", () => {
    const line = applySupplyTypeTaxRates(recalculateMaterialLine({
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
    }), "INTER_STATE", { forceFromGstRate: true });

    assert.equal(line.cgstRate, 0);
    assert.equal(line.sgstRate, 0);
    assert.equal(line.igstRate, 18);
    assert.equal(line.gstAmount, 225);
    assert.equal(line.totalAmount, 1475);
  });

  it("updates gross total and net payable using GST-inclusive totals", () => {
    const line = applySupplyTypeTaxRates(recalculateMaterialLine({
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
    }), "INTRA_STATE", { forceFromGstRate: true });
    const summary = summarizeMaterialInLines([line]);

    assert.equal(summary.totalInvoiceValue, 1250);
    assert.equal(summary.totalAmount, 1475);
    assert.equal(calculateNetSupplierPayable(summary.totalAmount, 450), 1025);
  });

  it("recalculates tax when the selected GST rate changes", () => {
    const line = {
      id: "service-line",
      itemId: "service-1",
      serviceId: "service-1",
      serviceName: "Consulting",
      lineType: "Service" as const,
      qty: 1,
      invoiceQty: 1,
      actualQty: 1,
      uom: "NOS",
      rate: 1000,
      invoiceRate: 1000,
      value: 1000,
      gstRate: 5,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
    };
    const updated = applySupplyTypeTaxRates({ ...line, gstRate: 12 }, "INTRA_STATE", { forceFromGstRate: true });

    assert.equal(updated.cgstRate, 6);
    assert.equal(updated.sgstRate, 6);
    assert.equal(updated.gstAmount, 120);
    assert.equal(updated.totalAmount, 1120);
  });

  it("keeps gross total unchanged and calculates net payable after fixed TDS", () => {
    assert.equal(calculateNetSupplierPayable(5000, 450), 4550);
    assert.equal(validateTdsAmount(450, 5000), null);
    assert.equal(validateTdsAmount(-1, 5000), "TDS cannot be negative.");
    assert.equal(validateTdsAmount(5001, 5000), "TDS cannot be greater than the gross Total Amount.");
  });
});
