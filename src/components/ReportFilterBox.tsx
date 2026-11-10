import React from "react";
import { Search } from "lucide-react";
import { Select } from "./Select";

// The app's standard search + filter box: full-width Search, labelled filters
// in a grid, Clear (only when something is set) and Apply (phones). On phones
// MobileCompactLayout folds the filters behind the filter icon (data-mf-panel).

type Option = { value: string; label: string; searchText?: string };

export const FILTER_LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
export const FILTER_DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";

export function ReportFilterBox({
  search,
  onSearch,
  hasFilters,
  onClear,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  hasFilters: boolean;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </div>
      {children ? <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">{children}</div> : null}
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {hasFilters ? (
          <button type="button" onClick={onClear} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">
            Clear
          </button>
        ) : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">
          Apply
        </button>
      </div>
    </div>
  );
}

// A labelled dropdown filter; `wide` takes the full row on phones.
export function SelectFilter({ label, value, onChange, options, wide = false }: { label: string; value: string; onChange: (value: string) => void; options: Option[]; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0 md:col-span-1" : "min-w-0"}>
      <span className={FILTER_LABEL}>{label}</span>
      <Select compact value={value} onChange={onChange} options={options} placeholder="All" />
    </div>
  );
}

// From / To dates on one line.
export function DateRangeFilter({ from, to, onFrom, onTo, fromLabel = "From Date", toLabel = "To Date" }: { from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void; fromLabel?: string; toLabel?: string }) {
  return (
    <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[280px]">
      <label className="min-w-0"><span className={FILTER_LABEL}>{fromLabel}</span><input type="date" value={from} max={to || undefined} onChange={(event) => onFrom(event.target.value)} className={FILTER_DATE_INPUT} /></label>
      <label className="min-w-0"><span className={FILTER_LABEL}>{toLabel}</span><input type="date" value={to} min={from || undefined} onChange={(event) => onTo(event.target.value)} className={FILTER_DATE_INPUT} /></label>
    </div>
  );
}

// Sorted unique dropdown options from a list of values (blanks and "-" dropped).
export function toFilterOptions(values: unknown[]): Option[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter((value) => value && value !== "-")))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((value) => ({ value, label: value }));
}
