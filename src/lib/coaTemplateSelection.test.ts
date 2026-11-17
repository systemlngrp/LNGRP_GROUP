import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTemplateForCompany, buildCoaSourceMap, defaultCoaLayout, resolveCoaSourceContext } from "./coa";

const template = (id: string, companyId: string, extra: Record<string, unknown> = {}) => ({
  id, templateKey: companyId, companyId, companyName: companyId, templateName: id, version: 1, status: "Active",
  layout: { ...defaultCoaLayout(), ...extra },
}) as any;

test("picks own template, then a group template, then COMMON", () => {
  const templates = [
    template("common", "COMMON"),
    template("britannia", "abcd40", { applyToCompanyIds: ["abcd41", "abcd45"] }),
    { ...template("draft", "abcd99"), status: "Draft" },
  ];
  assert.equal(activeTemplateForCompany(templates, "abcd40")?.id, "britannia");
  assert.equal(activeTemplateForCompany(templates, "abcd45")?.id, "britannia");
  assert.equal(activeTemplateForCompany(templates, "abcd99")?.id, "common");
});

test("fills standards from the job and NPD item", () => {
  const production = { id: "p1", transactionNo: "JOB/1", itemId: "i1", flute: "B+C", ply: 5, height: 300, l1: 150, f1: 120, l2: 0, f2: 120, l3: 150 } as any;
  const items = [{ id: "i1", csKgStd: 240, bsKgCm2Std: 9, stackHeight: 8, printingColour1: "RED", printingColour2: "BLUE" }];
  const map = buildCoaSourceMap(resolveCoaSourceContext(production, [], [], [], [], [], [], [], [], [], items), "2026-11-17");
  assert.equal(map["standard.boardThickness"], "Min 7 mm (B+C-Flute)");
  assert.equal(map["item.csStandard"], "240");
  assert.equal(map["item.colours"], "RED & BLUE");
  assert.equal(map["production.layerGsm"], "150 / 120 / 120 / 150");
  assert.equal(map["production.height"], "300");
});
