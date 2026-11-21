import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Download, Eye, EyeOff, FileText, Search } from "lucide-react";
import { userDashboardName } from "../lib/dashboardName";
import { downloadSummaryExcel, downloadSummaryPdf, type SummaryExportInput } from "../lib/summarySheetExport";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { computeSummarySheetRows, isoDateText, n, s } from "../lib/reports/summarySheet";
import type { PreAppDispatch, SummaryRow } from "../lib/reports/summarySheet";
import { useServerReport } from "../hooks/useServerReport";
import { computeSummarySheetSections, type SalesTargetFigures, monthStartKey, localDayKey, summarySheetCellClass } from "../lib/reports/summarySheetTiles";
import type { SummarySheetExtras, SummaryTile, SummaryTileSection } from "../lib/reports/summarySheetTiles";
import { realizationCellClass } from "../lib/jobCellColors";
import { findRealizationTargetForDate, parseRealizationTargets } from "../lib/realizationTargets";
import { ClientPagination } from "../components/ClientPagination";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { displayJobNo } from "../lib/jobNumber";
import { useAuth } from "../auth/AuthContext";
import { refreshSummarySheetUserColumns, useSummarySheetUserColumns } from "../hooks/useSummarySheetUserColumns";
import { MultiSelect } from "../components/MultiSelect";
import type { Company, DispatchPlan, Firm, Invoice, InvoiceLineItem, LoadingSlip, Order, OrderSchedule, PreDispatchInspection, Production, ProductionProcessing, Setting, Truck } from "../types";

const COLUMNS = [
  // Keep the report readable in the same order users work through a job:
  // identity, production, dispatch/loading, stock/status, and finance/audit.
  "Sl No", "Job No.", "Date", "Party Name", "Item Name", "ERP",
  "Planned Qty", "Job Weight", "Meter", "Cutting Size", "UPS", "Sheets prdcd", "Plate per box",
  "Boardline Prod.", "Printing prod.", "PPR Rqd.", "PPR Used", "Paper Wastage", "Boardline Wastage", "Printing Wastage",
  "Realization / kg", "Actual Realization / kg",
  // Dispatch (invoiced, per invoice) 1-6, then Loading (slips) 1-6, then Invoice 1-6.
  "Total Dispatch", "Dispatch Qty 1", "Dispatch Date 1", "Dispatch Qty 2", "Dispatch Date 2", "Dispatch Qty 3", "Dispatch Date 3", "Dispatch Qty 4", "Dispatch Date 4", "Dispatch Qty 5", "Dispatch Date 5", "Dispatch Qty 6", "Dispatch Date 6",
  "Total Loading", "Loading No 1", "Loading Date 1", "Loading Qty 1", "Vehicle 1", "Loading No 2", "Loading Date 2", "Loading Qty 2", "Vehicle 2", "Loading No 3", "Loading Date 3", "Loading Qty 3", "Vehicle 3", "Loading No 4", "Loading Date 4", "Loading Qty 4", "Vehicle 4", "Loading No 5", "Loading Date 5", "Loading Qty 5", "Vehicle 5", "Loading No 6", "Loading Date 6", "Loading Qty 6", "Vehicle 6",
  "Total Invoice Value", "Invoice No. 1", "Invoice Value 1", "Invoice No. 2", "Invoice Value 2", "Invoice No. 3", "Invoice Value 3", "Invoice No. 4", "Invoice Value 4", "Invoice No. 5", "Invoice Value 5", "Invoice No. 6", "Invoice Value 6",
  "FG Stock", "FG LEFT", "Status", "Close Date", "Job Closed", "Remarks",
  "Board QC", "Print QC", "PDI REPORT", "COA",
  "Rate", "Sale Value", "wip value",
  "Customer Complaint", "Timestamp",
] as const;
const SUMMARY_SECTIONS = [
  { label: "JOB & PRODUCTION", start: "Sl No", end: "Actual Realization / kg" },
  { label: "DISPATCH & LOADING", start: "Total Dispatch", end: "Invoice Value 6" },
  { label: "STOCK & STATUS", start: "FG Stock", end: "Remarks" },
  { label: "QC & DOCUMENTS", start: "Board QC", end: "COA" },
  { label: "FINANCE & REMARKS", start: "Rate", end: "Timestamp" },
] as const;
const SUMMARY_SHEET_TABLES = ["productions", "production_processing", "orders", "orders_schedule", "dispatch_plans", "loading_slips", "invoices", "invoice_line_items", "trucks", "companies", "firms", "npd", "pre_app_dispatches", "pre_dispatch_inspections", "boardline_qc_checks", "printing_qc_checks"];
// Display names (the data keeps its field names, so saved column choices still match).
const COLUMN_DISPLAY: Record<string, string> = {};
const columnTitle = (column: string) => COLUMN_DISPLAY[column] || column;
const SUMMARY_HIDDEN_COLUMNS_KEY = "summary-sheet-hidden-columns";

const NUMERIC_COLUMNS = new Set([
  "Sl No", "Planned Qty", "Job Weight", "Meter", "UPS", "Sheets prdcd", "Plate per box", "Boardline Prod.", "Printing prod.",
  "PPR Rqd.", "PPR Used", "Paper Wastage", "Boardline Wastage", "Printing Wastage", "Realization / kg", "Actual Realization / kg",
  "Dispatched Qty", "Dispatched Qty (3 slips)", "Total Dispatch", "Dispatch Qty 1", "Dispatch Qty 2", "Dispatch Qty 3", "Dispatch Qty 4", "Dispatch Qty 5", "Dispatch Qty 6", "Invoice Value 4", "Invoice Value 5", "Invoice Value 6", "Total Loading", "Total Invoice Value", "Loading Qty 1", "Loading Qty 2", "Loading Qty 3", "Loading Qty 4", "Loading Qty 5", "Loading Qty 6", "FG Stock", "FG LEFT", "FINAL FG LEFT", "App Stock", "Rate",
  "Sale Value", "Sale Value (3 slips)", "Value", "App sale value", "Invoice Value 1", "Invoice Value 2", "Invoice Value 3", "wip value",
  "Pre-App Dispatched Qty", "Pre-App Sale Value", "Dispatched Qty incl. Pre-App", "Dispatched Qty incl. Pre-App (3 slips)", "Sale Value incl. Pre-App", "Sale Value incl. Pre-App (3 slips)",
]);
const CENTER_COLUMNS = new Set([
  "Date", "Dispatch Date", "Invoice Date 1", "Invoice Date 2", "Invoice Date 3", "Loading Date 1", "Loading Date 2", "Loading Date 3", "Loading Date 4", "Loading Date 5", "Loading Date 6",
  "Dispatch Date 1", "Dispatch Date 2", "Dispatch Date 3", "Dispatch Date 4", "Dispatch Date 5", "Dispatch Date 6",
  "Status", "Close Date", "Job Closed", "Dispatched From FG", "PDI REPORT",
  "Pre-App Invoice Date", "Invoice Date 1 incl. Pre-App",
]);
const DATE_COLUMNS = new Set([
  "Date", "Dispatch Date", "Invoice Date 1", "Invoice Date 2", "Invoice Date 3", "Loading Date 1", "Loading Date 2", "Loading Date 3", "Loading Date 4", "Loading Date 5", "Loading Date 6", "Close Date", "Timestamp",
  "Dispatch Date 1", "Dispatch Date 2", "Dispatch Date 3", "Dispatch Date 4", "Dispatch Date 5", "Dispatch Date 6",
  "Pre-App Invoice Date", "Invoice Date 1 incl. Pre-App",
]);
// Columns added up in the TOTAL row of the downloads (quantities and values, not rates).
const TOTAL_COLUMNS = new Set([
  "Planned Qty", "Job Weight", "Meter", "Sheets prdcd", "Boardline Prod.", "Printing prod.", "PPR Rqd.", "PPR Used",
  "Paper Wastage", "Boardline Wastage", "Printing Wastage",
  "Total Dispatch", "Dispatch Qty 1", "Dispatch Qty 2", "Dispatch Qty 3", "Dispatch Qty 4", "Dispatch Qty 5", "Dispatch Qty 6",
  "Total Loading", "Loading Qty 1", "Loading Qty 2", "Loading Qty 3", "Loading Qty 4", "Loading Qty 5", "Loading Qty 6",
  "Total Invoice Value", "Invoice Value 1", "Invoice Value 2", "Invoice Value 3", "Invoice Value 4", "Invoice Value 5", "Invoice Value 6",
  "FG Stock", "FG LEFT", "Sale Value", "wip value",
]);
const columnAlignment = (column: string) => NUMERIC_COLUMNS.has(column) ? "text-right" : CENTER_COLUMNS.has(column) ? "text-center" : "text-left";
const displayDate = (value: unknown) => {
  const iso = isoDateText(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

// "26-27/11053" -> "26-27/0000011053" so serials sort as numbers within a financial year.
const jobNoSortKey = (value: unknown) => {
  const shown = displayJobNo(value);
  const match = shown.match(/^(\d{2}-\d{2})\/(\d+)$/);
  return match ? `${match[1]}/${match[2].padStart(10, "0")}` : shown;
};

// "LNCB-2/JOB/26-27/11053" -> "11053" (other numbers are shown as they are).
const jobSerial = (value: unknown) => {
  const shown = displayJobNo(value);
  const match = shown.match(/^\d{2}-\d{2}\/(\d+)$/);
  return match ? match[1] : shown;
};

const isZeroDisplay = (value: unknown) => {
  if (typeof value === "number") return value === 0 || !Number.isFinite(value);
  const text = String(value ?? "").trim();
  return /^[₹\s]*[-+]?0+(?:[.,]0+)?\s*%?$/.test(text);
};

export function SummarySheetReport() {
  // Rows are calculated on the server; if it cannot, the lists are loaded and
  // calculated here as before. Jobs stay loaded for Close / Unclose.
  // Admin sees the full Summary Sheet. Everyone else sees it as "Dashboard": only the
  // filters and the table, with the columns Admin chose for them (no tiles, no column menu).
  const { user } = useAuth();
  // Users see their shared view as "<first name> Dashboard"; Admin sees the Summary Sheet.
  const pageTitle = user?.role === "Admin" ? "Summary Sheet" : userDashboardName(user);
  useEffect(() => {
    const previous = document.title;
    document.title = pageTitle;
    return () => { document.title = previous; };
  }, [pageTitle]);
  const isAdmin = user?.role === "Admin";
  const userSetup = useSummarySheetUserColumns(!isAdmin);
  const userColumnNames = isAdmin ? null : userSetup.columns;
  const reportAllowed = isAdmin || Boolean(userColumnNames?.length);
  const serverReport = useServerReport<SummaryRow[]>("summary-sheet", {}, SUMMARY_SHEET_TABLES, reportAllowed, { minRefreshMs: 60_000 });
  // Only Admin may fall back to working the report out in the browser (that downloads every table).
  const browserFallback = isAdmin && serverReport.failed;
  const extrasReport = useServerReport<SummarySheetExtras>("summary-sheet-tiles", {}, ["orders", "orders_schedule", "dispatch_plans", "loading_slips", "invoices", "invoice_line_items", "npd", "materials", "material_in", "material_issue_lines", "material_firm_openings", "php_job_master", "plate_job_master"], isAdmin, { minRefreshMs: 60_000 });
  // Live job status / closure / remarks: only these columns are downloaded
  // (the full jobs list is ~11 MB). The full list loads only to save a
  // Close / Unclose, or when the browser has to calculate the report itself.
  const [jobStatuses] = useData<Production>("productions", [], {
    firmScope: "all",
    storageKey: "summary-sheet-job-status",
    fields: ["status", "closeBy", "closeDate", "remarks", "date", "firmId", "firmName", "companyName", "transactionNo", "jobCardNo", "ffgTimestamp", "qty"],
    enabled: !browserFallback,
  });
  const [needFullJobs, setNeedFullJobs] = useState(false);
  const [fullProductions, setProductions, fullProductionsLoading] = useData<Production>("productions", [], { firmScope: "all", enabled: browserFallback || needFullJobs });
  const [closeOverrides, setCloseOverrides] = useState<Record<string, { closeBy: string; closeDate: string }>>({});
  const pendingCloseActions = useRef<Array<{ id: string; close: boolean }>>([]);
  const productions = useMemo(() => {
    const list = browserFallback ? fullProductions : jobStatuses;
    if (!Object.keys(closeOverrides).length) return list;
    return list.map((p) => closeOverrides[p.id] ? { ...p, ...closeOverrides[p.id] } : p);
  }, [browserFallback, closeOverrides, fullProductions, jobStatuses]);
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all", enabled: browserFallback });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", enabled: browserFallback });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", enabled: browserFallback });
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "summary-sheet-dispatch-plans", enabled: browserFallback });
  const [slips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "summary-sheet-loading-slips", enabled: browserFallback });
  const [invoices] = useData<Invoice>("invoices", [], { firmScope: "all", storageKey: "summary-sheet-invoices", enabled: browserFallback });
  const [invoiceLines] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all", storageKey: "summary-sheet-invoice-lines", enabled: browserFallback });
  const [trucks] = useData<Truck>("trucks", [], { firmScope: "all", enabled: browserFallback });
  const [preAppDispatches] = useData<PreAppDispatch>("pre_app_dispatches", [], { firmScope: "all", enabled: browserFallback });
  const [inspections] = useData<PreDispatchInspection>("pre_dispatch_inspections", [], { firmScope: "all", enabled: browserFallback });
  const [boardlineQc] = useData<any>("boardline_qc_checks", [], { firmScope: "all", enabled: browserFallback });
  const [printingQc] = useData<any>("printing_qc_checks", [], { firmScope: "all", enabled: browserFallback });
  const [companies] = useData<Company>("companies", [], { enabled: browserFallback });
  const [firms] = useData<Firm>("firms", []);
  const [settings] = useData<Setting>("settings", []);
  const stockItems = useNpdItems({ enabled: browserFallback });
  const realizationTargets = useMemo(() => parseRealizationTargets(settings[0]?.realizationPerKgTargets), [settings]);
  const [showTiles, setShowTiles] = useState(() => {
    try { return window.localStorage.getItem("summary-sheet-show-tiles") !== "no"; } catch { return true; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("summary-sheet-show-tiles", showTiles ? "yes" : "no"); } catch { /* storage blocked */ }
  }, [showTiles]);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setHeaderSlot(document.getElementById("page-header-actions")), []);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // From/To dates are shared and kept on the server, so they stay after a refresh.
  const datesLoaded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("authToken") || "";
    fetch("/api/summary-sheet-dates", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((saved) => {
        if (cancelled) return;
        if (saved) { setFrom(String(saved.from || "")); setTo(String(saved.to || "")); }
        datesLoaded.current = true;
      })
      .catch(() => { if (!cancelled) datesLoaded.current = true; });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!datesLoaded.current) return;
    if ((from && from.length !== 10) || (to && to.length !== 10)) return;
    const timer = window.setTimeout(() => {
      const token = localStorage.getItem("authToken") || "";
      fetch("/api/summary-sheet-dates", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ from, to: from && to && from > to ? "" : to }),
      }).catch(() => { /* kept on screen; saved next change */ });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [from, to]);
  // Target / Revised / Achieved / Short sales per day, pushed hourly from the Sales Analysis sheet.
  const [salesTargets, setSalesTargets] = useState<SalesTargetFigures | null>(null);
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("authToken") || "";
    fetch("/api/sales-targets", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((saved) => {
        if (cancelled || !saved || typeof saved.targetPerDay !== "number") return;
        setSalesTargets(saved as SalesTargetFigures);
      })
      .catch(() => { /* tiles stay blank */ });
    return () => { cancelled = true; };
  }, []);
  const [firmFilter, setFirmFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [closedFilter, setClosedFilter] = useState("Open"); // opens with open jobs only
  const [partyFilter, setPartyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  // Hidden columns are remembered in this browser by column name, so a new
  // column added later shows by default and the others stay as chosen.
  const [visibleColumns, setVisibleColumns] = useState<number[]>(() => {
    try {
      const hidden = new Set<string>(JSON.parse(window.localStorage.getItem(SUMMARY_HIDDEN_COLUMNS_KEY) || "[]"));
      return COLUMNS.map((_, index) => index).filter((index) => !hidden.has(COLUMNS[index]));
    } catch {
      return COLUMNS.map((_, index) => index);
    }
  });
  useEffect(() => {
    try {
      const shown = new Set(visibleColumns);
      window.localStorage.setItem(SUMMARY_HIDDEN_COLUMNS_KEY, JSON.stringify(COLUMNS.filter((_, index) => !shown.has(index))));
    } catch { /* storage blocked */ }
  }, [visibleColumns]);
  const [phoneTable, setPhoneTable] = useState(false); // phones: job cards by default, full table on request
  // Phone = narrow screen, or a touch phone opened as "Desktop site" (wide layout on a small screen).
  const detectPhone = () => {
    if (typeof window === "undefined") return false;
    const narrow = window.matchMedia("(max-width: 767px)").matches;
    const touchPhone = window.matchMedia("(pointer: coarse)").matches && Math.min(window.screen.width, window.screen.height) < 768;
    return narrow || touchPhone;
  };
  const [isPhone, setIsPhone] = useState(detectPhone);
  useEffect(() => {
    const update = () => setIsPhone(detectPhone());
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); };
  }, []);
  const showCards = isAdmin && isPhone && !phoneTable; // compact phone table (key columns + eye for details)
  const [detailRow, setDetailRow] = useState<SummaryRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const queueCloseAction = (id: string, close: boolean) => {
    // Show the change at once; save it on the full job record.
    setCloseOverrides((current) => ({ ...current, [id]: close ? { closeBy: "Yes", closeDate: new Date().toISOString().slice(0, 10) } : { closeBy: "", closeDate: "" } }));
    pendingCloseActions.current.push({ id, close });
    setNeedFullJobs(true);
  };
  // Only Admin closes / uncloses jobs (the server refuses it for everyone else too).
  const closeJob = (id: string) => { if (isAdmin) queueCloseAction(id, true); };
  const uncloseJob = (id: string) => { if (isAdmin) queueCloseAction(id, false); };
  useEffect(() => {
    if (!needFullJobs || fullProductionsLoading || !fullProductions.length || !pendingCloseActions.current.length) return;
    const actions = pendingCloseActions.current.splice(0);
    const byId = new Map(actions.map((action) => [action.id, action.close]));
    const now = new Date().toISOString();
    void setProductions((current) => current.map((p) => {
      if (!byId.has(p.id)) return p;
      return byId.get(p.id)
        ? { ...p, closeBy: "Yes", closeDate: now.slice(0, 10), updatedBy: "System User", updateTimestamp: now }
        : { ...p, closeBy: "", closeDate: "", updatedBy: "System User", updateTimestamp: now };
    }));
  }, [fullProductions, fullProductionsLoading, needFullJobs, setProductions]);

  const productionById = useMemo(() => new Map(productions.map((production) => [production.id, production])), [productions]);
  const clientBaseRows = useMemo<SummaryRow[]>(
    () => (browserFallback ? computeSummarySheetRows({ productions, processing, orders, schedules, plans, slips, invoices, invoiceLines, trucks, companies, firms, preAppDispatches, inspections, boardlineQc, printingQc }, stockItems) : []),
    [browserFallback, boardlineQc, printingQc, inspections, preAppDispatches, companies, firms, invoiceLines, invoices, orders, plans, processing, productions, schedules, slips, stockItems, trucks]
  );
  // Owner's rule (21-Nov-2026): the Summary Sheet shows only jobs dated
  // 17-Nov-2026 or later; older jobs were bulk-closed and are left out.
  const SUMMARY_SHEET_FIRST_JOB_DATE = "2026-11-17";
  const allBaseRows = browserFallback ? clientBaseRows : (serverReport.result || []);
  const baseRows = useMemo(() => allBaseRows.filter((row) => s(row.Date) >= SUMMARY_SHEET_FIRST_JOB_DATE), [allBaseRows]);

  const filteredRows = useMemo<SummaryRow[]>(() => {
    return baseRows.map((baseRow) => {
      // Job status and closure come from the live jobs list, so Close / Unclose
      // shows at once without waiting for the report to refresh.
      const production = productionById.get(s(baseRow.__productionId));
      if (!production) return baseRow;
      return {
        ...baseRow,
        // Stage comes from the report (worked out from the data); only closing / unclosing
        // here is applied at once. The saved status text is not used.
        Status: s(production.closeBy).toLowerCase() === "yes" && s(production.closeDate)
          ? "Job Closed"
          : s(baseRow.Status) === "Job Closed" ? "Pending Loading" : s(baseRow.Status),
        "Job Closed": s(production.closeBy).toLowerCase() === "yes" ? "Yes" : "",
        "Close Date": isoDateText(production.closeDate),
        Remarks: s(production.remarks),
      };
    }).filter((row) => {
      const production = productionById.get(s(row.__productionId));
      if (production?.status === "Cancelled") return false;
      if (statusFilter && s(row.Status) !== statusFilter) return false;
      const closed = s(production?.closeBy).toLowerCase() === "yes" && s(production?.closeDate);
      if (closedFilter === "Closed" && !closed) return false;
      if (closedFilter === "Open" && closed) return false;
      if (firmFilter && s(row.__firmName).toLowerCase() !== firmFilter.toLowerCase()) return false;
      const rowDate = s(row.Date);
      if (from && rowDate < from) return false;
      if (to && rowDate > to) return false;
      if (partyFilter && s(row["Party Name"]) !== partyFilter) return false;
      if (itemFilter && s(row["Item Name"]) !== itemFilter) return false;
      if (erpFilter && s(row.ERP) !== erpFilter) return false;
      return true;
    });
  }, [baseRows, closedFilter, erpFilter, firmFilter, from, itemFilter, partyFilter, productionById, statusFilter, to]);

  const selectedColumns = useMemo(() => {
    if (!isAdmin) {
      const allowed = new Set(userColumnNames || []);
      return COLUMNS.map((_, index) => index).filter((index) => index === 0 || allowed.has(COLUMNS[index]));
    }
    return visibleColumns.filter((index) => index >= 0 && index < COLUMNS.length);
  }, [isAdmin, userColumnNames, visibleColumns]);
  const [userColumnsOpen, setUserColumnsOpen] = useState(false);
  // Search matches the shown columns as the cells display them (Sl No skipped;
  // Job Closed only by its "Yes (date)" text, not the button).
  const rows = useTableSearch(filteredRows, search, (row) => selectedColumns.map((columnIndex) => {
    if (columnIndex === 0) return "";
    const column = COLUMNS[columnIndex];
    if (column === "Job Closed") return s(row["Job Closed"]) === "Yes" ? "Closed" : "";
    const value = row[column] ?? "";
    if (column === "Job No.") return `${jobSerial(value)} ${s(value)}`;
    return DATE_COLUMNS.has(column) ? displayDate(value) : value;
  }), [selectedColumns]);
  const selectedSections = useMemo(() => SUMMARY_SECTIONS.map((section) => {
    const start = COLUMNS.indexOf(section.start);
    const end = COLUMNS.indexOf(section.end);
    return { ...section, columns: selectedColumns.filter((index) => index >= start && index <= end) };
  }).filter((section) => section.columns.length), [selectedColumns]);
  // QC & documents: "Open" when the record exists, "Add" to create it (opens in a new tab).
  const [coaRecords] = useData<any>("coa-records", []);
  const coaIdByProduction = useMemo(() => { const map = new Map<string, { id: string; at: string }>(); coaRecords.forEach((record: any) => { const id = s(record.productionId); if (!id) return; const at = s(record.updateTimestamp); const current = map.get(id); if (!current || at > current.at) map.set(id, { id: s(record.id), at }); }); return map; }, [coaRecords]);
  const documentLink = (column: string, row: SummaryRow): React.ReactNode => {
    const jobNo = s(row["Job No."]);
    const productionId = s(row.__productionId);
    const link = (href: string, label: string, exists: boolean, title: string) => <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={`inline-block rounded px-2 py-0.5 text-[11px] font-black ${exists ? "border border-emerald-700 bg-emerald-50 text-emerald-800" : "border border-indigo-700 bg-indigo-700 text-white"}`}>{label}</a>;
    if (column === "Board QC") return s(row["Board QC"]) ? link(`#/quality/boardline-qc/master?job=${encodeURIComponent(jobNo)}`, "Open", true, "Boardline QC checks of this job") : link(`#/quality/boardline-qc/form?productionId=${encodeURIComponent(productionId)}`, "Add", false, "Add a Boardline QC check for this job");
    if (column === "Print QC") return s(row["Print QC"]) ? link(`#/quality/printing-qc/master?job=${encodeURIComponent(jobNo)}`, "Open", true, "Printing QC checks of this job") : link(`#/quality/printing-qc/form?productionId=${encodeURIComponent(productionId)}`, "Add", false, "Add a Printing QC check for this job");
    // PDI: the cell colour shows the result (green PASS / red FAIL); the button just says Open.
    if (column === "PDI REPORT") return s(row["PDI REPORT"]) ? link(`#/quality/pdi-report?job=${encodeURIComponent(jobNo)}`, "Open", true, `PDI: ${s(row["PDI REPORT"])} – open the PDI report of this job`) : link(`#/quality/pre-dispatch-inspection/form?productionId=${encodeURIComponent(productionId)}`, "Add", false, "Add the PDI for this job");
    if (column === "COA") { if (s(row["PDI REPORT"]) !== "QC PASS") return s(row["PDI REPORT"]) === "QC FAIL" ? <span className="font-bold text-red-600">No COA</span> : ""; const coa = coaIdByProduction.get(productionId); return coa ? link(`#/quality/coa/form/${encodeURIComponent(coa.id)}`, "Open", true, "Open the COA of this job") : link(`#/quality/coa/form?productionId=${encodeURIComponent(productionId)}`, "Add", false, "Generate the COA for this job"); }
    return null;
  };
  const DOCUMENT_COLUMNS = new Set(["Board QC", "Print QC", "PDI REPORT", "COA"]);
  const valueForColumn = (row: SummaryRow, columnIndex: number, rowIndex: number) => {
    if (columnIndex === 0) return rowIndex + 1;
    const column = COLUMNS[columnIndex];
    const value = row[column] ?? "";
    if (DATE_COLUMNS.has(column)) return displayDate(value);
    if (column === "Job No.") return jobSerial(value); // serial only: no firm / JOB / financial-year prefix
    // Zero values show as an empty cell (0, "0", "0.00", "₹ 0", "0%"...).
    if (isZeroDisplay(value)) return "";
    return value;
  };
  const filterOptions = useMemo(() => ({
    statuses: ["Pending Material Issue", "Pending Corrugation", "Pending Printing", "Pending Loading", "Pending Job Closure", "Job Closed"].filter((stage) => baseRows.some((r) => s(r.Status) === stage)),
    parties: [...new Set(rows.map((r) => s(r["Party Name"])).filter(Boolean))].sort(),
    items: [...new Set(rows.map((r) => s(r["Item Name"])).filter(Boolean))].sort(),
    erps: [...new Set(rows.map((r) => s(r.ERP)).filter(Boolean))].sort(),
  }), [baseRows, productions, rows]);
  // Header tiles like the Google Summary Sheet (rows 1-5): live job status,
  // firm filter only; range tiles use From-To (default this month).
  const tileRange = useMemo(() => ({ from: from || monthStartKey(), to: to || localDayKey(0) }), [from, to]);
  const tiles = useMemo(() => {
    const tileRows = baseRows.map((baseRow) => {
      const production = productionById.get(s(baseRow.__productionId));
      return production ? { ...baseRow, "Job Closed": s(production.closeBy).toLowerCase() === "yes" ? "Yes" : "" } : baseRow;
    }).filter((row) => {
      // Same filters as the table except the dates (they set the tiles' range).
      const production = productionById.get(s(row.__productionId));
      if (production?.status === "Cancelled") return false;
      if (firmFilter && s(row.__firmName).toLowerCase() !== firmFilter.toLowerCase()) return false;
      if (statusFilter && s(row.Status) !== statusFilter) return false;
      // Tiles ignore the Open/Closed filter (it now opens on "Open"), so they show what they showed before.
      if (partyFilter && s(row["Party Name"]) !== partyFilter) return false;
      if (itemFilter && s(row["Item Name"]) !== itemFilter) return false;
      if (erpFilter && s(row.ERP) !== erpFilter) return false;
      return true;
    });
    const firmNameById = new Map(firms.map((firm) => [firm.id, s(firm.firmName).toLowerCase()]));
    const cancelledDates = productions
      .filter((p) => p.status === "Cancelled" && (!firmFilter || (s((p as any).firmName).toLowerCase() || firmNameById.get(s(p.firmId))) === firmFilter.toLowerCase()))
      .filter((p) => !partyFilter || s((p as any).companyName) === partyFilter)
      .map((p) => isoDateText(p.date));
    const filters = { firm: firmFilter, party: partyFilter, item: itemFilter, erp: erpFilter };
    // WIP stock: jobs created whose FFG is not filled yet (same filters as the tiles).
    const wipJobs = tileRows.filter((row) => {
      const production = productionById.get(s(row.__productionId));
      return production && !s((production as any).ffgTimestamp);
    });
    const wip = productions.length ? { qty: wipJobs.reduce((sum, row) => sum + n(row["Planned Qty"]), 0), jobs: wipJobs.length } : null;
    return computeSummarySheetSections(tileRows, cancelledDates, tileRange, extrasReport.result || null, filters, Boolean(from || to), wip, new Date(), salesTargets);
  }, [salesTargets, baseRows, erpFilter, extrasReport.result, firmFilter, firms, from, itemFilter, partyFilter, productionById, productions, statusFilter, tileRange, to]);
  useEffect(() => setPage(1), [closedFilter, erpFilter, firmFilter, from, itemFilter, partyFilter, search, statusFilter, to, pageSize]);
  // Column sort over every searched row before paging (keys are column names); Sl No is not sortable.
  // Opens sorted by Date (oldest first), and by Job No. (lowest first) within a date.
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => {
    const column = key as (typeof COLUMNS)[number];
    if (column === "Job Closed") return s(row["Job Closed"]) === "Yes" ? isoDateText(row["Close Date"]) || "Yes" : "";
    const value = row[column] ?? "";
    // Date sorts by date, then job no. within the same date.
    if (column === "Date") return `${isoDateText(value)}|${jobNoSortKey(row["Job No."])}`;
    if (DATE_COLUMNS.has(column)) return isoDateText(value);
    if (column === "Job No.") return jobNoSortKey(value);
    return NUMERIC_COLUMNS.has(column) && s(value) !== "" ? n(value) : value;
  }, [], { key: "Date", direction: "asc" });

  // Open filter: every row on one page (no pagination). Closed / All Closure: paged as before.
  const showAllRows = closedFilter === "Open";
  // Open has thousands of jobs: draw the first ROW_BATCH and add more while scrolling
  // (drawing every row at once froze the browser for over a minute).
  const ROW_BATCH = 100;
  const [visibleCount, setVisibleCount] = useState(ROW_BATCH);
  useEffect(() => setVisibleCount(ROW_BATCH), [closedFilter, erpFilter, firmFilter, from, itemFilter, partyFilter, search, statusFilter, to, sort?.key, sort?.direction]);
  const moreSentinel = useRef<HTMLDivElement | null>(null);
  const hasMoreRows = showAllRows && visibleCount < sortedRows.length;
  useEffect(() => {
    const target = moreSentinel.current;
    if (!target || !hasMoreRows || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisibleCount((count) => count + ROW_BATCH);
    }, { rootMargin: "600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreRows, visibleCount]);
  const pagedRows = useMemo(() => showAllRows ? sortedRows.slice(0, visibleCount) : sortedRows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, showAllRows, sortedRows, visibleCount]);
  const rowOffset = showAllRows ? 0 : (page - 1) * pageSize;
  // Downloads: every filtered / searched / sorted row (not only the ones drawn), shown columns only.
  const [exporting, setExporting] = useState<"" | "excel" | "pdf">("");
  const buildExport = (): SummaryExportInput => {
    const exportColumns = selectedColumns.filter((index) => index > 0).map((index) => COLUMNS[index] as string);
    const exportRows = sortedRows;
    const shown = (row: SummaryRow, column: string, rowIndex: number): string => {
      if (column === "Job Closed") return s(row["Job Closed"]) === "Yes" ? `Yes${s(row["Close Date"]) ? ` (${displayDate(row["Close Date"])})` : ""}` : "";
      if (column === "COA") return coaIdByProduction.has(s(row.__productionId)) ? "Yes" : "";
      return s(valueForColumn(row, COLUMNS.indexOf(column as (typeof COLUMNS)[number]), rowIndex));
    };
    const label = (value: string) => value || "All";
    const range = from || to ? `${from ? displayDate(from) : "start"} to ${to ? displayDate(to) : "today"}` : "All dates";
    return {
      title: pageTitle,
      fileLabel: (from || to ? `${from || "start"}_to_${to || localDayKey(0)}` : `all_${localDayKey(0)}`).replace(/\//g, "-"),
      subtitle: [
        `Dates: ${range}`,
        `Firm: ${label(firmFilter)}`, `Status: ${label(statusFilter)}`, `Jobs: ${closedFilter || "All"}`,
        `Party: ${label(partyFilter)}`, `Item: ${label(itemFilter)}`, `ERP: ${label(erpFilter)}`,
        ...(search.trim() ? [`Search: ${search.trim()}`] : []),
        `${exportRows.length.toLocaleString("en-IN")} jobs`, `Downloaded ${new Date().toLocaleString("en-IN")}`,
      ],
      columns: exportColumns,
      sections: selectedSections.map((section) => ({ label: section.label, columns: section.columns.filter((index) => index > 0).map((index) => COLUMNS[index] as string) })),
      rowCount: exportRows.length,
      displayValue: (rowIndex, column) => shown(exportRows[rowIndex], column, rowIndex),
      numericValue: (rowIndex, column) => {
        const row = exportRows[rowIndex];
        if (!NUMERIC_COLUMNS.has(column) || shown(row, column, rowIndex) === "") return null;
        const value = n(row[column]);
        return Number.isFinite(value) ? value : null;
      },
      cellClass: (rowIndex, column) => {
        const row = exportRows[rowIndex];
        if (column === "Realization / kg") return realizationCellClass(row[column], findRealizationTargetForDate(realizationTargets, s(row.Date))?.value);
        return summarySheetCellClass(column, row);
      },
      totalColumns: TOTAL_COLUMNS,
      numericColumns: NUMERIC_COLUMNS,
    };
  };
  const runExport = async (kind: "excel" | "pdf") => {
    if (exporting || !sortedRows.length) return;
    setExporting(kind);
    try {
      // Let the button show "Preparing…" before the work starts.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const input = buildExport();
      if (kind === "excel") await downloadSummaryExcel(input);
      else await downloadSummaryPdf(input);
    } catch (error) {
      console.error("Summary Sheet download failed:", error);
      alert("Download failed. Please try again.");
    } finally {
      setExporting("");
    }
  };
  const clearFilters = () => { setSearch(""); setFrom(""); setTo(""); setFirmFilter(""); setStatusFilter(""); setClosedFilter(""); setPartyFilter(""); setItemFilter(""); setErpFilter(""); };
  const toggleColumn = (columnIndex: number) => setVisibleColumns((current) => current.includes(columnIndex) ? current.filter((index) => index !== columnIndex) : [...current, columnIndex].sort((a, b) => a - b));
  if (!isAdmin && (userSetup.loaded && !userColumnNames || serverReport.failed)) {
    return <div className="space-y-4 pb-8">
      <h2 className="border-b border-black pb-3 text-xl font-bold uppercase">{pageTitle}</h2>
      <div className="rounded border-2 border-black bg-amber-50 p-6 text-center text-sm font-bold text-amber-900">
        {serverReport.failed && userColumnNames ? `${pageTitle} could not be loaded. Please try again in a minute.` : `${pageTitle} is not set up for you yet. Please contact Admin.`}
      </div>
    </div>;
  }
  return <div className="space-y-4 pb-8">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black pb-3">
      <h2 className={`text-xl font-bold uppercase ${isAdmin ? "text-purple-700" : ""}`}>{pageTitle}</h2>
      <div data-header-action="true" className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
        <label className="min-w-0 text-[10px] font-black uppercase tracking-wide text-slate-600">From Date<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="mt-0.5 block h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold text-black" /></label>
        <label className="min-w-0 text-[10px] font-black uppercase tracking-wide text-slate-600">To Date<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="mt-0.5 block h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold text-black" /></label>
        {(from || to) ? <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold hover:bg-slate-100">Clear Dates</button> : null}
        <button type="button" data-export="excel" onClick={() => void runExport("excel")} disabled={Boolean(exporting) || !sortedRows.length} title="Download Excel (all rows matching the filters, shown columns)" className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded border-2 border-emerald-700 bg-white px-3 text-xs font-bold uppercase text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><Download size={15} />{exporting === "excel" ? "Preparing…" : "Excel"}</button>
        <button type="button" data-export="pdf" onClick={() => void runExport("pdf")} disabled={Boolean(exporting) || !sortedRows.length} title="Download PDF (all rows matching the filters, shown columns)" className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded border-2 border-red-700 bg-white px-3 text-xs font-bold uppercase text-red-700 hover:bg-red-50 disabled:opacity-40"><FileText size={15} />{exporting === "pdf" ? "Preparing…" : "PDF"}</button>
      </div>
    </div>
    {isAdmin && headerSlot ? createPortal(
      <button
        type="button"
        onClick={() => setShowTiles((value) => !value)}
        title={showTiles ? "Hide tiles" : "Show tiles"}
        aria-pressed={showTiles}
        className={`inline-flex items-center justify-center rounded border border-black p-2 transition ${showTiles ? "bg-indigo-700 text-white hover:bg-indigo-800" : "bg-white text-black hover:bg-slate-100"}`}
      >
        {showTiles ? <Eye size={18} /> : <EyeOff size={18} />}
      </button>,
      headerSlot,
    ) : null}
    {isAdmin && showTiles ? <div className="grid grid-cols-1 items-start gap-2 lg:grid-cols-2">{tiles.map((section) => <SummaryTileGroup key={section.id} section={section} />)}</div> : null}
    <div data-mf-panel="true" className="relative z-40 grid grid-cols-2 gap-2 rounded border border-black bg-white p-3 md:grid-cols-4 xl:grid-cols-6"><div className="relative col-span-2 xl:col-span-2"><Search className="absolute left-2 top-2.5 text-slate-500" size={16} /><input className="w-full rounded border border-black py-2 pl-8 pr-2" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="rounded border border-black p-2" value={firmFilter} onChange={(event) => setFirmFilter(event.target.value)}><option value="">All Firms</option>{firms.map((firm) => <option key={firm.id} value={firm.firmName}>{getFirmDisplayName(firm)}</option>)}</select><select className="rounded border border-black p-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Statuses</option>{filterOptions.statuses.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={closedFilter} onChange={(event) => setClosedFilter(event.target.value)}><option value="">All Closure</option><option value="Open">Open</option><option value="Closed">Closed</option></select><select className="rounded border border-black p-2" value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)}><option value="">All Parties</option>{filterOptions.parties.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}><option value="">All Items</option>{filterOptions.items.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={erpFilter} onChange={(event) => setErpFilter(event.target.value)}><option value="">All ERP</option>{filterOptions.erps.map((v) => <option key={v}>{v}</option>)}</select><button type="button" onClick={clearFilters} className="rounded border border-black px-3 py-2 font-bold">Clear Filters</button>{isAdmin ? <button type="button" onClick={() => setUserColumnsOpen(true)} className="rounded border border-black bg-indigo-700 px-3 py-2 font-bold text-white hover:bg-indigo-800">User Columns</button> : null}{isAdmin ? <details className="relative"><summary className="cursor-pointer rounded border border-black px-3 py-2 font-bold">Columns ({selectedColumns.length}/{COLUMNS.length})</summary><div className="absolute right-0 z-50 mt-1 max-h-96 w-72 overflow-auto rounded border-2 border-black bg-white p-3 shadow-lg"><div className="sticky -top-3 z-10 -mx-3 -mt-3 mb-2 flex gap-2 border-b border-black bg-white px-3 py-2"><button type="button" onClick={() => setVisibleColumns(COLUMNS.map((_, index) => index))} className="flex-1 rounded border-2 border-black bg-indigo-700 px-2 py-1 text-xs font-bold text-white hover:bg-indigo-800">Reset Columns</button><button type="button" onClick={() => setVisibleColumns([0, 1])} className="flex-1 rounded border-2 border-black bg-white px-2 py-1 text-xs font-bold hover:bg-slate-100">Hide All</button></div>{COLUMNS.map((column, index) => <label key={`${column}-${index}`} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={selectedColumns.includes(index)} onChange={() => toggleColumn(index)} /><span>{columnTitle(column)}</span></label>)}</div></details> : null}</div>
    {isAdmin && userColumnsOpen ? <SummaryUserColumnsDialog onClose={() => setUserColumnsOpen(false)} /> : null}
{isPhone && isAdmin ? <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-700">{rows.length.toLocaleString("en-IN")} jobs</span><button type="button" onClick={() => setPhoneTable((value) => !value)} className="rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-bold">{phoneTable ? "Short table" : "Show full table"}</button></div> : null}
{showCards ? <div className="overflow-x-auto rounded border-2 border-black bg-white" data-disable-table-pagination="true"><table className="w-full border-collapse text-[11px]"><thead><tr className="bg-[#0b4773] text-left text-white">{["Job", "Party / Item", "Status", "Plan", "Disp.", "FG Left", ""].map((heading) => <th key={heading} className={`border border-black px-1.5 py-1.5 font-black ${["Plan", "Disp.", "FG Left"].includes(heading) ? "text-right" : ""}`}>{heading}</th>)}</tr></thead><tbody>{pagedRows.length ? pagedRows.map((row, index) => { const dispatched = valueForColumn(row, COLUMNS.indexOf("Total Dispatch"), 0); return <tr key={`${row["Job No."]}-m-${index}`} className="align-top">
  <td className={`border border-black px-1.5 py-1 font-black ${summarySheetCellClass("Job No.", row)}`}><div className="whitespace-nowrap">{valueForColumn(row, COLUMNS.indexOf("Job No."), 0)}</div><div className="whitespace-nowrap text-[9px] font-semibold">{displayDate(row.Date)}</div></td>
  <td className="border border-black px-1.5 py-1"><div className="line-clamp-2 font-bold">{s(row["Party Name"]) || "—"}</div><div className="line-clamp-2 text-[10px] text-slate-600">{s(row["Item Name"]) || "—"}</div></td>
  <td className="border border-black px-1.5 py-1 text-[9.5px] font-bold uppercase leading-tight">{s(row.Status) || "—"}</td>
  <td className={`border border-black px-1.5 py-1 text-right font-bold ${summarySheetCellClass("Planned Qty", row)}`}>{s(valueForColumn(row, COLUMNS.indexOf("Planned Qty"), 0))}</td>
  <td className={`border border-black px-1.5 py-1 text-right font-bold ${summarySheetCellClass("Total Dispatch", row)}`}>{s(dispatched) ? <a href={`#/quality/pdi-report?job=${encodeURIComponent(s(row["Job No."]))}`} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">{dispatched}</a> : ""}</td>
  <td className={`border border-black px-1.5 py-1 text-right font-bold ${summarySheetCellClass("FG LEFT", row)}`}>{s(valueForColumn(row, COLUMNS.indexOf("FG LEFT"), 0))}</td>
  <td className="border border-black px-1 py-1 text-center"><button type="button" onClick={() => setDetailRow(row)} title="View all details" aria-label="View all details" className="inline-flex h-7 w-7 items-center justify-center rounded border border-black bg-white text-indigo-700"><Eye size={14} /></button></td>
</tr>; }) : <tr><td colSpan={7} className="p-6 text-center text-sm">No summary rows found.</td></tr>}</tbody></table></div> : null}
{detailRow ? (() => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(detailRow["Job No."])); const closed = s(detailRow["Job Closed"]) === "Yes"; return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Job details" onClick={() => setDetailRow(null)}><div className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-t-xl border-2 border-black bg-white sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
  <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2"><div className="min-w-0"><div className="text-sm font-black">Job {valueForColumn(detailRow, COLUMNS.indexOf("Job No."), 0)} · {displayDate(detailRow.Date)}</div><div className="truncate text-xs font-bold text-slate-600">{s(detailRow["Party Name"])}</div></div><button type="button" onClick={() => setDetailRow(null)} className="rounded border-2 border-black px-3 py-1 text-xs font-bold">Close</button></div>
  <div className="max-h-[66vh] overflow-y-auto"><table className="w-full border-collapse text-xs"><tbody>{selectedColumns.filter((columnIndex) => columnIndex > 0 && COLUMNS[columnIndex] !== "Job Closed").map((columnIndex) => { const column = COLUMNS[columnIndex]; const value = s(valueForColumn(detailRow, columnIndex, 0)); return <tr key={column}><th className="w-[45%] border border-slate-300 bg-slate-50 px-2 py-1 text-left text-[10px] font-black uppercase text-slate-600">{columnTitle(column)}</th><td className={`border border-slate-300 px-2 py-1 font-semibold ${summarySheetCellClass(column, detailRow)}`}>{DOCUMENT_COLUMNS.has(column) && s(detailRow.__productionId) ? documentLink(column, detailRow) : value || "—"}</td></tr>; })}</tbody></table></div>
  {production && isAdmin ? <div className="flex justify-end gap-2 border-t-2 border-black px-3 py-2">{closed ? <button type="button" onClick={() => { uncloseJob(production.id); setDetailRow(null); }} className="rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">Unclose Job</button> : <button type="button" onClick={() => { closeJob(production.id); setDetailRow(null); }} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Close Job</button>}</div> : null}
</div></div>; })() : null}
{showCards ? null : <div className="overflow-auto rounded border-2 border-black bg-white" {...(showAllRows ? { "data-disable-table-pagination": "true" } : {})}><table className="min-w-[1200px] border-collapse text-[11px]"><thead><tr>{selectedSections.map((section) => <th key={section.label} colSpan={section.columns.length} className="whitespace-nowrap border border-black bg-[#24165f] px-2 py-2 text-center font-black text-white">{section.label}</th>)}</tr><tr className="bg-[#0b4773] text-white">{selectedColumns.map((columnIndex) => <th key={`${COLUMNS[columnIndex]}-${columnIndex}`} className={`whitespace-nowrap border border-black px-2 py-2 font-black ${columnAlignment(COLUMNS[columnIndex])}`}>{columnIndex === 0 ? COLUMNS[columnIndex] : <SortHeader label={columnTitle(COLUMNS[columnIndex])} sortKey={COLUMNS[columnIndex]} sort={sort} onToggle={toggleSort} align={NUMERIC_COLUMNS.has(COLUMNS[columnIndex]) ? "right" : CENTER_COLUMNS.has(COLUMNS[columnIndex]) ? "center" : "left"} />}</th>)}</tr></thead><tbody>{pagedRows.length ? pagedRows.map((row, index) => { const target = findRealizationTargetForDate(realizationTargets, row.Date)?.value; return <tr key={s(row.__productionId) || `${row["Job No."]}-${index}`}>{selectedColumns.map((columnIndex) => { const column = COLUMNS[columnIndex]; const rowColorClass = column === "Realization / kg" ? realizationCellClass(row[column], target) : summarySheetCellClass(column, row); return <td key={`${column}-${columnIndex}`} className={`${column === "Remarks" ? "min-w-[180px] max-w-[280px] whitespace-normal break-words" : "whitespace-nowrap"} border border-black px-2 py-2 ${columnAlignment(column)} ${rowColorClass}`}>{column === "Job Closed" && !isAdmin ? (s(row["Job Closed"]) === "Yes" ? `Yes${s(row["Close Date"]) ? ` (${displayDate(row["Close Date"])})` : ""}` : "") : column === "Job Closed" ? s(row["Job Closed"]) === "Yes" ? <div><button type="button" onClick={() => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(row["Job No."])); if (production) uncloseJob(production.id); }} className="rounded bg-amber-600 px-2 py-1 font-bold text-white">Unclose Job</button></div> : <button type="button" onClick={() => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(row["Job No."])); if (production) closeJob(production.id); }} className="rounded bg-emerald-600 px-2 py-1 font-bold text-white">Close Job</button> : DOCUMENT_COLUMNS.has(column) && s(row.__productionId) ? documentLink(column, row) : column === "Total Dispatch" && s(valueForColumn(row, columnIndex, rowOffset + index)) ? <a href={`#/quality/pdi-report?job=${encodeURIComponent(s(row["Job No."]))}`} target="_blank" rel="noopener noreferrer" title="Open PDI report for this job" className="font-bold underline decoration-dotted underline-offset-2">{valueForColumn(row, columnIndex, rowOffset + index)}</a> : valueForColumn(row, columnIndex, rowOffset + index)}</td>; })}</tr>; }) : <tr><td colSpan={selectedColumns.length || 1} className="bg-[#eaf2f8] p-8 text-center">No summary rows found.</td></tr>}</tbody></table></div>}
{showAllRows && sortedRows.length ? <div ref={moreSentinel} className="flex items-center justify-center gap-3 py-2 text-xs font-bold text-slate-600"><span>Showing {Math.min(visibleCount, sortedRows.length).toLocaleString("en-IN")} of {sortedRows.length.toLocaleString("en-IN")} jobs</span>{hasMoreRows ? <button type="button" onClick={() => setVisibleCount((count) => count + 500)} className="rounded border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black hover:bg-slate-100">Show more</button> : null}</div> : null}{showAllRows ? null : <ClientPagination page={page} pageSize={pageSize} totalItems={rows.length} onPageChange={setPage} onPageSizeChange={setPageSize} />}
  </div>;
}

const formatTileValue = (tile: SummaryTile) => {
  if (tile.value === null) return "";
  if (tile.format === "percent") return `${tile.value.toFixed(2)}%`;
  if (tile.format === "rate") return `₹ ${tile.value.toFixed(2)}`;
  if (tile.format === "money") return `₹ ${Math.round(tile.value).toLocaleString("en-IN")}`;
  if (tile.format === "count") return tile.value.toLocaleString("en-IN");
  return Number(tile.value.toFixed(2)).toLocaleString("en-IN");
};

function SummaryTileGroup({ section }: { section: SummaryTileSection }) {
  return (
    <section className="overflow-hidden rounded-md border-2 border-black bg-white shadow-[2px_2px_0_0_rgba(15,23,42,1)]">
      <div className="flex items-center justify-between border-b-2 border-black bg-[#0c343d] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
        <span>{section.title}</span>
      </div>
      <div className={section.columns === 4 ? "grid grid-cols-2 sm:grid-cols-4" : section.columns === 5 ? "grid grid-cols-2 sm:grid-cols-5" : section.columns === 6 ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" : "grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(128px,1fr))]"}>
        {section.tiles.map((tile) => (
          <div
            key={tile.id}
            className={`flex min-h-[54px] flex-col justify-between border-b border-r border-black/40 px-2 py-1.5 ${tile.tone}`}
            title={tile.value === null ? `${tile.label}: not recorded in the app yet` : tile.note ? `${tile.label}: ${tile.note}` : tile.label}
          >
            <div className="line-clamp-2 text-[9.5px] font-black uppercase leading-[1.15] tracking-wide">{tile.label}</div>
            <div className={`mt-1 truncate text-[15px] font-black leading-none ${tile.value === null ? "opacity-40" : ""}`}>{tile.value === null ? "—" : formatTileValue(tile)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Admin: choose which Summary Sheet columns each user sees on their "Dashboard". */
function SummaryUserColumnsDialog({ onClose }: { onClose: () => void }) {
  const [users] = useData<any>("users", [], { firmScope: "all" });
  const setup = useSummarySheetUserColumns();
  const [userIds, setUserIds] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // "Copy" on a user with a Dashboard fills the columns from them without selecting them,
  // so the copy can be changed and saved for other users while theirs stays as it is.
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const choosable = COLUMNS.slice(1); // Sl No is always shown
  const userOptions = useMemo(() => users
    .filter((entry: any) => entry?.id && entry.role !== "Admin" && entry.role !== "TruckDriver")
    .map((entry: any) => ({ value: String(entry.id), label: `${entry.name || entry.userId || entry.id}${entry.userId && entry.name ? ` (${entry.userId})` : ""}${entry.status === "Inactive" ? " – Inactive" : ""}`, searchText: `${entry.name || ""} ${entry.userId || ""} ${entry.mobile || ""}` }))
    .sort((a: any, b: any) => a.label.localeCompare(b.label)), [users]);
  const userLabel = (id: string) => userOptions.find((option: any) => option.value === id)?.label || id;
  const configured = Object.entries(setup.users || {}).sort((a, b) => userLabel(a[0]).localeCompare(userLabel(b[0])));
  // Picking users loads the first one's setup, so it can be checked and changed.
  const chooseUsers = (ids: string[]) => {
    setUserIds(ids);
    setMessage("");
    if (copiedFrom) return; // keep the copied columns whatever users are picked
    const existing = setup.users?.[ids[0]];
    if (ids.length && !userIds.length && existing?.length) setColumns(existing);
    if (!ids.length) setColumns([]);
  };
  const toggle = (column: string) => setColumns((current) => current.includes(column) ? current.filter((entry) => entry !== column) : [...current, column]);
  const save = async (nextColumns: string[]) => {
    if (!userIds.length) { setMessage("Select at least one user."); return; }
    setSaving(true);
    setMessage("");
    try {
      const token = localStorage.getItem("authToken") || "";
      const response = await fetch("/api/summary-sheet-user-columns", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userIds, columns: COLUMNS.filter((column) => nextColumns.includes(column)) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to save.");
      await refreshSummarySheetUserColumns();
      setColumns(nextColumns);
      setCopiedFrom(null);
      setMessage(nextColumns.length ? `Saved for ${userIds.length} user${userIds.length > 1 ? "s" : ""}.` : `Dashboard removed for ${userIds.length} user${userIds.length > 1 ? "s" : ""}.`);
    } catch (error) {
      setMessage((error as Error).message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  };
  return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded border-2 border-black bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b-2 border-black px-4 py-3">
        <div><div className="text-lg font-black uppercase">User Columns (Dashboard)</div><div className="text-xs font-semibold text-slate-600">Users see only the filters and the table, with the columns ticked here. No setup = no Dashboard.</div></div>
        <button type="button" onClick={onClose} className="rounded border-2 border-black px-3 py-1 text-sm font-bold hover:bg-slate-100">Close</button>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-3">
          <div><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Users</span><MultiSelect value={userIds} onChange={chooseUsers} options={userOptions} placeholder="Select users..." /></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase text-slate-700">Columns: {columns.length} shown / {choosable.length - columns.length} hidden</span>
            <button type="button" onClick={() => setColumns([...choosable])} className="rounded border-2 border-black px-2 py-1 text-xs font-bold hover:bg-slate-100">Select all</button>
            <button type="button" onClick={() => setColumns([])} className="rounded border-2 border-black px-2 py-1 text-xs font-bold hover:bg-slate-100">Clear</button>
          </div>
          {copiedFrom ? <div className="flex flex-wrap items-center gap-2 rounded border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-xs font-bold text-indigo-900">
            <span>Copied from {userLabel(copiedFrom)} ({(setup.users?.[copiedFrom] || []).length} cols). Pick the new users above, tick any extra columns, then Save.</span>
            <button type="button" onClick={() => { setCopiedFrom(null); setColumns(userIds.length ? setup.users?.[userIds[0]] || [] : []); }} className="ml-auto rounded border border-indigo-700 bg-white px-2 py-0.5 text-[11px] font-black text-indigo-700 hover:bg-indigo-100">Cancel copy</button>
          </div> : null}
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {choosable.map((column) => {
              const shown = columns.includes(column);
              return <label key={column} className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs ${shown ? "border-emerald-600 bg-emerald-50" : "border-slate-300 bg-white"}`}>
                <span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={shown} onChange={() => toggle(column)} className="accent-emerald-600" /><span className="truncate font-semibold">{columnTitle(column)}</span></span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${shown ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{shown ? "Shown" : "Hidden"}</span>
              </label>;
            })}
          </div>
          {columns.length && !columns.includes("Job Closed") ? <div className="text-[11px] font-semibold text-slate-600">Tip: tick "Job Closed" if these users should be able to Close / Unclose jobs.</div> : null}
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-600">Users with a Dashboard ({configured.length})</div>
          <div className="space-y-1">
            {configured.length ? configured.map(([id, list]) => <div key={id} className="flex items-stretch gap-1">
              <button type="button" onClick={() => { setCopiedFrom(null); setUserIds([id]); setColumns(list); setMessage(""); }} title="Edit this user's columns" className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${!copiedFrom && userIds.length === 1 && userIds[0] === id ? "border-indigo-700 bg-indigo-50" : "border-slate-300"}`}><span className="truncate font-bold">{userLabel(id)}</span><span className="shrink-0 font-black text-emerald-700">{list.length} cols</span></button>
              <button type="button" onClick={() => { setCopiedFrom(id); setUserIds([]); setColumns(list); setMessage(""); }} title={`Copy ${userLabel(id)}'s columns for new users`} className={`shrink-0 rounded border px-2 text-[11px] font-black ${copiedFrom === id ? "border-indigo-700 bg-indigo-700 text-white" : "border-indigo-700 bg-white text-indigo-700 hover:bg-indigo-50"}`}>Copy</button>
            </div>) : <div className="text-xs text-slate-500">No user has a Dashboard yet.</div>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-black px-4 py-3">
        {message ? <span className="mr-auto text-xs font-bold text-slate-700">{message}</span> : null}
        <button type="button" disabled={saving || !userIds.length} onClick={() => void save([])} className="rounded border-2 border-red-700 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40">Remove Dashboard</button>
        <button type="button" disabled={saving || !userIds.length || !columns.length} onClick={() => void save(columns)} className="rounded border-2 border-black bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">{saving ? "Saving…" : `Save for ${userIds.length || 0} user${userIds.length === 1 ? "" : "s"}`}</button>
      </div>
    </div>
  </div>;
}
