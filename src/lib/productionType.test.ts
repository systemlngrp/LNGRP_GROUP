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

test("direct PHP and Plate jobs do not enter machine processing", () => {
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "PHP", methodology: "Corrugation" }, undefined, {}, machines), []);
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "PLATE", methodology: "CORRUGATION" }, undefined, {}, machines), []);
});

test("linked PHP and Plate Corrugation jobs use Corrugation Liner then Printing", () => {
  const expected = ["Corrugation Liner", "Printing"];
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "FG", phpScheduledJobId: "php-1", methodology: "Corrugation" }, undefined, {}, machines), expected);
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "FG", plateScheduledJobId: "plate-1", methodology: "CORRUGATION" }, undefined, {}, machines), expected);
});

test("regular FG processing keeps its configured route", () => {
  assert.deepEqual(getRequiredMachinesForProduction({ itemSource: "FG" }, { boxType: "RSC" }, { RSC: ["Corrugation Liner", "Printing"] }, machines), ["Corrugation Liner", "Printing"]);
});
