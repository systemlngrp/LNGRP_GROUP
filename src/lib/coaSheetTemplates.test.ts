import { test } from "node:test";
import assert from "node:assert/strict";
import { coaSheetTemplates } from "./coaSheetTemplates";
import { buildInitialCellValues, evaluateCoaAutoRule } from "./coa";

const source: Record<string, string> = {
  jobNo: "J/1", "production.length": "547.00", "production.breadth": "397.00", "production.height": "477.00",
  "production.ply": "3", "production.flute": "A", "item.csStandard": "200", "item.bsStandard": "6", "item.compositeGsm": "525",
};

test("every sheet tab has a template whose rows fit 9 columns", () => {
  const all = coaSheetTemplates();
  assert.equal(Object.keys(all).length, 14);
  for (const [name, layout] of Object.entries(all)) {
    for (const row of [...layout.metadataRows, ...layout.parameterRows, ...layout.footerRows]) {
      const width = row.cells.reduce((sum, cell) => sum + (cell.colSpan || 1), 0);
      assert.equal(width, 9, `${name} row ${row.id} spans ${width}`);
    }
    const ids = [...layout.metadataRows, ...layout.parameterRows, ...layout.footerRows].flatMap((row) => row.cells.map((cell) => cell.id));
    assert.equal(new Set(ids).size, ids.length, `${name} has duplicate cell ids`);
  }
});

test("observations follow the sheet ranges", () => {
  for (let i = 0; i < 100; i++) {
    const values = buildInitialCellValues(coaSheetTemplates()["Britannia / ITC"], { ...source, jobNo: `J/${i}` });
    const dims = ["p8-o1", "p8-o2", "p8-o3"].map((id) => Number(values[id].value));
    assert.ok(Math.abs(dims[0] - 547) <= 2 && Math.abs(dims[1] - 397) <= 2 && Math.abs(dims[2] - 477) <= 2);
    const gsm = Number(values["p10-o"].value); assert.ok(gsm >= 509.25 && gsm <= 540.75);
    const cs = ["p12-o1", "p12-o2", "p12-o3"].map((id) => Number(values[id].value));
    assert.ok(cs[0] >= 220 && cs[0] <= 240 && cs[1] >= 222 && cs[1] <= 242 && cs[2] >= 220 && cs[2] <= 242);
    const bs = Number(values["p18-o1"].value); assert.ok(bs >= 6.5 && bs <= 6.9);
    assert.ok(["7", "8"].includes(values["p17-o1"].value));
    assert.equal(values["p14-o"].value, "A");
  }
});

test("rules: copy, flute ranges, missing standard", () => {
  const valueOf = (id: string) => ({ s: "B+C", n: "abc" } as Record<string, string>)[id] || "";
  assert.equal(evaluateCoaAutoRule({ copy: "s" }, valueOf, "x"), "B+C");
  const t = Number(evaluateCoaAutoRule({ byValueOf: "s", decimals: 2, ranges: { "B+C": [7, 7.3] } }, valueOf, "x"));
  assert.ok(t >= 7 && t <= 7.3);
  assert.equal(evaluateCoaAutoRule({ from: "n", min: 1, max: 2 }, valueOf, "x"), "");
  assert.equal(evaluateCoaAutoRule({ byValueOf: "s", ranges: { A: [1, 2] } }, valueOf, "x"), "");
});
