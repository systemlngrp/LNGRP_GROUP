import React, { useMemo, useState } from "react";
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
import { buildReportPdf, computeDispatchPlanDayRows, dispatchPlanPdfSpec, type DispatchPlanDayRow } from "../lib/reports/whatsappReports";
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
 * Dispatch Plan for one date (Quick Access), in the Production Plan pattern:
 * pick a date, see that day's dispatch plans with totals, download Excel / PDF.
 * Columns follow the Dispatch Plans Master (read-only here).
 */
export function DispatchPlanByDate() {
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
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
    () => computeDispatchPlanDayRows({ plans, orders, companies, schedules, trucks, firms }, resolveOrderItem, selectedDate),
    [companies, firms, orders, plans, resolveOrderItem, schedules, selectedDate, trucks]
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
      (!companyFilter || row.companyName === companyFilter) &&
      (!itemFilter || row.itemKey === itemFilter) &&
      matchesTableSearch(rowSearchText([row.plan.planNo, row.firmName, row.companyName, row.orderNo, row.itemName, row.truckNo, row.planned, row.invoiced, row.cancelled, row.pending, row.plan.status]), words)
    );
  }, [companyFilter, dayRows, firmFilter, itemFilter, searchTerm]);

  const { sorted: rows, sort, toggle } = useTableSort(filteredRows, (row, key) => {
    switch (key) {
      case "planNo": return row.plan.planNo || "";
      case "firmName": return row.firmName;
      case "companyName": return row.companyName;
      case "orderNo": return row.orderNo;
      case "itemName": return row.itemName;
      case "truckNo": return row.truckNo;
      case "planned": return row.planned;
      case "invoiced": return row.invoiced;
      case "cancelled": return row.cancelled;
      case "pending": return row.pending;
      case "status": return row.plan.status || "";
      default: return "";
    }
  }, [], { key: "planNo", direction: "asc" });

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    planned: sum.planned + row.planned,
    invoiced: sum.invoiced + row.invoiced,
    cancelled: sum.cancelled + row.cancelled,
    pending: sum.pending + row.pending,
  }), { planned: 0, invoiced: 0, cancelled: 0, pending: 0 }), [rows]);

  const HEADERS = ["Sr.", "Plan No", "Firm", "Company", "Order No", "Item", "Truck", "Planned", "Invoice Qty", "Cancl", "Pending", "Status"];
  const exportRows = () => rows.map((row, index) => [
    index + 1, row.plan.planNo || "", row.firmName, row.companyName, row.orderNo, row.itemName, row.truckNo,
    row.planned, row.invoiced, row.cancelled, row.pending, row.plan.status || "",
  ]);
  const totalRow = ["TOTAL", "", "", "", "", "", "", totals.planned, totals.invoiced, totals.cancelled, totals.pending, ""];

  const handleExcel = async () => {
    const XLSX = await import("xlsx-js-style");
    const aoa = [["Dispatch Plan"], [`Date: ${formatDate(selectedDate)}`], HEADERS, ...exportRows(), totalRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } }];
    ws["!cols"] = HEADERS.map((header) => ({ wch: header === "Item" ? 40 : header === "Company" ? 28 : Math.max(8, header.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dispatch Plan");
    XLSX.writeFile(wb, `Dispatch_Plan_${selectedDate}.xlsx`);
  };
  const handlePdf = () => {
    buildReportPdf(dispatchPlanPdfSpec(rows, selectedDate)).save(`Dispatch_Plan_${selectedDate}.pdf`);
  };

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const TH = "border border-black px-3 py-2 text-xs font-bold uppercase text-black";
  const TD = "border border-black px-3 py-2 text-xs text-black";
  const hasFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-2">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Dispatch Plan</h2>
        <div data-header-action="true" className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold uppercase text-black" htmlFor="dispatch-plan-date">Plan Date:</label>
            <input
              id="dispatch-plan-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayKey())}
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
          <SendReportWhatsappButton report="dispatch-plan" disabled={!rows.length} buildSpec={() => (rows.length ? dispatchPlanPdfSpec(rows, selectedDate) : null)} />
        </div>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search plan no, company, order, item, truck..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <div className="min-w-0"><span className={LABEL}>Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={options.firms} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={options.companies} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={options.items} placeholder="All" /></div>
        </div>
        {hasFilters ? (
          <div className="flex justify-end">
            <button type="button" onClick={() => { setSearchTerm(""); setFirmFilter(""); setCompanyFilter(""); setItemFilter(""); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-bold text-slate-700">
        <span>Plans: <span className="text-indigo-700">{rows.length}</span></span>
        <span>Planned: <span className="text-indigo-700">{qty(totals.planned)}</span></span>
        <span>Invoiced: <span className="text-indigo-700">{qty(totals.invoiced)}</span></span>
        <span>Pending: <span className="text-indigo-700">{qty(totals.pending)}</span></span>
      </div>

      {/* No pagination: every plan of the day on one page, like the Production Plan. */}
      <div className="overflow-x-auto rounded border border-black bg-white" data-disable-table-pagination="true">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className={TH}>Sr.</th>
              <th className={TH}><SortHeader label="Plan No" sortKey="planNo" sort={sort} onToggle={toggle} /></th>
              <th className={TH}><SortHeader label="Firm" sortKey="firmName" sort={sort} onToggle={toggle} /></th>
              <th className={TH}><SortHeader label="Company" sortKey="companyName" sort={sort} onToggle={toggle} /></th>
              <th className={TH}><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggle} /></th>
              <th className={TH}><SortHeader label="Item" sortKey="itemName" sort={sort} onToggle={toggle} /></th>
              <th className={TH}><SortHeader label="Truck" sortKey="truckNo" sort={sort} onToggle={toggle} /></th>
              <th className={TH}><SortHeader label="Planned" sortKey="planned" sort={sort} onToggle={toggle} align="right" /></th>
              <th className={TH}><SortHeader label="Invoice Qty" sortKey="invoiced" sort={sort} onToggle={toggle} align="right" /></th>
              <th className={TH}><SortHeader label="Cancl" sortKey="cancelled" sort={sort} onToggle={toggle} align="right" /></th>
              <th className={TH}><SortHeader label="Pending" sortKey="pending" sort={sort} onToggle={toggle} align="right" /></th>
              <th className={TH}><SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} align="center" /></th>
            </tr>
          </thead>
          <tbody>
            {plansLoading && !plans.length ? (
              <tr><td colSpan={12} className="p-8 text-center"><Spinner size={28} className="inline-block text-indigo-600" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={12} className="p-8 text-center text-sm font-medium text-black">No dispatch plans for {formatDate(selectedDate)}.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={row.plan.id} className="hover:bg-slate-50">
                <td className={`${TD} text-center`}>{index + 1}</td>
                <td className={`${TD} whitespace-nowrap font-bold`}>{row.plan.planNo || "-"}</td>
                <td className={`${TD} whitespace-nowrap`}>{row.firmName || "-"}</td>
                <td className={TD}>{row.companyName || "-"}</td>
                <td className={`${TD} whitespace-nowrap font-bold`}>{row.orderNo || "-"}</td>
                <td className={TD}>{row.itemName || "-"}</td>
                <td className={`${TD} whitespace-nowrap`}>{row.truckNo || "-"}</td>
                <td className={`${TD} whitespace-nowrap text-right font-bold`}>{qty(row.planned)}</td>
                <td className={`${TD} whitespace-nowrap text-right font-bold`}>{qty(row.invoiced)}</td>
                <td className={`${TD} whitespace-nowrap text-right font-bold`}>{qty(row.cancelled)}</td>
                <td className={`${TD} whitespace-nowrap text-right font-black`}>{qty(row.pending)}</td>
                <td className={`${TD} text-center`}>
                  <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${row.plan.status === "Dispatched" ? "border-emerald-900 bg-emerald-100 text-emerald-900" : "border-amber-900 bg-amber-100 text-amber-900"}`}>{row.plan.status || "-"}</span>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr className="bg-slate-100 font-black">
                <td className={`${TD} font-black`} colSpan={7}>TOTAL</td>
                <td className={`${TD} text-right font-black`}>{qty(totals.planned)}</td>
                <td className={`${TD} text-right font-black`}>{qty(totals.invoiced)}</td>
                <td className={`${TD} text-right font-black`}>{qty(totals.cancelled)}</td>
                <td className={`${TD} text-right font-black`}>{qty(totals.pending)}</td>
                <td className={TD}></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
