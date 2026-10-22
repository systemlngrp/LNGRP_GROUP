import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTemplateForCompany, buildCoaSourceMap, buildInitialCellValues, defaultCoaLayout, resolveCoaSourceContext } from "./coa";
import type { Company, CoaTemplate, Firm, Production } from "../types";

const production: Production = {
  id: "production-1", transactionNo: "JOB-100", date: "2026-10-22", itemId: "item-1", companyName: "Acme Boards", firmId: "firm-1", firmName: "LN Group", qty: 25, uom: "BOX", remarks: "", status: "Completed",
};
const company: Company = { id: "company-1", name: "Acme Boards", active: "Yes" };
const firm: Firm = { id: "firm-1", firmName: "LN Group", address: "Factory Road" };

test("COA resolver selects the production company, firm, and latest QC sources", () => {
  const context = resolveCoaSourceContext(production, [company], [firm], [], [], [], [], [], [{ id: "board-1", jobNo: "JOB-100", boardThickness: 5, updateTimestamp: "2026-10-22T10:00:00Z" } as any], []);
  assert.equal(context.company?.id, "company-1");
  assert.equal(context.firm?.id, "firm-1");
  assert.equal(context.boardline?.boardThickness, 5);
  assert.equal(buildCoaSourceMap(context, "2026-10-22").jobNo, "JOB-100");
});

test("active template selection is company-specific and version-aware", () => {
  const makeTemplate = (id: string, companyId: string, version: number, status: "Draft" | "Active" | "Archived"): CoaTemplate => ({ id, templateKey: companyId, companyId, companyName: companyId, templateName: "COA", version, status, layout: defaultCoaLayout() });
  const selected = activeTemplateForCompany([makeTemplate("one", "company-1", 1, "Active"), makeTemplate("two", "company-1", 2, "Active"), makeTemplate("other", "company-2", 9, "Active"), makeTemplate("draft", "company-1", 10, "Draft")], "company-1");
  assert.equal(selected?.id, "two");
});

test("initial COA cell values preserve source provenance and defaults", () => {
  const layout = defaultCoaLayout();
  const values = buildInitialCellValues(layout, { itemName: "Box Item", coaDate: "2026-10-22" });
  assert.equal(values["meta-item-value"]?.value, "Box Item");
  assert.equal(values["meta-item-value"]?.source, "auto");
  assert.equal(values["meta-date-value"]?.value, "2026-10-22");
  assert.equal(values["p1-standard"]?.value, "");
});
