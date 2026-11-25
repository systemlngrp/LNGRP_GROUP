import React, { useMemo, useState } from "react";
import { MultiSelect } from "../components/MultiSelect";
import { Download, FileText, Search } from "lucide-react";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { Company, DispatchPlan, Order, OrderSchedule, Truck } from "../types";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { getFirmOptions } from "../lib/firmDisplay";
import { exportsAllowed } from "../lib/exportPolicy";
import { buildReportPdf, computeDispatchPlanDayRows, dispatchPlanColumns, dispatchPlanPdfSpec, dispatchPlanRangeLabel, type DispatchPlanDayRow } from "../lib/reports/whatsappReports";
import { SendReportWhatsappButton } from "../components/SendReportWhatsappButton";

const localDay = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const todayKey = () => localDay(new Date());
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-IN");

type PlanRow = DispatchPlanDayRow;

/**
 * Dispatch Plan (Quick Access): pending plan lines from one date to another,
 * with totals, Excel / PDF and WhatsApp. Invoice Qty / Cancl show only when
 * some row has one.
 */
export function DispatchPlanByDate() {
  const [fromDate, setFromDate] = useState(todayKey);
  const [toDate, setToDate] = useState(todayKey);
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const [itemFilter, setItemFilter] = useState("");
  const [plans, , plansLoading] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", storageKey: "orders-schedule-all-firms" });
  const [trucks] = useData<Truck>("trucks", []);
  const [firms] = useData<any>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const { resolveOrderItem } = useOrderItemCatalog();
  const allowExports = exportsAllowed();

  // Same rows as the WhatsApp PDF the server sends for this date.
  const dayRows = useMemo<PlanRow[]>(
    () => computeDispatchPlanDayRows({ plans, orders, companies, schedules, trucks, firms }, resolveOrderItem, fromDate, toDate),
    [companies, firms, fromDate, orders, plans, resolveOrderItem, schedules, toDate, trucks]
  );

  const options = useMemo(() => {
    const unique = (values: Array<[string, string]>) => Array.from(new Map(values.filter(([value, label]) => value && label)).entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    const firmIds = new Set(dayRows.map((row: any) => row.firmId).filter(Boolean));
    return {
      firms: getFirmOptions(firms.filter((firm: { id: string }) => firmIds.has(String(firm.id)))),
      companies: unique(dayRows.map((row) => [row.companyName, row.companyName])),
      items: unique(dayRows.map((row) => [row.itemKey, row.itemName])),
    };
  }, [dayRows, firms]);

  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return dayRows.filter((row: any) =>
      (!firmFilter || row.firmId === firmFilter) &&
      (!companyFilter.length || companyFilter.includes(row.companyName)) &&
      (!itemFilter || row.itemKey === itemFilter) &&
      matchesTableSearch(rowSearchText([formatDate(row.planDate), row.plan.planNo, row.firmName, row.companyName, row.orderNo, row.itemName, row.planned, row.invoiced, row.cancelled, row.pending]), words)
    );
  }, [companyFilter, dayRows, firmFilter, itemFilter, searchTerm]);

  const { sorted: rows, sort, toggle } = useTableSort(filteredRows, (row, key) => {
    switch (key) {
      case "planDate": return row.planDate;
      case "planNo": return row.plan.planNo || "";
      case "firmName": return row.firmName;
      case "companyName": return row.companyName;
      case "orderNo": return row.orderNo;
      case "itemName": return row.itemName;
      case "planned": return row.planned;
      case "invoiced": return row.invoiced;
      case "cancelled": return row.cancelled;
      case "pending": return row.pending;
      default: return "";
    }
  }, [], { key: "planDate", direction: "asc" });

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    planned: sum.planned + row.planned,
    invoiced: sum.invoiced + row.invoiced,
    cancelled: sum.cancelled + row.cancelled,
    pending: sum.pending + row.pending,
  }), { planned: 0, invoiced: 0, cancelled: 0, pending: 0 }), [rows]);

  const { cols } = useMemo(() => dispatchPlanColumns(rows), [rows]);
  const rangeLabel = dispatchPlanRangeLabel(fromDate, toDate);
  const fileStem = fromDate === toDate ? `Dispatch_Plan_${fromDate}` : `Dispatch_Plan_${fromDate}_to_${toDate}`;
  const HEADERS = cols.map((col) => col.label);
  const exportRows = () => rows.map((row, index) => cols.map((col) => col.cell(row, index)));
  const totalRow = cols.map((col, index) => (col.total ? col.total(rows) : index === 0 ? "TOTAL" : ""));
  const labelSpan = cols.findIndex((col) => col.qty);
  const setRange = (nextFrom: string, nextTo: string) => {
    const from = nextFrom || todayKey();
    setFromDate(from);
    setToDate(nextTo && nextTo >= from ? nextTo : from);
  };

  const handleExcel = async () => {
    const XLSX = await import("xlsx-js-style");
    const aoa = [["Dispatch Plan"], [fromDate === toDate ? `Date: ${rangeLabel}` : rangeLabel], HEADERS, ...exportRows(), totalRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } }];
    ws["!cols"] = HEADERS.map((header) => ({ wch: header === "Item" ? 40 : header === "Company" ? 28 : Math.max(8, header.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dispatch Plan");
    XLSX.writeFile(wb, `${fileStem}.xlsx`);
  };
  const handlePdf = () => {
    buildReportPdf(dispatchPlanPdfSpec(rows, fromDate, toDate)).save(`${fileStem}.pdf`);
  };

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const TH = "border border-black px-3 py-2 text-xs font-bold uppercase text-black";
  const TD = "border border-black px-3 py-2 text-xs text-black";
  const hasFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter.length || itemFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-2">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Dispatch Plan</h2>
        <div data-header-action="true" className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold uppercase text-black" htmlFor="dispatch-plan-from">From:</label>
            <input
              id="dispatch-plan-from"
              type="date"
              value={fromDate}
              onChange={(e) => setRange(e.target.value, toDate)}
              className="rounded border-2 border-black p-1 text-sm focus:border-indigo-600 focus:outline-none"
            />
            <label className="text-sm font-bold uppercase text-black" htmlFor="dispatch-plan-to">To:</label>
            <input
              id="dispatch-plan-to"
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setRange(fromDate, e.target.value || fromDate)}
              className="rounded border-2 border-black p-1 text-sm focus:border-indigo-600 focus:outline-none"
            />
          </div>
          {allowExports ? (
            <>
              <button type="button" onClick={() => void handleExcel()} disabled={!rows.length} title="Download Excel" className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                <Download size={16} /><span>Excel</span>
              </button>
              <button type="button" onClick={handlePdf} disabled={!rows.length} title="Download PDF" className="inline-flex items-center gap-2 rounded border border-red-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-red-700 hover:bg-red-50 disabled:opacity-40">
                <FileText size={16} /><span>PDF</span>
              </button>
            </>
          ) : null}
          <SendReportWhatsappButton report="dispatch-plan" title="Dispatch Plan" loading={plansLoading} disabled={!rows.length} buildRequest={() => ({ date: fromDate, filters: { firm: firmFilter, company: companyFilter, item: itemFilter, toDate }, label: rangeLabel })} />
        </div>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search plan no, company, order, item..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <div className="min-w-0"><span className={LABEL}>Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={options.firms} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Company</span><MultiSelect value={companyFilter} onChange={setCompanyFilter} options={options.companies} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={options.items} placeholder="All" /></div>
        </div>
        {hasFilters ? (
          <div className="flex justify-end">
            <button type="button" onClick={() => { setSearchTerm(""); setFirmFilter(""); setCompanyFilter([]); setItemFilter(""); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-bold text-slate-700">
        <span>Plans: <span className="text-indigo-700">{rows.length}</span></span>
        <span>Planned: <span className="text-indigo-700">{qty(totals.planned)}</span></span>
        {totals.invoiced ? <span>Invoiced: <span className="text-indigo-700">{qty(totals.invoiced)}</span></span> : null}
        <span>Pending: <span className="text-indigo-700">{qty(totals.pending)}</span></span>
      </div>

      {/* No pagination: every plan of the day on one page, like the Production Plan. */}
      <div className="overflow-x-auto rounded border border-black bg-white" data-disable-table-pagination="true">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              {cols.map((col) => col.key === "sr"
                ? <th key={col.key} className={TH}>Sr.</th>
                : <th key={col.key} className={TH}><SortHeader label={col.label} sortKey={col.key} sort={sort} onToggle={toggle} align={col.qty ? "right" : undefined} /></th>)}
            </tr>
          </thead>
          <tbody>
            {plansLoading && !plans.length ? (
              <tr><td colSpan={cols.length} className="p-8 text-center"><Spinner size={28} className="inline-block text-indigo-600" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="p-8 text-center text-sm font-medium text-black">No pending dispatch plans for {rangeLabel}.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={row.plan.id} className="hover:bg-slate-50">
                {cols.map((col) => {
                  const value = col.cell(row, index);
                  if (col.qty) return <td key={col.key} className={`${TD} whitespace-nowrap text-right ${col.key === "pending" ? "font-black" : "font-bold"}`}>{qty(value)}</td>;
                  const bold = col.key === "planNo" || col.key === "orderNo";
                  const nowrap = col.key !== "companyName" && col.key !== "itemName";
                  return <td key={col.key} className={`${TD} ${col.key === "sr" ? "text-center" : ""} ${nowrap ? "whitespace-nowrap" : ""} ${bold ? "font-bold" : ""}`}>{value === "" ? "-" : value}</td>;
                })}
              </tr>
            ))}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr className="bg-slate-100 font-black">
                <td className={`${TD} font-black`} colSpan={labelSpan}>TOTAL</td>
                {cols.slice(labelSpan).map((col) => <td key={col.key} className={`${TD} text-right font-black`}>{qty(col.total ? col.total(rows) : 0)}</td>)}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
