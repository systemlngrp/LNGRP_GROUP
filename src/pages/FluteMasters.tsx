import React, { useState } from "react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { Edit, Trash2 } from "lucide-react";
import { Spinner } from "../components/Spinner";
import { MasterHeader } from "../components/MasterHeader";
import { ReportFilterBox } from "../components/ReportFilterBox";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { FluteMaster } from "../types";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { normalizeFlute } from "../lib/fluteBatch";

// Flute → Batch No. The Production Form and Production Plan take each job's
// Flute Batch from here, and the Production Plan runs batches in ascending order.
export function FluteMasters() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [flutes, setFlutes, loading] = useData<FluteMaster>("flute_masters", []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [flute, setFlute] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    setFlutes(flutes.filter((row) => row.id !== id));
    setDeletingId(null);
  };

  const resetForm = () => {
    setFlute("");
    setBatchNo("");
    setEditingId(null);
  };

  const startEdit = (row: FluteMaster) => {
    setFlute(row.flute);
    setBatchNo(String(row.batchNo ?? ""));
    setEditingId(row.id);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFlute = normalizeFlute(flute);
    const batch = Number(batchNo);
    if (!cleanFlute) return;
    if (!Number.isInteger(batch) || batch < 1) {
      alert("Batch No must be a whole number of 1 or more.");
      return;
    }
    if (flutes.some((row) => normalizeFlute(row.flute) === cleanFlute && row.id !== editingId)) {
      alert(`Flute "${cleanFlute}" already exists.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const audit = {
        updatedBy: user?.name || "System User",
        updateTimestamp: new Date().toISOString(),
      };
      if (editingId) {
        await setFlutes(flutes.map((row) => (row.id === editingId ? { ...row, flute: cleanFlute, batchNo: batch, ...audit } : row)));
      } else {
        await setFlutes([...flutes, { id: crypto.randomUUID(), flute: cleanFlute, batchNo: batch, ...audit }]);
      }
      resetForm();
      setIsFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = flutes
    .filter((row) => matchesTableSearch([row.flute, String(row.batchNo ?? "")], searchWords(searchTerm)))
    .sort((a, b) => Number(a.batchNo || 0) - Number(b.batchNo || 0) || String(a.flute).localeCompare(String(b.flute)));
  const { sorted, sort, toggle: toggleSort } = useTableSort(filtered, (row, key) =>
    key === "batchNo" ? Number(row.batchNo || 0) : row.flute
  );

  return (
    <div className="space-y-4">
      {isFormOpen ? (
        <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">{editingId ? "Edit Flute" : "New Flute"}</h2>
      ) : (
        <MasterHeader title="Flute Master" addLabel="Add Flute" onAdd={() => setIsFormOpen(true)} />
      )}

      {isFormOpen ? (
        <div className="mx-auto w-full max-w-xl rounded-lg border-2 border-black bg-white p-4">
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Flute *</label>
              <input
                type="text"
                value={flute}
                onChange={(e) => setFlute(e.target.value.toUpperCase())}
                placeholder="e.g. A, B, B+C"
                required
                className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Batch No *</label>
              <input
                type="number"
                min={1}
                step={1}
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                required
                className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
              />
              <span className="text-xs text-slate-600">Production Plan runs Batch 1 first, then 2, 3 and so on.</span>
            </div>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-6 py-2 rounded font-bold hover:bg-emerald-700 transition border border-black min-w-[100px]">
                {isSubmitting ? <Spinner size={20} className="text-white" /> : "Save"}
              </button>
              <button type="button" onClick={() => { setIsFormOpen(false); resetForm(); }} className="bg-white text-black border-2 border-black px-6 py-2 rounded font-bold hover:bg-slate-50 transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={Boolean(searchTerm.trim())} onClear={() => setSearchTerm("")} />
          <div className="text-xs font-bold text-slate-700">{filtered.length.toLocaleString()} {filtered.length === 1 ? "flute" : "flutes"}</div>
          <div className="bg-white rounded shadow-sm border border-black table-sticky-scroll">
            <table className="min-w-full divide-y divide-black border-collapse border border-black">
              <thead className="sticky top-0 z-30 bg-slate-100 divide-x divide-black">
                <tr className="divide-x divide-black">
                  <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Flute" sortKey="flute" sort={sort} onToggle={toggleSort} align="left" /></th>
                  <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Batch No" sortKey="batchNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                  <th className="px-6 py-3 text-right text-sm font-bold text-black uppercase border border-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black bg-white">
                {loading ? (
                  <tr><td colSpan={3} className="px-6 py-8 text-center"><Spinner size={24} /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-black font-medium">No flutes found.</td></tr>
                ) : (
                  sorted.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 divide-x divide-black">
                      <td className="px-6 py-4 text-sm font-bold text-black border border-black">{row.flute}</td>
                      <td className="px-6 py-4 text-sm text-black border border-black">{row.batchNo}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium border border-black whitespace-nowrap">
                        {canManage ? <button onClick={() => startEdit(row)} className="text-indigo-600 hover:text-indigo-900 mr-4 font-bold inline-flex items-center">
                          <Edit size={16} className="mr-1" /> Edit
                        </button> : null}
                        {canManage ? <button
                          onClick={() => handleDelete(row.id)}
                          className={`${deletingId === row.id ? "text-amber-600 animate-pulse" : "text-red-600"} hover:text-red-900 font-bold inline-flex items-center min-w-[80px] justify-end`}
                        >
                          <Trash2 size={16} className="mr-1" /> {deletingId === row.id ? "Confirm?" : "Delete"}
                        </button> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
