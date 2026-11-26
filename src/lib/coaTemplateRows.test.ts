import { test } from "node:test";
import assert from "node:assert/strict";
import { coaSheetTemplates } from "./coaSheetTemplates";
import { COA_PARAMETERS, coaParameterForLabel, type CoaParameter } from "./coaParameters";
import { coaParameterRowParts, defaultCoaLayout } from "./coa";
import { buildCoaParameterRow, coaParameterCodeFromName } from "./coaTemplateRows";

const param = (code: string) => COA_PARAMETERS.find((value) => value.code === code)!;
const lastParts = (layout: any, row: any) => coaParameterRowParts({ ...layout, parameterRows: [...layout.parameterRows, row] }).slice(-1)[0];

test("a picked parameter's row is recognised by the Parameter Master on every sheet layout", () => {
  for (const layout of [...Object.values(coaSheetTemplates()), defaultCoaLayout()]) {
    for (const parameter of COA_PARAMETERS) {
      const parts = lastParts(layout, buildCoaParameterRow(layout, parameter, COA_PARAMETERS, { stamp: "t" }));
      assert.equal(coaParameterForLabel(parts.label)?.code, parameter.code, `${parameter.code} on ${layout.title}`);
      assert.ok(parts.obs.length >= 1, `${parameter.code} has an observation box`);
    }
  }
});

test("same columns as a sheet template: the sheet row is copied (standard source and 3 readings kept)", () => {
  const layout = coaSheetTemplates()["COMMON COA"];
  const parts = lastParts(layout, buildCoaParameterRow(layout, param("CS"), COA_PARAMETERS, { stamp: "t" }));
  assert.equal(parts.std[0].binding, "item.csStandard");
  assert.equal(parts.obs.length, 3);
});

test("single-box layout: box size uses the full L X B X H", () => {
  const layout = defaultCoaLayout();
  const parts = lastParts(layout, buildCoaParameterRow(layout, param("DIM_ID"), COA_PARAMETERS, { stamp: "t" }));
  assert.equal(parts.std[0].binding, "production.boxSizeX");
  assert.equal(parts.obs[0].binding, "pdi.boxSize");
});

test("new parameter from '+': typed standard becomes the default, label matches the new master entry", () => {
  const custom: CoaParameter = { ...param("CS"), code: "INK_RUB_TEST", name: "Ink Rub Test", labels: ["INK RUB TEST"], byFlute: undefined };
  const list = [...COA_PARAMETERS, custom];
  const layout = coaSheetTemplates()["COMMON COA"];
  const parts = lastParts(layout, buildCoaParameterRow(layout, custom, list, { standardText: "Min 50 rubs", stamp: "u" }));
  assert.equal(parts.label, "INK RUB TEST");
  assert.equal(parts.std[0].defaultValue, "Min 50 rubs");
  assert.equal(coaParameterForLabel(parts.label, list)?.code, "INK_RUB_TEST");
});

test("codes from names are unique", () => {
  assert.equal(coaParameterCodeFromName("Ink Rub Test", new Set()), "INK_RUB_TEST");
  assert.equal(coaParameterCodeFromName("Ink Rub Test", new Set(["INK_RUB_TEST"])), "INK_RUB_TEST_2");
});
