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
