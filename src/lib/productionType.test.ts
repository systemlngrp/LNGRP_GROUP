import assert from "node:assert/strict";
import test from "node:test";
import { getRequiredMachinesForProduction } from "./productionType";

const machines = [
  { id: "corrugation", name: "Corrugation Liner" },
  { id: "printing", name: "Printing" },
] as any;

test("PHP and Plate Scrap jobs have no processing machines", () => {
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "PHP", methodology: "Scrap" }, undefined, {}, machines), []);
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "PLATE", methodology: "SCRAP" }, undefined, {}, machines), []);
});

test("PHP and Plate Corrugation jobs use Corrugation Liner then Printing", () => {
  const expected = ["Corrugation Liner", "Printing"];
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "PHP", methodology: "Corrugation" }, undefined, {}, machines), expected);
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "PLATE", methodology: "CORRUGATION" }, undefined, {}, machines), expected);
});

test("regular FG processing keeps its configured route", () => {
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "FG" }, { boxType: "RSC" }, { RSC: ["Corrugation Liner", "Printing"] }, machines), ["Corrugation Liner", "Printing"]);
});
