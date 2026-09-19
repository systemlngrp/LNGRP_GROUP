import { Search } from "lucide-react";

type ApprovalFiltersProps = {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  firmFilter: string;
  onFirmChange: (value: string) => void;
  supplierFilter: string;
  onSupplierChange: (value: string) => void;
  itemFilter: string;
  onItemChange: (value: string) => void;
  fromDate: string;
  onFromDateChange: (value: string) => void;
  toDate: string;
  onToDateChange: (value: string) => void;
  firms: string[];
  suppliers: string[];
};

export function ApprovalFilters({
  searchTerm,
  onSearchChange,
  firmFilter,
  onFirmChange,
  supplierFilter,
  onSupplierChange,
  itemFilter,
  onItemChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  firms,
  suppliers,
}: ApprovalFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-black bg-slate-50 p-3">
      <label className="relative min-w-[220px] flex-1 text-xs font-bold uppercase text-black">
        Search
        <Search className="absolute left-3 top-8 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search all columns"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          className="mt-1 w-full border-2 border-black bg-white py-2 pl-9 pr-3 text-sm font-medium normal-case focus:outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </label>
      <label className="min-w-[150px] text-xs font-bold uppercase text-black">
        Firm
        <select value={firmFilter} onChange={(event) => onFirmChange(event.target.value)} className="mt-1 w-full border-2 border-black bg-white px-2 py-2 text-sm font-medium normal-case">
          <option value="">Firms</option>
          {firms.map((firm) => <option key={firm} value={firm}>{firm}</option>)}
        </select>
      </label>
      <label className="min-w-[180px] text-xs font-bold uppercase text-black">
        Supplier
        <select value={supplierFilter} onChange={(event) => onSupplierChange(event.target.value)} className="mt-1 w-full border-2 border-black bg-white px-2 py-2 text-sm font-medium normal-case">
          <option value="">Suppliers</option>
          {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
        </select>
      </label>
      <label className="min-w-[180px] text-xs font-bold uppercase text-black">
        Item
        <input
          type="text"
          placeholder="Filter item name"
          value={itemFilter}
          onChange={(event) => onItemChange(event.target.value)}
          className="mt-1 w-full border-2 border-black bg-white px-3 py-2 text-sm font-medium normal-case focus:outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </label>
      <label className="min-w-[145px] text-xs font-bold uppercase text-black">
        From Date
        <input
          type="date"
          value={fromDate}
          onChange={(event) => onFromDateChange(event.target.value)}
          className="mt-1 w-full border-2 border-black bg-white px-2 py-2 text-sm font-medium normal-case"
        />
      </label>
      <label className="min-w-[145px] text-xs font-bold uppercase text-black">
        To Date
        <input
          type="date"
          value={toDate}
          onChange={(event) => onToDateChange(event.target.value)}
          className="mt-1 w-full border-2 border-black bg-white px-2 py-2 text-sm font-medium normal-case"
        />
      </label>
    </div>
  );
}
