import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoaObservations, buildCoaSourceMap } from "./coa";

test("observations come from real readings only", () => {
  const o = buildCoaObservations({
    ply: 3, printingColorCheck: "OK", printingArtworkCheck: "NOT OK",
    lengthId: "548", widthId: "396", heightId: "478", boardFlute: "A", boardThickness: "5.3", moisture: "8.2",
  });
  assert.equal(o["obs.colour"], "AS PER STANDARD");
  assert.equal(o["obs.printing"], "NOT OK");
  assert.equal(o["obs.length"], "548"); assert.equal(o["obs.breadth"], "396"); assert.equal(o["obs.height"], "478");
  assert.equal(o["obs.ply"], "3"); assert.equal(o["obs.flute"], "A");
  assert.equal(o["obs.boardThickness"], "5.3"); assert.equal(o["obs.moisture"], "8.2");
  // Not recorded as numbers anywhere: typed by QC.
  assert.equal(o["obs.jointWidth"], ""); assert.equal(o["obs.flapGap"], "");
});

test("no readings leave observations blank (nothing is made up)", () => {
  const o = buildCoaObservations({});
  for (const value of Object.values(o)) assert.equal(value, "");
});

test("item name comes from the NPD item, never its id", () => {
  const map = buildCoaSourceMap({ production: { id: "p", transactionNo: "J1", itemId: "fa76" } as any, item: { id: "fa76", itemName: "MAHAVIR CHEMICALS UNIT II (PRINTED)" }, order: { itemId: "fa76" } as any });
  assert.equal(map.itemName, "MAHAVIR CHEMICALS UNIT II (PRINTED)");
  const noItem = buildCoaSourceMap({ production: { id: "p", transactionNo: "J1", itemId: "fa76" } as any, order: { itemId: "fa76" } as any });
  assert.equal(noItem.itemName, "");
});

test("a zero reading in a template-bound observation cell is left blank (not FAIL)", async () => {
  const { buildInitialCellValues, defaultCoaLayout } = await import("./coa");
  const layout = defaultCoaLayout();
  const values = buildInitialCellValues(layout, { "obs.moisture": "0.00", "obs.flapGap": "0" });
  assert.equal(values["p9-observation"].value, "");
  assert.equal(values["p6-observation"].value, "0");
});

test("COA fill: flute standard for a blank standard, company standard, text observations, target hints only as hints", async () => {
  const { buildInitialCellValues, coaObservationHints } = await import("./coa");
  const { COA_PARAMETERS } = await import("./coaParameters");
  const row = (id: string, label: string, std = "") => ({ id, cells: [
    { id: `${id}-label`, label, kind: "static", inputType: "text" },
    { id: `${id}-s`, label: "", kind: "input", inputType: "text", defaultValue: std },
    { id: `${id}-o`, label: "", kind: "input", inputType: "text" },
  ] });
  const layout: any = { title: "T", columns: 3, metadataRows: [], footerRows: [], parameterRows: [
    { id: "h", cells: [{ id: "h1", label: "PARAMETERS", kind: "static" }, { id: "h2", label: "STANDARD", kind: "static" }, { id: "h3", label: "OBSERVATION", kind: "static" }] },
    row("fh", "FLUTE HEIGHT (MM)"), row("mo", "MOISTURE CONTENT", "7-9%"), row("od", "ODOUR", "-"), row("jw", "MANUFACTURING JOINT WIDTH", "Min 35 mm"),
  ] };
  const params = COA_PARAMETERS.map((p) => p.code === "MOISTURE" ? { ...p, companyStandards: { co1: "6-8%" } } : p);
  const map = { "production.flute": "C", companyId: "co1", "boardline.moisture": "8.5" };
  const values = buildInitialCellValues(layout, map, params);
  assert.equal(values["fh-s"].value, "Min 4.0 mm");
  assert.equal(values["fh-o"].value, "");
  assert.equal(values["mo-s"].value, "6-8%");
  assert.equal(values["mo-o"].value, "8.5");
  assert.equal(values["od-o"].value, "NONE");
  assert.equal(values["jw-o"].value, "");
  const hints = coaObservationHints(layout, map, params);
  assert.equal(hints["fh-o"], "Target: 4.2-4.6");
  assert.equal(hints["jw-o"], "Target: 36-38");
});
