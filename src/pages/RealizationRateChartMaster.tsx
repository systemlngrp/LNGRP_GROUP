import React, { useMemo, useState } from "react";
import { Edit, Trash2 } from "lucide-react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { Spinner } from "../components/Spinner";
import { MasterHeader } from "../components/MasterHeader";
import { formatDate } from "../lib/utils";
import { chartPeriodError, type RealizationChartRow } from "../lib/orderApprovalRule";

type ChartRow = RealizationChartRow & { id: string; updatedBy?: string; updateTimestamp?: string };

// Realization Rate Chart: minimum realisation per kg for each period.
// Used by order auto-approval (an order is approved automatically only when the
// item's last RAPC is at least the rate for the order date) and shown on
// Pending Salesman Approval.
export function RealizationRateChartMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const actor = String(user?.email || user?.name || "").trim() || "System User";
  const [rows, setRows, loading] = useData<ChartRow>("realization_rate_chart", []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rate, setRate] = useState<number | "">("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = useMemo(() => [...rows].sort((a, b) => String(b.dateFrom || "").localeCompare(String(a.dateFrom || ""))), [rows]);

  const resetForm = () => {
    setDateFrom(""); setDateTo(""); setRate(""); setEditingId(null); setError(""); setIsFormOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ChartRow = {
      id: editingId || crypto.randomUUID(),
      dateFrom,
      dateTo,
      realizationRate: Number(rate),
      updatedBy: actor,
      updateTimestamp: new Date().toISOString(),
    };
    const problem = chartPeriodError(payload, rows);
    if (problem) { setError(problem); return; }
    setRows((prev) => (editingId ? prev.map((row) => (row.id === editingId ? payload : row)) : [...prev, payload]));
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    setRows((prev) => prev.filter((row) => row.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      {isFormOpen ? (
        <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">{editingId ? "Edit Rate Period" : "New Rate Period"}</h2>
      ) : (
        <MasterHeader title="Realization Rate Chart" addLabel="Add Period" onAdd={canManage ? () => setIsFormOpen(true) : undefined} />
      )}
      {!isFormOpen ? (
        <p className="text-xs text-slate-700">
          Minimum realisation per kg for each period. A new order is approved automatically only when its rate equals the last billed rate
          and the item's last RAPC is at least the rate for the order date; otherwise it waits in Pending Salesman Approval.
        </p>
      ) : null}

      {isFormOpen && (
        <div className="mx-auto w-full max-w-2xl rounded-lg border-2 border-black bg-white p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="flex flex-col space-y-1">
                <span className="text-sm font-bold text-black">Date From *</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required className="rounded border-2 border-black p-2 text-black focus:border-indigo-600 focus:outline-none" />
              </label>
              <label className="flex flex-col space-y-1">
                <span className="text-sm font-bold text-black">Date To *</span>
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} required className="rounded border-2 border-black p-2 text-black focus:border-indigo-600 focus:outline-none" />
              </label>
              <label className="flex flex-col space-y-1">
                <span className="text-sm font-bold text-black">Rate (₹/kg) *</span>
                <input type="number" step="0.01" min="0.01" value={rate} onChange={(e) => setRate(e.target.value === "" ? "" : Number(e.target.value))} required className="rounded border-2 border-black p-2 text-black focus:border-indigo-600 focus:outline-none" />
              </label>
            </div>
            {error ? <div className="rounded border border-red-600 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
            <div className="flex space-x-3 border-t border-black pt-4">
              <button type="submit" className="rounded border-2 border-black bg-emerald-600 px-8 py-2 font-bold text-white">Save</button>
              <button type="button" onClick={resetForm} className="rounded border-2 border-black bg-white px-8 py-2 font-bold text-black hover:bg-slate-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {!isFormOpen ? (
        <div className="overflow-x-auto rounded border border-black bg-white">
          <table className="w-full border-collapse border border-black text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase">Date From</th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase">Date To</th>
                <th className="border border-black px-3 py-2 text-right text-xs font-bold uppercase">Rate (₹/kg)</th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase">Updated By</th>
                <th className="border border-black px-3 py-2 text-right text-xs font-bold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="border border-black px-6 py-8"><div className="flex justify-center"><Spinner /></div></td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={5} className="border border-black px-6 py-8 text-center font-medium">No rate periods yet.</td></tr>
              ) : sorted.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border border-black px-3 py-2 font-bold">{formatDate(String(row.dateFrom || ""))}</td>
                  <td className="border border-black px-3 py-2">{formatDate(String(row.dateTo || ""))}</td>
                  <td className="border border-black px-3 py-2 text-right font-bold">{Number(row.realizationRate).toFixed(2)}</td>
                  <td className="border border-black px-3 py-2 text-xs">{row.updatedBy || "-"}</td>
                  <td className="border border-black px-3 py-2 text-right">
                    {canManage ? (
                      <>
                        <button onClick={() => { setDateFrom(String(row.dateFrom || "").slice(0, 10)); setDateTo(String(row.dateTo || "").slice(0, 10)); setRate(Number(row.realizationRate)); setEditingId(row.id); setError(""); setIsFormOpen(true); }} className="mr-4 inline-flex items-center font-bold text-indigo-600 hover:text-indigo-900">
                          <Edit size={16} className="mr-1" /> Edit
                        </button>
                        <button onClick={() => handleDelete(row.id)} className={`${deletingId === row.id ? "animate-pulse text-amber-600" : "text-red-600"} inline-flex items-center font-bold hover:text-red-900`}>
                          <Trash2 size={16} className="mr-1" /> {deletingId === row.id ? "Confirm?" : "Delete"}
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
