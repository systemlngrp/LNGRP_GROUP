import type {
  Company, Consumption, DispatchPlan, Firm, GateEntry, GatePass, Indent, IndentLine, Invoice, InvoiceLineItem, Item,
  LoadingSlip, LoadingSlipLine, Machine, Material, MaterialIn, MaterialInPackingSlip, MaterialIssue, MaterialIssueLine,
  MaterialIssueReelLine, MaterialReturn, MaterialReturnLine, MaterialReturnReelLine, OperationDashboardMetricCard,
  OperationDashboardSummary, Order, OrderSchedule, Production, ProductionProcessing, PurchaseOrder, SampleRequest, Setting,
} from "../types";
import { buildProductionMaterialUsageMap, getProductionActualPaperUsed } from "./productionMaterialUsage";
import { normalizeMachineName } from "./productionMachineNames";
import { PROCESSING_MACHINE_COLUMNS } from "./productionProcessingSummary";
import { formatDate } from "./serial";
import { buildOperationDashboardSummary, getSafeRange, isDateWithinRange } from "./operationDashboard";
import { buildPendingTaskCounts } from "./pendingTaskCounts";
import { buildScrapInvoiceRows, summarizeScrapInvoiceRows } from "./wastageReport";
import { createOrderItemCatalog } from "./orderItemCatalog";
import { normalizeNpdItem } from "./npdItems";

/**
 * All Operation Dashboard figures, computed from the raw lists. Shared by the
 * page (fallback mode) and the server summary endpoint so both produce
 * identical numbers. Logic moved verbatim from OperationDashboard.tsx.
 */

export type ProcessingTotals = {
  paper: number;
  liner: number;
  printing: number;
  pasting: number;
  stitching: number;
  punching: number;
  gluing: number;
};

export type OperationRow = {
  srNo: number;
  production: Production;
  item?: Item;
  schedule?: OrderSchedule;
  order?: Order;
  company?: Company;
  processingTotals: ProcessingTotals;
  loadedQty: number;
  leastGsm: number | null;
  actualPaperUsed: number;
};

export const PROCESSING_MACHINE_CARD_ORDER = [
  "Corrugation Paper",
  "Corrugation Liner",
  "Printing",
  "Pasting",
  "Rotary",
  "Slotting",
  "Stitching",
  "Punching",
  "Gluing",
] as const;

export type ClosedJobFilter = "all" | "yes" | "no";

export type OperationDashboardLists = {
  productions: Production[];
  firms: Firm[];
  phpJobMaster: Production[];
  plateJobMaster: Production[];
  /** Raw rows of /api/npd-firm-wise?status=all (normalized here, as useNpdItems does). */
  npdFirmWiseRows: any[];
  /** Raw rows used by useOrderItemCatalog. */
  catalogFgRows: any[];
  catalogPhpRows: any[];
  catalogPlateRows: any[];
  catalogMaterialRows: Material[];
  materials: Material[];
  materialIn: MaterialIn[];
  packingSlips: MaterialInPackingSlip[];
  schedules: OrderSchedule[];
  orders: Order[];
  companies: Company[];
  gateEntries: GateEntry[];
  dispatchPlans: DispatchPlan[];
  processing: ProductionProcessing[];
  loadingSlips: LoadingSlip[];
  materialIssues: MaterialIssue[];
  materialIssueLines: MaterialIssueLine[];
  issueReelLines: MaterialIssueReelLine[];
  materialReturns: MaterialReturn[];
  materialReturnLines: MaterialReturnLine[];
  returnReelLines: MaterialReturnReelLine[];
  invoices: Invoice[];
  invoiceLineItems: InvoiceLineItem[];
  consumptions: Consumption[];
  sampleRequests: SampleRequest[];
  indents: Indent[];
  indentLines: IndentLine[];
  purchaseOrders: PurchaseOrder[];
  phpLoadingSlips: LoadingSlip[];
  plateLoadingSlips: LoadingSlip[];
  gatePasses: GatePass[];
  machines: Machine[];
  settings: Setting[];
};

export type OperationDashboardOptions = {
  dateRange: { from: string; to: string };
  closedJobFilter: ClosedJobFilter;
  includeExportRows?: boolean;
  /**
   * The same lists for all firms. Most pending pages list every firm's records
   * (firmScope "all"), so their dashboard counts are taken from these; the
   * pages that list only the active firm keep the firm's own lists.
   */
  pendingLists?: OperationDashboardLists;
};

/** Pending pages that list only the active firm's records. */
const FIRM_SCOPED_PENDING_KEYS = [
  "/purchase-orders/pending-indent-lines",
  "/material-receipt/pending-mrr",
  "/material-receipt/pending-debit-note",
  "/material-receipt/pending-credit-note",
  "/production/pending-job-transfer",
  "/loading/php/pending-tally",
  "/loading/plate/pending-tally",
  "/samples/pending",
  "/gate-pass/pending-returnable",
];

function computePendingCounts(lists: OperationDashboardLists) {
  const { resolveOrderItem, findItemAcrossSources, itemsBySource } = createOrderItemCatalog({
    fgRows: lists.catalogFgRows,
    phpRows: lists.catalogPhpRows,
    plateRows: lists.catalogPlateRows,
    materialRows: lists.catalogMaterialRows,
  });
  return buildPendingTaskCounts({
    firms: lists.firms, materialIn: lists.materialIn, productions: lists.productions, phpJobMaster: lists.phpJobMaster,
    plateJobMaster: lists.plateJobMaster, materials: lists.materials, orders: lists.orders,
    npdItems: lists.npdFirmWiseRows.map(normalizeNpdItem), consumptions: lists.consumptions,
    materialIssues: lists.materialIssues, materialIssueLines: lists.materialIssueLines, materialIssueReelLines: lists.issueReelLines,
    materialReturns: lists.materialReturns, materialReturnLines: lists.materialReturnLines, materialReturnReelLines: lists.returnReelLines,
    sampleRequests: lists.sampleRequests, indents: lists.indents, indentLines: lists.indentLines, purchaseOrders: lists.purchaseOrders,
    gateEntries: lists.gateEntries, schedules: lists.schedules, dispatchPlans: lists.dispatchPlans, loadingSlips: lists.loadingSlips,
    phpLoadingSlips: lists.phpLoadingSlips, plateLoadingSlips: lists.plateLoadingSlips, invoices: lists.invoices,
    invoiceLineItems: lists.invoiceLineItems, companies: lists.companies, gatePasses: lists.gatePasses, machines: lists.machines,
    processing: lists.processing, settings: lists.settings,
    resolveOrderItem, findItemAcrossSources, itemsBySource,
  });
}

export type OperationDashboardResult = {
  summary: OperationDashboardSummary;
  processingMachineCards: OperationDashboardMetricCard[];
  /** Pending task counts, each matching the row count of its pending page. */
  pendingCounts: Record<string, number>;
  exportRows?: Record<string, unknown>[];
};

function firstById<T, K>(rows: T[], getKey: (row: T) => K) {
  const index = new Map<K, T>();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!index.has(key)) index.set(key, row);
  });
  return index;
}

export function computeOperationDashboard(lists: OperationDashboardLists, options: OperationDashboardOptions): OperationDashboardResult {
  const {
    productions, firms, phpJobMaster, plateJobMaster, materials, materialIn, packingSlips, schedules, orders, companies,
    gateEntries, dispatchPlans, processing, loadingSlips, materialIssues, materialIssueLines, issueReelLines, materialReturns,
    materialReturnLines, returnReelLines, invoices, invoiceLineItems, consumptions, sampleRequests, indents, indentLines,
    purchaseOrders, phpLoadingSlips, plateLoadingSlips, gatePasses, machines, settings,
  } = lists;
  const { dateRange, closedJobFilter } = options;
  const npdItems = lists.npdFirmWiseRows.map(normalizeNpdItem);
  const { resolveOrderItem, findItem, findItemAcrossSources, itemsBySource } = createOrderItemCatalog({
    fgRows: lists.catalogFgRows,
    phpRows: lists.catalogPhpRows,
    plateRows: lists.catalogPlateRows,
    materialRows: lists.catalogMaterialRows,
  });

  const safeRange = (() => getSafeRange(dateRange))();
  const filteredProductions = (() => (safeRange ? productions.filter((entry) => isDateWithinRange(entry.date, safeRange)) : productions))();
  const processingTotalsMap = (() => {
    const map = new Map<string, ProcessingTotals>();
    processing.forEach((row) => {
      const totals = map.get(row.productionId) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
      const machineColumn = PROCESSING_MACHINE_COLUMNS.find((col) =>
        (col.machineNames as readonly string[]).includes(row.machineName)
      );
      if (machineColumn) totals[machineColumn.key] += Number(row.qty || 0);
      map.set(row.productionId, totals);
    });
    return map;
  })();
  const loadedQtyByProductionId = (() => {
    const map = new Map<string, number>();
    const getJobAllocations = (line: LoadingSlipLine) =>
      Array.isArray(line.allocations)
        ? line.allocations.filter((allocation) => allocation.sourceType === "job")
        : [];

    loadingSlips
      .filter((slip) => slip.status !== "Cancelled")
      .forEach((slip) => {
        slip.lines.forEach((line) => {
          getJobAllocations(line).forEach((allocation) => {
            map.set(allocation.jobId, (map.get(allocation.jobId) || 0) + Number(allocation.qty || 0));
          });
        });
      });
    return map;
  })();
  const erpLeastGsmMap = (() => {
    const map = new Map<string, number>();
    productions.forEach((p) => {
      if (p.status === "Cancelled" || p.cancelTimestamp) return;
      const erp = String(p.erpCode || "").trim();
      const gsm = Number(p.gsm || 0);
      if (erp && gsm > 0) {
        if (!map.has(erp) || gsm < map.get(erp)!) map.set(erp, gsm);
      }
    });
    return map;
  })();
  const filteredMaterialIssues = (() => (safeRange ? materialIssues.filter((entry) => isDateWithinRange(entry.date, safeRange)) : materialIssues))();
  const filteredMaterialReturns = (() => (safeRange ? materialReturns.filter((entry) => isDateWithinRange(entry.date, safeRange)) : materialReturns))();
  const productionUsageMap = (() => {
    return buildProductionMaterialUsageMap(
      filteredMaterialIssues,
      materialIssueLines,
      filteredMaterialReturns,
      materialReturnLines,
      issueReelLines,
      returnReelLines
    );
  })();
  const scrapInvoiceSummary = (() => {
    const scrapRows = buildScrapInvoiceRows({
      invoices,
      lineItems: invoiceLineItems,
      companies,
      filters: { fromDate: dateRange.from, toDate: dateRange.to },
      findItem,
      findItemAcrossSources,
    });
    return summarizeScrapInvoiceRows(scrapRows);
  })();

  const scheduleById = firstById(schedules, (s) => s.id);
  const orderById = firstById(orders, (o) => o.id);
  const companyById = firstById(companies, (c) => c.id);
  const npdItemById = firstById(npdItems, (i) => i.id);
  const rows: OperationRow[] = (() => {
    const sorted = filteredProductions
      .map((p) => {
        const schedule = scheduleById.get(p.scheduleId);
        const order = orderById.get(schedule?.orderId);
        const company = companyById.get(order?.companyId);
        const item = npdItemById.get(p.itemId);

        const processingTotals =
          processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
        const loadedQty = Number(loadedQtyByProductionId.get(p.id) || 0);
        const erp = String(p.erpCode || "").trim();
        const leastGsm = erp ? (erpLeastGsmMap.get(erp) ?? null) : null;

        const actualPaperUsed = getProductionActualPaperUsed(p, productionUsageMap);

        return {
          srNo: 0,
          production: p,
          item,
          schedule,
          order,
          company,
          processingTotals,
          loadedQty,
          leastGsm,
          actualPaperUsed,
        };
      })
      .filter((row) => {
        const isClosedJob = Boolean(row.production.closeDate || row.production.closeBy || row.production.status === "Completed");
        if (closedJobFilter === "yes" && !isClosedJob) return false;
        if (closedJobFilter === "no" && isClosedJob) return false;

        return true;
      })
      .sort((a, b) => b.production.transactionNo.localeCompare(a.production.transactionNo, undefined, { numeric: true, sensitivity: "base" }));

    return sorted.map((row, idx) => ({ ...row, srNo: idx + 1 }));
  })();

  const summary = (() =>
      buildOperationDashboardSummary({
        dateRange,
        productions,
        schedules,
        orders,
        dispatchPlans,
        loadingSlips,
        invoices,
        scrapSoldQty: scrapInvoiceSummary.totalQty,
        items: npdItems,
        materials,
        materialIn,
        packingSlips,
        processing,
        materialIssues,
        materialIssueLines,
        issueReelLines,
        materialReturns,
        materialReturnLines,
        returnReelLines,
      }))();

  const pendingCounts = (() => {
    const firmCounts = computePendingCounts(lists);
    if (!options.pendingLists) return firmCounts;
    const counts = computePendingCounts(options.pendingLists);
    FIRM_SCOPED_PENDING_KEYS.forEach((key) => { counts[key] = firmCounts[key] || 0; });
    return counts;
  })();

  const processingMachineCards = (() => {
    const machineMap = new Map<string, { qty: number; entries: number }>();

    processing
      .filter((entry) => (safeRange ? isDateWithinRange(entry.date, safeRange) : true))
      .forEach((entry) => {
        const machineName = normalizeMachineName(entry.machineName || "").trim();
        if (!machineName) return;
        const current = machineMap.get(machineName) || { qty: 0, entries: 0 };
        current.qty += Number(entry.qty || 0);
        current.entries += 1;
        machineMap.set(machineName, current);
      });

    const cards: OperationDashboardMetricCard[] = PROCESSING_MACHINE_CARD_ORDER.map((machineName) => {
      const totals = machineMap.get(machineName) || { qty: 0, entries: 0 };
      return {
        id: `processing-${machineName.toLowerCase().replace(/\s+/g, "-")}`,
        label: machineName,
        value: totals.qty,
        format: "number" as const,
        note: `${totals.entries} entr${totals.entries === 1 ? "y" : "ies"}`,
        status: "ready" as const,
      };
    });

    machineMap.forEach((totals, machineName) => {
      if (PROCESSING_MACHINE_CARD_ORDER.includes(machineName as (typeof PROCESSING_MACHINE_CARD_ORDER)[number])) return;
      cards.push({
        id: `processing-${machineName.toLowerCase().replace(/\s+/g, "-")}`,
        label: machineName,
        value: totals.qty,
        format: "number" as const,
        note: `${totals.entries} entr${totals.entries === 1 ? "y" : "ies"}`,
        status: "ready" as const,
      });
    });

    return cards;
  })();

  const exportRows = options.includeExportRows ? (() => {
    return rows.map((r) => ({
      "Sr. No.": r.srNo,
      "Job No.": r.production.transactionNo || "-",
      "Order No.": r.order?.orderNo || "-",
      "ERP Code": r.production.erpCode || "-",
      Company: r.company?.name || "-",
      "Plan Date": formatDate(r.production.date),
      "Item Name": r.item?.name || "-",
      Sample: (r.item as any)?.isSample ? "Yes" : "-",
      Type: (r.item as any)?.boxType || "-",
      "Planned Qty": `${r.production.qty ?? "-"} ${r.production.uom || ""}`.trim(),
      UPS: r.production.ups || (r.item as any)?.ups || "-",
      "Loaded Qty": r.loadedQty,
      Paper: r.processingTotals.paper,
      Liner: r.processingTotals.liner,
      Print: r.processingTotals.printing,
      Paste: r.processingTotals.pasting,
      Stitch: r.processingTotals.stitching,
      Punch: r.processingTotals.punching,
      Glue: r.processingTotals.gluing,
      L: r.production.length ?? "-",
      B: r.production.breadth ?? "-",
      H: r.production.height ?? "-",
      "L (OD)": r.item?.lOd ?? "-",
      "W (OD)": r.item?.wOd ?? "-",
      "H (OD)": r.item?.hOd ?? "-",
      Ply: r.production.ply ?? "-",
      Flute: r.production.flute ?? "-",
      L1: r.production.l1 || (r.item as any)?.l1 || "-",
      F1: r.production.f1 || (r.item as any)?.f1 || "-",
      L2: r.production.l2 || (r.item as any)?.l2 || "-",
      F2: r.production.f2 || (r.item as any)?.f2 || "-",
      L3: r.production.l3 || (r.item as any)?.l3 || "-",
      "L1 Paper": r.production.l1 ?? "-",
      GSM: r.production.gsm ?? "-",
      "Least GSM": r.leastGsm === null ? "-" : r.leastGsm,
      "Color 1": r.production.color1 ?? "-",
      "Color 2": r.production.color2 ?? "-",
      "Printing Color": r.production.printingColor ?? "-",
      "Total Wt": r.production.totalPaperWeight ?? "-",
      "Real/KG": Number(r.production.realizationPerKg || 0) ? Number(r.production.realizationPerKg || 0).toFixed(2) : "-",
      "Reel (Calc)": (r.production as any).reelAsPerCalc || "-",
      "Reel Trim": (r.production as any).reelActualWithTrimming || "-",
      "Cutting Trim": (r.production as any).cuttingWithTrimming || r.item?.cuttingSize || "-",
      "Planned Prod (M)": r.production.plannedProductionInMeter ?? "-",
      "Sheet Wt": r.production.sheetWeight || "-",
      "Flute Batch": r.production.fluteBatches || "-",
      Rate: Number(r.production.rate) ? Number(r.production.rate).toFixed(2) : (r.production.rate || "-"),
      Value: Number(r.production.qty || 0) && Number(r.production.rate || 0) ? (Number(r.production.qty || 0) * Number(r.production.rate || 0)).toLocaleString() : "-",
      "Production FFG": Number(r.production.prodFromFFG || 0),
      "Actual Paper (KG)": Number(r.actualPaperUsed.toFixed(2)),
      "Job Closer": r.production.closeBy || "-",
      "Close Date": r.production.closeDate || "-",
    }));
  })() : undefined;

  return { summary, processingMachineCards, pendingCounts, exportRows };
}
