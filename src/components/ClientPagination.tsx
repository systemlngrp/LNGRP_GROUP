import React, { useEffect, useRef } from "react";

type ClientPaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
};

export function ClientPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 250],
}: ClientPaginationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let table: HTMLTableElement | null = null;
    let current: Element | null = root.previousElementSibling;
    while (current && !table) {
      if (current.matches("table")) {
        table = current as HTMLTableElement;
      } else {
        const tables = current.querySelectorAll<HTMLTableElement>("table");
        table = tables[tables.length - 1] || null;
      }
      current = current.previousElementSibling;
    }
    if (!table) {
      const tables = root.parentElement?.querySelectorAll<HTMLTableElement>("table");
      table = tables?.[tables.length - 1] || null;
    }
    if (!table) return;

    const wasMarked = table.dataset.tablePaginationExternal === "true";
    table.dataset.tablePaginationExternal = "true";
    return () => {
      if (!wasMarked && table) delete table.dataset.tablePaginationExternal;
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-table-pagination="external"
      className="flex items-center justify-end border border-black bg-slate-50 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-black">
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-black bg-white px-2 py-1 text-sm"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label="Previous page"
          title="Previous page"
          className="rounded border border-black bg-white px-3 py-1 text-base font-black leading-none text-black disabled:opacity-50"
        >
          &#8249;
        </button>
        <span className="min-w-[88px] text-center text-sm font-bold text-black">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label="Next page"
          title="Next page"
          className="rounded border border-black bg-white px-3 py-1 text-base font-black leading-none text-black disabled:opacity-50"
        >
          &#8250;
        </button>
      </div>
    </div>
  );
}
