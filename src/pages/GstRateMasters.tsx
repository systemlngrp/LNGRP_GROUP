import React, { useMemo, useState } from "react";
import { Spinner } from "../components/Spinner";
import { MasterHeader } from "../components/MasterHeader";
import { ReportFilterBox, SelectFilter } from "../components/ReportFilterBox";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { GstRateMaster } from "../types";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function GstRateMasters() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [rates, setRates] = useData<GstRateMaster>("gst_rate_masters", []);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [active, setActive] = useState<"Yes" | "No">("Yes");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredRates = useMemo(
    () =>
      [...rates]
        .filter((entry) => (!activeFilter || (entry.active || "Yes") === activeFilter) && matchesTableSearch([entry.name, `${Number(entry.rate || 0).toFixed(2)}%`, Number(entry.rate || 0).toFixed(2), entry.active || "Yes"], searchWords(searchTerm)))
        .sort((a, b) => Number(a.rate || 0) - Number(b.rate || 0) || a.name.localeCompare(b.name)),
    [rates, searchTerm, activeFilter]
  );
  const { sorted: sortedRates, sort, toggle: toggleSort } = useTableSort(filteredRates, (row, key) =>
    key === "rate" ? Number(row.rate || 0) : key === "active" ? row.active || "Yes" : row.name
  );

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setRate("");
    setActive("Yes");
    setIsFormOpen(true);
  };

  const openEdit = (entry: GstRateMaster) => {
    setEditingId(entry.id);
    setName(entry.name);
    setRate(String(entry.rate ?? ""));
    setActive(entry.active === "No" ? "No" : "Yes");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setName("");
    setRate("");
    setActive("Yes");
    setIsFormOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const parsedRate = Number(rate);
    if (!normalizedName || !Number.isFinite(parsedRate)) return;

    const duplicate = rates.some(
      (entry) =>
        entry.id !== editingId &&
        (entry.name.toLowerCase() === normalizedName.toLowerCase() || Number(entry.rate || 0) === parsedRate)
    );
    if (duplicate) {
      alert("A GST rate with the same name or value already exists.");
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const nextRow: GstRateMaster = {
        id: editingId || crypto.randomUUID(),
        name: normalizedName,
        rate: parsedRate,
        active,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };
      await setRates(editingId ? rates.map((entry) => (entry.id === editingId ? nextRow : entry)) : [nextRow, ...rates]);
      closeForm();
    } catch (error) {
      console.error("Failed to save GST rate:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeBadge = (value?: string) => (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-black uppercase ${(value || "Yes") === "Yes" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-slate-400 bg-slate-100 text-slate-600"}`}>{(value || "Yes") === "Yes" ? "Active" : "Inactive"}</span>
  );

  return (
    <div className="space-y-4">
      {isFormOpen ? (
        <div className="mx-auto w-full max-w-xl space-y-4">
          <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">{editingId ? "Edit GST Rate" : "New GST Rate"}</h2>
          <form id="gst-rate-form" onSubmit={handleSubmit} className="space-y-4 rounded-lg border-2 border-black bg-white p-4">
            <label className="block"><span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-600">GST Name *</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus required className="h-10 w-full rounded border-2 border-black bg-white px-3 text-sm font-bold text-black focus:border-indigo-600 focus:outline-none" /></label>
            <label className="block"><span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-600">Rate % *</span><input type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required className="h-10 w-full rounded border-2 border-black bg-white px-3 text-sm font-bold text-black focus:border-indigo-600 focus:outline-none" /></label>
            <label className="block"><span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-600">Active</span>
              <select value={active} onChange={(e) => setActive(e.target.value === "No" ? "No" : "Yes")} className="h-10 w-full rounded border-2 border-black bg-white px-3 text-sm font-bold text-black focus:border-indigo-600 focus:outline-none">
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
          </form>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="submit" form="gst-rate-form" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded border-2 border-black bg-emerald-600 px-8 py-2.5 text-sm font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50">
              {isSubmitting ? <Spinner size={18} className="text-white" /> : "Save"}
            </button>
            <button type="button" onClick={closeForm} className="rounded border-2 border-black bg-white px-8 py-2.5 text-sm font-black uppercase text-black hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <MasterHeader title="GST Rate Master" addLabel="Add GST Rate" onAdd={openCreate} />
          <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={Boolean(searchTerm.trim() || activeFilter)} onClear={() => { setSearchTerm(""); setActiveFilter(""); }}>
            <SelectFilter label="Active" value={activeFilter} onChange={setActiveFilter} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />
          </ReportFilterBox>
          <div className="text-xs font-bold text-slate-700">{filteredRates.length.toLocaleString()} {filteredRates.length === 1 ? "rate" : "rates"}</div>
          <div className="overflow-hidden rounded border border-black bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-100">
                <tr>
                  <th className="border border-black px-3 py-2 text-[11px] font-black uppercase"><SortHeader label="Name" sortKey="name" sort={sort} onToggle={toggleSort} /></th>
                  <th className="w-24 border border-black px-3 py-2 text-[11px] font-black uppercase"><SortHeader label="Rate %" sortKey="rate" sort={sort} onToggle={toggleSort} align="right" /></th>
                  <th className="w-24 border border-black px-3 py-2 text-[11px] font-black uppercase"><SortHeader label="Active" sortKey="active" sort={sort} onToggle={toggleSort} align="center" /></th>
                  {canManage ? <th className="w-20 border border-black px-3 py-2 text-[11px] font-black uppercase">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredRates.length === 0 ? (
                  <tr><td colSpan={canManage ? 4 : 3} className="px-6 py-10 text-center font-medium">No GST rates found.</td></tr>
                ) : sortedRates.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="border border-black px-3 py-2 text-sm font-bold text-black">{entry.name}</td>
                    <td className="border border-black px-3 py-2 text-right text-sm font-bold">{Number(entry.rate || 0).toFixed(2)}%</td>
                    <td className="border border-black px-3 py-2 text-center">{activeBadge(entry.active)}</td>
                    {canManage ? <td className="border border-black px-3 py-2 text-center"><button type="button" onClick={() => openEdit(entry)} className="rounded border border-indigo-600 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase text-indigo-700 hover:bg-indigo-100">Edit</button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
