import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Select } from "../components/Select";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getProductionWastageTotals } from "../lib/wastageCalculations";
import type { Firm, Production, ProductionProcessing, QcPrintingWastage } from "../types";
import { getFirmDisplayName, getFirmDisplayNameById } from "../lib/firmDisplay";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const inputClass = "w-full rounded border-2 border-black bg-white px-3 py-2";
const derivedInputClass = `${inputClass} cursor-not-allowed bg-slate-100 text-slate-600`;
const clean = (value: unknown) => String(value ?? "").trim();
const jobNumber = (production: Production) => clean(production.transactionNo || production.jobCardNo);
const productionItemName = (production: Production) => clean((production as any).itemName);
const isOpenQcJob = (production: Production) => production.status !== "Cancelled" && !(clean((production as any).closeBy).toLowerCase() === "yes" && clean((production as any).closeDate));
const formatMetric = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-";
};
const parseTimestamp = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const formatDatePart = (value: unknown) => parseTimestamp(value)?.toLocaleDateString() || "-";
const formatTimePart = (value: unknown) => parseTimestamp(value)?.toLocaleTimeString() || "-";
const localDay = (value: unknown) => { const date = parseTimestamp(value); return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""; };
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";

function useOpenQcJobs() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  return useMemo(() => productions.filter(isOpenQcJob).filter((production) => jobNumber(production)).sort((a, b) => jobNumber(a).localeCompare(jobNumber(b), undefined, { numeric: true, sensitivity: "base" })), [productions]);
}

export function QcPrintingWastageForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const jobs = useOpenQcJobs();
  const { findItemAcrossSources } = useOrderItemCatalog();
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const [, setRecords] = useData<QcPrintingWastage>("qc_printing_wastage_records", []);
  const [productionId, setProductionId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedJob = jobs.find((production) => production.id === productionId);
  const selectedCatalogItem = selectedJob
    ? findItemAcrossSources(
        String(selectedJob.itemId || selectedJob.npdId || ""),
        selectedJob.itemSource,
        selectedJob.erpCode || selectedJob.masterErp
      )
    : undefined;
  const selectedWastage = selectedJob ? getProductionWastageTotals(selectedJob, processing) : null;
  const selectedItemName = selectedJob
    ? productionItemName(selectedJob) || clean(selectedCatalogItem?.name) || clean(selectedCatalogItem?.raw?.itemName) || clean(selectedCatalogItem?.raw?.name) || "-"
    : "-";
  const selectedCompany = selectedJob
    ? clean(selectedJob.companyName || selectedCatalogItem?.companyName || selectedJob.firmName) || "-"
    : "-";
  const selectedActualPaperUsed = selectedJob && selectedJob.actualPaperUsed !== undefined && selectedJob.actualPaperUsed !== null && clean(selectedJob.actualPaperUsed) !== ""
    ? formatMetric(selectedJob.actualPaperUsed)
    : "-";
  const jobOptions = useMemo(() => jobs.map((production) => ({
    value: production.id,
    label: `${jobNumber(production)}${productionItemName(production) ? ` - ${productionItemName(production)}` : ""}`,
    searchText: `${jobNumber(production)} ${productionItemName(production)} ${clean((production as any).companyName)}`,
  })), [jobs]);

  const save = async () => {
    setMessage("");
    const numericQuantity = Number(quantity);
    if (!selectedJob) return setMessage("Job No. is required.");
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) return setMessage("Quantity must be greater than zero.");
    if (saving) return;
    setSaving(true);
    const timestamp = new Date().toISOString();
    const record: QcPrintingWastage = {
      id: crypto.randomUUID(),
      timestamp,
      productionId: selectedJob.id,
      jobNo: jobNumber(selectedJob),
      quantity: numericQuantity,
      firmId: clean(selectedJob.firmId),
      firmName: clean(selectedJob.firmName),
      updatedBy: clean(user?.name) || "System User",
      updateTimestamp: timestamp,
    };
    try {
      await setRecords((current) => [record, ...current]);
      navigate("/quality/printing-wastage/master", { state: { message: "QC Printing Wastage saved successfully." } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save QC Printing Wastage.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-4xl space-y-5 pb-8">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Printing Wastage Form</h2></div>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <section className="rounded border-2 border-black bg-white p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label><b>Job No. *</b><Select value={productionId} onChange={setProductionId} options={jobOptions} placeholder="Search Job No." noOptionsMessage="No open QC jobs found" /></label>
        <label><b>Item Name</b><input className={derivedInputClass} value={selectedItemName} readOnly /></label>
        <label><b>Company</b><input className={derivedInputClass} value={selectedCompany} readOnly /></label>
        <label><b>Total Wastage (KG)</b><input className={derivedInputClass} value={selectedWastage ? formatMetric(selectedWastage.totalWastageKg) : "-"} readOnly /></label>
        <label><b>Actual Paper Used (KG)</b><input className={derivedInputClass} value={selectedActualPaperUsed} readOnly /></label>
        <label><b>Quantity *</b><input type="number" min="0" step="0.01" className={inputClass} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      </div>
    </section>
    <div className="flex justify-end gap-3"><button type="button" onClick={() => navigate("/quality/printing-wastage/master")} className="rounded border-2 border-black bg-white px-5 py-2 font-bold">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-indigo-600 px-5 py-2 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button></div>
  </div>;
}

export function QcPrintingWastageMaster() {
  const [records] = useData<QcPrintingWastage>("qc_printing_wastage_records", []);
  const jobs = useOpenQcJobs();
  const [searchTerm, setSearchTerm] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [firmFilter, setFirmFilter] = useState("");
  const [updatedByFilter, setUpdatedByFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const jobOptions = useMemo(() => [...new Set(records.map((record) => record.jobNo).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value })), [records]);
  const firmKey = (record: QcPrintingWastage) => clean(record.firmId) || clean(record.firmName);
  const firmLabel = (record: QcPrintingWastage) => clean(record.firmId) && firms.some((firm) => String(firm.id) === clean(record.firmId)) ? getFirmDisplayNameById(clean(record.firmId), firms) : getFirmDisplayName({ firmName: clean(record.firmName) });
  const firmOptions = useMemo(() => { const map = new Map<string, string>(); records.forEach((record) => { const key = firmKey(record); if (key && !map.has(key)) map.set(key, firmLabel(record)); }); return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)); }, [firms, records]); // eslint-disable-line react-hooks/exhaustive-deps
  const updatedByOptions = useMemo(() => [...new Set(records.map((record) => clean(record.updatedBy)).filter(Boolean))].sort().map((value) => ({ value, label: value })), [records]);
  const hasFilters = Boolean(searchTerm.trim() || jobFilter || firmFilter || updatedByFilter || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(""); setJobFilter(""); setFirmFilter(""); setUpdatedByFilter(""); setFromDate(""); setToDate(""); };
  const sortedRecords = useMemo(() => [...records].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))), [records]);
  // Search the table columns: Date, Time, Job No., Quantity, Updated By.
  const searchedRecords = useTableSearch(sortedRecords, searchTerm, (record) => [formatDatePart(record.timestamp), formatTimePart(record.timestamp), record.jobNo, Number(record.quantity).toLocaleString(), record.quantity, record.updatedBy]);
  const rows = useMemo(() => searchedRecords.filter((record) => {
    if (jobFilter && record.jobNo !== jobFilter) return false;
    if (firmFilter && firmKey(record) !== firmFilter) return false;
    if (updatedByFilter && clean(record.updatedBy) !== updatedByFilter) return false;
    if (fromDate || toDate) { const day = localDay(record.timestamp); if (!day || (fromDate && day < fromDate) || (toDate && day > toDate)) return false; }
    return true;
  }), [firmFilter, fromDate, jobFilter, searchedRecords, toDate, updatedByFilter]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (record, key) => { const at = parseTimestamp(record.timestamp); if (key === "date") return at ? String(record.timestamp) : ""; if (key === "time") return at ? at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds() : ""; if (key === "quantity") return Number(record.quantity); return (record as any)[key]; });
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [jobFilter, firmFilter, updatedByFilter, fromDate, toDate, pageSize, searchTerm]);

  return <div className="space-y-5 text-black">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Printing Wastage Master</h2></div>
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <div className="min-w-0"><span className={LABEL}>Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Job No</span><Select compact value={jobFilter} onChange={setJobFilter} options={jobOptions} placeholder="All" noOptionsMessage="No matching Job No." /></div>
        <div className="min-w-0"><span className={LABEL}>Updated By</span><Select compact value={updatedByFilter} onChange={setUpdatedByFilter} options={updatedByOptions} placeholder="All" /></div>
        <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0"><span className={LABEL}>From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className={DATE_INPUT} /></label>
          <label className="min-w-0"><span className={LABEL}>To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className={DATE_INPUT} /></label>
        </div>
      </div>
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
      </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-[800px] w-full border-collapse text-sm"><thead className="bg-slate-100"><tr>{([["Date", "date"], ["Time", "time"], ["Job No.", "jobNo"], ["Quantity", "quantity"], ["Updated By", "updatedBy"]] as const).map(([header, key]) => <th key={header} className="border border-black px-3 py-2 text-left font-bold"><SortHeader label={header} sortKey={key} sort={sort} onToggle={toggleSort} /></th>)}</tr></thead><tbody>{pagedRows.length ? pagedRows.map((record) => <tr key={record.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2">{formatDatePart(record.timestamp)}</td><td className="border border-black p-2">{formatTimePart(record.timestamp)}</td><td className="border border-black p-2 font-bold">{record.jobNo}</td><td className="border border-black p-2 text-right">{Number(record.quantity).toLocaleString()}</td><td className="border border-black p-2">{record.updatedBy || "-"}</td></tr>) : <tr><td colSpan={5} className="h-16" aria-label="No records" /></tr>}</tbody></table></div>
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm"><span className="font-black" title="Total">{rows.length}</span><div className="flex items-center gap-2"><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded border border-black p-1" aria-label="Rows per page"><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50" aria-label="Previous page" title="Previous page">&#8249;</button><span>{currentPage} / {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50" aria-label="Next page" title="Next page">&#8250;</button></div></div>
  </div>;
}
