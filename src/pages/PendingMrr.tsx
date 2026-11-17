import { useMemo, useState } from "react";
import { Eye, Search, X, XCircle } from "lucide-react";
import { useData } from "../hooks/useData";
import { Company, Firm, GateEntry, GateEntryPhoto, Supplier } from "../types";
import { useNavigate } from "react-router-dom";
import { canCreateMrrForGateEntry, hasGateEntryMrr } from "../lib/gateEntryState";
import { useAuth } from "../auth/AuthContext";
import { getFirmDisplayNameById, getFirmOptions } from "../lib/firmDisplay";
import { Select } from "../components/Select";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function PendingMrr() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Pending MRR is a workflow queue, like Gate Entry Master. Load all firms so
  // a valid pending entry is not hidden merely because another firm is active.
  const [gateEntries, setGateEntries] = useData<GateEntry>("gate-entries", [], { firmScope: "all" });
  const [gateEntryPhotos] = useData<GateEntryPhoto>("gate-entry-photos", []);
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [truckFilter, setTruckFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const eligibleEntries = useMemo(
    () => gateEntries.filter((entry) => canCreateMrrForGateEntry(entry)),
    [gateEntries]
  );

  const firmOptions = useMemo(() => getFirmOptions(firms), [firms]);
  const supplierOptions = useMemo(
    () =>
      Array.from(
        new Set(
          eligibleEntries
            .map((entry) => getSupplierName(entry.supplierId))
            .filter(Boolean)
        )
      )
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    [eligibleEntries, suppliers, companies]
  );

  const truckOptions = useMemo(
    () =>
      Array.from(new Set(eligibleEntries.map((entry) => String(entry.truckNo || "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b))
        .map((truck) => ({ value: truck, label: truck })),
    [eligibleEntries]
  );

  const pendingEntries = useMemo(() => {
    const words = searchWords(searchTerm);
    return (
      [...eligibleEntries]
        .filter((entry) => {
          const s = suppliers.find((supplier) => supplier.id === entry.supplierId);
          const c = companies.find((company) => company.id === entry.supplierId);
          const supplierName = s ? s.name : (c ? c.name : "");
          const firmId = String(entry.firmId || entry.destinationFirmId || "");
          const matchesSearch = !words.length || matchesTableSearch([
            entry.gateEntryNo || "Syncing...",
            getFirmName(entry),
            entry.date,
            supplierName,
            entry.invoiceNo,
            Number(entry.invoiceValue || 0).toFixed(2),
            entry.truckNo,
            `${gateEntryPhotos.filter((photo) => photo.gateEntryId === entry.id).length} Photos`,
          ], words);
          return matchesSearch
            && (!firmFilter || firmId === firmFilter)
            && (!supplierFilter || supplierName === supplierFilter)
            && (!truckFilter || String(entry.truckNo || "").trim() === truckFilter)
            && (!fromDate || entry.date >= fromDate)
            && (!toDate || entry.date <= toDate);
        })
        .sort((a, b) => {
          const timeA = new Date(a.updateTimestamp || a.date || 0).getTime();
          const timeB = new Date(b.updateTimestamp || b.date || 0).getTime();
          return timeB - timeA;
        })
    );
  }, [eligibleEntries, gateEntryPhotos, searchTerm, suppliers, companies, firms, firmFilter, supplierFilter, truckFilter, fromDate, toDate]);

  const { sorted: sortedPendingEntries, sort, toggle: toggleSort } = useTableSort(
    pendingEntries,
    (entry, key) => {
      switch (key) {
        case "Gate Entry No": return entry.gateEntryNo || "Syncing...";
        case "Firm": return getFirmName(entry);
        case "Date": return entry.date;
        case "Party": return getSupplierName(entry.supplierId);
        case "Invoice No": return entry.invoiceNo;
        case "Invoice Value": return Number(entry.invoiceValue || 0);
        case "Truck No": return entry.truckNo;
        default: return "";
      }
    },
    [firms, suppliers, companies]
  );

  const hasActiveFilters = Boolean(searchTerm || firmFilter || supplierFilter || truckFilter || fromDate || toDate);
  const pendingValue = pendingEntries.reduce((sum, entry) => sum + Number(entry.invoiceValue || 0), 0);
  const clearFilters = () => {
    setSearchTerm("");
    setFirmFilter("");
    setSupplierFilter("");
    setTruckFilter("");
    setFromDate("");
    setToDate("");
  };

  const selectedEntry = pendingEntries.find((entry) => entry.id === selectedEntryId) || null;
  const selectedPhotos = selectedEntry
    ? gateEntryPhotos.filter((photo) => photo.gateEntryId === selectedEntry.id).sort((a, b) => a.slotNo - b.slotNo)
    : [];

  function getSupplierName(supplierId: string) {
    const s = suppliers.find((supplier) => supplier.id === supplierId);
    if (s) return s.name;
    const c = companies.find((company) => company.id === supplierId);
    if (c) return c.name;
    return "";
  }
  const getPhotoCount = (gateEntryId: string) => gateEntryPhotos.filter((photo) => photo.gateEntryId === gateEntryId).length;
  function getFirmName(entry: GateEntry) {
    return getFirmDisplayNameById(entry.firmId || entry.destinationFirmId, firms, "Unassigned");
  }

  const handleCancel = async (entry: GateEntry) => {
    if (hasGateEntryMrr(entry)) {
      alert("Gate Entry cannot be cancelled after MRR is created.");
      return;
    }

    const reason = window.prompt(`Enter cancellation reason for ${entry.gateEntryNo || "this Gate Entry"}:`);
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) return;

    const timestamp = new Date().toISOString();
    const actor = user?.name || "System User";
    setCancellingId(entry.id);
    try {
      await setGateEntries((prev) =>
        prev.map((row) =>
          row.id === entry.id
            ? {
                ...row,
                status: "Cancelled",
                cancelReason: trimmedReason,
                cancelledAt: timestamp,
                cancelledBy: actor,
                updatedBy: actor,
                updateTimestamp: timestamp,
              }
            : row
        )
      );
      if (selectedEntryId === entry.id) setSelectedEntryId(null);
    } catch (error) {
      console.error("Failed to cancel gate entry:", error);
      alert("Failed to cancel Gate Entry. Please try again.");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Direct Service has its own menu item (Direct Service Form). */}
      <div className="border-b border-black pb-4">
        <h2 className="min-w-0 text-xl font-bold uppercase tracking-tight text-black">Pending Material Receipt</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search gate entry, party, invoice, truck..."
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Party</span><Select compact value={supplierFilter} onChange={setSupplierFilter} options={supplierOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Truck No</span><Select compact value={truckFilter} onChange={setTruckFilter} options={truckOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input type="date" aria-label="From date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></label>
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input type="date" aria-label="To date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearFilters} className="inline-flex h-[34px] items-center gap-1 rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">
              <X size={14} /> Clear
            </button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700">
        <span>Pending gate entries: <span className="text-indigo-700">{pendingEntries.length.toLocaleString()}</span></span>
        <span>Invoice value <span className="text-indigo-700">{pendingValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
      </div>

      <div className="overflow-hidden rounded-lg border border-black bg-white shadow-sm">
        <div className="max-h-[calc(100vh-260px)] w-full overflow-auto">
        <table className="w-full min-w-[1200px] border-collapse border border-black">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr>
              {["Gate Entry No", "Firm", "Date", "Party", "Invoice No", "Invoice Value", "Truck No", "Photos", "Action"].map((heading) => (
                <th key={heading} className="whitespace-nowrap border border-black px-4 py-3 text-left text-sm font-bold uppercase text-black">
                  {heading === "Photos" || heading === "Action" ? heading : <SortHeader label={heading} sortKey={heading} sort={sort} onToggle={toggleSort} align="left" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pendingEntries.length === 0 ? (
              <tr>
                <td colSpan={9} className="border border-black px-6 py-10 text-center font-medium text-black">
                  No pending MRR gate entries found.
                </td>
              </tr>
            ) : (
              sortedPendingEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap border border-black px-4 py-3 text-sm font-semibold text-black">{entry.gateEntryNo || "Syncing..."}</td>
                  <td className="border border-black px-4 py-3 text-sm text-black">{getFirmName(entry)}</td>
                  <td className="whitespace-nowrap border border-black px-4 py-3 text-sm text-black">{entry.date}</td>
                  <td className="border border-black px-4 py-3 text-sm text-black">{getSupplierName(entry.supplierId)}</td>
                  <td className="border border-black px-4 py-3 text-sm text-black">{entry.invoiceNo}</td>
                  <td className="border border-black px-4 py-3 text-sm text-black">{Number(entry.invoiceValue || 0).toFixed(2)}</td>
                  <td className="whitespace-nowrap border border-black px-4 py-3 text-sm text-black">{entry.truckNo}</td>
                  <td className="border border-black px-4 py-3 text-sm text-black">{getPhotoCount(entry.id)} Photos</td>
                  <td className="border border-black px-4 py-3 text-right">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigate(`/material-in/form?gateEntryId=${entry.id}`)}
                        className="inline-flex items-center gap-2 rounded border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                      >
                        Create MRR
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedEntryId(entry.id)}
                        title="View"
                        aria-label="View"
                        className="inline-flex items-center gap-2 rounded border border-black px-2 py-2 text-sm font-semibold text-black transition hover:bg-slate-100"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCancel(entry)}
                        disabled={cancellingId === entry.id}
                        className="inline-flex items-center gap-2 rounded border border-red-700 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        <XCircle size={15} /> {cancellingId === entry.id ? "Cancelling..." : "Cancel"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {selectedEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-blue-700">{selectedEntry.gateEntryNo || "Gate Entry"}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {getSupplierName(selectedEntry.supplierId)} | Invoice {selectedEntry.invoiceNo} | Truck {selectedEntry.truckNo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntryId(null)}
                className="rounded-full border border-slate-300 px-3 py-2 text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <InfoCard label="Date" value={selectedEntry.date} />
              <InfoCard label="Supplier" value={getSupplierName(selectedEntry.supplierId)} />
              <InfoCard label="Invoice No" value={selectedEntry.invoiceNo} />
              <InfoCard label="Invoice Value" value={Number(selectedEntry.invoiceValue || 0).toFixed(2)} />
              <InfoCard label="Truck No" value={selectedEntry.truckNo} />
              <InfoCard label="MRR No" value={selectedEntry.mrrNo || "Pending"} />
              <InfoCard label="MRR Date" value={selectedEntry.mrrDate || "Pending"} />
              <InfoCard label="Photos" value={`${selectedPhotos.length}`} />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {selectedPhotos.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm font-medium text-slate-500">
                  No photos uploaded for this gate entry.
                </div>
              ) : (
                selectedPhotos.map((photo) => (
                  <div key={photo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {photo.photo && photo.photo.toLowerCase().endsWith(".pdf") ? (
                      <div className="h-44 w-full flex flex-col items-center justify-center bg-red-50 text-red-700 gap-2 border-b border-slate-200">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <span className="text-xs font-bold uppercase">PDF Document</span>
                        <a href={`/uploads/${photo.photo}`} target="_blank" rel="noreferrer" className="mt-2 text-[10px] bg-red-700 text-white px-3 py-1 rounded-full uppercase tracking-wider hover:bg-red-800 transition">View PDF</a>
                      </div>
                    ) : (
                      <img
                        src={`/uploads/${photo.photo}`}
                        alt={`Gate entry slot ${photo.slotNo}`}
                        className="h-44 w-full object-cover"
                      />
                    )}
                    <div className="px-4 py-3 text-sm font-semibold text-slate-600">Pic {photo.slotNo}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value || "-"}</div>
    </div>
  );
}
