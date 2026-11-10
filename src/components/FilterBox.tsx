import type { ReactNode } from "react";
import { Search } from "lucide-react";

/**
 * Standard filter box: Search on top, labelled filters in a grid, and Clear
 * (only when something is set) plus a phone-only Apply at the bottom.
 * On phones the filters fold behind the filter icon next to the search
 * (data-mf-panel / data-mf-actions / data-mf-apply, see mobileCompactLayout).
 */
export function FilterBox({
  searchTerm,
  onSearchChange,
  active,
  onClear,
  children,
  columns = "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  active: boolean;
  onClear: () => void;
  children?: ReactNode;
  columns?: string;
}) {
  return (
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </div>
      {children ? <div className={`grid gap-2 ${columns}`}>{children}</div> : null}
      <div data-mf-actions="true" className={`flex justify-end gap-2 ${active ? "" : "md:hidden"}`}>
        {active ? (
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

/** A labelled cell inside FilterBox. */
export function FilterField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2 md:col-span-1" : ""}`}>
      <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </div>
  );
}

export const FILTER_DATE_CLASS = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
