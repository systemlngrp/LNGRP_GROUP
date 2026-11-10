import React, { useEffect, useMemo, useRef, useState } from "react";
import { Edit, Plus, Search, Trash2 } from "lucide-react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { RapcRange } from "../types";
import { Spinner } from "../components/Spinner";
import { ClientPagination } from "../components/ClientPagination";
import { MasterHeader } from "../components/MasterHeader";
import { FILTER_DATE_INPUT, FILTER_LABEL, ReportFilterBox } from "../components/ReportFilterBox";
import { useClientPagination } from "../hooks/useClientPagination";
import { buildSeedRapcRanges } from "../lib/rapcRanges";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function RapcRangeMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [ranges, setRanges, loading] = useData<RapcRange>("rapc-ranges", []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterFrom, setFilterFrom] = useState<"" | number>("");
  const [filterTo, setFilterTo] = useState<"" | number>("");
  const [fromValue, setFromValue] = useState<number | "">("");
  const [toValue, setToValue] = useState<number | "">("");
  const [rapcRangeValue, setRapcRangeValue] = useState<number | "">("");
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Seed the default ranges once per visit when the table is empty. A failed
  // save must not trigger another seed attempt in a loop.
  const seededRef = useRef(false);
  useEffect(() => {
    if (loading || ranges.length > 0 || seededRef.current) return;
    seededRef.current = true;
    setRanges(buildSeedRapcRanges());
  }, [loading, ranges.length, setRanges]);

  const resetForm = () => {
    setFromValue("");
    setToValue("");
    setRapcRangeValue("");
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromValue === "" || toValue === "" || rapcRangeValue === "") return;

    setIsSubmitting(true);
    setTimeout(() => {
      const audit = {
        updatedBy: "System User",
        updateTimestamp: new Date().toISOString(),
      };
      const payload: RapcRange = {
        id: editingId || crypto.randomUUID(),
        from: Number(fromValue),
        to: Number(toValue),
        rapcRange: Number(rapcRangeValue),
        ...audit,
      };

      if (editingId) {
        setRanges((prev) => prev.map((row) => (row.id === editingId ? payload : row)));
      } else {
        setRanges((prev) => [...prev, payload]);
      }

      resetForm();
      setIsSubmitting(false);
    }, 300);
  };

  const handleDelete = (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    setRanges((prev) => prev.filter((row) => row.id !== id));
    setDeletingId(null);
  };

  const filteredRanges = useMemo(() => {
    const words = searchWords(searchTerm);
    return ranges.filter((row) => {
      if (!words.length && filterFrom === '' && filterTo === '') return true;
      const matchesSearch = matchesTableSearch([row.from, row.to, row.rapcRange], words);
      const matchesFrom = filterFrom === '' || row.from >= Number(filterFrom);
      const matchesTo = filterTo === '' || row.to <= Number(filterTo);
      return matchesSearch && matchesFrom && matchesTo;
    });
  }, [ranges, searchTerm, filterFrom, filterTo]);
  const { sorted: sortedRanges, sort, toggle: toggleSort } = useTableSort(filteredRanges, (row, key) => (row as any)[key]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedRanges,
  } = useClientPagination(sortedRanges, 25);

  return (
    <div className="space-y-4">
      {isFormOpen ? (
        <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">{editingId ? "Edit RAPC Range" : "New RAPC Range"}</h2>
      ) : (
        <MasterHeader title="RAPC Range Master" addLabel="Add RAPC Range" onAdd={() => setIsFormOpen(true)} />
      )}

      {isFormOpen && (
        <div className="mx-auto w-full max-w-2xl rounded-lg border-2 border-black bg-white p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col space-y-1">
                <label className="font-bold text-black text-sm">From *</label>
                <input
                  autoFocus
                  type="number"
                  value={fromValue}
                  onChange={(e) => setFromValue(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                  className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="font-bold text-black text-sm">To *</label>
                <input
                  type="number"
                  value={toValue}
                  onChange={(e) => setToValue(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                  className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="font-bold text-black text-sm">RAPC Range *</label>
                <input
                  type="number"
                  value={rapcRangeValue}
                  onChange={(e) => setRapcRangeValue(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                  className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>
            <div className="flex space-x-3 pt-4 border-t border-black">
              <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-8 py-2 rounded font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all">
                {isSubmitting ? <Spinner size={20} className="text-white" /> : "Save"}
              </button>
              <button type="button" onClick={resetForm} className="bg-white text-black border-2 border-black px-8 py-2 rounded font-bold hover:bg-slate-50 transition shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!isFormOpen ? (<>
      <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={Boolean(searchTerm.trim() || filterFrom !== "" || filterTo !== "")} onClear={() => { setSearchTerm(""); setFilterFrom(""); setFilterTo(""); }}>
        <label className="min-w-0"><span className={FILTER_LABEL}>From (min)</span><input type="number" inputMode="numeric" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Any" className={FILTER_DATE_INPUT} /></label>
        <label className="min-w-0"><span className={FILTER_LABEL}>To (max)</span><input type="number" inputMode="numeric" value={filterTo} onChange={(e) => setFilterTo(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Any" className={FILTER_DATE_INPUT} /></label>
      </ReportFilterBox>

      <div className="text-xs font-bold text-slate-700">{filteredRanges.length.toLocaleString()} {filteredRanges.length === 1 ? "range" : "ranges"}</div>

      <div className="bg-white rounded shadow-sm overflow-x-auto border border-black">
        <div className="table-sticky-scroll">
          <table className="w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 sticky top-0 z-10">
              <tr className="divide-x divide-black">
                <th className="border border-black px-3 py-2 text-right text-xs font-bold text-black uppercase tracking-wider">SL No</th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold text-black uppercase tracking-wider"><SortHeader label="From" sortKey="from" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold text-black uppercase tracking-wider"><SortHeader label="To" sortKey="to" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold text-black uppercase tracking-wider"><SortHeader label="RAPC Range" sortKey="rapcRange" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-2 text-right text-xs font-bold text-black uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-black">
              {loading ? (
                <tr>
                  <td colSpan={5} className="border border-black px-6 py-8 text-center text-black">
                    <div className="flex justify-center">
                      <Spinner />
                    </div>
                  </td>
                </tr>
              ) : paginatedRanges.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-black px-6 py-8 text-center text-black font-medium">
                    No RAPC ranges found.
                  </td>
                </tr>
              ) : (
                paginatedRanges.map((row, index) => (
                  <tr key={row.id} className="divide-x divide-black hover:bg-slate-50">
                    <td className="border border-black px-3 py-2 whitespace-nowrap text-sm font-bold text-black text-right">{(page - 1) * pageSize + index + 1}</td>
                    <td className="border border-black px-3 py-2 whitespace-nowrap text-sm font-bold text-black">{row.from}</td>
                    <td className="border border-black px-3 py-2 whitespace-nowrap text-sm text-black">{row.to}</td>
                    <td className="border border-black px-3 py-2 whitespace-nowrap text-sm text-black">{row.rapcRange}</td>
                    <td className="border border-black px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                      {canManage ? <button
                        onClick={() => {
                          setFromValue(row.from);
                          setToValue(row.to);
                          setRapcRangeValue(row.rapcRange);
                          setEditingId(row.id);
                          setIsFormOpen(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-900 mr-4 font-bold inline-flex items-center"
                      >
                        <Edit size={16} className="mr-1" /> Edit
                      </button> : null}
                      <button
                        onClick={() => handleDelete(row.id)}
                        className={`${deletingId === row.id ? "text-amber-600 animate-pulse" : "text-red-600"} hover:text-red-900 font-bold inline-flex items-center min-w-[80px] justify-end`}
                      >
                        <Trash2 size={16} className="mr-1" /> {deletingId === row.id ? "Confirm?" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      </>) : null}
    </div>
  );
}
