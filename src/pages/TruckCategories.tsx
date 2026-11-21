import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import type { Truck, TruckCategory } from "../types";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const STATUS_OPTIONS = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];
const USAGE_OPTIONS = [{ value: "used", label: "Used" }, { value: "unused", label: "Not Used" }];

// Truck Category Master: categories picked in the Truck form (trucks.categoryId).
// A category used by trucks cannot be deleted; make it Inactive instead.
export function TruckCategories() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [rows, , loading, api] = useData<TruckCategory>("truck_categories", [], { firmScope: "all" });
  const [trucks] = useData<Truck>("trucks", []);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [usageFilter, setUsageFilter] = useState("");
  const [busyId, setBusyId] = useState("");

  const truckCount = useMemo(() => {
    const counts = new Map<string, number>();
    trucks.forEach((truck) => {
      const id = String(truck.categoryId || "");
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }, [trucks]);

  const filtered = useMemo(() => {
    const words = searchWords(search);
    return rows.filter((row) => {
      const active = String(row.active).toLowerCase() === "yes";
      const used = (truckCount.get(row.id) || 0) > 0;
      return matchesTableSearch([row.name, row.description, active ? "Active" : "Inactive", truckCount.get(row.id) || 0], words) &&
        (!status || (status === "active" ? active : !active)) &&
        (!usageFilter || (usageFilter === "used" ? used : !used));
    });
  }, [rows, search, status, usageFilter, truckCount]);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filtered, (row, key) =>
    key === "status" ? (String(row.active).toLowerCase() === "yes" ? "Active" : "Inactive")
      : key === "trucks" ? truckCount.get(row.id) || 0
      : (row as any)[key], [truckCount]);

  const resetForm = () => { setEditing(""); setName(""); setDescription(""); };

  const save = async () => {
    const value = name.trim();
    if (!value) return setMessage("Category Name is required.");
    const duplicate = rows.find((row) => row.id !== editing && row.name.trim().toLowerCase() === value.toLowerCase());
    if (duplicate) return setMessage("This category already exists.");
    const old = rows.find((row) => row.id === editing);
    if (editing && !old) return setMessage("Category not found. Refresh and try again.");
    const item: TruckCategory = {
      id: old?.id || `TRUCKCAT-${crypto.randomUUID()}`,
      name: value,
      description: description.trim(),
      active: old?.active || "Yes",
      updatedBy: "System User",
      updateTimestamp: new Date().toISOString(),
    };
    setBusyId(item.id);
    setMessage("");
    try {
      if (old) await api.saveItem(item); else await api.addItem(item);
      resetForm();
      setMessage("Category saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save category.");
    } finally { setBusyId(""); }
  };

  const toggle = async (row: TruckCategory) => {
    setBusyId(row.id);
    setMessage("");
    try {
      await api.saveItem({ ...row, active: String(row.active).toLowerCase() === "yes" ? "No" : "Yes", updatedBy: "System User", updateTimestamp: new Date().toISOString() });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update status.");
    } finally { setBusyId(""); }
  };

  const remove = async (row: TruckCategory) => {
    if ((truckCount.get(row.id) || 0) > 0 || busyId) return;
    if (!window.confirm(`Delete category "${row.name}"?`)) return;
    setBusyId(row.id);
    setMessage("");
    try {
      await api.removeItem(row.id);
      if (editing === row.id) resetForm();
      setMessage("Category deleted.");
    } catch {
      setMessage("Unable to delete this category. It may be used by a truck.");
    } finally { setBusyId(""); }
  };

  return <div className="space-y-4">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Truck Category Master</h2></div>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    {canManage ? <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 sm:max-w-xs"><span className={LABEL}>Category Name *</span><input placeholder="e.g. 14 ft" className="w-full rounded border-2 border-black px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="min-w-0 flex-1 sm:max-w-sm"><span className={LABEL}>Description</span><input placeholder="Optional" className="w-full rounded border-2 border-black px-3 py-2" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <button type="button" disabled={Boolean(busyId)} onClick={() => void save()} title={editing ? "Update" : "Add"} aria-label={editing ? "Update" : "Add"} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-700 font-bold text-white hover:bg-cyan-800 disabled:opacity-50">{editing ? <Check size={18} /> : <Plus size={18} />}</button>
      {editing && <button type="button" onClick={resetForm} className="rounded border-2 border-black px-4 py-2 font-bold">Cancel</button>}
    </div> : null}
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" aria-label="Search categories" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
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
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-cyan-800 text-white"><tr>
          <th className="p-2 text-left"><SortHeader label="Category" sortKey="name" sort={sort} onToggle={toggleSort} /></th>
          <th className="p-2 text-left"><SortHeader label="Description" sortKey="description" sort={sort} onToggle={toggleSort} /></th>
          <th className="p-2 text-center"><SortHeader label="Trucks" sortKey="trucks" sort={sort} onToggle={toggleSort} align="center" /></th>
          <th className="p-2 text-left"><SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} /></th>
          <th className="p-2 text-left">Actions</th>
        </tr></thead>
        <tbody>{loading ? <tr><td colSpan={5} className="p-5 text-center">Loading...</td></tr> : sortedRows.length ? sortedRows.map((row) => {
          const active = String(row.active).toLowerCase() === "yes";
          const used = truckCount.get(row.id) || 0;
          return <tr key={row.id} className="border-t border-black">
            <td className="p-2 font-bold">{row.name}</td>
            <td className="p-2">{row.description || "-"}</td>
            <td className="p-2 text-center font-bold">{used}</td>
            <td className="p-2">{active ? "Active" : "Inactive"}</td>
            <td className="flex flex-wrap items-center gap-3 p-2">
              {canManage ? <button type="button" onClick={() => { setEditing(row.id); setName(row.name); setDescription(row.description || ""); setMessage(""); }} className="underline">Edit</button> : null}
              {canManage ? <button type="button" disabled={Boolean(busyId)} onClick={() => void toggle(row)} className="underline disabled:opacity-50">{active ? "Deactivate" : "Activate"}</button> : null}
              {canManage ? <button type="button" disabled={Boolean(busyId) || used > 0} title={used > 0 ? `Used by ${used} truck${used > 1 ? "s" : ""}` : "Delete"} onClick={() => void remove(row)} className="font-bold text-red-700 underline disabled:text-gray-500 disabled:no-underline">Delete</button> : null}
              {used > 0 ? <span className="text-xs text-gray-600">Used by {used} truck{used > 1 ? "s" : ""}</span> : null}
            </td>
          </tr>;
        }) : <tr><td colSpan={5} className="p-5 text-center text-slate-500">No categories yet.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
