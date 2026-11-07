// Reports the server can calculate (/api/reports/<name>). Each entry lists the
// collections the report reads (loaded the same way the browser loads them)
// and the shared calculation, so the server returns only the result.
import { createOrderItemCatalog } from "../orderItemCatalog";
import { computePaperRequirement } from "./paperRequirement";
import { computeJobsInProgressRows } from "./jobsInProgress";
import { normalizeNpdItem } from "../npdItems";

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

export function runReport(name: string, lists: Record<string, any[]>, params: Record<string, any>, helpers: ReportHelpers) {
  const definition = REPORT_DEFINITIONS[name];
  if (!definition) throw new Error(`Unknown report ${name}`);
  return definition.compute(lists, params, helpers);
}
