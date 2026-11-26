import { test } from "node:test";
import assert from "node:assert/strict";
import { poTermsForOrder } from "./poTerms";

const materials = [{ id: "m1", materialGroupId: "g-kraft" }, { id: "m2", materialGroupId: "g-ink" }, { id: "m3" }];
const terms = [{ id: "g-kraft", materialGroupId: "g-kraft", materialGroupName: "Kraft", terms: "Kraft terms" }, { id: "g-ink", materialGroupId: "g-ink", terms: "Ink terms" }];

test("terms of the first item's group", () => {
  assert.equal(poTermsForOrder([{ materialId: "m2" }, { materialId: "m1" }], materials, terms).text, "Ink terms");
});
test("lines without a group (services) are skipped", () => {
  assert.equal(poTermsForOrder([{ materialId: "" }, { materialId: "m3" }, { materialId: "m1" }], materials, terms).text, "Kraft terms");
});
test("no terms set for the group: blank", () => {
  assert.equal(poTermsForOrder([{ materialId: "m1" }], materials, []).text, "");
});
