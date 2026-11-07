// Reports the server can calculate (/api/reports/<name>). Each entry lists the
// collections the report reads (loaded the same way the browser loads them)
// and the shared calculation, so the server returns only the result.
import { createOrderItemCatalog } from "../orderItemCatalog";
import { computePaperRequirement } from "./paperRequirement";
import { computeJobsInProgressRows } from "./jobsInProgress";
import { normalizeNpdItem } from "../npdItems";
import { computeJobwiseReelConsumptionRows } from "./jobwiseReelConsumption";
import { computeConversionCostMonthWise } from "./conversionCostMonthWise";
import { computeSummarySheetRows } from "./summarySheet";
import { computeConversionCostBase } from "./conversionCostDetails";
import { computeAuditDashboard } from "./auditDashboard";
import { computeQcViewRows, toQcItems } from "./qcView";

export type ReportListSpec = {
  key: string;
  entity: string;
  /** "firm": same active-firm scope the page uses; "all": every firm. */
  scope: "firm" | "all";
};

export type ReportDefinition = {
  /** Menu path a user needs to run the report. */
  permission: string;
  lists: ReportListSpec[];
  /** Needs the order item catalog (FG catalog, PHP/Plate masters, materials). */
  catalog?: boolean;
  /** Needs the firm-wise NPD item list (same as the useNpdItems hook). */
  npdItems?: boolean;
  compute: (lists: Record<string, any[]>, params: Record<string, any>, helpers: ReportHelpers) => unknown;
};

export type ReportHelpers = {
  catalogRows?: { fgRows: any[]; phpRows: any[]; plateRows: any[]; materialRows: any[] };
  npdItems?: any[];
};

function catalogFrom(helpers: ReportHelpers) {
  const rows = helpers.catalogRows || { fgRows: [], phpRows: [], plateRows: [], materialRows: [] };
  return createOrderItemCatalog(rows);
}

export const REPORT_DEFINITIONS: Record<string, ReportDefinition> = {
  "paper-requirement": {
    permission: "/reports/paper-requirement",
    catalog: true,
    lists: [
      { key: "productions", entity: "productions", scope: "firm" },
      { key: "orders", entity: "orders", scope: "firm" },
      { key: "schedules", entity: "orders_schedule", scope: "firm" },
      { key: "dispatchPlans", entity: "dispatch_plans", scope: "firm" },
      { key: "loadingSlips", entity: "loading_slips", scope: "firm" },
      { key: "materials", entity: "materials", scope: "firm" },
      { key: "materialIn", entity: "material_in", scope: "firm" },
      { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
      { key: "issueEntries", entity: "material_issues", scope: "firm" },
      { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
      { key: "returnEntries", entity: "material_returns", scope: "firm" },
      { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" },
      { key: "purchaseOrders", entity: "purchase_orders", scope: "firm" },
      { key: "purchaseOrderLines", entity: "purchase_order_lines", scope: "firm" },
      { key: "rapcRanges", entity: "rapc_ranges", scope: "firm" },
    ],
    compute: (lists, params, helpers) =>
      computePaperRequirement(lists as any, {
        uptoDate: String(params.uptoDate || ""),
        resolveOrderItem: catalogFrom(helpers).resolveOrderItem as any,
      }),
  },
};

REPORT_DEFINITIONS["jobs-in-progress"] = {
  permission: "/reports/jobs-in-progress",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "processing", entity: "production_processing", scope: "firm" },
    { key: "plans", entity: "dispatch_plans", scope: "firm" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "invoiceLineItems", entity: "invoice_line_items", scope: "all" },
  ],
  compute: (lists, _params, helpers) => computeJobsInProgressRows(lists as any, (helpers.npdItems || []).map(normalizeNpdItem)),
};

REPORT_DEFINITIONS["jobwise-reel-consumption"] = {
  permission: "/reports/jobwise-reel-consumption",
  lists: [
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "processing", entity: "production_processing", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
    { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
    { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" },
  ],
  compute: (lists) => computeJobwiseReelConsumptionRows(lists as any),
};

REPORT_DEFINITIONS["conversion-cost-month-wise"] = {
  permission: "/reports/conversion-cost-month-wise",
  lists: [
    { key: "materialIssues", entity: "material_issues", scope: "firm" },
    { key: "issueLines", entity: "material_issue_lines", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "fixedExpenses", entity: "fixed_monthly_expenses", scope: "firm" },
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
    { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
    { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" },
  ],
  compute: (lists, params) => computeConversionCostMonthWise(lists as any, String(params.fy || "")),
};

REPORT_DEFINITIONS["summary-sheet"] = {
  permission: "/reports/summary-sheet",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "slips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLines", entity: "invoice_line_items", scope: "all" },
    { key: "trucks", entity: "trucks", scope: "all" },
    { key: "companies", entity: "companies", scope: "firm" },
    { key: "firms", entity: "firms", scope: "firm" },
  ],
  compute: (lists, _params, helpers) => computeSummarySheetRows(lists as any, (helpers.npdItems || []).map(normalizeNpdItem)),
};

REPORT_DEFINITIONS["conversion-cost-details"] = {
  permission: "/reports/conversion-cost-details",
  lists: [
    { key: "materialIssues", entity: "material_issues", scope: "firm" },
    { key: "issueLines", entity: "material_issue_lines", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
    { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
    { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" },
    { key: "fixedExpenses", entity: "fixed_monthly_expenses", scope: "firm" },
    { key: "fixedDailyExpenses", entity: "fixed_daily_expenses", scope: "firm" },
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "processing", entity: "production_processing", scope: "firm" },
    { key: "invoices", entity: "invoices", scope: "firm" },
    { key: "invoiceLines", entity: "invoice_line_items", scope: "firm" },
  ],
  compute: (lists, params) => computeConversionCostBase(lists as any, String(params.fromDate || ""), String(params.toDate || "")),
};

REPORT_DEFINITIONS["audit-dashboard"] = {
  permission: "/audit-dashboard",
  npdItems: true,
  lists: [
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "materialIssues", entity: "material_issues", scope: "firm" },
    { key: "materialIssueLines", entity: "material_issue_lines", scope: "firm" },
    { key: "materialReturns", entity: "material_returns", scope: "firm" },
    { key: "materialReturnLines", entity: "material_return_lines", scope: "firm" },
    { key: "invoices", entity: "invoices", scope: "firm" },
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
    { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
    { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" },
    { key: "suppliers", entity: "suppliers", scope: "firm" },
  ],
  compute: (lists, _params, helpers) => computeAuditDashboard(lists as any, (helpers.npdItems || []).map(normalizeNpdItem)),
};

REPORT_DEFINITIONS["qc-view"] = {
  permission: "/quality/qc-view",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "boardline", entity: "boardline_qc_checks", scope: "firm" },
    { key: "printing", entity: "printing_qc_checks", scope: "firm" },
    { key: "inspections", entity: "pre_dispatch_inspections", scope: "all" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "settings", entity: "settings", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIssues", entity: "material_issues", scope: "all" },
    { key: "materialIssueLines", entity: "material_issue_lines", scope: "all" },
    { key: "materialIssueReelLines", entity: "material_issue_reel_lines", scope: "all" },
    { key: "materialReturns", entity: "material_returns", scope: "all" },
    { key: "materialReturnLines", entity: "material_return_lines", scope: "all" },
    { key: "materialReturnReelLines", entity: "material_return_reel_lines", scope: "all" },
    { key: "qcUpdates", entity: "qc_update_records", scope: "all" },
    { key: "blockRecords", entity: "qc_block_records", scope: "all" },
    { key: "controlRecords", entity: "control_records", scope: "all" },
  ],
  compute: (lists, _params, helpers) => computeQcViewRows(lists as any, toQcItems((helpers.npdItems || []).map(normalizeNpdItem))),
};

export function runReport(name: string, lists: Record<string, any[]>, params: Record<string, any>, helpers: ReportHelpers) {
  const definition = REPORT_DEFINITIONS[name];
  if (!definition) throw new Error(`Unknown report ${name}`);
  return definition.compute(lists, params, helpers);
}
