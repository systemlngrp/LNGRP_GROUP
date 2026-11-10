import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { useTrackPageLoading } from "../components/DataLoadingBoundary";
import type { QcBlockLocationMaster } from "../types";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const STATUS_OPTIONS = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];
const USAGE_OPTIONS = [{ value: "used", label: "Used" }, { value: "unused", label: "Not Used" }];

type LocationUsage = { count: number; details: { label: string; count: number }[] };

export function QcBlockLocationMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [rows, , loading, api] = useData<QcBlockLocationMaster>("qc_block_location_masters", [], { firmScope: "all" });
  const [name, setName] = useState("");
  const [editing, setEditing] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [usageFilter, setUsageFilter] = useState("");
  const [usage, setUsage] = useState<Record<string, LocationUsage>>({});
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [usageRetryKey, setUsageRetryKey] = useState(0);
  useTrackPageLoading(usageLoading, usageError || null, () => setUsageRetryKey((value) => value + 1));

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setUsageLoading(true);
    const token = window.localStorage.getItem("authToken") || "";
    fetch("/api/qc-block-location-masters/usage", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to check location usage.");
      return result as Record<string, LocationUsage>;
    }).then(result => {
      if (!cancelled) { setUsage(result); setUsageError(""); }
    }).catch(error => {
      if (!cancelled) { setUsage({}); setUsageError(error instanceof Error ? error.message : "Unable to check location usage."); }
    }).finally(() => { if (!cancelled) setUsageLoading(false); });
    return () => { cancelled = true; };
  }, [rows, loading, usageRetryKey]);

  const filtered = useMemo(() => {
    const words = searchWords(search);
    return rows.filter(row => {
    const active = String(row.active).toLowerCase() === "yes";
    // Search the table columns: Location, Status.
    return matchesTableSearch([row.name, active ? "Active" : "Inactive"], words) &&
      (!status || (status === "active" ? active : !active)) &&
      (!usageFilter || (usageFilter === "used" ? Boolean(usage[row.id]?.count) : !usage[row.id]?.count));
    });
  }, [rows, search, status, usage, usageFilter]);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filtered, (row, key) => key === "status" ? (String(row.active).toLowerCase() === "yes" ? "Active" : "Inactive") : (row as any)[key]);

  const save = async () => {
    const value = name.trim();
    if (!value) return setMessage("Location is required.");
    const duplicate = rows.find(row => row.id !== editing && row.name.trim().toLowerCase() === value.toLowerCase());
    if (duplicate) return setMessage("This location already exists.");
    const old = rows.find(row => row.id === editing);
    if (editing && !old) return setMessage("Location not found. Refresh and try again.");
    const item: QcBlockLocationMaster = {
      id: old?.id || `BLOCKLOC-${crypto.randomUUID()}`,
      name: value,
      active: old?.active || "Yes",
      updatedBy: "System User",
      updateTimestamp: new Date().toISOString(),
    };
    setBusyId(item.id);
    setMessage("");
    try {
      if (old) await api.saveItem(item); else await api.addItem(item);
      setName(""); setEditing("");
      setMessage("Location saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save location.");
    } finally { setBusyId(""); }
  };

  const toggle = async (row: QcBlockLocationMaster) => {
    setBusyId(row.id);
    setMessage("");
    try {
      await api.saveItem({
        ...row,
        active: String(row.active).toLowerCase() === "yes" ? "No" : "Yes",
        updatedBy: "System User",
        updateTimestamp: new Date().toISOString(),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update status.");
    } finally { setBusyId(""); }
  };

  const remove = async (row: QcBlockLocationMaster) => {
    if (usageLoading || usageError || !usage[row.id] || usage[row.id].count || busyId) return;
    if (!window.confirm(`Delete location "${row.name}"?`)) return;
    setBusyId(row.id);
    setMessage("");
    try {
      const token = window.localStorage.getItem("authToken") || "";
      const response = await fetch(`/api/qc-block-location-masters/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Unable to delete location.");
      }
      await api.refresh({ force: true });
      if (editing === row.id) { setEditing(""); setName(""); }
      setMessage("Location deleted successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete location.");
    } finally { setBusyId(""); }
  };

  const editingUsed = Boolean(editing && usage[editing]?.count);
  return <div className="space-y-4">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Block Location Master</h2></div>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    {usageError && <div className="rounded border border-red-700 bg-red-100 p-3">{usageError} Delete is unavailable until usage can be checked.</div>}
    <div className="flex flex-wrap items-center gap-2">
      <input placeholder="New location" className="min-w-0 flex-1 rounded border-2 border-black px-3 py-2 sm:max-w-sm" value={name} onChange={event => setName(event.target.value)} readOnly={editingUsed}/>
      <button type="button" disabled={Boolean(busyId)} onClick={() => void save()} title={editing ? "Update" : "Add"} aria-label={editing ? "Update" : "Add"} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-700 font-bold text-white hover:bg-cyan-800 disabled:opacity-50">{editing ? <Check size={20} strokeWidth={3}/> : <Plus size={22} strokeWidth={3}/>}</button>
      {editing && <button type="button" onClick={() => { setEditing(""); setName(""); }} className="rounded border-2 border-black px-4 py-2 font-bold">Cancel</button>}
      {editingUsed && <span className="self-center text-sm">Used locations cannot be renamed.</span>}
    </div>
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" aria-label="Search locations" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <div className="min-w-0"><span className={LABEL}>Status</span><Select compact value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Usage</span><Select compact value={usageFilter} onChange={setUsageFilter} options={USAGE_OPTIONS} placeholder="All" /></div>
      </div>
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {search.trim() || status || usageFilter ? <button type="button" onClick={() => { setSearch(""); setStatus(""); setUsageFilter(""); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
      </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white">
      <table className="min-w-[600px] w-full text-sm">
        <thead className="bg-cyan-800 text-white"><tr><th className="p-2 text-left"><SortHeader label="Location" sortKey="name" sort={sort} onToggle={toggleSort} /></th><th className="p-2 text-left"><SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} /></th><th className="p-2 text-left">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={3} className="p-5 text-center">Loading...</td></tr> : sortedRows.length ? sortedRows.map(row => {
          const active = String(row.active).toLowerCase() === "yes";
          const references = usage[row.id];
          const reason = references?.details.map(detail => `${detail.label} (${detail.count})`).join(", ") || "";
          const deleteDisabled = Boolean(busyId || usageLoading || usageError || !references || references.count);
          return <tr key={row.id} className="border-t border-black">
            <td className="p-2">{row.name}</td><td className="p-2">{active ? "Active" : "Inactive"}</td>
            <td className="flex flex-wrap gap-3 p-2">
              {canManage ? <button type="button" onClick={() => { setEditing(row.id); setName(row.name); setMessage(""); }} className="underline">Edit</button> : null}
              {canManage ? <button type="button" disabled={Boolean(busyId)} onClick={() => void toggle(row)} className="underline disabled:opacity-50">{active ? "Deactivate" : "Activate"}</button> : null}
              {canManage ? <span title={reason || (usageLoading ? "Checking usage" : usageError || "")}>
                {canManage ? <button type="button" disabled={deleteDisabled} onClick={() => void remove(row)} className="font-bold text-red-700 underline disabled:text-gray-500 disabled:no-underline">Delete</button> : null}
              </span> : null}
              {reason && <span className="text-xs text-gray-600">Used in {reason}</span>}
            </td>
          </tr>;
        }) : <tr><td colSpan={3} className="h-16" aria-label="No records" /></tr>}</tbody>
      </table>
    </div>
  </div>;
}
