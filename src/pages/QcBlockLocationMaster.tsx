import { useEffect, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import type { QcBlockLocationMaster } from "../types";

type LocationUsage = { count: number; details: { label: string; count: number }[] };

export function QcBlockLocationMaster() {
  const [rows, , loading, api] = useData<QcBlockLocationMaster>("qc_block_location_masters", [], { firmScope: "all" });
  const [name, setName] = useState("");
  const [editing, setEditing] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [usage, setUsage] = useState<Record<string, LocationUsage>>({});
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
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
  }, [rows]);

  const filtered = useMemo(() => rows.filter(row => {
    const active = String(row.active).toLowerCase() === "yes";
    return row.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (status === "all" || (status === "active" ? active : !active));
  }), [rows, search, status]);

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
    <h2 className="border-b border-black pb-3 text-xl font-bold uppercase">QC Block Location Master</h2>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    {usageError && <div className="rounded border border-red-700 bg-red-100 p-3">{usageError} Delete is unavailable until usage can be checked.</div>}
    <div className="flex flex-wrap gap-2">
      <input className="rounded border-2 border-black px-3 py-2" value={name} onChange={event => setName(event.target.value)} placeholder="Block Location" readOnly={editingUsed}/>
      <button type="button" disabled={Boolean(busyId)} onClick={() => void save()} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white disabled:opacity-50">{editing ? "Update" : "Add"}</button>
      {editing && <button type="button" onClick={() => { setEditing(""); setName(""); }} className="rounded border-2 border-black px-4 py-2 font-bold">Cancel</button>}
      {editingUsed && <span className="self-center text-sm">Used locations cannot be renamed.</span>}
    </div>
    <div className="flex flex-wrap gap-2 rounded border-2 border-black bg-white p-3">
      <input className="min-w-56 flex-1 rounded border border-black px-3 py-2" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search locations" aria-label="Search locations"/>
      <select className="rounded border border-black px-3 py-2" value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by status">
        <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
      </select>
      <button type="button" onClick={() => { setSearch(""); setStatus("all"); }} className="rounded border-2 border-black px-3 py-2 font-bold">Clear Filters</button>
    </div>
    <div className="overflow-auto rounded border-2 border-black bg-white">
      <table className="min-w-[600px] w-full text-sm">
        <thead className="bg-cyan-800 text-white"><tr><th className="p-2 text-left">Location</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={3} className="p-5 text-center">Loading...</td></tr> : filtered.length ? filtered.map(row => {
          const active = String(row.active).toLowerCase() === "yes";
          const references = usage[row.id];
          const reason = references?.details.map(detail => `${detail.label} (${detail.count})`).join(", ") || "";
          const deleteDisabled = Boolean(busyId || usageLoading || usageError || !references || references.count);
          return <tr key={row.id} className="border-t border-black">
            <td className="p-2">{row.name}</td><td className="p-2">{active ? "Active" : "Inactive"}</td>
            <td className="flex flex-wrap gap-3 p-2">
              <button type="button" onClick={() => { setEditing(row.id); setName(row.name); setMessage(""); }} className="underline">Edit</button>
              <button type="button" disabled={Boolean(busyId)} onClick={() => void toggle(row)} className="underline disabled:opacity-50">{active ? "Deactivate" : "Activate"}</button>
              <span title={reason || (usageLoading ? "Checking usage" : usageError || "")}>
                <button type="button" disabled={deleteDisabled} onClick={() => void remove(row)} className="font-bold text-red-700 underline disabled:text-gray-500 disabled:no-underline">Delete</button>
              </span>
              {reason && <span className="text-xs text-gray-600">Used in {reason}</span>}
            </td>
          </tr>;
        }) : <tr><td colSpan={3} className="p-5 text-center">No locations found.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}