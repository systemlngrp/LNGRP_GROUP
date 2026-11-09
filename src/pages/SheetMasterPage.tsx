import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ClientPagination } from "../components/ClientPagination";
import { Select } from "../components/Select";
import { useClientPagination } from "../hooks/useClientPagination";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import type { SheetMasterColumn, SheetMasterFilter } from "../lib/sheetMasterConfigs";

export type SheetMasterRow = {
  id: string;
  [key: string]: string | number | boolean | null | undefined;
};

export function formatCellValue(value: SheetMasterRow[string]) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function SheetMasterPage({
  title,
  entity,
  columns,
  searchPlaceholder,
  filters = [],
  rowsOverride,
  editableColumns = [],
  stockKey,
}: {
  title: string;
  entity: string;
  columns: SheetMasterColumn[];
  searchPlaceholder: string;
  filters?: SheetMasterFilter[];
  rowsOverride?: SheetMasterRow[];
  editableColumns?: string[];
  /** Column holding the stock balance: adds a Stock filter (All / > 0 / 0 or less). */
  stockKey?: string;
}) {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [rows, setRows] = useData<SheetMasterRow>(entity, []);
  const effectiveRows = rowsOverride || rows;
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [stockFilter, setStockFilter] = useState("");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const editableColumnSet = useMemo(() => new Set(editableColumns), [editableColumns]);

  const filterOptions = useMemo(() => {
    return filters.map((filter) => {
      const optionMap = new Map<string, { value: string; label: string; searchText?: string }>();

      effectiveRows.forEach((row) => {
        const value = String(row[filter.key] ?? "").trim();
        if (!value || optionMap.has(value)) return;

        const labelParts = (filter.optionLabelKeys || [filter.key])
          .map((key) => String(row[key] ?? "").trim())
          .filter(Boolean);
        const searchParts = [
          ...labelParts,
          ...(filter.optionSearchKeys || []).map((key) => String(row[key] ?? "").trim()),
        ].filter(Boolean);

        optionMap.set(value, {
          value,
          label: labelParts.length ? Array.from(new Set(labelParts)).join(" - ") : value,
          searchText: Array.from(new Set(searchParts)).join(" "),
        });
      });

      return {
        ...filter,
        options: Array.from(optionMap.values()).sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true })
        ),
      };
    });
  }, [effectiveRows, filters]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return effectiveRows.filter((row) => {
      const matchesSearch = !query || columns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(query));
      if (!matchesSearch) return false;
      if (stockKey && stockFilter) {
        const balance = Number(row[stockKey] ?? 0) || 0;
        if (stockFilter === "positive" && !(balance > 0)) return false;
        if (stockFilter === "zero" && balance > 0) return false;
      }
      return filters.every((filter) => {
        const selectedValue = String(filterValues[filter.key] || "").trim();
        if (!selectedValue) return true;
        return String(row[filter.key] ?? "").trim() === selectedValue;
      });
    });
  }, [columns, effectiveRows, filterValues, filters, searchTerm, stockFilter, stockKey]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedRows,
  } = useClientPagination(filteredRows, 25);

  const hasActiveFilters = Boolean(searchTerm.trim()) || Boolean(stockFilter) || filters.some((filter) => String(filterValues[filter.key] || "").trim());

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterValues, stockFilter, setPage]);

  const clearAll = () => {
    setSearchTerm("");
    setFilterValues({});
    setStockFilter("");
  };

  const getCellDraftKey = (rowId: string, columnKey: string) => `${rowId}::${columnKey}`;

  const getDisplayValue = (row: SheetMasterRow, columnKey: string) => {
    const draftKey = getCellDraftKey(row.id, columnKey);
    if (Object.prototype.hasOwnProperty.call(draftValues, draftKey)) {
      return draftValues[draftKey];
    }
    const value = row[columnKey];
    return value === null || value === undefined || value === "" ? "" : String(value);
  };

  const commitEditableCell = async (rowId: string, columnKey: string) => {
    const draftKey = getCellDraftKey(rowId, columnKey);
    if (!Object.prototype.hasOwnProperty.call(draftValues, draftKey)) return;

    const rawValue = draftValues[draftKey].trim();
    const normalizedValue = rawValue === "" ? 0 : Number(rawValue);
    if (!Number.isFinite(normalizedValue)) {
      setDraftValues((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
      return;
    }

    const sourceRow = rows.find((entry) => entry.id === rowId);
    if (!sourceRow) return;
    if (Number(sourceRow[columnKey] || 0) === normalizedValue) {
      setDraftValues((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
      return;
    }

    setSavingCell(draftKey);
    try {
      await setRows((prev) =>
        prev.map((entry) =>
          entry.id === rowId
            ? {
                ...entry,
                [columnKey]: normalizedValue,
              }
            : entry
        )
      );
      setDraftValues((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
    } finally {
      setSavingCell((current) => (current === draftKey ? null : current));
    }
  };

  const handleEditableKeyDown = (event: KeyboardEvent<HTMLInputElement>, rowId: string, columnKey: string) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      const draftKey = getCellDraftKey(rowId, columnKey);
      setDraftValues((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
      event.currentTarget.blur();
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">{title}</h2>
      </div>

      <div className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border-2 border-black py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {filterOptions.map((filter) => (
            <div key={filter.key} className="min-w-0">
              <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">{filter.label}</span>
              {filter.searchable ? (
                <Select
                  compact
                  value={filterValues[filter.key] || ""}
                  onChange={(value) => setFilterValues((prev) => ({ ...prev, [filter.key]: value }))}
                  options={filter.options}
                  placeholder="All"
                />
              ) : (
                <select
                  value={filterValues[filter.key] || ""}
                  onChange={(e) => setFilterValues((prev) => ({ ...prev, [filter.key]: e.target.value }))}
                  className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold"
                >
                  <option value="">All</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {stockKey ? (
            <div className="min-w-0">
              <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Stock</span>
              <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold">
                <option value="">All</option>
                <option value="positive">Balance &gt; 0</option>
                <option value="zero">Balance 0 or less</option>
              </select>
            </div>
          ) : null}
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearAll} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white">
        <div>
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className="border border-black px-2 py-2 text-left text-xs font-bold uppercase text-black">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="h-16" aria-label="No records" />
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    {columns.map((column) => {
                      const draftKey = getCellDraftKey(row.id, column.key);
                      const isEditable = canManage && editableColumnSet.has(column.key);
                      return (
                        <td key={column.key} className="whitespace-nowrap border border-black px-2 py-1.5 align-top">
                          {isEditable ? (
                            <input
                              type="number"
                              step="any"
                              value={getDisplayValue(row, column.key)}
                              onChange={(e) =>
                                setDraftValues((prev) => ({
                                  ...prev,
                                  [draftKey]: e.target.value,
                                }))
                              }
                              onBlur={() => void commitEditableCell(row.id, column.key)}
                              onKeyDown={(e) => handleEditableKeyDown(e, row.id, column.key)}
                              disabled={savingCell === draftKey}
                              className="w-24 rounded border border-black px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black disabled:bg-slate-100"
                            />
                          ) : (
                            formatCellValue(row[column.key])
                          )}
                        </td>
                      );
                    })}
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
    </div>
  );
}
