import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Edit, Eye, RotateCcw, Save, Search } from "lucide-react";
import { Select } from "../components/Select";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
import { useData } from "../hooks/useData";
import { SortHeader, useTableSort } from "../lib/tableSort";
import type { ExpenseMaster, FixedDailyExpense, FixedMonthlyExpenseLine } from "../types";

function todayLocalDate() {
  const date = new Date();
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function newLine(expenseName = "", amount = 0): FixedMonthlyExpenseLine {
  return { id: crypto.randomUUID(), expenseName, amount };
}

function normalizeLines(value: FixedDailyExpense["lines"] | string | undefined): FixedMonthlyExpenseLine[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

export function FixedDailyExpenses({ view = "form" }: { view?: "form" | "master" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [records, setRecords] = useData<FixedDailyExpense>("fixed_daily_expenses", []);
  const [expenseMasters] = useData<ExpenseMaster>("expense_masters", []);
  const [date, setDate] = useState(todayLocalDate());
  const [lines, setLines] = useState<FixedMonthlyExpenseLine[]>([]);
  const [viewRecord, setViewRecord] = useState<(FixedDailyExpense & { lines: FixedMonthlyExpenseLine[] }) | null>(null);

  const normalizedRecords = useMemo(
    () => records.map((record) => ({ ...record, lines: normalizeLines(record.lines) })),
    [records]
  );

  const expenseOptions = useMemo(() => {
    const names = new Map<string, string>();
    expenseMasters
      .filter((expense) => expense.type === "Daily")
      .forEach((expense) => {
        const name = String(expense.name || "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (!names.has(key)) names.set(key, name);
      });

    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [expenseMasters]);

  const buildDailyLines = (sourceLines: FixedMonthlyExpenseLine[] = []) => {
    const amountByExpense = new Map(sourceLines.map((line) => [line.expenseName.trim().toLowerCase(), Number(line.amount || 0)]));
    return expenseOptions.map((expenseName) => newLine(expenseName, amountByExpense.get(expenseName.toLowerCase()) || 0));
  };

  useEffect(() => {
    const existing = normalizedRecords.find((record) => record.date === date);
    setLines((current) => buildDailyLines(existing ? normalizeLines(existing.lines) : current));
  }, [expenseOptions, date, normalizedRecords]);

  const totalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    [lines]
  );

  const savedRows = useMemo(
    () => normalizedRecords.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [normalizedRecords]
  );

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return savedRows.filter((record) =>
      (!fromDate || String(record.date || "") >= fromDate) &&
      (!toDate || String(record.date || "") <= toDate) &&
      matchesTableSearch(rowSearchText([formatDate(record.date), normalizeLines(record.lines).map((line) => line.expenseName).join(", "), formatMoney(Number(record.totalAmount || 0))]), words)
    );
  }, [savedRows, searchTerm, fromDate, toDate]);
  const hasFilters = Boolean(searchTerm.trim() || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(""); setFromDate(""); setToDate(""); };
  const filteredTotal = filteredRows.reduce((sum, record) => sum + Number(record.totalAmount || 0), 0);

  // Opened from the Master's Edit: load that date.
  useEffect(() => {
    if (view !== "form") return;
    const qDate = searchParams.get("date");
    if (qDate) setDate(qDate);
  }, [view, searchParams]);
  const handleEdit = (record: FixedDailyExpense) => {
    if (view === "master") navigate(`/fixed-expenses/daily-form?date=${encodeURIComponent(record.date)}`);
    else loadRecord(record);
  };

  const viewLines = viewRecord ? normalizeLines(viewRecord.lines) : [];
  // Column sorts: saved records table and the View popup's expense lines.
  const { sorted: sortedSavedRows, sort: savedSort, toggle: toggleSavedSort } = useTableSort(filteredRows, (record, key) => {
    if (key === "expenses") return normalizeLines(record.lines).map((line) => line.expenseName).join(", ");
    if (key === "totalAmount") return Number(record.totalAmount || 0);
    return record.date;
  });
  const { sorted: sortedViewLines, sort: viewSort, toggle: toggleViewSort, setSort: setViewSort } = useTableSort(viewLines, (line, key) => (key === "amount" ? Number(line.amount || 0) : line.expenseName || ""), [viewRecord]);
  useEffect(() => { setViewSort(null); }, [viewRecord, setViewSort]);
  const viewTotalAmount = viewLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

  const resetForm = () => {
    setDate(todayLocalDate());
    setLines(buildDailyLines());
  };

  const loadRecord = (record: FixedDailyExpense) => {
    setDate(record.date);
    setLines(buildDailyLines(normalizeLines(record.lines)));
  };

  const updateLine = (id: string, amount: number) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, amount } : line)));
  };

  const handleSave = async () => {
    const cleanLines = lines
      .map((line) => ({
        ...line,
        expenseName: line.expenseName.trim(),
        amount: Number(line.amount || 0),
      }))
      .filter((line) => line.expenseName || line.amount > 0);

    if (!date) {
      alert("Please select date.");
      return;
    }
    if (!cleanLines.length) {
      alert("Please add at least one daily expense in Expense Master.");
      return;
    }

    const existing = normalizedRecords.find((record) => record.date === date);
    const nextRecord: FixedDailyExpense = {
      id: existing?.id || crypto.randomUUID(),
      date,
      lines: cleanLines,
      totalAmount: cleanLines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
      updatedBy: "System User",
      updateTimestamp: new Date().toISOString(),
    };

    await setRecords((current) => {
      const exists = current.some((record) => record.id === nextRecord.id || record.date === nextRecord.date);
      return exists ? current.map((record) => (record.id === nextRecord.id || record.date === nextRecord.date ? nextRecord : record)) : [nextRecord, ...current];
    });
    alert("Fixed daily expenses saved.");
  };

  if (view === "form") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-900 pb-3">
          <h1 className="text-xl font-bold uppercase tracking-tight text-black">Fixed Daily Expenses Form</h1>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-slate-500">Total Amount</p>
            <p className="text-xl font-black text-blue-700">{formatMoney(totalAmount)}</p>
          </div>
        </div>

      <div className="rounded-lg border border-gray-900 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm font-bold">
            Date
            <input className="mt-1 w-full rounded border border-gray-900 p-2" type="date" value={date} max={todayLocalDate()} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-gray-900 p-2 text-left">Expenses</th>
                <th className="border border-gray-900 p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="border border-gray-900 p-2 font-bold text-black">{line.expenseName}</td>
                  <td className="border border-gray-900 p-2">
                    <input
                      className="w-full rounded border border-slate-300 p-2 text-right"
                      type="number"
                      min="0"
                      step="0.01"
                      value={Number(line.amount || 0) > 0 ? line.amount : ""}
                      onChange={(event) => updateLine(line.id, Number(event.target.value || 0))}
                    />
                  </td>
                </tr>
              ))}
              {!lines.length && (
                <tr>
                  <td className="border border-gray-900 p-4 text-center text-slate-500" colSpan={2}>
                    No daily expenses found in Expense Master.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-black">
                <td className="border border-gray-900 p-2 text-right">Total</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className="inline-flex items-center justify-center gap-2 rounded bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white" type="button" onClick={handleSave}>
            <Save size={16} /> Save
          </button>
          <button className="inline-flex items-center justify-center gap-2 rounded border border-gray-900 px-6 py-2.5 text-sm font-bold" type="button" onClick={resetForm}>
            <RotateCcw size={16} /> Clear
          </button>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h1 className="text-xl font-bold uppercase tracking-tight text-black">Fixed Daily Expenses Master</h1>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[280px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700">
        <span>{filteredRows.length.toLocaleString()} {filteredRows.length === 1 ? "record" : "records"}</span>
        <span>Total <span className="text-blue-700">{formatMoney(filteredTotal)}</span></span>
      </div>

      {/* Phones: one card per record. */}
      <div className="space-y-2 md:hidden">
        {sortedSavedRows.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm text-slate-500">No records found.</div>
        ) : sortedSavedRows.map((record) => (
          <div key={record.id} className="rounded-lg border-2 border-black bg-white p-3 text-black">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black">{formatDate(record.date)}</span>
              <span className="text-sm font-black text-blue-700">{formatMoney(Number(record.totalAmount || 0))}</span>
            </div>
            <div className="mt-1 break-words text-xs text-slate-700">{normalizeLines(record.lines).filter((line) => Number(line.amount || 0) > 0).map((line) => line.expenseName).join(", ") || "-"}</div>
            <div className="mt-2 flex justify-end gap-2">
              <button className="inline-flex items-center gap-1 rounded border border-gray-900 px-3 py-1.5 text-xs font-bold" type="button" onClick={() => setViewRecord(record)}><Eye size={14} /> View</button>
              <button className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white" type="button" onClick={() => handleEdit(record)}><Edit size={14} /> Edit</button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-gray-900 bg-white md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-gray-900 p-2 text-left"><SortHeader label="Date" sortKey="date" sort={savedSort} onToggle={toggleSavedSort} align="left" /></th>
              <th className="border border-gray-900 p-2 text-left"><SortHeader label="Expenses" sortKey="expenses" sort={savedSort} onToggle={toggleSavedSort} align="left" /></th>
              <th className="border border-gray-900 p-2 text-right"><SortHeader label="Total Amount" sortKey="totalAmount" sort={savedSort} onToggle={toggleSavedSort} align="right" /></th>
              <th className="border border-gray-900 p-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedSavedRows.map((record) => (
              <tr key={record.id}>
                <td className="border border-gray-900 p-2 font-bold">{formatDate(record.date)}</td>
                <td className="border border-gray-900 p-2">{normalizeLines(record.lines).map((line) => line.expenseName).join(", ") || "-"}</td>
                <td className="border border-gray-900 p-2 text-right font-bold">{formatMoney(Number(record.totalAmount || 0))}</td>
                <td className="border border-gray-900 p-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button className="inline-flex items-center gap-2 rounded border border-gray-900 px-3 py-1.5 text-xs font-bold" type="button" onClick={() => setViewRecord(record)} title="View details" aria-label="View details">
                      <Eye size={14} />
                    </button>
                    <button className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white" type="button" onClick={() => handleEdit(record)}>
                      <Edit size={14} /> Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!sortedSavedRows.length && (
              <tr>
                <td className="border border-gray-900 p-4 text-center text-slate-500" colSpan={4}>
                  No fixed daily expenses saved.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {viewRecord ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewRecord(null)}>
          <div className="w-full max-w-2xl rounded border-2 border-gray-900 bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-gray-900 px-5 py-4">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Fixed Daily Expenses</h3>
                <p className="mt-1 text-sm font-bold text-slate-600">Date: {formatDate(viewRecord.date)}</p>
              </div>
              <button className="rounded border border-gray-900 px-3 py-1.5 text-sm font-bold hover:bg-slate-100" type="button" onClick={() => setViewRecord(null)}>
                Close
              </button>
            </div>
            <div className="p-5">
              <div className="overflow-hidden rounded border border-gray-900 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="w-20 border border-gray-900 p-2 text-left">Sl No</th>
                      <th className="border border-gray-900 p-2 text-left"><SortHeader label="Expense" sortKey="expenseName" sort={viewSort} onToggle={toggleViewSort} align="left" /></th>
                      <th className="w-40 border border-gray-900 p-2 text-right"><SortHeader label="Amount" sortKey="amount" sort={viewSort} onToggle={toggleViewSort} align="right" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedViewLines.map((line, index) => (
                      <tr key={line.id || `${line.expenseName}-${index}`}>
                        <td className="border border-gray-900 p-2 font-bold">{index + 1}</td>
                        <td className="border border-gray-900 p-2">{line.expenseName || "-"}</td>
                        <td className="border border-gray-900 p-2 text-right font-bold">{formatMoney(Number(line.amount || 0))}</td>
                      </tr>
                    ))}
                    {!viewLines.length && (
                      <tr>
                        <td className="border border-gray-900 p-4 text-center text-slate-500" colSpan={3}>
                          No expenses found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-black">
                      <td className="border border-gray-900 p-2 text-right" colSpan={2}>
                        Total
                      </td>
                      <td className="border border-gray-900 p-2 text-right">{formatMoney(Number(viewRecord.totalAmount || 0) || viewTotalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}