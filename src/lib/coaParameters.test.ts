import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCoaDimensions, checkCoaObservation, coaParameterForLabel } from "./coaParameters";

const p = (label: string) => coaParameterForLabel(label);

test("every template label maps to a master parameter", () => {
  for (const label of ["COLOUR OF THE CBB", "Moisture content", "INTERNAL BOX DIMENSION (LXBXH) (MM) (+-3 MM)", "Gap between closing Flap", "BS OF CFB (KG/CM2)", "Compression strength"]) {
    assert.ok(p(label), label);
  }
  assert.equal(p("SOMETHING ELSE"), undefined);
});

test("PASS / FAIL from the standard text", () => {
  assert.equal(checkCoaObservation(p("MOISTURE OF COMPOSITE BOARD (%)"), "7-9%", "8"), "PASS");
  assert.equal(checkCoaObservation(p("MOISTURE OF COMPOSITE BOARD (%)"), "7-9%", "11"), "FAIL");
  assert.equal(checkCoaObservation(p("MOISTURE OF COMPOSITE BOARD (%)"), "6% +-2%", "7.5"), "PASS");
  assert.equal(checkCoaObservation(p("Gap between closing Flap"), "Maximum 3 mm", "4"), "FAIL");
  assert.equal(checkCoaObservation(p("Manufacturing Joint Width"), "Min. 35 mm", "36"), "PASS");
  assert.equal(checkCoaObservation(p("Manufacturing Joint Width"), "28 - 32 mm", "33"), "FAIL");
  assert.equal(checkCoaObservation(p("BOARD THICKNESS"), "Min 4.8 mm (A-Flute)", "5.1"), "PASS");
  assert.equal(checkCoaObservation(p("Compression Strength"), "170 +-8%", "160"), "PASS");
  assert.equal(checkCoaObservation(p("Bursting strength"), ">=6", "5.5"), "FAIL");
  assert.equal(checkCoaObservation(p("NUMBER OF FLUTES / 30CM (BROAD FLUTE/NARRO FLUTE)"), "35 (+-3)", "37"), "PASS");
});

test("plain-number standards use the parameter's rule", () => {
  assert.equal(checkCoaObservation(p("COMPRESSION STRENGTH (kgf)"), "200", "236 231"), "PASS");
  assert.equal(checkCoaObservation(p("COMPRESSION STRENGTH (kgf)"), "200", "236 190"), "FAIL");
  assert.equal(checkCoaObservation(p("COMPOSITE GSM (+- 3%) (g)"), "525", "530"), "PASS");
  assert.equal(checkCoaObservation(p("PLY OF CFB"), "3", "5"), "FAIL");
  assert.equal(checkCoaObservation(p("COLOUR OF THE CBB"), "AS PER STANDARD", "NOT OK"), "FAIL");
  assert.equal(checkCoaObservation(p("MOISTURE OF COMPOSITE BOARD (%)"), "7-9%", ""), "");
});

test("dimensions: each within ± 3 mm", () => {
  assert.equal(checkCoaDimensions(["547", "397", "477"], ["548", "395", "480"]), "PASS");
  assert.equal(checkCoaDimensions(["547", "397", "477"], ["548", "395", "481"]), "FAIL");
  assert.equal(checkCoaDimensions(["547"], [""]), "");
});

test("saved edits override the built-in parameter; reset = no record", async () => {
  const { mergeCoaParameters, coaParameterToRecord, COA_PARAMETERS } = await import("./coaParameters");
  assert.equal(mergeCoaParameters([]), COA_PARAMETERS);
  const moisture = COA_PARAMETERS.find((parameter) => parameter.code === "MOISTURE")!;
  const record = { ...coaParameterToRecord(moisture), observationSource: "manual", plainRule: "tol:1", name: "Moisture %" };
  const merged = mergeCoaParameters([record]);
  const edited = merged.find((parameter) => parameter.code === "MOISTURE")!;
  assert.equal(edited.name, "Moisture %");
  assert.deepEqual(edited.observation, { manual: true });
  assert.deepEqual(edited.plain, { tolerance: 1 });
  assert.equal(coaParameterForLabel("MOISTURE CONTENT", merged), edited);   // labels kept
  assert.equal(checkCoaObservation(edited, "8", "9.5"), "FAIL");
  // New parameter, and switching one off.
  const extra = mergeCoaParameters([{ id: "ODOUR_X", code: "ODOUR_X", name: "Carton Odour", observationSource: "manual", labels: "CARTON ODOUR" }, { id: "ECT", code: "ECT", name: "ECT", active: "No" }]);
  assert.ok(coaParameterForLabel("Carton odour", extra));
  assert.equal(coaParameterForLabel("ECT VALUE", extra), undefined);
});
