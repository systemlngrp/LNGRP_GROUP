import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoaObservations, buildCoaSourceMap } from "./coa";

const standards = { length: "547.00", breadth: "397.00", height: "477.00", ply: 3, flute: "A" };

test("observations follow the COMMON COA sheet ranges", () => {
  for (let i = 0; i < 200; i++) {
    const o = buildCoaObservations(`JOB/${i}`, standards);
    assert.equal(o["obs.colour"], "AS PER STANDARD");
    assert.equal(o["obs.printing"], "AS PER STANDARD");
    assert.ok(Math.abs(Number(o["obs.length"]) - 547) <= 2);
    assert.ok(Math.abs(Number(o["obs.breadth"]) - 397) <= 2);
    assert.ok(Math.abs(Number(o["obs.height"]) - 477) <= 2);
    assert.equal(o["obs.ply"], "3");
    assert.equal(o["obs.flute"], "A");
    const joint = Number(o["obs.jointWidth"]); assert.ok(joint >= 28 && joint <= 32 && Number.isInteger(joint));
    const gap = Number(o["obs.flapGap"]); assert.ok(gap >= 1 && gap <= 3);
    const thickness = Number(o["obs.boardThickness"]); assert.ok(thickness >= 5.2 && thickness <= 5.5);
    assert.ok(["8", "9"].includes(o["obs.moisture"]));
  }
});

test("same job gives the same observations", () => {
  assert.deepEqual(buildCoaObservations("LNCB-2/JOB/26-27/11060", standards), buildCoaObservations("LNCB-2/JOB/26-27/11060", standards));
});

test("missing standards leave observations blank", () => {
  const o = buildCoaObservations("x", {});
  assert.equal(o["obs.length"], ""); assert.equal(o["obs.boardThickness"], ""); assert.equal(o["obs.flute"], "");
});

test("item name comes from the NPD item, never its id", () => {
  const map = buildCoaSourceMap({ production: { id: "p", transactionNo: "J1", itemId: "fa76" } as any, item: { id: "fa76", itemName: "MAHAVIR CHEMICALS UNIT II (PRINTED)" }, order: { itemId: "fa76" } as any });
  assert.equal(map.itemName, "MAHAVIR CHEMICALS UNIT II (PRINTED)");
  const noItem = buildCoaSourceMap({ production: { id: "p", transactionNo: "J1", itemId: "fa76" } as any, order: { itemId: "fa76" } as any });
  assert.equal(noItem.itemName, "");
});
