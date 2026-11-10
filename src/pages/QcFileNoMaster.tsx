import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Select } from "../components/Select";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { useData } from "../hooks/useData";
import type { QcFileNoMaster } from "../types";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const text = (value: unknown) => String(value ?? "").trim();
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const STATUS_OPTIONS = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];

export function QcFileNoMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [rows, , loading, api] = useData<QcFileNoMaster>("qc_file_no_masters", [], { firmScope: "all" });
  const [fileNo, setFileNo] = useState("");
  const [editing, setEditing] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [updatedByFilter, setUpdatedByFilter] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const displayName = text(user?.name || user?.userId || user?.email || "System User");

  const filtered = useMemo(() => { const words = searchWords(search); return rows.filter(row => {
    const active = text(row.active).toLowerCase() === "yes";
    return matchesTableSearch([row.fileNo, active ? "Active" : "Inactive", row.updatedBy], words) &&
      (!status || (status === "active" ? active : !active)) &&
      (!updatedByFilter || text(row.updatedBy) === updatedByFilter);
  }).sort((a, b) => text(a.fileNo).localeCompare(text(b.fileNo), undefined, { numeric: true, sensitivity: "base" })); }, [rows, search, status, updatedByFilter]);
  const updatedByOptions = useMemo(() => [...new Set(rows.map(row => text(row.updatedBy)).filter(Boolean))].sort().map(value => ({ value, label: value })), [rows]);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filtered, (row, key) => key === "status" ? (text(row.active).toLowerCase() === "yes" ? "Active" : "Inactive") : (row as any)[key]);

  const save = async () => {
    const value = fileNo.trim();
    if (!value) { setMessage("File No. is required."); return; }
    const duplicate = rows.find(row => row.id !== editing && text(row.fileNo).toLowerCase() === value.toLowerCase());
    if (duplicate) { setMessage("This File No. already exists."); return; }
    const old = rows.find(row => row.id === editing);
    const item: QcFileNoMaster = {
      id: old?.id || `QCFILE-${crypto.randomUUID()}`,
      fileNo: value,
      active: old?.active || "Yes",
      updatedBy: displayName,
      updateTimestamp: new Date().toISOString(),
    };
    setBusyId(item.id);
    setMessage("");
    try {
      if (old) await api.saveItem(item); else await api.addItem(item);
      setFileNo("");
      setEditing("");
      setMessage("File No. saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save File No.");
    } finally {
      setBusyId("");
    }
  };

  const toggle = async (row: QcFileNoMaster) => {
    setBusyId(row.id);
    setMessage("");
    try {
      await api.saveItem({
        ...row,
        active: text(row.active).toLowerCase() === "yes" ? "No" : "Yes",
        updatedBy: displayName,
        updateTimestamp: new Date().toISOString(),
      });
      setMessage("File No. status updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update File No. status.");
    } finally {
      setBusyId("");
    }
  };

  return <div className="space-y-4 pb-8">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">File No. Master</h2></div>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <div className="flex flex-wrap items-center gap-2 rounded border-2 border-black bg-white p-3">
      <input placeholder="New file no" className="min-w-0 flex-1 rounded border-2 border-black px-3 py-2 sm:max-w-sm" value={fileNo} onChange={event => setFileNo(event.target.value)} disabled={Boolean(busyId)} />
      <button type="button" disabled={Boolean(busyId)} onClick={() => void save()} title={editing ? "Update" : "Add"} aria-label={editing ? "Update" : "Add"} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-700 font-bold text-white hover:bg-cyan-800 disabled:opacity-50">{editing ? <Check size={20} strokeWidth={3}/> : <Plus size={22} strokeWidth={3}/>}</button>
      {editing && <button type="button" disabled={Boolean(busyId)} onClick={() => { setEditing(""); setFileNo(""); setMessage(""); }} className="rounded border-2 border-black px-4 py-2 font-bold disabled:opacity-50">Cancel</button>}
    </div>
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" aria-label="Search File Nos." value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <div className="min-w-0"><span className={LABEL}>Status</span><Select compact value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Updated By</span><Select compact value={updatedByFilter} onChange={setUpdatedByFilter} options={updatedByOptions} placeholder="All" /></div>
      </div>
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {search.trim() || status || updatedByFilter ? <button type="button" onClick={() => { setSearch(""); setStatus(""); setUpdatedByFilter(""); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
      </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white">
      <table className="min-w-[650px] w-full text-sm">
        <thead className="bg-cyan-800 text-white"><tr><th className="p-2 text-left"><SortHeader label="File No." sortKey="fileNo" sort={sort} onToggle={toggleSort} /></th><th className="p-2 text-left"><SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} /></th><th className="p-2 text-left"><SortHeader label="Updated By" sortKey="updatedBy" sort={sort} onToggle={toggleSort} /></th><th className="p-2 text-left">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={4} className="p-5 text-center">Loading...</td></tr> : sortedRows.length ? sortedRows.map(row => {
          const active = text(row.active).toLowerCase() === "yes";
          return <tr key={row.id} className="border-t border-black">
            <td className="p-2 font-bold">{row.fileNo}</td><td className="p-2">{active ? "Active" : "Inactive"}</td><td className="p-2">{row.updatedBy || "-"}</td>
            <td className="flex flex-wrap gap-3 p-2">{canManage ? <button type="button" disabled={Boolean(busyId)} onClick={() => { setEditing(row.id); setFileNo(row.fileNo); setMessage(""); }} className="font-bold underline disabled:opacity-50">Edit</button> : null}{canManage ? <button type="button" disabled={Boolean(busyId)} onClick={() => void toggle(row)} className="font-bold underline disabled:opacity-50">{active ? "Deactivate" : "Activate"}</button> : null}</td>
          </tr>;
        }) : <tr><td colSpan={4} className="h-16" aria-label="No records" /></tr>}</tbody>
      </table>
    </div>
  </div>;
}
