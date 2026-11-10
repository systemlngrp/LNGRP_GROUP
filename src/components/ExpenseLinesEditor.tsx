import React, { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FixedMonthlyExpenseLine } from "../types";

// Expense lines of the Fixed Monthly / Daily Expenses forms: one row per
// expense with its amount, rows can be added (pick a known expense or type a
// new one) and removed. Rows, not a table, so it fits phones without scrolling.

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ExpenseLinesEditor({
  lines,
  onChange,
  suggestions,
  emptyText,
}: {
  lines: FixedMonthlyExpenseLine[];
  onChange: (lines: FixedMonthlyExpenseLine[]) => void;
  suggestions: string[];
  emptyText: string;
}) {
  const listId = useId();
  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const update = (id: string, patch: Partial<FixedMonthlyExpenseLine>) => onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const remove = (id: string) => onChange(lines.filter((line) => line.id !== id));
  const add = () => onChange([...lines, { id: crypto.randomUUID(), expenseName: "", amount: 0 }]);
  const used = new Set(lines.map((line) => line.expenseName.trim().toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[minmax(0,1fr)_180px_40px] gap-2 px-1 text-[10px] font-black uppercase tracking-wide text-slate-600 sm:grid">
        <span>Expense</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      {lines.length === 0 ? (
        <div className="rounded border border-dashed border-slate-400 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500">{emptyText}</div>
      ) : (
        lines.map((line, index) => (
          <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 rounded border border-slate-300 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_180px_40px] sm:items-center">
            <input
              list={listId}
              value={line.expenseName}
              onChange={(event) => update(line.id, { expenseName: event.target.value })}
              placeholder={`Expense ${index + 1}`}
              aria-label={`Expense ${index + 1} name`}
              className="h-10 w-full min-w-0 rounded border-2 border-black bg-white px-3 text-sm font-bold text-black focus:border-indigo-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => remove(line.id)}
              title="Remove expense"
              aria-label={`Remove ${line.expenseName || `expense ${index + 1}`}`}
              className="row-span-2 flex h-10 w-10 items-center justify-center self-start rounded border-2 border-red-600 bg-red-50 text-red-700 hover:bg-red-100 sm:order-3 sm:row-span-1"
            >
              <Trash2 size={16} />
            </button>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={Number(line.amount || 0) > 0 ? line.amount : ""}
              onChange={(event) => update(line.id, { amount: Number(event.target.value || 0) })}
              placeholder="0.00"
              aria-label={`${line.expenseName || `Expense ${index + 1}`} amount`}
              className="h-10 w-full rounded border-2 border-black bg-white px-3 text-right text-sm font-bold text-black focus:border-indigo-600 focus:outline-none sm:order-2"
            />
          </div>
        ))
      )}

      <datalist id={listId}>
        {suggestions.filter((name) => !used.has(name.trim().toLowerCase())).map((name) => <option key={name} value={name} />)}
      </datalist>

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-indigo-600 bg-indigo-50 px-3 py-2 text-sm font-black uppercase text-indigo-700 hover:bg-indigo-100"
      >
        <Plus size={16} /> Add Expense
      </button>

      <div className="flex items-center justify-between rounded border-2 border-black bg-slate-900 px-3 py-2 text-white">
        <span className="text-xs font-black uppercase tracking-wide">Total</span>
        <span className="text-lg font-black">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
