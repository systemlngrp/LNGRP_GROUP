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

test("observations come from readings; nothing is generated", () => {
  const readings = {
    ...source, "pdi.lengthId": "548", "pdi.widthId": "396", "pdi.heightId": "479", "pdi.csAchieved": "236", "printing.csAchieved": "231",
    "pdi.gsmAchieved": "530", "printing.bsAchieved": "6.7", "boardline.moisture": "8", "boardline.typeOfFlute": "A",
    "pdi.printingColorCheck": "OK", "pdi.printingArtworkCheck": "OK",
  };
  const values = buildInitialCellValues(coaSheetTemplates()["Britannia / ITC"], readings);
  assert.deepEqual(["p8-o1", "p8-o2", "p8-o3"].map((id) => values[id].value), ["548", "396", "479"]);
  assert.equal(values["p10-o"].value, "530");
  assert.deepEqual(["p12-o1", "p12-o2", "p12-o3"].map((id) => values[id].value), ["236", "231", ""]);
  assert.equal(values["p17-o1"].value, "8");
  assert.equal(values["p18-o1"].value, "6.7");
  assert.equal(values["p14-o"].value, "A");
  assert.equal(values["p1-o"].value, "AS PER STANDARD");
  // Flutes / 30 cm and flute height have no reading: left for QC to type.
  assert.equal(values["p15-o"].value, ""); assert.equal(values["p16-o"].value, "");
  const empty = buildInitialCellValues(coaSheetTemplates()["Britannia / ITC"], source);
  for (const id of ["p8-o1", "p10-o", "p12-o1", "p17-o1", "p18-o1"]) assert.equal(empty[id].value, "", id);
});

test("test-result layout: remark is OK / NOT OK from the check", () => {
  const values = buildInitialCellValues(coaSheetTemplates()["Carlsberg"], { ...source, "pdi.csAchieved": "150", "boardline.moisture": "8" });
  const rowOf = (label: string) => coaSheetTemplates()["Carlsberg"].parameterRows.find((row) => row.cells[0].label === label)!;
  const cs = rowOf("Compression strength");
  assert.equal(values[cs.cells.find((c) => c.id.endsWith("-o"))!.id].value, "150");
  assert.equal(values[cs.cells.find((c) => c.id.endsWith("-r"))!.id].value, "NOT OK"); // 150 < 200
});

test("rules: copy works; generated-number rules give nothing", () => {
  const valueOf = (id: string) => ({ s: "B+C", n: "abc" } as Record<string, string>)[id] || "";
  assert.equal(evaluateCoaAutoRule({ copy: "s" }, valueOf, "x"), "B+C");
  assert.equal(evaluateCoaAutoRule({ byValueOf: "s", decimals: 2, ranges: { "B+C": [7, 7.3] } }, valueOf, "x"), "");
  assert.equal(evaluateCoaAutoRule({ min: 1, max: 2 }, valueOf, "x"), "");
});
