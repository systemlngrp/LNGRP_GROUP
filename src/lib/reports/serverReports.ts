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
import { computeSummarySheetExtras } from "./summarySheetTiles";
import { computeConversionCostBase } from "./conversionCostDetails";
import { computeAuditDashboard } from "./auditDashboard";
import { computeQcViewRows, toQcItems } from "./qcView";
import { buildTraceabilityRecordById, buildTraceabilitySearchIndex } from "../traceabilityData";
import { computeDispatchPlanDayRows, computeProductionPlanRows, dispatchPlanPdfSpec, pendingLoadingPdfSpec, pendingLoadingRowsFromProjections, productionPlanPdfSpec, sortDispatchPlanDayRows } from "./whatsappReports";
import { getPendingLoadingPlanProjections } from "../pendingLoadingEligibility";
import { corrugationLinerQtyByJobId } from "../productionProcessingProgress";
import { computePendingLinkedPlanningRows, planningRowFirmId, planningRowItemKey } from "../pendingLinkedPlanning";
import { planningPdfSpec, phpPlatePlanPdfSpec } from "./whatsappReports";
import { buildPhpPlateWorkflowJobs, computePhpPlatePlanRows } from "../phpPlatePlan";
import { getFirmDisplayNameById } from "../firmDisplay";

// WhatsApp report PDFs (timed sends): the server builds the PDF from these specs.
export { buildReportPdf, renderWhatsappReportMessage, DEFAULT_WHATSAPP_REPORT_MESSAGES, WHATSAPP_REPORT_MENUS, whatsappReportKeyForMenu } from "./whatsappReports";

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
    { key: "preAppDispatches", entity: "pre_app_dispatches", scope: "all" },
    { key: "inspections", entity: "pre_dispatch_inspections", scope: "all" },
    { key: "boardlineQc", entity: "boardline_qc_checks", scope: "all" },
    { key: "printingQc", entity: "printing_qc_checks", scope: "all" },
  ],
  // Blank cells are left out to keep the download small (the page reads a missing value as blank).
  compute: (lists, _params, helpers) => computeSummarySheetRows(lists as any, (helpers.npdItems || []).map(normalizeNpdItem))
    .map((row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== "" && value !== null && value !== undefined))),
};

REPORT_DEFINITIONS["summary-sheet-tiles"] = {
  permission: "/reports/summary-sheet",
  npdItems: true,
  lists: [
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "slips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLines", entity: "invoice_line_items", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "firms", entity: "firms", scope: "all" },
    { key: "materials", entity: "materials", scope: "all" },
    { key: "materialFirmOpenings", entity: "material_firm_openings", scope: "all" },
    { key: "materialIn", entity: "material_in", scope: "all" },
    { key: "issueLines", entity: "material_issue_lines", scope: "all" },
    { key: "phpJobs", entity: "php_job_master", scope: "all" },
    { key: "plateJobs", entity: "plate_job_master", scope: "all" },
  ],
  compute: (lists, _params, helpers) => computeSummarySheetExtras(lists, (helpers.npdItems || []).map(normalizeNpdItem)),
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

// Traceability: the search list (light fields of every job) and the full
// record of one job. Both read the same lists as the page.
REPORT_DEFINITIONS["traceability-index"] = {
  permission: "/quality/traceability",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "boardline", entity: "boardline_qc_checks", scope: "all" },
    { key: "printing", entity: "printing_qc_checks", scope: "all" },
    { key: "inspections", entity: "pre_dispatch_inspections", scope: "all" },
    { key: "dispatchPlans", entity: "dispatch_plans", scope: "all" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLineItems", entity: "invoice_line_items", scope: "all" },
    { key: "trucks", entity: "trucks", scope: "all" },
    { key: "qcUpdates", entity: "qc_update_records", scope: "all" },
    { key: "complaints", entity: "quality_complaints", scope: "all" },
    { key: "materials", entity: "materials", scope: "all" },
    { key: "materialIssueReelLines", entity: "material_issue_reel_lines", scope: "all" },
    { key: "materialReturnReelLines", entity: "material_return_reel_lines", scope: "all" },
  ],
  compute: (lists, _params, helpers) => buildTraceabilitySearchIndex({ ...(lists as any), items: (helpers.npdItems || []).map(normalizeNpdItem) }),
};

REPORT_DEFINITIONS["traceability-record"] = {
  permission: "/quality/traceability",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "boardline", entity: "boardline_qc_checks", scope: "all" },
    { key: "printing", entity: "printing_qc_checks", scope: "all" },
    { key: "inspections", entity: "pre_dispatch_inspections", scope: "all" },
    { key: "dispatchPlans", entity: "dispatch_plans", scope: "all" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLineItems", entity: "invoice_line_items", scope: "all" },
    { key: "trucks", entity: "trucks", scope: "all" },
    { key: "qcUpdates", entity: "qc_update_records", scope: "all" },
    { key: "complaints", entity: "quality_complaints", scope: "all" },
    { key: "materials", entity: "materials", scope: "all" },
    { key: "materialIssueReelLines", entity: "material_issue_reel_lines", scope: "all" },
    { key: "materialReturnReelLines", entity: "material_return_reel_lines", scope: "all" },
  ],
  compute: (lists, params, helpers) => buildTraceabilityRecordById({ ...(lists as any), items: (helpers.npdItems || []).map(normalizeNpdItem) }, String(params.productionId || "")),
};

// WhatsApp reports: each returns the PDF spec (rows + totals + message values).
// params.date = plan date (YYYY-MM-DD); params.firmLabel = firm name for the title.
REPORT_DEFINITIONS["wa-production-plan"] = {
  permission: "/production/plan",
  catalog: true,
  lists: [
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "schedules", entity: "orders_schedule", scope: "firm" },
    { key: "orders", entity: "orders", scope: "firm" },
    { key: "companies", entity: "companies", scope: "firm" },
    { key: "sampleRequests", entity: "sample_requests", scope: "firm" },
    { key: "settings", entity: "settings", scope: "firm" },
    { key: "fluteMasters", entity: "flute_masters", scope: "firm" },
  ],
  compute: (lists, params, helpers) => {
    const npdItems = (helpers.catalogRows?.fgRows || []).map(normalizeNpdItem);
    const filters = params.filters || {};
    const rows = computeProductionPlanRows({ ...(lists as any), npdItems }, String(params.date || ""), {
      companies: Array.isArray(filters.companies) ? filters.companies.map(String) : [],
      item: String(filters.item || ""),
    });
    return productionPlanPdfSpec(rows, String(params.date || ""), String(params.firmLabel || ""));
  },
};

REPORT_DEFINITIONS["wa-dispatch-plan"] = {
  permission: "/dispatch/plan",
  catalog: true,
  lists: [
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "trucks", entity: "trucks", scope: "all" },
    { key: "firms", entity: "firms", scope: "all" },
  ],
  compute: (lists, params, helpers) => {
    const { resolveOrderItem } = catalogFrom(helpers);
    // Page dropdowns: firm (id), company (name), item (name::erp).
    const filters = params.filters || {};
    const fromDate = String(params.date || "");
    const toDate = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.toDate || "")) ? String(filters.toDate) : fromDate;
    const rows = sortDispatchPlanDayRows(computeDispatchPlanDayRows(lists as any, resolveOrderItem as any, fromDate, toDate).filter((row) =>
      (!filters.firm || row.firmId === String(filters.firm)) &&
      (!filters.company || row.companyName === String(filters.company)) &&
      (!filters.item || row.itemKey === String(filters.item))
    ));
    return dispatchPlanPdfSpec(rows, fromDate, toDate);
  },
};

// params.atJobWorkerByJobId = qty still at a job worker per job; params.asOf = ISO time.
REPORT_DEFINITIONS["wa-pending-loading"] = {
  permission: "/loading/pending",
  catalog: true,
  lists: [
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "firms", entity: "firms", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "productions", entity: "productions", scope: "all" },
    { key: "phpJobs", entity: "php_job_master", scope: "all" },
    { key: "plateJobs", entity: "plate_job_master", scope: "all" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
  ],
  compute: (lists, params, helpers) => {
    // Same catalog as the page (FG, PHP, Plate; no materials).
    const rows = helpers.catalogRows || { fgRows: [], phpRows: [], plateRows: [], materialRows: [] };
    const { resolveOrderItem, findItemAcrossSources } = createOrderItemCatalog({ ...rows, materialRows: [] });
    const atJobWorker = new Map(Object.entries(params.atJobWorkerByJobId || {}).map(([jobId, qty]) => [jobId, Number(qty || 0)]));
    const projections = getPendingLoadingPlanProjections({
      ...(lists as any),
      corrugationQtyByJobId: corrugationLinerQtyByJobId(lists.processing as any),
      atJobWorkerByJobId: atJobWorker,
      resolveOrderItem: resolveOrderItem as any,
      findItemAcrossSources: findItemAcrossSources as any,
    });
    // Page dropdowns: firm (id), source, company (name), item (name) — as the page filters them.
    const filters = params.filters || {};
    const filtered = projections.filter((projection: any) =>
      (!filters.firm || String(projection.firmId || "").toLowerCase() === String(filters.firm).trim().toLowerCase()) &&
      (!filters.source || projection.itemSource === String(filters.source)) &&
      (!filters.company || (projection.company?.name || "Company unavailable") === String(filters.company)) &&
      (!filters.item || (projection.item?.name || "Item unavailable") === String(filters.item))
    );
    return pendingLoadingPdfSpec(pendingLoadingRowsFromProjections(filtered, lists.firms), new Date(String(params.asOf || new Date().toISOString())));
  },
};

// Pending PHP / Plate Planning (as on now). params.filters: firm, company (id),
// item (key), from / to (schedule date); params.firmLabel for the title.
for (const [name, source, permission] of [["wa-php-planning", "PHP", "/production/php/pending-planning"], ["wa-plate-planning", "PLATE", "/production/plate/pending-planning"]] as const) {
  REPORT_DEFINITIONS[name] = {
    permission,
    catalog: true,
    lists: [
      { key: "schedules", entity: "orders_schedule", scope: "all" },
      { key: "orders", entity: "orders", scope: "all" },
      { key: "companies", entity: "companies", scope: "firm" },
      { key: "firms", entity: "firms", scope: "all" },
      { key: "jobRows", entity: source === "PHP" ? "php_job_master" : "plate_job_master", scope: "firm" },
    ],
    compute: (lists, params, helpers) => {
      const { resolveOrderItem, itemsBySource } = catalogFrom(helpers);
      const filters = params.filters || {};
      const rows = computePendingLinkedPlanningRows({
        source,
        schedules: lists.schedules as any,
        orders: lists.orders as any,
        companies: lists.companies as any,
        jobRows: lists.jobRows as any,
        sourceItems: (itemsBySource as any)[source] || [],
        resolveOrderItem: resolveOrderItem as any,
      })
        .filter((row) => {
          const date = String(row.schedule.scheduledDate || "").slice(0, 10);
          return (!filters.firm || planningRowFirmId(row) === String(filters.firm))
            && (!filters.company || row.company?.id === String(filters.company))
            && (!filters.item || planningRowItemKey(row) === String(filters.item))
            && (!filters.from || date >= String(filters.from))
            && (!filters.to || date <= String(filters.to));
        })
        // Same order as the page opens in: latest schedule date first.
        .sort((a, b) => new Date(b.schedule.scheduledDate).getTime() - new Date(a.schedule.scheduledDate).getTime());
      return planningPdfSpec(name === "wa-php-planning" ? "php-planning" : "plate-planning", rows.map((row) => ({
        scheduledDate: String(row.schedule.scheduledDate || ""),
        scheduleNo: String(row.schedule.scheduleNo || ""),
        firmName: getFirmDisplayNameById(planningRowFirmId(row), lists.firms as any),
        orderNo: String(row.order?.orderNo || ""),
        companyName: String(row.company?.name || ""),
        fgItem: row.isDirectSourceOrder ? "Direct Order" : String(row.fgItem?.name || ""),
        mainErp: String(row.order?.erpCode || row.fgItem?.erp || ""),
        linkedItem: String(row.linkedItem?.name || ""),
        scheduledQty: row.scheduledQty,
        setsPerBox: row.isDirectSourceOrder ? "Direct" : String(row.setsPerBox ?? ""),
        requiredQty: row.requiredQty,
        alreadyPlannedQty: row.alreadyPlannedQty,
        remainingQty: row.remainingQty,
      })), new Date(String(params.asOf || new Date().toISOString())), String(params.firmLabel || ""));
    },
  };
}

// PHP / Plate Production Plan for params.date (Shift, then Sequence). params.filters: firm, company, item, shift, methodology.
for (const [name, source, permission] of [["wa-php-production-plan", "PHP", "/production/php/plan"], ["wa-plate-production-plan", "PLATE", "/production/plate/plan"]] as const) {
  REPORT_DEFINITIONS[name] = {
    permission,
    catalog: true,
    lists: [
      { key: "sourceJobs", entity: source === "PHP" ? "php_job_master" : "plate_job_master", scope: "all" },
      { key: "productions", entity: "productions", scope: "all" },
      { key: "schedules", entity: "orders_schedule", scope: "all" },
      { key: "orders", entity: "orders", scope: "all" },
      { key: "companies", entity: "companies", scope: "all" },
      { key: "firms", entity: "firms", scope: "all" },
    ],
    compute: (lists, params, helpers) => {
      const { itemsBySource } = catalogFrom(helpers);
      const date = String(params.date || "");
      const rows = computePhpPlatePlanRows({
        source,
        date,
        jobs: buildPhpPlateWorkflowJobs(source, lists.sourceJobs as any, lists.productions as any),
        schedules: lists.schedules as any,
        orders: lists.orders as any,
        companies: lists.companies as any,
        firms: lists.firms as any,
        sourceItems: (itemsBySource as any)[source] || [],
        filters: params.filters || {},
      });
      return phpPlatePlanPdfSpec(source === "PHP" ? "php-production-plan" : "plate-production-plan", rows, date);
    },
  };
}

export function runReport(name: string, lists: Record<string, any[]>, params: Record<string, any>, helpers: ReportHelpers) {
  const definition = REPORT_DEFINITIONS[name];
  if (!definition) throw new Error(`Unknown report ${name}`);
  return definition.compute(lists, params, helpers);
}
