import { useMemo, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useData } from "../hooks/useData";
import type { PrintingStereoRecord } from "../types";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { Select } from "../components/Select";
import { dateKey } from "../lib/jobCellColors";

import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";

const text = (value: unknown) => String(value ?? "").trim();
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
const optionList = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })).map(value => ({ value, label: value }));
const dayKey = (value: unknown) => { const raw = text(value); if (raw.includes("T")) { const date = new Date(raw); if (!Number.isNaN(date.getTime())) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; } return dateKey(raw); };
const emptyFilters = { erpCode: "", partyName: "", itemName: "", location: "", blockNo: "", updatedBy: "", fromDate: "", toDate: "" };
export function PrintingStereoMaster() {
  const { user, hasAccess } = useAuth();
  const canDelete = canManageMasterRecords(user?.role) && hasAccess("/quality/printing-stereo");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const location = useLocation(); const [records, , loading] = useData<PrintingStereoRecord>("printing_stereo_records", [], { firmScope: "all" }); const [search, setSearch] = useState("");
  const message = text((location.state as { message?: string } | null)?.message); const sorted = useMemo(() => [...records].sort((a, b) => text(b.updateTimestamp).localeCompare(text(a.updateTimestamp))), [records]);
  // Search the table columns: ERP Code, Party Name, Item Name, Location, Block No., Updated By, Updated Timestamp (Sl. No. is just the row counter).
  const searched = useTableSearch(sorted, search, record => [record.erpCode, record.partyName, record.itemName, record.location, record.blockNo, record.updatedBy, record.updateTimestamp]);
  const [filters, setFilters] = useState(emptyFilters);
  const setFilter = (key: keyof typeof emptyFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const hasFilters = Boolean(search.trim()) || Object.values(filters).some(Boolean);
  const filterOptions = useMemo(() => ({ erps: optionList(records.map(record => record.erpCode)), parties: optionList(records.map(record => record.partyName)), items: optionList(records.map(record => record.itemName)), locations: optionList(records.map(record => record.location)), blocks: optionList(records.map(record => record.blockNo)), users: optionList(records.map(record => record.updatedBy)) }), [records]);
  const filtered = useMemo(() => searched.filter(record => {
    if (filters.erpCode && text(record.erpCode) !== filters.erpCode) return false;
    if (filters.partyName && text(record.partyName) !== filters.partyName) return false;
    if (filters.itemName && text(record.itemName) !== filters.itemName) return false;
    if (filters.location && text(record.location) !== filters.location) return false;
    if (filters.blockNo && text(record.blockNo) !== filters.blockNo) return false;
    if (filters.updatedBy && text(record.updatedBy) !== filters.updatedBy) return false;
    if (filters.fromDate || filters.toDate) { const day = dayKey(record.updateTimestamp); if (!day || (filters.fromDate && day < filters.fromDate) || (filters.toDate && day > filters.toDate)) return false; }
    return true;
  }), [filters, searched]);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filtered, (record, key) => (record as any)[key]);
  const deleteRecord = async (record: PrintingStereoRecord) => {
    if (!canDelete || deletingRef.current) return;
    if (!window.confirm(`Delete Printing Stereo record for ERP ${record.erpCode}, location ${record.location}, block ${record.blockNo}? Its linked Block Record will also be permanently deleted.`)) return;
    deletingRef.current = true;
    setDeletingId(record.id);
    setFeedback(null);
    try {
      const token = window.localStorage.getItem("authToken") || "";
      const response = await fetch(`/api/printing-stereo-records/${encodeURIComponent(record.id)}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to delete Printing Stereo record.");
      window.dispatchEvent(new CustomEvent("sync-data-printing_stereo_records"));
      window.dispatchEvent(new CustomEvent("sync-data-qc_block_records"));
      setFeedback({ message: "Printing Stereo record and any linked Block Record deleted successfully.", error: false });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Unable to delete Printing Stereo record.", error: true });
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  };
  return <div className="space-y-5 pb-8"><div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Printing Stereo Records</h2></div>{(feedback || message) && <div role="status" className={`rounded border p-3 font-bold ${feedback?.error ? "border-red-700 bg-red-100" : "border-emerald-700 bg-emerald-100"}`}>{feedback?.message || message}</div>}<div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3"><div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div><div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6"><div className="min-w-0"><span className={LABEL}>ERP</span><Select compact value={filters.erpCode} onChange={value => setFilter("erpCode", value)} options={filterOptions.erps} placeholder="All" /></div><div className="min-w-0"><span className={LABEL}>Party</span><Select compact value={filters.partyName} onChange={value => setFilter("partyName", value)} options={filterOptions.parties} placeholder="All" /></div><div className="min-w-0"><span className={LABEL}>Item</span><Select compact value={filters.itemName} onChange={value => setFilter("itemName", value)} options={filterOptions.items} placeholder="All" /></div><div className="min-w-0"><span className={LABEL}>Location</span><Select compact value={filters.location} onChange={value => setFilter("location", value)} options={filterOptions.locations} placeholder="All" /></div><div className="min-w-0"><span className={LABEL}>Block No.</span><Select compact value={filters.blockNo} onChange={value => setFilter("blockNo", value)} options={filterOptions.blocks} placeholder="All" /></div><div className="min-w-0"><span className={LABEL}>Updated By</span><Select compact value={filters.updatedBy} onChange={value => setFilter("updatedBy", value)} options={filterOptions.users} placeholder="All" /></div><div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2"><label className="min-w-0"><span className={LABEL}>Update From Date</span><input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={event => setFilter("fromDate", event.target.value)} className={DATE_INPUT} /></label><label className="min-w-0"><span className={LABEL}>Update To Date</span><input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={event => setFilter("toDate", event.target.value)} className={DATE_INPUT} /></label></div></div><div data-mf-actions="true" className="flex justify-end gap-2">{hasFilters ? <button type="button" onClick={() => { setSearch(""); setFilters(emptyFilters); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}<button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button></div></div><div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-[1000px] w-full border-collapse text-sm"><thead className="bg-cyan-800 text-white"><tr>{([["Sl. No.", ""], ["ERP Code", "erpCode"], ["Party Name", "partyName"], ["Item Name", "itemName"], ["Location", "location"], ["Block No.", "blockNo"], ["Updated By", "updatedBy"], ["Updated Timestamp", "updateTimestamp"], ...(canDelete ? [["Actions", ""]] : [])] as [string, string][]).map(([header, key]) => <th key={header} className="border border-black p-2 text-left">{key ? <SortHeader label={header} sortKey={key} sort={sort} onToggle={toggleSort} /> : header}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={canDelete ? 9 : 8} className="p-6 text-center">Loading...</td></tr> : sortedRows.length ? sortedRows.map((record, index) => <tr key={record.id}><td className="border border-black p-2">{index + 1}</td><td className="border border-black p-2 font-bold">{record.erpCode}</td><td className="border border-black p-2">{record.partyName}</td><td className="border border-black p-2">{record.itemName}</td><td className="border border-black p-2">{record.location}</td><td className="border border-black p-2">{record.blockNo}</td><td className="border border-black p-2">{record.updatedBy}</td><td className="border border-black p-2">{record.updateTimestamp || "-"}</td>{canDelete && <td className="border border-black p-2"><button type="button" disabled={deletingId !== null} onClick={() => void deleteRecord(record)} className="inline-flex items-center gap-1 rounded bg-red-700 px-2 py-1 font-bold text-white disabled:opacity-50"><Trash2 size={14}/>{deletingId === record.id ? "Deleting..." : "Delete"}</button></td>}</tr>) : <tr><td colSpan={canDelete ? 9 : 8} className="h-16" aria-label="No records" /></tr>}</tbody></table></div></div>;
}


