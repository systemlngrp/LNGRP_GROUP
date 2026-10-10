import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Select } from "../components/Select";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getProductionWastageTotals } from "../lib/wastageCalculations";
import type { Production, ProductionProcessing, QcPrintingWastage } from "../types";

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
const formatTimestamp = (value: string) => value ? new Date(value).toLocaleString() : "-";

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
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">QC Printing Wastage Form</h2></div>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <section className="rounded border-2 border-black bg-white p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label><b>Job No. *</b><Select value={productionId} onChange={setProductionId} options={jobOptions} placeholder="Search Job No." noOptionsMessage="No open QC jobs found" /></label>
        <label><b>Item Name</b><input className={derivedInputClass} value={selectedItemName} readOnly /></label>
        <label><b>Company</b><input className={derivedInputClass} value={selectedCompany} readOnly /></label>
        <label><b>Total Wastage (KG)</b><input className={derivedInputClass} value={selectedWastage ? formatMetric(selectedWastage.totalWastageKg) : "-"} readOnly /></label>
        <label><b>Actual Paper Used (KG)</b><input className={derivedInputClass} value={selectedActualPaperUsed} readOnly /></label>
        <label><b>Quantity *</b><input type="number" min="0" step="0.01" className={inputClass} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Enter quantity" /></label>
      </div>
    </section>
    <div className="flex justify-end gap-3"><button type="button" onClick={() => navigate("/quality/printing-wastage/master")} className="rounded border-2 border-black bg-white px-5 py-2 font-bold">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-indigo-600 px-5 py-2 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Printing Wastage"}</button></div>
  </div>;
}

export function QcPrintingWastageMaster() {
  const [records] = useData<QcPrintingWastage>("qc_printing_wastage_records", []);
  const jobs = useOpenQcJobs();
  const [searchTerm, setSearchTerm] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const jobOptions = useMemo(() => [...new Set(records.map((record) => record.jobNo).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value })), [records]);
  const rows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return [...records].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).filter((record) => {
      if (jobFilter && record.jobNo !== jobFilter) return false;
      return !query || [record.jobNo, record.quantity, record.updatedBy, record.timestamp].join(" ").toLowerCase().includes(query);
    });
  }, [jobFilter, records, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [jobFilter, pageSize, searchTerm]);

  return <div className="space-y-5 text-black">
    <div className="border-b border-black pb-4"><h2 className="text-xl font-bold uppercase">QC Printing Wastage Master</h2></div>
    <div className="grid grid-cols-1 gap-3 rounded border-2 border-black bg-white p-3 md:grid-cols-[minmax(260px,1fr)_minmax(180px,0.6fr)_auto] md:items-end"><label className="relative"><span className="sr-only">Search Job No.</span><Search className="absolute left-3 top-3 text-slate-500" size={17} /><input className="w-full rounded border-2 border-black py-2 pl-9 pr-3" placeholder="Search Job No., quantity..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label><Select compact value={jobFilter} onChange={setJobFilter} options={jobOptions} placeholder="All Job Nos." noOptionsMessage="No matching Job No." /><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded border-2 border-black p-2"><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select></div>
    <div className="overflow-x-auto rounded border-2 border-black bg-white"><table className="min-w-[700px] w-full border-collapse text-sm"><thead className="bg-slate-100"><tr>{["Date / Time", "Job No.", "Quantity", "Updated By"].map((header) => <th key={header} className="border border-black px-3 py-2 text-left font-bold">{header}</th>)}</tr></thead><tbody>{pagedRows.length ? pagedRows.map((record) => <tr key={record.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2">{formatTimestamp(record.timestamp)}</td><td className="border border-black p-2 font-bold">{record.jobNo}</td><td className="border border-black p-2 text-right">{Number(record.quantity).toLocaleString()}</td><td className="border border-black p-2">{record.updatedBy || "-"}</td></tr>) : <tr><td colSpan={4} className="p-8 text-center font-semibold">No QC Printing Wastage records found.</td></tr>}</tbody></table></div>
    <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length}</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Previous</button><span>Page {currentPage} / {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Next</button></div></div>
  </div>;
}
