import { Search } from "lucide-react";

type MaterialReceiptFiltersProps = {
  firmFilter: string;
  onFirmChange: (value: string) => void;
  itemFilter: string;
  onItemChange: (value: string) => void;
  supplierFilter: string;
  onSupplierChange: (value: string) => void;
  mrrFilter: string;
  onMrrChange: (value: string) => void;
  firms: string[];
  suppliers: string[];
};

export function MaterialReceiptFilters({
  firmFilter,
  onFirmChange,
  itemFilter,
  onItemChange,
  supplierFilter,
  onSupplierChange,
  mrrFilter,
  onMrrChange,
  firms,
  suppliers,
}: MaterialReceiptFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-black bg-slate-50 p-3">
      <label className="min-w-[150px] flex-1 text-xs font-bold uppercase text-black">
        Firm
        <select value={firmFilter} onChange={(event) => onFirmChange(event.target.value)} className="mt-1 w-full border-2 border-black bg-white px-2 py-2 text-sm font-medium normal-case">
          <option value="">Firms</option>
          {firms.map((firm) => <option key={firm} value={firm}>{firm}</option>)}
        </select>
      </label>
      <label className="min-w-[190px] flex-1 text-xs font-bold uppercase text-black">
        Item Name
        <div className="relative mt-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input value={itemFilter} onChange={(event) => onItemChange(event.target.value)} placeholder="Filter item name" className="w-full border-2 border-black bg-white py-2 pl-9 pr-3 text-sm font-medium normal-case focus:outline-none focus:ring-1 focus:ring-indigo-600" />
        </div>
      </label>
      <label className="min-w-[190px] flex-1 text-xs font-bold uppercase text-black">
        Supplier
        <select value={supplierFilter} onChange={(event) => onSupplierChange(event.target.value)} className="mt-1 w-full border-2 border-black bg-white px-2 py-2 text-sm font-medium normal-case">
          <option value="">Suppliers</option>
          {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
        </select>
      </label>
      <label className="min-w-[190px] flex-1 text-xs font-bold uppercase text-black">
        MRR No
        <input value={mrrFilter} onChange={(event) => onMrrChange(event.target.value)} placeholder="Filter MRR number" className="mt-1 w-full border-2 border-black bg-white px-3 py-2 text-sm font-medium normal-case focus:outline-none focus:ring-1 focus:ring-indigo-600" />
      </label>
    </div>
  );
}
