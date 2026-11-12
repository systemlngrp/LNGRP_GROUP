import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Eye, EyeOff, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { computeSummarySheetRows, isoDateText, n, s } from "../lib/reports/summarySheet";
import type { SummaryRow } from "../lib/reports/summarySheet";
import { useServerReport } from "../hooks/useServerReport";
import { computeSummarySheetSections, monthStartKey, localDayKey, summarySheetCellClass } from "../lib/reports/summarySheetTiles";
import type { SummarySheetExtras, SummaryTile, SummaryTileSection } from "../lib/reports/summarySheetTiles";
import { jobNumberCellClass, realizationCellClass } from "../lib/jobCellColors";
import { findRealizationTargetForDate, parseRealizationTargets } from "../lib/realizationTargets";
import { ClientPagination } from "../components/ClientPagination";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import type { Company, DispatchPlan, Firm, Invoice, InvoiceLineItem, LoadingSlip, Order, OrderSchedule, Production, ProductionProcessing, Setting, Truck } from "../types";

const COLUMNS = [
  // Keep the report readable in the same order users work through a job:
  // identity, production, dispatch/loading, stock/status, and finance/audit.
  "Sl No", "Job No.", "Date", "Party Name", "Item Name", "ERP",
  "Planned Qty", "Job Weight", "Meter", "Cutting Size", "UPS", "Sheets prdcd", "Plate per box",
  "Boardline Prod.", "Printing prod.", "PPR Rqd.", "PPR Used", "Paper Wastage", "Boardline Wastage", "Printing Wastage",
  "Realization / kg", "Actual Realization / kg",
  "Dispatched Qty", "Dispatch Date", "Vehicle No", "App Stock", "Invoice Value 1", "Invoice Value 2", "Invoice Value 3",
  "Invoice No. 1", "Invoice Date 1", "Invoice No. 2", "Invoice Date 2", "Invoice No. 3", "Invoice Date 3",
  "Loading No 1", "Loading Date 1", "Loading Qty 1", "Vehicle 1", "Loading No 2", "Loading Date 2", "Loading Qty 2", "Vehicle 2", "Loading No 3", "Loading Date 3", "Loading Qty 3", "Vehicle 3",
  "FG Stock", "FG LEFT", "FINAL FG LEFT", "Dispatched From FG", "Status", "Close Date", "Job Closed", "Remarks",
  "Rate", "Sale Value", "Value", "App sale value", "wip value",
  "Customer Complaint", "PDI REPORT", "Timestamp",
] as const;
const SUMMARY_SECTIONS = [
  { label: "JOB & PRODUCTION", start: "Sl No", end: "Actual Realization / kg" },
  { label: "DISPATCH & LOADING", start: "Dispatched Qty", end: "Vehicle 3" },
  { label: "STOCK & STATUS", start: "FG Stock", end: "Remarks" },
  { label: "FINANCE & REMARKS", start: "Rate", end: "Timestamp" },
] as const;
const SUMMARY_SHEET_TABLES = ["productions", "production_processing", "orders", "orders_schedule", "dispatch_plans", "loading_slips", "invoices", "invoice_line_items", "trucks", "companies", "firms", "npd"];
const NUMERIC_COLUMNS = new Set([
  "Sl No", "Planned Qty", "Job Weight", "Meter", "UPS", "Sheets prdcd", "Plate per box", "Boardline Prod.", "Printing prod.",
  "PPR Rqd.", "PPR Used", "Paper Wastage", "Boardline Wastage", "Printing Wastage", "Realization / kg", "Actual Realization / kg",
  "Dispatched Qty", "Loading Qty 1", "Loading Qty 2", "Loading Qty 3", "FG Stock", "FG LEFT", "FINAL FG LEFT", "App Stock", "Rate",
  "Sale Value", "Value", "App sale value", "Invoice Value 1", "Invoice Value 2", "Invoice Value 3", "wip value",
]);
const CENTER_COLUMNS = new Set([
  "Date", "Dispatch Date", "Invoice Date 1", "Invoice Date 2", "Invoice Date 3", "Loading Date 1", "Loading Date 2", "Loading Date 3",
  "Status", "Close Date", "Job Closed", "Dispatched From FG", "PDI REPORT",
]);
const DATE_COLUMNS = new Set([
  "Date", "Dispatch Date", "Invoice Date 1", "Invoice Date 2", "Invoice Date 3", "Loading Date 1", "Loading Date 2", "Loading Date 3", "Close Date", "Timestamp",
]);
const columnAlignment = (column: string) => NUMERIC_COLUMNS.has(column) ? "text-right" : CENTER_COLUMNS.has(column) ? "text-center" : "text-left";
const displayDate = (value: unknown) => {
  const iso = isoDateText(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

export function SummarySheetReport() {
  // Rows are calculated on the server; if it cannot, the lists are loaded and
  // calculated here as before. Jobs stay loaded for Close / Unclose.
  const serverReport = useServerReport<SummaryRow[]>("summary-sheet", {}, SUMMARY_SHEET_TABLES);
  const browserFallback = serverReport.failed;
  const extrasReport = useServerReport<SummarySheetExtras>("summary-sheet-tiles", {}, ["orders", "orders_schedule", "dispatch_plans", "loading_slips", "invoices", "invoice_line_items", "npd"]);
  const [productions, setProductions] = useData<Production>("productions", [], { firmScope: "all" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all", enabled: browserFallback });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", enabled: browserFallback });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", enabled: browserFallback });
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "summary-sheet-dispatch-plans", enabled: browserFallback });
  const [slips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "summary-sheet-loading-slips", enabled: browserFallback });
  const [invoices] = useData<Invoice>("invoices", [], { firmScope: "all", storageKey: "summary-sheet-invoices", enabled: browserFallback });
  const [invoiceLines] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all", storageKey: "summary-sheet-invoice-lines", enabled: browserFallback });
  const [trucks] = useData<Truck>("trucks", [], { firmScope: "all", enabled: browserFallback });
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
  const [firmFilter, setFirmFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [closedFilter, setClosedFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<number[]>(() => COLUMNS.map((_, index) => index));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const closeJob = (id: string) => void setProductions((current) => current.map((p) => p.id === id ? { ...p, closeBy: "Yes", closeDate: new Date().toISOString().slice(0, 10), updatedBy: "System User", updateTimestamp: new Date().toISOString() } : p));
  const uncloseJob = (id: string) => void setProductions((current) => current.map((p) => p.id === id ? { ...p, closeBy: "", closeDate: "", updatedBy: "System User", updateTimestamp: new Date().toISOString() } : p));

  const productionById = useMemo(() => new Map(productions.map((production) => [production.id, production])), [productions]);
  const clientBaseRows = useMemo<SummaryRow[]>(
    () => (browserFallback ? computeSummarySheetRows({ productions, processing, orders, schedules, plans, slips, invoices, invoiceLines, trucks, companies, firms }, stockItems) : []),
    [browserFallback, companies, firms, invoiceLines, invoices, orders, plans, processing, productions, schedules, slips, stockItems, trucks]
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
        Status: s(production.status),
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
    return DATE_COLUMNS.has(column) ? displayDate(value) : value;
  };
  const filterOptions = useMemo(() => ({
    statuses: [...new Set(productions.filter((p) => p.status !== "Cancelled").map((p) => s(p.status)).filter(Boolean))].sort(),
    parties: [...new Set(rows.map((r) => s(r["Party Name"])).filter(Boolean))].sort(),
    items: [...new Set(rows.map((r) => s(r["Item Name"])).filter(Boolean))].sort(),
    erps: [...new Set(rows.map((r) => s(r.ERP)).filter(Boolean))].sort(),
  }), [productions, rows]);
  // Header tiles like the Google Summary Sheet (rows 1-5): live job status,
  // firm filter only; range tiles use From-To (default this month).
  const tileRange = useMemo(() => ({ from: from || monthStartKey(), to: to || localDayKey(0) }), [from, to]);
  const tiles = useMemo(() => {
    const tileRows = baseRows.map((baseRow) => {
      const production = productionById.get(s(baseRow.__productionId));
      return production ? { ...baseRow, "Job Closed": s(production.closeBy).toLowerCase() === "yes" ? "Yes" : "" } : baseRow;
    }).filter((row) => {
      const production = productionById.get(s(row.__productionId));
      if (production?.status === "Cancelled") return false;
      return !firmFilter || s(row.__firmName).toLowerCase() === firmFilter.toLowerCase();
    });
    const firmNameById = new Map(firms.map((firm) => [firm.id, s(firm.firmName).toLowerCase()]));
    const cancelledDates = productions
      .filter((p) => p.status === "Cancelled" && (!firmFilter || (s((p as any).firmName).toLowerCase() || firmNameById.get(s(p.firmId))) === firmFilter.toLowerCase()))
      .map((p) => isoDateText(p.date));
    return computeSummarySheetSections(tileRows, cancelledDates, tileRange, extrasReport.result || null);
  }, [baseRows, extrasReport.result, firmFilter, firms, productionById, productions, tileRange]);
  useEffect(() => setPage(1), [closedFilter, erpFilter, firmFilter, from, itemFilter, partyFilter, search, statusFilter, to, pageSize]);
  // Column sort over every searched row before paging (keys are column names); Sl No is not sortable.
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => {
    const column = key as (typeof COLUMNS)[number];
    if (column === "Job Closed") return s(row["Job Closed"]) === "Yes" ? isoDateText(row["Close Date"]) || "Yes" : "";
    const value = row[column] ?? "";
    if (DATE_COLUMNS.has(column)) return isoDateText(value);
    return NUMERIC_COLUMNS.has(column) && s(value) !== "" ? n(value) : value;
  });
  const pagedRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, sortedRows]);
  const clearFilters = () => { setSearch(""); setFrom(""); setTo(""); setFirmFilter(""); setStatusFilter(""); setClosedFilter(""); setPartyFilter(""); setItemFilter(""); setErpFilter(""); };
  const toggleColumn = (columnIndex: number) => setVisibleColumns((current) => current.includes(columnIndex) ? current.filter((index) => index !== columnIndex) : [...current, columnIndex].sort((a, b) => a - b));
  return <div className="space-y-4 pb-8">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black pb-3">
      <h2 className="text-xl font-bold uppercase">Summary Sheet</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-slate-600">From Date<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="mt-0.5 block h-[34px] rounded border-2 border-black bg-white px-2 text-xs font-semibold text-black" /></label>
        <label className="text-[10px] font-black uppercase tracking-wide text-slate-600">To Date<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="mt-0.5 block h-[34px] rounded border-2 border-black bg-white px-2 text-xs font-semibold text-black" /></label>
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
    {showTiles ? <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">{tiles.map((section) => <SummaryTileGroup key={section.id} section={section} />)}</div> : null}
    <div className="relative z-40 grid grid-cols-1 gap-2 rounded border border-black bg-white p-3 md:grid-cols-4 xl:grid-cols-6"><div className="relative xl:col-span-2"><Search className="absolute left-2 top-2.5 text-slate-500" size={16} /><input className="w-full rounded border border-black py-2 pl-8 pr-2" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="rounded border border-black p-2" value={firmFilter} onChange={(event) => setFirmFilter(event.target.value)}><option value="">All Firms</option>{firms.map((firm) => <option key={firm.id} value={firm.firmName}>{getFirmDisplayName(firm)}</option>)}</select><select className="rounded border border-black p-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Statuses</option>{filterOptions.statuses.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={closedFilter} onChange={(event) => setClosedFilter(event.target.value)}><option value="">All Closure</option><option value="Open">Open</option><option value="Closed">Closed</option></select><select className="rounded border border-black p-2" value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)}><option value="">All Parties</option>{filterOptions.parties.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}><option value="">All Items</option>{filterOptions.items.map((v) => <option key={v}>{v}</option>)}</select><select className="rounded border border-black p-2" value={erpFilter} onChange={(event) => setErpFilter(event.target.value)}><option value="">All ERP</option>{filterOptions.erps.map((v) => <option key={v}>{v}</option>)}</select><button type="button" onClick={clearFilters} className="rounded border border-black px-3 py-2 font-bold">Clear Filters</button><details className="relative"><summary className="cursor-pointer rounded border border-black px-3 py-2 font-bold">Columns ({selectedColumns.length}/{COLUMNS.length})</summary><div className="absolute right-0 z-50 mt-1 max-h-96 w-72 overflow-auto rounded border-2 border-black bg-white p-3 shadow-lg">{COLUMNS.map((column, index) => <label key={`${column}-${index}`} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={selectedColumns.includes(index)} onChange={() => toggleColumn(index)} /><span>{column}</span></label>)}</div></details></div>
<div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[1200px] border-collapse text-[11px]"><thead><tr>{selectedSections.map((section) => <th key={section.label} colSpan={section.columns.length} className="whitespace-nowrap border border-black bg-[#24165f] px-2 py-2 text-center font-black text-white">{section.label}</th>)}</tr><tr className="bg-[#0b4773] text-white">{selectedColumns.map((columnIndex) => <th key={`${COLUMNS[columnIndex]}-${columnIndex}`} className={`whitespace-nowrap border border-black px-2 py-2 font-black ${columnAlignment(COLUMNS[columnIndex])}`}>{columnIndex === 0 ? COLUMNS[columnIndex] : <SortHeader label={COLUMNS[columnIndex]} sortKey={COLUMNS[columnIndex]} sort={sort} onToggle={toggleSort} align={NUMERIC_COLUMNS.has(COLUMNS[columnIndex]) ? "right" : CENTER_COLUMNS.has(COLUMNS[columnIndex]) ? "center" : "left"} />}</th>)}</tr></thead><tbody>{pagedRows.length ? pagedRows.map((row, index) => <tr key={`${row["Job No."]}-${index}`}>{selectedColumns.map((columnIndex) => { const column = COLUMNS[columnIndex]; const target = findRealizationTargetForDate(realizationTargets, row.Date)?.value; const rowColorClass = column === "Job No." ? jobNumberCellClass(row.Date, row["PDI REPORT"]) : column === "Realization / kg" ? realizationCellClass(row[column], target) : summarySheetCellClass(column, row); return <td key={`${column}-${columnIndex}`} className={`${column === "Remarks" ? "min-w-[180px] max-w-[280px] whitespace-normal break-words" : "whitespace-nowrap"} border border-black px-2 py-2 ${columnAlignment(column)} ${rowColorClass}`}>{column === "Job Closed" ? s(row["Job Closed"]) === "Yes" ? <div><button type="button" onClick={() => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(row["Job No."])); if (production) uncloseJob(production.id); }} className="rounded bg-amber-600 px-2 py-1 font-bold text-white">Unclose Job</button></div> : <button type="button" onClick={() => { const production = productions.find((p) => s(p.transactionNo || p.jobCardNo) === s(row["Job No."])); if (production) closeJob(production.id); }} className="rounded bg-emerald-600 px-2 py-1 font-bold text-white">Close Job</button> : valueForColumn(row, columnIndex, (page - 1) * pageSize + index)}</td>; })}</tr>) : <tr><td colSpan={selectedColumns.length || 1} className="bg-[#eaf2f8] p-8 text-center">No summary rows found.</td></tr>}</tbody></table></div><ClientPagination page={page} pageSize={pageSize} totalItems={rows.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
  </div>;
}

const formatTileValue = (tile: SummaryTile) => {
  if (tile.value === null) return "";
  if (tile.format === "percent") return `${tile.value.toFixed(2)}%`;
  if (tile.format === "money") return `₹ ${Math.round(tile.value).toLocaleString("en-IN")}`;
  if (tile.format === "count") return tile.value.toLocaleString("en-IN");
  return Number(tile.value.toFixed(2)).toLocaleString("en-IN");
};

function SummaryTileGroup({ section }: { section: SummaryTileSection }) {
  return (
    <section className="overflow-hidden rounded border-2 border-black bg-white">
      <div className="border-b-2 border-black bg-[#0c343d] px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white">{section.title}</div>
      <div className="flex flex-wrap">
        {section.tiles.map((tile) => (
          <div key={tile.id} className={`min-w-[140px] flex-1 border-b border-r border-black px-3 py-2 ${tile.tone}`} title={tile.value === null ? "Not recorded in the app yet" : undefined}>
            <div className="text-[10px] font-black uppercase leading-tight tracking-wide">{tile.label}</div>
            <div className="mt-1 min-h-[1.25rem] whitespace-nowrap text-base font-black leading-tight">{formatTileValue(tile)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
