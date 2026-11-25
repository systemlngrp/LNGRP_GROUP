import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit, Trash2, X } from "lucide-react";
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
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<{ from: number | ""; to: number | ""; rapcRange: number | "" }>({ from: "", to: "", rapcRange: "" });
  const who = String((user as any)?.name || user?.id || "User");

  /** Error text when a From–To range is invalid or overlaps another row (excluding ignoreId). */
  const rangeError = (from: number, to: number, rapcRange: number, ignoreId?: string | null) => {
    if (![from, to, rapcRange].every((value) => Number.isFinite(value))) return "From, To and RAPC Range are required.";
    if (from < 0 || to < 0 || rapcRange < 0) return "Values cannot be negative.";
    if (from > to) return `From (${from}) cannot be more than To (${to}).`;
    const clash = ranges.find((row) => row.id !== ignoreId && from <= Number(row.to) && Number(row.from) <= to);
    if (clash) return `${from}–${to} overlaps the existing range ${clash.from}–${clash.to} (RAPC ${clash.rapcRange}). From/To cannot repeat.`;
    return "";
  };

  const startInline = (row: RapcRange) => {
    setInlineId(row.id);
    setInlineDraft({ from: row.from, to: row.to, rapcRange: row.rapcRange });
  };

  const saveInline = (row: RapcRange) => {
    const from = inlineDraft.from === "" ? NaN : Number(inlineDraft.from);
    const to = inlineDraft.to === "" ? NaN : Number(inlineDraft.to);
    const rapcRange = inlineDraft.rapcRange === "" ? NaN : Number(inlineDraft.rapcRange);
    const error = rangeError(from, to, rapcRange, row.id);
    if (error) { alert(error); return; }
    setRanges((prev) => prev.map((item) => (item.id === row.id ? { ...item, from, to, rapcRange, updatedBy: who, updateTimestamp: new Date().toISOString() } : item)));
    setInlineId(null);
  };

  // Rows that already overlap another row (shown in red so they can be corrected).
  const overlappingIds = useMemo(() => {
    const ids = new Set<string>();
    ranges.forEach((a) => ranges.forEach((b) => {
      if (a.id !== b.id && Number(a.from) <= Number(b.to) && Number(b.from) <= Number(a.to)) ids.add(a.id);
    }));
    return ids;
  }, [ranges]);

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
    const error = rangeError(Number(fromValue), Number(toValue), Number(rapcRangeValue), editingId);
    if (error) { alert(error); return; }

    setIsSubmitting(true);
    setTimeout(() => {
      const audit = {
        updatedBy: who,
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

      <div className="text-xs font-bold text-slate-700">{filteredRanges.length.toLocaleString()} {filteredRanges.length === 1 ? "range" : "ranges"}{overlappingIds.size ? <span className="ml-3 text-red-700">{overlappingIds.size} rows overlap another row (shown in red): correct them so From/To do not repeat.</span> : null}</div>

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
                  <tr key={row.id} className={`divide-x divide-black ${overlappingIds.has(row.id) ? "bg-red-50" : "hover:bg-slate-50"}`}>
                    <td className="border border-black px-3 py-2 whitespace-nowrap text-sm font-bold text-black text-right">{(page - 1) * pageSize + index + 1}</td>
                    {inlineId === row.id ? (
                      (["from", "to", "rapcRange"] as const).map((field) => (
                        <td key={field} className="border border-black px-2 py-1">
                          <input
                            type="number"
                            autoFocus={field === "from"}
                            value={inlineDraft[field]}
                            onChange={(e) => setInlineDraft((prev) => ({ ...prev, [field]: e.target.value === "" ? "" : Number(e.target.value) }))}
                            onKeyDown={(e) => { if (e.key === "Enter") saveInline(row); if (e.key === "Escape") setInlineId(null); }}
                            className="w-28 rounded border-2 border-indigo-600 bg-yellow-50 px-2 py-1 text-sm font-bold text-black focus:outline-none"
                          />
                        </td>
                      ))
                    ) : (
                      <>
                        <td className={`border border-black px-3 py-2 whitespace-nowrap text-sm font-bold ${overlappingIds.has(row.id) ? "text-red-700" : "text-black"}`}>{row.from}</td>
                        <td className={`border border-black px-3 py-2 whitespace-nowrap text-sm ${overlappingIds.has(row.id) ? "font-bold text-red-700" : "text-black"}`}>{row.to}</td>
                        <td className="border border-black px-3 py-2 whitespace-nowrap text-sm text-black">{row.rapcRange}</td>
                      </>
                    )}
                    <td className="border border-black px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                      {canManage && inlineId === row.id ? (
                        <>
                          <button type="button" onClick={() => saveInline(row)} title="Save" className="mr-3 inline-flex items-center font-bold text-emerald-700 hover:text-emerald-900"><Check size={16} className="mr-1" /> Save</button>
                          <button type="button" onClick={() => setInlineId(null)} title="Cancel" className="mr-4 inline-flex items-center font-bold text-slate-600 hover:text-black"><X size={16} className="mr-1" /> Cancel</button>
                        </>
                      ) : canManage ? <button
                        type="button"
                        onClick={() => startInline(row)}
                        title="Edit"
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
