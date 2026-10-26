import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySupplyTypeTaxRates } from "./materialInTaxes";

const baseLine = {
  id: "line-1",
  itemId: "material-1",
  qty: 10,
  uom: "KG",
  invoiceQty: 10,
  rate: 100,
  invoiceRate: 100,
  value: 1000,
  gstRate: 0,
  cgstRate: 99,
  sgstRate: 88,
  igstRate: 77,
};

describe("MRR line GST split", () => {
  for (const gstRate of [0, 5, 12, 18]) {
    it(`derives CGST and SGST from ${gstRate}% GST`, () => {
      const line = applySupplyTypeTaxRates(
        { ...baseLine, gstRate, cgstRate: 99, sgstRate: 88 },
        "INTRA_STATE",
        { forceFromGstRate: true }
      );

      assert.equal(line.cgstRate, gstRate / 2);
      assert.equal(line.sgstRate, gstRate / 2);
      assert.equal(line.igstRate, 0);
    });
  }

  it("does not use manually supplied intra-state split rates when forced", () => {
    const line = applySupplyTypeTaxRates(
      { ...baseLine, gstRate: 5, cgstRate: 20, sgstRate: 1 },
      "INTRA_STATE",
      { forceFromGstRate: true }
    );

    assert.equal(line.cgstRate, 2.5);
    assert.equal(line.sgstRate, 2.5);
  });

  it("keeps interstate IGST behavior unchanged", () => {
    const line = applySupplyTypeTaxRates(
      { ...baseLine, gstRate: 18, cgstRate: 0, sgstRate: 0, igstRate: 18 },
      "INTER_STATE"
    );

    assert.equal(line.cgstRate, 0);
    assert.equal(line.sgstRate, 0);
    assert.equal(line.igstRate, 18);
  });
});
