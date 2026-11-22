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
  assert.equal(Object.keys(all).length, 16);
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

// Templates saved from the Template Master use plain ids (s-12, c-13): columns come from the header row.
test("templates built in the Template Master: header columns, template bindings kept", () => {
  const st = (id: string, label: string, colSpan = 1) => ({ id, label, kind: "static", inputType: "text", colSpan }) as any;
  const inp = (id: string, extra: Record<string, unknown> = {}, colSpan = 3) => ({ id, label: "", kind: "input", inputType: "text", colSpan, ...extra }) as any;
  const layout: any = {
    title: "COA", columns: 9, metadataRows: [], footerRows: [],
    parameterRows: [
      { id: "h", cells: [st("s-1", "SL. NO."), st("s-2", "PARAMETERS", 2), st("s-3", "STANDARD", 3), st("s-4", "OBSERVATION", 3)] },
      { id: "r1", cells: [st("s-5", "1"), st("s-6", "COLOUR OF THE CBB", 2), inp("c-7", { defaultValue: "AS PER STANDARD" }), inp("c-8")] },
      { id: "r2", cells: [st("s-9", "2"), st("s-10", "INTERNAL BOX DIMENSION (LXBXH) (MM) (+-3 MM)", 2),
        inp("c-11", { binding: "production.length" }, 1), inp("c-12", { binding: "production.breadth" }, 1), inp("c-13", { binding: "production.height" }, 1),
        inp("c-14", { binding: "pdi.lengthId" }, 1), inp("c-15", { binding: "pdi.widthId" }, 1), inp("c-16", {}, 1)] },
      { id: "r3", cells: [st("s-17", "3"), st("s-18", "FLUTE HEIGHT (MM)", 2), inp("c-19", { defaultValue: "4.6(+-0.1)" }), inp("c-20", { defaultValue: "4.7" })] },
      { id: "r4", cells: [st("s-21", "4"), st("s-22", "PLY OF CFB", 2), inp("c-23", { binding: "production.ply" }), inp("c-24")] },
    ],
  };
  const values = buildInitialCellValues(layout, { ...source, "pdi.lengthId": "548", "pdi.widthId": "396", "pdi.heightId": "479", "pdi.printingColorCheck": "OK" });
  assert.equal(values["c-8"].value, "AS PER STANDARD");          // PDI colour check OK
  assert.deepEqual(["c-14", "c-15", "c-16"].map((id) => values[id].value), ["548", "396", "479"]); // height filled from PDI
  assert.equal(values["c-20"].value, "");                         // fixed "4.7" removed: typed by QC
  assert.equal(values["c-24"].value, "3");                        // ply = job ply
});

test("a reading saved as 0 counts as not measured", () => {
  const values = buildInitialCellValues(coaSheetTemplates()["Britannia / ITC"], { ...source, "boardline.moisture": "0.00", "pdi.csAchieved": "00", "printing.csAchieved": "231" });
  assert.equal(values["p17-o1"].value, "");
  assert.deepEqual(["p12-o1", "p12-o2"].map((id) => values[id].value), ["", "231"]);
});

test("joint width and flap gap come from the PDI (mm); a 0 mm flap gap is kept", () => {
  const values = buildInitialCellValues(coaSheetTemplates()["COMMON COA"], { ...source, "pdi.jointWidthMm": "30", "pdi.flapGapMm": "0" });
  const rows = coaSheetTemplates()["COMMON COA"].parameterRows;
  const obsOf = (label: string) => values[rows.find((row) => row.cells[1]?.label === label)!.cells.find((cell) => /-o\d?$/.test(cell.id))!.id].value;
  assert.equal(obsOf("Manufacturing Joint Width"), "30");
  assert.equal(obsOf("Gap between closing Flap"), "0");
});

test("observation linked to a PDI check shows the parameter wording (Colour of Printing: AS PER STANDARD), not the bare OK", () => {
  const st = (id: string, label: string, colSpan = 1) => ({ id, label, kind: "static", inputType: "text", colSpan }) as any;
  const inp = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: "", kind: "input", inputType: "text", colSpan: 3, ...extra }) as any;
  const layout: any = { title: "COA", columns: 9, metadataRows: [], footerRows: [], parameterRows: [
    { id: "h", cells: [st("s-1", "SL. NO."), st("s-2", "PARAMETERS", 2), st("s-3", "STANDARD", 3), st("s-4", "OBSERVATION", 3)] },
    { id: "r", cells: [st("s-5", "1"), st("s-6", "COLOUR OF PRINTING", 2), inp("c-7", { binding: "item.colours" }), inp("c-8", { binding: "pdi.printingColorCheck" })] },
  ] };
  assert.equal(buildInitialCellValues(layout, { "item.colours": "RED & BLUE", "pdi.printingColorCheck": "OK" })["c-8"].value, "AS PER STANDARD");
  assert.equal(buildInitialCellValues(layout, { "item.colours": "RED & BLUE", "pdi.printingColorCheck": "NOT OK" })["c-8"].value, "NOT OK");
});
