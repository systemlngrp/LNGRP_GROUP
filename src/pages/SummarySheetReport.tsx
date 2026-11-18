import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Eye, EyeOff, Search } from "lucide-react";
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
import type { Company, DispatchPlan, Firm, Invoice, InvoiceLineItem, LoadingSlip, Order, OrderSchedule, PreDispatchInspection, Production, ProductionProcessing, Setting, Truck } from "../types";

const COLUMNS = [
  // Keep the report readable in the same order users work through a job:
  // identity, production, dispatch/loading, stock/status, and finance/audit.
  "Sl No", "Job No.", "Date", "Party Name", "Item Name", "ERP",
  "Planned Qty", "Job Weight", "Meter", "Cutting Size", "UPS", "Sheets prdcd", "Plate per box",
  "Boardline Prod.", "Printing prod.", "PPR Rqd.", "PPR Used", "Paper Wastage", "Boardline Wastage", "Printing Wastage",
  "Realization / kg", "Actual Realization / kg",
  "Dispatched Qty", "Dispatched Qty (3 slips)", "Total Dispatch", "Total Loading", "Total Invoice Value", "Invoice No", "Dispatch Date", "Vehicle No", "App Stock", "Invoice Value 1", "Invoice Value 2", "Invoice Value 3",
  "Invoice No. 1", "Invoice Date 1", "Invoice No. 2", "Invoice Date 2", "Invoice No. 3", "Invoice Date 3",
  "Loading No 1", "Loading Date 1", "Loading Qty 1", "Vehicle 1", "Loading No 2", "Loading Date 2", "Loading Qty 2", "Vehicle 2", "Loading No 3", "Loading Date 3", "Loading Qty 3", "Vehicle 3",
  "Loading No 4", "Loading Date 4", "Loading Qty 4", "Vehicle 4", "Loading No 5", "Loading Date 5", "Loading Qty 5", "Vehicle 5",
  "Loading No 6", "Loading Date 6", "Loading Qty 6", "Vehicle 6",
  "FG Stock", "FG LEFT", "FINAL FG LEFT", "Dispatched From FG", "Status", "Close Date", "Job Closed", "Remarks",
  "Rate", "Sale Value", "Sale Value (3 slips)", "Value", "App sale value", "wip value",
  "Pre-App Loading No", "Pre-App Invoice No", "Pre-App Invoice Date", "Pre-App Dispatched Qty", "Pre-App Sale Value",
  "Dispatched Qty incl. Pre-App", "Dispatched Qty incl. Pre-App (3 slips)", "Sale Value incl. Pre-App", "Sale Value incl. Pre-App (3 slips)", "Invoice Date 1 incl. Pre-App",
  "Customer Complaint", "PDI REPORT", "Timestamp",
] as const;
const SUMMARY_SECTIONS = [
  { label: "JOB & PRODUCTION", start: "Sl No", end: "Actual Realization / kg" },
  { label: "DISPATCH & LOADING", start: "Dispatched Qty", end: "Vehicle 6" },
  { label: "STOCK & STATUS", start: "FG Stock", end: "Remarks" },
  { label: "FINANCE & REMARKS", start: "Rate", end: "Timestamp" },
] as const;
const SUMMARY_SHEET_TABLES = ["productions", "production_processing", "orders", "orders_schedule", "dispatch_plans", "loading_slips", "invoices", "invoice_line_items", "trucks", "companies", "firms", "npd", "pre_app_dispatches", "pre_dispatch_inspections", "boardline_qc_checks", "printing_qc_checks"];
const SUMMARY_HIDDEN_COLUMNS_KEY = "summary-sheet-hidden-columns";

const NUMERIC_COLUMNS = new Set([
  "Sl No", "Planned Qty", "Job Weight", "Meter", "UPS", "Sheets prdcd", "Plate per box", "Boardline Prod.", "Printing prod.",
  "PPR Rqd.", "PPR Used", "Paper Wastage", "Boardline Wastage", "Printing Wastage", "Realization / kg", "Actual Realization / kg",
  "Dispatched Qty", "Dispatched Qty (3 slips)", "Total Dispatch", "Total Loading", "Total Invoice Value", "Loading Qty 1", "Loading Qty 2", "Loading Qty 3", "Loading Qty 4", "Loading Qty 5", "Loading Qty 6", "FG Stock", "FG LEFT", "FINAL FG LEFT", "App Stock", "Rate",
  "Sale Value", "Sale Value (3 slips)", "Value", "App sale value", "Invoice Value 1", "Invoice Value 2", "Invoice Value 3", "wip value",
  "Pre-App Dispatched Qty", "Pre-App Sale Value", "Dispatched Qty incl. Pre-App", "Dispatched Qty incl. Pre-App (3 slips)", "Sale Value incl. Pre-App", "Sale Value incl. Pre-App (3 slips)",
]);
const CENTER_COLUMNS = new Set([
  "Date", "Dispatch Date", "Invoice Date 1", "Invoice Date 2", "Invoice Date 3", "Loading Date 1", "Loading Date 2", "Loading Date 3", "Loading Date 4", "Loading Date 5", "Loading Date 6",
  "Status", "Close Date", "Job Closed", "Dispatched From FG", "PDI REPORT",
  "Pre-App Invoice Date", "Invoice Date 1 incl. Pre-App",
]);
const DATE_COLUMNS = new Set([
  "Date", "Dispatch Date", "Invoice Date 1", "Invoice Date 2", "Invoice Date 3", "Loading Date 1", "Loading Date 2", "Loading Date 3", "Loading Date 4", "Loading Date 5", "Loading Date 6", "Close Date", "Timestamp",
  "Pre-App Invoice Date", "Invoice Date 1 incl. Pre-App",
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
  const serverReport = useServerReport<SummaryRow[]>("summary-sheet", {}, SUMMARY_SHEET_TABLES, true, { minRefreshMs: 60_000 });
  const browserFallback = serverReport.failed;
  const extrasReport = useServerReport<SummarySheetExtras>("summary-sheet-tiles", {}, ["orders", "orders_schedule", "dispatch_plans", "loading_slips", "invoices", "invoice_line_items", "npd", "materials", "material_in", "material_issue_lines", "material_firm_openings", "php_job_master", "plate_job_master"], true, { minRefreshMs: 60_000 });
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
  const showCards = isPhone && !phoneTable;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const queueCloseAction = (id: string, close: boolean) => {
    // Show the change at once; save it on the full job record.
    setCloseOverrides((current) => ({ ...current, [id]: close ? { closeBy: "Yes", closeDate: new Date().toISOString().slice(0, 10) } : { closeBy: "", closeDate: "" } }));
    pendingCloseActions.current.push({ id, close });
    setNeedFullJobs(true);
  };
  const closeJob = (id: string) => queueCloseAction(id, true);
  const uncloseJob = (id: string) => queueCloseAction(id, false);
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
  const baseRows = browserFallback ? clientBaseRows : (serverReport.result || []);

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

  const selectedColumns = useMemo(() => visibleColumns.filter((index) => index >= 0 && index < COLUMNS.length), [visibleColumns]);
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
  const pagedRows = useMemo(() => showAllRows ? sortedRows : sortedRows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, showAllRows, sortedRows]);
  const rowOffset = showAllRows ? 0 : (page - 1) * pageSize;
  const clearFilters = () => { setSearch(""); setFrom(""); setTo(""); setFirmFilter(""); setStatusFilter(""); setClosedFilter(""); setPartyFilter(""); setItemFilter(""); setErpFilter(""); };
  const toggleColumn = (columnIndex: number) => setVisibleColumns((current) => current.includes(columnIndex) ? current.filter((index) => index !== columnIndex) : [...current, columnIndex].sort((a, b) => a - b));
  return <div className="space-y-4 pb-8">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black pb-3">
      <h2 className="text-xl font-bold uppercase">Summary Sheet</h2>
      <div data-header-action="true" className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
        <label className="min-w-0 text-[10px] font-black uppercase tracking-wide text-slate-600">From Date<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="mt-0.5 block h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold text-black" /></label>
        <label className="min-w-0 text-[10px] font-black uppercase tracking-wide text-slate-600">To Date<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="mt-0.5 block h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold text-black" /></label>
        {(from || to) ? <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold hover:bg-slate-100">Clear Dates</button> : null}
      </div>
    </div>
    {headerSlot ? createPortal(
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
    {showTiles ? <div className="grid grid-cols-1 items-start gap-2 lg:grid-cols-2">{tiles.map((section) => <SummaryTileGroup key={section.id} section={section} />)}</div> : null}
    <div data-mf-panel="true" className="relative z-40 grid grid-cols-2 gap-2 rounded border border-black bg-white p-3 md:grid-cols-4 xl:grid-cols-6"><div className="relative col-span-2 xl:col-span-2"><Search className="absolute left-2 top-2.5 text-slate-500" size={16} /><input className="w-full rounded border border-black py-2 pl-8 pr-2" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="rounded border border-black p-2" value={firmFilter} onChange={(event) => setFirmFilter(event.target.value)}><option value="">All Firms</option>{firms.map((firm) => <option key={firm.id} value={firm.firmName}>{getFirmDisplayName(firm)}</option>)}</select><select className="rounded border border-black p-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Statuses</option>{filterOptions.statuses.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={closedFilter} onChange={(event) => setClosedFilter(event.target.value)}><option value="">All Closure</option><option value="Open">Open</option><option value="Closed">Closed</option></select><select className="rounded border border-black p-2" value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)}><option value="">All Parties</option>{filterOptions.parties.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}><option value="">All Items</option>{filterOptions.items.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={erpFilter} onChange={(event) => setErpFilter(event.target.value)}><option value="">All ERP</option>{filterOptions.erps.map((v) => <option key={v}>{v}</option>)}</select><button type="button" onClick={clearFilters} className="rounded border border-black px-3 py-2 font-bold">Clear Filters</button><details className="relative"><summary className="cursor-pointer rounded border border-black px-3 py-2 font-bold">Columns ({selectedColumns.length}/{COLUMNS.length})</summary><div className="absolute right-0 z-50 mt-1 max-h-96 w-72 overflow-auto rounded border-2 border-black bg-white p-3 shadow-lg"><div className="sticky -top-3 z-10 -mx-3 -mt-3 mb-2 flex gap-2 border-b border-black bg-white px-3 py-2"><button type="button" onClick={() => setVisibleColumns(COLUMNS.map((_, index) => index))} className="flex-1 rounded border-2 border-black bg-indigo-700 px-2 py-1 text-xs font-bold text-white hover:bg-indigo-800">Reset Columns</button><button type="button" onClick={() => setVisibleColumns([0, 1])} className="flex-1 rounded border-2 border-black bg-white px-2 py-1 text-xs font-bold hover:bg-slate-100">Hide All</button></div>{COLUMNS.map((column, index) => <label key={`${column}-${index}`} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={selectedColumns.includes(index)} onChange={() => toggleColumn(index)} /><span>{column}</span></label>)}</div></details></div>
{isPhone ? <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-700">{rows.length.toLocaleString("en-IN")} jobs</span><button type="button" onClick={() => setPhoneTable((value) => !value)} className="rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-bold">{phoneTable ? "Show cards" : "Show full table"}</button></div> : null}
{showCards ? <div className="space-y-2">{pagedRows.length ? pagedRows.map((row, index) => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(row["Job No."])); const closed = s(row["Job Closed"]) === "Yes"; const dispatched = valueForColumn(row, COLUMNS.indexOf("Dispatched Qty"), 0); const cell = (label: string, column: (typeof COLUMNS)[number]) => { const value = valueForColumn(row, COLUMNS.indexOf(column), 0); return <div className={`min-w-0 rounded border border-slate-300 px-2 py-1 ${summarySheetCellClass(column, row)}`}><div className="text-[9px] font-black uppercase text-slate-500">{label}</div><div className="truncate text-xs font-black">{s(value) || "—"}</div></div>; }; return <div key={`${row["Job No."]}-card-${index}`} className="rounded-lg border-2 border-black bg-white p-3 text-black">
  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm font-black">{valueForColumn(row, COLUMNS.indexOf("Job No."), 0)} <span className="text-[11px] font-semibold text-slate-600">· {displayDate(row.Date)}</span></div><div className="break-words text-xs font-bold">{s(row["Party Name"]) || "—"}</div><div className="break-words text-xs text-slate-700">{s(row["Item Name"]) || "—"}{row.ERP ? ` · ${row.ERP}` : ""}</div></div><span className="shrink-0 rounded border border-black bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase">{s(row.Status) || "—"}</span></div>
  <div className="mt-2 grid grid-cols-3 gap-1">{cell("Planned", "Planned Qty")}{cell("Boardline", "Boardline Prod.")}{cell("Printing", "Printing prod.")}<div className={`min-w-0 rounded border border-slate-300 px-2 py-1 ${summarySheetCellClass("Dispatched Qty", row)}`}><div className="text-[9px] font-black uppercase text-slate-500">Dispatched</div>{s(dispatched) ? <a href={`#/quality/pdi-report?job=${encodeURIComponent(s(row["Job No."]))}`} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-black underline decoration-dotted">{dispatched}</a> : <div className="text-xs font-black">—</div>}</div>{cell("FG Left", "FG LEFT")}{cell("Inv. Value", "Total Invoice Value")}</div>
  {production ? <div className="mt-2 flex justify-end">{closed ? <button type="button" onClick={() => uncloseJob(production.id)} className="rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">Unclose Job</button> : <button type="button" onClick={() => closeJob(production.id)} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Close Job</button>}</div> : null}
</div>; }) : <div className="rounded border border-black bg-white p-6 text-center text-sm">No summary rows found.</div>}</div> : null}
<div className={`${showCards ? "hidden" : ""} overflow-auto rounded border-2 border-black bg-white`} {...(showAllRows ? { "data-disable-table-pagination": "true" } : {})}><table className="min-w-[1200px] border-collapse text-[11px]"><thead><tr>{selectedSections.map((section) => <th key={section.label} colSpan={section.columns.length} className="whitespace-nowrap border border-black bg-[#24165f] px-2 py-2 text-center font-black text-white">{section.label}</th>)}</tr><tr className="bg-[#0b4773] text-white">{selectedColumns.map((columnIndex) => <th key={`${COLUMNS[columnIndex]}-${columnIndex}`} className={`whitespace-nowrap border border-black px-2 py-2 font-black ${columnAlignment(COLUMNS[columnIndex])}`}>{columnIndex === 0 ? COLUMNS[columnIndex] : <SortHeader label={COLUMNS[columnIndex]} sortKey={COLUMNS[columnIndex]} sort={sort} onToggle={toggleSort} align={NUMERIC_COLUMNS.has(COLUMNS[columnIndex]) ? "right" : CENTER_COLUMNS.has(COLUMNS[columnIndex]) ? "center" : "left"} />}</th>)}</tr></thead><tbody>{pagedRows.length ? pagedRows.map((row, index) => <tr key={`${row["Job No."]}-${index}`}>{selectedColumns.map((columnIndex) => { const column = COLUMNS[columnIndex]; const target = findRealizationTargetForDate(realizationTargets, row.Date)?.value; const rowColorClass = column === "Realization / kg" ? realizationCellClass(row[column], target) : summarySheetCellClass(column, row); return <td key={`${column}-${columnIndex}`} className={`${column === "Remarks" ? "min-w-[180px] max-w-[280px] whitespace-normal break-words" : "whitespace-nowrap"} border border-black px-2 py-2 ${columnAlignment(column)} ${rowColorClass}`}>{column === "Job Closed" ? s(row["Job Closed"]) === "Yes" ? <div><button type="button" onClick={() => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(row["Job No."])); if (production) uncloseJob(production.id); }} className="rounded bg-amber-600 px-2 py-1 font-bold text-white">Unclose Job</button></div> : <button type="button" onClick={() => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(row["Job No."])); if (production) closeJob(production.id); }} className="rounded bg-emerald-600 px-2 py-1 font-bold text-white">Close Job</button> : column === "Dispatched Qty" && s(valueForColumn(row, columnIndex, rowOffset + index)) ? <a href={`#/quality/pdi-report?job=${encodeURIComponent(s(row["Job No."]))}`} target="_blank" rel="noopener noreferrer" title="Open PDI report for this job" className="font-bold underline decoration-dotted underline-offset-2">{valueForColumn(row, columnIndex, rowOffset + index)}</a> : valueForColumn(row, columnIndex, rowOffset + index)}</td>; })}</tr>) : <tr><td colSpan={selectedColumns.length || 1} className="bg-[#eaf2f8] p-8 text-center">No summary rows found.</td></tr>}</tbody></table></div>{showAllRows ? null : <ClientPagination page={page} pageSize={pageSize} totalItems={rows.length} onPageChange={setPage} onPageSizeChange={setPageSize} />}
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
      <div className={section.columns === 4 ? "grid grid-cols-2 sm:grid-cols-4" : "grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(128px,1fr))]"}>
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
