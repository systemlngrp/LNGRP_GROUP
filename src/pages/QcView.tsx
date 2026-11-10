import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { ClientPagination } from "../components/ClientPagination";
import { Select } from "../components/Select";
import { useClientPagination } from "../hooks/useClientPagination";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { BoardLineQcCheck, ControlRecord, DispatchPlan, Item, LoadingSlip, Material, MaterialIssue, MaterialIssueLine, MaterialIssueReelLine, MaterialReturn, MaterialReturnLine, MaterialReturnReelLine, PreDispatchInspection, PrintingQcCheck, Production, ProductionProcessing, QcBlockRecord, QcUpdateRecord, Setting } from "../types";
import { buildProductionCorrugatedSheetUsageMap, buildProductionMaterialUsageMap, getProductionActualPaperUsed, hasPaperNotRequiredBypass, hasProductionCorrugatedSheetUsage } from "../lib/productionMaterialUsage";
import { isCorrugationLinerComplete, isMachineStepFull } from "../lib/productionProcessingProgress";
import { dateKey, jobDateCellClass, qcResultCellClass } from "../lib/jobCellColors";
import { findLatestInspection } from "../lib/pdiReportData";
import { buildJobLoadingRecords } from "../lib/jobLoadingRecords";
import { calculateSamplingPlanQty, resolvePlanQuantity } from "../lib/samplingPlanQty";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { QC_REPORT_COLUMN_COUNTS, QC_REPORT_COLUMN_SCHEMA_VERSIONS } from "../lib/qcColumnLayout";
import { useQcColumnLayout } from "../hooks/useQcColumnLayout";
import { computeQcViewRows } from "../lib/reports/qcView";
import { useServerReport } from "../hooks/useServerReport";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort, type SortState } from "../lib/tableSort";

const GROUPS = [
  { label: "PROGRAM", group: "bg-[#24165f] text-white", head: "bg-[#0b4773] text-white", columns: ["SL No.", "Job No.", "Date", "Party Name", "Item Name", "ERP Code", "Plan Quantity", "Item Status"] },
  { label: "RECORD KEEPING", group: "bg-[#075985] text-white", head: "bg-[#0b4773] text-white", columns: ["Artwork", "Spec", "File No.", "Index No", "Sample No.", "Block Location", "Block No.", "Sample Location", "Sample No. (Control)"] },
  { label: "QC REMARKS", group: "bg-[#b80000] text-white", head: "bg-[#f59e0b] text-black", columns: ["Boardline AUTO-CORRECTION Message", "Previous Customer Complaint", "PDI RESULT", "QC Remarks"] },
  { label: "PROCESS REPORT", group: "bg-[#1724dc] text-white", head: "bg-[#bfd4f4] text-black", columns: ["Boardline Production", "Printing Production", "Loaded Quantity"] },
  { label: "BOX SPECIFICATION", group: "bg-[#0f766e] text-white", head: "bg-[#ccfbf1] text-black", columns: ["Length", "Width", "Height", "L-OD", "W-OD", "H-OD", "FLAP", "Ply", "No. Of parts"] },
  { label: "IN-PROCESS QC CHECK REPORT [LIVE]", group: "bg-[#b80000] text-white", head: "bg-[#0b4773] text-white", columns: ["SAMPLING PLAN QTY", "Required Size", "Check 1", "Check 2", "Check 3", "Check 4", "Required Cutting Size", "Cutting Check 1", "Cutting Check 2", "Cutting Check 3", "Cutting Check 4", "Required B.GSM", "BGSM MIN", "BGSM MAX", "GSM Check 1", "GSM Check 2", "GSM Check 3", "GSM Check 4", "PLY", "Flute Check", "Moisture Check", "Board Thickness Achieved", "BS Achieved", "Board Weight Achieved (Grams)"] },
] as const;
const COLUMNS = GROUPS.flatMap((group) => [...group.columns]);
const UNSORTED_COLUMNS = new Set<string>(["SL No.", "Artwork"]);
const MESSAGE_COLUMN = "Boardline AUTO-CORRECTION Message";
const LONG_TEXT_COLUMNS = new Set([
  "Party Name",
  "Item Name",
  "Artwork",
  "Spec",
  MESSAGE_COLUMN,
  "Previous Customer Complaint",
  "QC Remarks",
  "Required Size",
  "Check 1",
  "Check 2",
  "Check 3",
  "Check 4",
  "Cutting Check 1",
  "Cutting Check 2",
  "Cutting Check 3",
  "Cutting Check 4",
]);
const REQUIRED_COLUMNS = new Set(["Required Size", "Required Cutting Size", "Required B.GSM"]);
const CHECK_COLUMNS = new Set([
  "Check 1", "Check 2", "Check 3", "Check 4",
  "Cutting Check 1", "Cutting Check 2", "Cutting Check 3", "Cutting Check 4",
  "GSM Check 1", "GSM Check 2", "GSM Check 3", "GSM Check 4",
  "Flute Check", "Moisture Check",
]);
const columnHighlightClass = (column: string) => REQUIRED_COLUMNS.has(column)
  ? "bg-[#0a5494] text-white font-bold"
  : CHECK_COLUMNS.has(column)
    ? "bg-[#b5d6a7] text-slate-950 font-bold"
    : "";
const columnHeaderClass = (column: string) => REQUIRED_COLUMNS.has(column) || CHECK_COLUMNS.has(column)
  ? "bg-[#0a5494] text-white font-bold"
  : "";
type Row = Record<string, string | number>;
const s = (v: unknown) => String(v ?? "").trim(); const key = (v: unknown) => s(v).toLowerCase(); const n = (v: unknown): string | number => v === "" || v == null ? "" : Number.isFinite(Number(v)) ? Number(v) : s(v); const isUrl = (v: unknown) => /^https?:\/\//i.test(s(v));
const formatDate = (value: unknown) => { const normalized = dateKey(value); return normalized ? `${normalized.slice(8, 10)}-${normalized.slice(5, 7)}-${normalized.slice(0, 4)}` : s(value); };
const formatFlapHeightFlap = (left: unknown, height: unknown, right: unknown) => { const values = [s(left), s(height), s(right)]; return values.some(Boolean) ? values.join(" - ") : ""; };
const whole = (value: unknown): string | number => { if (value === "" || value == null) return ""; const numeric = Number(value); return Number.isFinite(numeric) ? Math.round(numeric) : s(value); };
const formatWholeFlapHeightFlap = (left: unknown, height: unknown, right: unknown) => { const values = [left, height, right].map(whole); return values.some((value) => value !== "") ? values.join(" - ") : ""; };
const checkColumnValues = (checkNo: unknown, operatorValue: string, driveValue: string, cuttingValue: string | number) => {
  const index = Number.parseInt(s(checkNo), 10);
  const values = ["", "", "", ""];
  if (index < 1 || index > 4) return { checks: values, cutting: ["", "", "", ""] };
  const combined = [operatorValue && `OS ${operatorValue}`, driveValue && `DS ${driveValue}`].filter(Boolean).join(" | ");
  values[index - 1] = combined;
  const cutting = ["", "", "", ""];
  cutting[index - 1] = String(cuttingValue);
  return { checks: values, cutting };
};
const OpenLinkButton = ({ href, newTab = false }: { href: string; newTab?: boolean }) => <a href={href} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 font-bold text-white"><ExternalLink size={13} />Open</a>;
const LinkCell = ({ value }: { value: unknown }) => isUrl(value) ? <OpenLinkButton href={s(value)} newTab /> : <>{s(value)}</>;
const SpecCell = ({ value }: { value: unknown; erp?: unknown }) => <LinkCell value={value} />;

const hasPositiveQuantity = (value: unknown) => Number(value || 0) > 0;

const processingQuantity = (records: ProductionProcessing[], production: Production, job: string, machine: string) =>
  records.filter((record) => key(record.machineName) === key(machine) && (key(record.productionId) === key(production.id) || key(record.jobNo) === key(job)))
    .reduce((total, record) => total + (hasPositiveQuantity(record.qty) ? Number(record.qty) : 0), 0);

function getQcProductionStatus(production: Production, actualPaperUsed: number, hasCorrugatedSheetUsage: boolean, processing: ProductionProcessing[]) {
  if (production.status === "Cancelled" || production.cancelTimestamp || production.tallyTimestamp || production.status === "Completed") return s(production.status);
  if (!hasPaperNotRequiredBypass(production) && actualPaperUsed <= 0 && !hasCorrugatedSheetUsage) return "Pending Reel Issue";
  if (!isCorrugationLinerComplete(processing, s(production.id))) return "Pending Corrugation";
  if (!isMachineStepFull(processing, s(production.id), "Printing")) return "Pending Printing";
  return s(production.status);
}

const QC_VIEW_TABLES = ["productions", "production_processing", "boardline_qc_checks", "printing_qc_checks", "pre_dispatch_inspections", "loading_slips", "dispatch_plans", "settings", "materials", "material_issues", "material_issue_lines", "material_issue_reel_lines", "material_returns", "material_return_lines", "material_return_reel_lines", "qc_update_records", "qc_block_records", "control_records", "npd"];

export function QcView() {
  const { user, hasAccess } = useAuth();
  const canManageColumns = canManageMasterRecords(user?.role) && hasAccess("/quality/qc-view");
  // Rows are calculated on the server; if it cannot, the lists are loaded and
  // calculated here as before (settings stay loaded for the column layout).
  const serverReport = useServerReport<Row[]>("qc-view", {}, QC_VIEW_TABLES);
  const browserFallback = serverReport.failed;
  const [productions] = useData<Production>("productions", [], { enabled: browserFallback, firmScope: "all" }); const [processing] = useData<ProductionProcessing>("production_processing", [], { enabled: browserFallback, firmScope: "all" }); const [boardline] = useData<BoardLineQcCheck>("boardline_qc_checks", [], { enabled: browserFallback }); const [printing] = useData<PrintingQcCheck>("printing_qc_checks", [], { enabled: browserFallback }); const [inspections] = useData<PreDispatchInspection>("pre_dispatch_inspections", [], { enabled: browserFallback, firmScope: "all" }); const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { enabled: browserFallback, firmScope: "all", storageKey: "loading-slips-all-firms" }); const [plans] = useData<DispatchPlan>("dispatch_plans", [], { enabled: browserFallback, firmScope: "all" }); const [settings] = useData<Setting>("settings", [], { cacheToLocalStorage: false }); const [materials] = useData<Material>("materials", [], { enabled: browserFallback }); const [materialIssues] = useData<MaterialIssue>("material-issues", [], { enabled: browserFallback, firmScope: "all" }); const [materialIssueLines] = useData<MaterialIssueLine>("material-issue-lines", [], { enabled: browserFallback, firmScope: "all" }); const [materialIssueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { enabled: browserFallback, firmScope: "all" }); const [materialReturns] = useData<MaterialReturn>("material-returns", [], { enabled: browserFallback, firmScope: "all" }); const [materialReturnLines] = useData<MaterialReturnLine>("material-return-lines", [], { enabled: browserFallback, firmScope: "all" }); const [materialReturnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { enabled: browserFallback, firmScope: "all" }); const [qcUpdates] = useData<QcUpdateRecord>("qc_update_records", [], { enabled: browserFallback, firmScope: "all" }); const [blockRecords] = useData<QcBlockRecord>("qc_block_records", [], { enabled: browserFallback, firmScope: "all" }); const [controlRecords] = useData<ControlRecord>("control_records", [], { enabled: browserFallback, firmScope: "all" }); const items = useNpdItems({ enabled: browserFallback }).map((item) => ({ ...item, artwork: (item as Item & { url?: string }).url, spec: item.artwork }));
  const [search, setSearch] = useState(""); const [jobFilter, setJobFilter] = useState(""); const [erpFilter, setErpFilter] = useState(""); const [partyFilter, setPartyFilter] = useState(""); const [itemFilter, setItemFilter] = useState(""); const [statusFilter, setStatusFilter] = useState(""); const [resultFilter, setResultFilter] = useState("");
  const [dateSort, setDateSort] = useState<"asc" | "desc">("asc");  const [showColumnPanel, setShowColumnPanel] = useState(false); const [columnSearch, setColumnSearch] = useState("");
  const { visible, status: saveState, publish } = useQcColumnLayout("qc-view", QC_REPORT_COLUMN_COUNTS["qc-view"], settings[0]?.qcViewVisibleColumns, canManageColumns, QC_REPORT_COLUMN_SCHEMA_VERSIONS["qc-view"]);
  const displayedColumns = useMemo(() => new Set(visible.map((index) => COLUMNS[index])), [visible]);
  const visibleGroups = useMemo(() => GROUPS.map((group) => ({ ...group, columns: group.columns.filter((column) => displayedColumns.has(column)) })).filter((group) => group.columns.length), [displayedColumns]);
  const visibleColumnList = useMemo(() => visibleGroups.flatMap((group) => [...group.columns]), [visibleGroups]);
  const toggleColumn = (column: string) => {
    const index = COLUMNS.findIndex((candidate) => candidate === column);
    publish(visible.includes(index) ? visible.filter((value) => value !== index) : [...visible, index].sort((a, b) => a - b));
  };
  const clientBaseRows = useMemo<Row[]>(
    () => (browserFallback ? computeQcViewRows({ productions, processing, boardline, printing, inspections, loadingSlips, plans, settings, materials, materialIssues, materialIssueLines, materialIssueReelLines, materialReturns, materialReturnLines, materialReturnReelLines, qcUpdates, blockRecords, controlRecords }, items) : []),
    // items is rebuilt each render; the list it comes from is in the deps via npd rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [browserFallback, blockRecords, boardline, controlRecords, inspections, loadingSlips, materialIssueLines, materialIssueReelLines, materialIssues, materialReturnLines, materialReturnReelLines, materialReturns, materials, plans, printing, processing, productions, qcUpdates, settings, items.length]
  );
  const baseRows = browserFallback ? clientBaseRows : (serverReport.result || []);
  // Search covers the columns currently shown (column picker), as the cells show them; SL No. and Open-link cells are skipped.
  const searchIndex = useMemo(() => {
    const columns = visibleColumnList.filter((column) => column !== "SL No.");
    return new Map(baseRows.map((row) => [row, rowSearchText(columns.map((column) => (column === "Spec" || column === "Artwork") && isUrl(row[column]) ? "" : row[column]))]));
  }, [baseRows, visibleColumnList]);
  const rows = useMemo<Row[]>(() => { const words = searchWords(search); return baseRows.filter((r) => (!jobFilter || r["Job No."] === jobFilter) && (!erpFilter || r["ERP Code"] === erpFilter) && (!partyFilter || r["Party Name"] === partyFilter) && (!itemFilter || r["Item Name"] === itemFilter) && (!statusFilter || r["Item Status"] === statusFilter) && (!resultFilter || r["PDI RESULT"] === resultFilter) && matchesTableSearch(searchIndex.get(r) || "", words)); }, [baseRows, erpFilter, itemFilter, jobFilter, partyFilter, resultFilter, search, searchIndex, statusFilter]);
  const options = useMemo(() => {
    const values = (column: string) => [...new Set(rows.map((row) => s(row[column])).filter(Boolean))].sort().map((value) => ({ value, label: value, searchText: value }));
    return { jobs: values("Job No."), erps: values("ERP Code"), parties: values("Party Name"), items: values("Item Name"), statuses: values("Item Status"), results: values("PDI RESULT") };
  }, [rows]);
  const sortedRows = useMemo(() => rows.map((row, index) => ({ row, index, date: dateKey(row.Date) || null })).sort((a, b) => {
    if (a.date === null || b.date === null) return a.date === null && b.date === null ? a.index - b.index : a.date === null ? 1 : -1;
    return (dateSort === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.index - b.index;
  }).map(({ row }) => row), [rows, dateSort]);
  // Other columns sort on top of the date order; the Date header keeps its own oldest/newest toggle.
  const { sorted: columnSortedRows, sort, toggle: toggleSort, setSort } = useTableSort(sortedRows, (row, column) => column === "Spec" && isUrl(row[column]) ? "" : row[column]);
  const headerSort: SortState = sort ?? { key: "Date", direction: dateSort };
  const onHeaderSort = (column: string) => { if (column !== "Date") { toggleSort(column); return; } if (sort) { setSort(null); setDateSort("asc"); } else setDateSort((current) => current === "asc" ? "desc" : "asc"); };
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(columnSortedRows, 25);
  useEffect(() => setPage(1), [search, jobFilter, erpFilter, partyFilter, itemFilter, statusFilter, resultFilter, dateSort, setPage]);
  const clear = () => { setSearch(""); setJobFilter(""); setErpFilter(""); setPartyFilter(""); setItemFilter(""); setStatusFilter(""); setResultFilter(""); setColumnSearch(""); };
  return <div className="space-y-4">
    <h2 className="text-xl font-bold uppercase">QC View</h2>
    <div className="rounded border border-black bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-9">
        <div className="relative sm:col-span-2"><label htmlFor="qc-view-search" className="sr-only">Search QC records</label><Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={16}/><input id="qc-view-search" aria-label="Search job, ERP, party, item or QC values" className="h-[34px] w-full rounded border-2 border-black pl-9 pr-3 text-sm" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
        <Select id="qc-job-filter" compact value={jobFilter} onChange={setJobFilter} options={options.jobs} placeholder="All Jobs" noOptionsMessage="No matching jobs"/>
        <Select id="qc-erp-filter" compact value={erpFilter} onChange={setErpFilter} options={options.erps} placeholder="All ERP Codes" noOptionsMessage="No matching ERP codes"/>
        <Select id="qc-party-filter" compact value={partyFilter} onChange={setPartyFilter} options={options.parties} placeholder="All Parties" noOptionsMessage="No matching parties"/>
        <Select id="qc-item-filter" compact value={itemFilter} onChange={setItemFilter} options={options.items} placeholder="All Items" noOptionsMessage="No matching items"/>
        <Select id="qc-status-filter" compact value={statusFilter} onChange={setStatusFilter} options={options.statuses} placeholder="All Statuses" noOptionsMessage="No matching statuses"/>
        <Select id="qc-result-filter" compact value={resultFilter} onChange={setResultFilter} options={options.results} placeholder="All PDI Results" noOptionsMessage="No matching PDI results"/>
        <button type="button" onClick={clear} className="inline-flex h-[34px] w-full items-center justify-center gap-2 rounded border-2 border-black px-3 text-sm font-bold hover:bg-slate-100"><X size={15}/>Clear Filters</button>{canManageColumns ? <button type="button" onClick={() => setShowColumnPanel((value) => !value)} className="inline-flex h-[34px] w-full items-center justify-center rounded border-2 border-black px-3 text-sm font-bold hover:bg-slate-100">Hide Columns</button> : null}
      </div>
    </div>
      {canManageColumns && showColumnPanel ? <div className="mt-3 rounded border-2 border-black bg-slate-50 p-3"><div className="mb-2 flex flex-wrap items-end justify-between gap-2"><label className="min-w-60 flex-1 text-xs font-bold" htmlFor="qc-column-search">Search columns<input id="qc-column-search" aria-label="Search visible columns" className="mt-1 h-[34px] w-full rounded border-2 border-black bg-white px-2 text-sm font-normal" placeholder="Search column names" value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)}/></label><div className="flex gap-2"><button type="button" onClick={() => publish(COLUMNS.map((_, index) => index))} className="rounded border border-black bg-white px-2 py-1 text-xs font-bold">Show All</button><button type="button" onClick={() => publish(COLUMNS.map((_, index) => index))} className="rounded border border-black bg-white px-2 py-1 text-xs font-bold">Reset</button>{saveState && <span className="text-xs font-bold">{saveState}</span>}</div></div><div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">{GROUPS.map((group) => { const columns = group.columns.filter((column) => column.toLowerCase().includes(columnSearch.trim().toLowerCase())); if (!columns.length) return null; return <fieldset key={group.label} className="rounded border border-slate-300 bg-white p-2"><legend className="px-1 text-xs font-black">{group.label}</legend>{columns.map((column) => <label key={column} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={displayedColumns.has(column)} onChange={() => toggleColumn(column)} />{column}</label>)}</fieldset>; })}</div>{columnSearch.trim() && !GROUPS.some((group) => group.columns.some((column) => column.toLowerCase().includes(columnSearch.trim().toLowerCase()))) ? <p className="mt-2 text-sm font-semibold text-slate-600">No columns match your search.</p> : null}</div> : null}<div className="max-h-[calc(100vh-290px)] overflow-auto rounded border-2 border-black bg-white">
      <table className="qc-view-table min-w-[4200px] border-collapse text-[11px]">
        <thead>
          <tr>{visibleGroups.flatMap((group) => group.columns.map((column) => <th key={column} aria-sort={column === "Date" && !sort ? dateSort === "asc" ? "ascending" : "descending" : undefined} className={`sticky top-0 z-20 min-w-[92px] whitespace-normal border border-black px-2 py-2 text-center font-bold leading-tight ${group.head} ${columnHeaderClass(column)}`}>{UNSORTED_COLUMNS.has(column) ? column : <SortHeader label={column} sortKey={column} sort={headerSort} onToggle={onHeaderSort} align="center" />}</th>))}</tr>
        </thead>
      <tbody>{paginatedItems.length ? paginatedItems.map((row, ri) => <tr key={`${row.__rowKey || row["Job No."]}-${(page - 1) * pageSize + ri}`} className="odd:bg-white even:bg-slate-50">{visibleColumnList.map((column) => { const rowColorClass = ["Date", "Party Name", "Item Name", "ERP Code"].includes(column) ? jobDateCellClass(row.Date) : ""; const colorClass = column === "PDI RESULT" ? (qcResultCellClass(row["PDI RESULT"]) || columnHighlightClass(column) || rowColorClass) : columnHighlightClass(column) || rowColorClass; const cellClass = column === MESSAGE_COLUMN ? "w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words leading-5" : "max-w-[260px] whitespace-normal break-words"; const value = column === "SL No." ? (page - 1) * pageSize + ri + 1 : column === "Spec" ? <SpecCell value={row[column]} erp={row["ERP Code"]}/> : column === "Artwork" ? <LinkCell value={row[column]}/> : row[column] === "" ? "-" : row[column]; const content = LONG_TEXT_COLUMNS.has(column) ? <div className="qc-view-long-cell" title={s(row[column])} aria-label={`${column}: ${s(row[column])}`}>{value}</div> : value; return <td key={column} className={`${cellClass} border border-black px-2 py-2 align-top ${colorClass}`}>{content}</td>; })}</tr>) : <tr><td colSpan={visibleColumnList.length} className="p-8 text-center font-semibold">No open QC jobs match the selected filters.</td></tr>}</tbody>
      </table>
    </div>
    <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
  </div>;
}











