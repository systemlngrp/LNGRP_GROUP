import { test } from "node:test";
import assert from "node:assert/strict";
import { planSeriesRenumber } from "./interFirmStepRemoval.ts";

test("later numbers close the gaps left by removed numbers", () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({ id: `r${3683 + i}`, no: `LNCB-2/MRR/26-27/0${3683 + i}` }));
  const changes = planSeriesRenumber(rows, ["LNCB-2/MRR/26-27/03684", "LNCB-2/MRR/26-27/03694"]);
  assert.equal(changes.length, 10);
  assert.deepEqual(changes[0], { id: "r3685", from: "LNCB-2/MRR/26-27/03685", to: "LNCB-2/MRR/26-27/03684" });
  assert.deepEqual(changes.at(-2), { id: "r3693", from: "LNCB-2/MRR/26-27/03693", to: "LNCB-2/MRR/26-27/03692" });
  assert.deepEqual(changes.at(-1), { id: "r3695", from: "LNCB-2/MRR/26-27/03695", to: "LNCB-2/MRR/26-27/03693" });
});

test("other series and earlier numbers are untouched", () => {
  const rows = [{ id: "a", no: "LNCB-1/MRR/26-27/03690" }, { id: "b", no: "LNCB-2/MRR/26-27/03600" }];
  assert.deepEqual(planSeriesRenumber(rows, ["LNCB-2/MRR/26-27/03684"]), []);
});
