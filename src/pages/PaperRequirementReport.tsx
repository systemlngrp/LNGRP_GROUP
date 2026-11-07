import React, { useMemo, useState } from "react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Select from "react-select";
import { FileText, RotateCcw, X } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { useServerReport } from "../hooks/useServerReport";
import {
  DispatchPlan,
  LoadingSlip,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnReelLine,
  Order,
  OrderSchedule,
  Production,
  PurchaseOrder,
  PurchaseOrderLine,
  RapcRange,
} from "../types";
import { formatDate } from "../lib/serial";
import { getEffectiveRapcRanges } from "../lib/rapcRanges";
import { buildReelStockRows } from "../lib/reelStock";
import type { OrderCatalogItem } from "../lib/orderItems";
import { calculateInternalRapc, calculateInternalUps } from "../lib/internalUps";
import { calculateProductionTakeUpFactor } from "../lib/productionCalculations";

import {
  computePaperRequirement,
  NET_FILTER_OPTIONS,
  GROUP_TYPE_OPTIONS,
  CHART_LIMIT_OPTIONS,
  KG_CONVERSION_FACTOR,
  parseAppDate,
  normalizeDate,
  toDateInput,
  round2,
  formatQty,
  makeKey,
  parseKey,
  getRangeGsmLabel,
  resolveRapcValue,
  getMaterialRapcInput,
  addToMap,
  firstPositiveNumber,
  getRawValue,
  getItemNumber,
  getItemText,
  getFgInternalRapc,
  getFgInternalUps,
  buildLeastCostByErp,
  calculateLayerWeightKg,
  passesNetFilter,
  passesGroupType,
  summarizeRows,
  getChartLimitCount,
} from "../lib/reports/paperRequirement";
import type {
  NetFilter,
  GroupTypeFilter,
  ChartLimit,
  RapcGroup,
  GroupKey,
  ReportRow,
  Summary,
  RangeGsmOption,
} from "../lib/reports/paperRequirement";

const PAPER_REQUIREMENT_TABLES = ["productions", "orders", "orders_schedule", "dispatch_plans", "loading_slips", "materials", "material_in", "material_in_packing_slips", "material_issues", "material_issue_reel_lines", "material_returns", "material_return_reel_lines", "purchase_orders", "purchase_order_lines", "rapc_ranges", "npd", "php_item_master", "plate_item_master"];

export function PaperRequirementReport() {
  const [uptoDate, setUptoDate] = useState(() => toDateInput(new Date()));
  const serverReport = useServerReport<ReportRow[]>("paper-requirement", { uptoDate }, PAPER_REQUIREMENT_TABLES);
  const browserFallback = serverReport.failed;
  const [productions] = useData<Production>("productions", [], { enabled: browserFallback });
  const [orders] = useData<Order>("orders", [], { enabled: browserFallback });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { enabled: browserFallback });
  const [dispatchPlans] = useData<DispatchPlan>("dispatch_plans", [], { enabled: browserFallback });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { enabled: browserFallback });
  const [materials] = useData<Material>("materials", [], { enabled: browserFallback });
  const [materialIn] = useData<MaterialIn>("material-in", [], { enabled: browserFallback });
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", [], { enabled: browserFallback });
  const [issueEntries] = useData<MaterialIssue>("material-issues", [], { enabled: browserFallback });
  const [issueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { enabled: browserFallback });
  const [returnEntries] = useData<MaterialReturn>("material-returns", [], { enabled: browserFallback });
  const [returnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { enabled: browserFallback });
  const [purchaseOrders] = useData<PurchaseOrder>("purchase-orders", [], { enabled: browserFallback });
  const [purchaseOrderLines] = useData<PurchaseOrderLine>("purchase-order-lines", [], { enabled: browserFallback });
  const [rapcRanges] = useData<RapcRange>("rapc-ranges", [], { enabled: browserFallback });
  const { resolveOrderItem } = useOrderItemCatalog({ enabled: browserFallback });

  const [selectedRangeGsm, setSelectedRangeGsm] = useState<RangeGsmOption | null>(null);
  const [netFilter, setNetFilter] = useState<NetFilter>("All Positive");
  const [groupType, setGroupType] = useState<GroupTypeFilter>("All");
  const [chartLimit, setChartLimit] = useState<ChartLimit>("Top 30");
  const [detailRow, setDetailRow] = useState<ReportRow | null>(null);

  const filteredTimestamp = useMemo(() => {
    const parsed = parseAppDate(uptoDate);
    return parsed ? normalizeDate(parsed).getTime() : normalizeDate(new Date()).getTime();
  }, [uptoDate]);

  // Calculated on the server; only the result rows are downloaded. If the
  // server cannot run it, every list is loaded and calculated here as before.
  const clientReportData = useMemo<ReportRow[]>(() => {
    if (!serverReport.failed) return [];
    return computePaperRequirement(
      {
        productions, orders, schedules, dispatchPlans, loadingSlips, materials, materialIn, packingSlips,
        issueEntries, issueReelLines, returnEntries, returnReelLines, purchaseOrders, purchaseOrderLines, rapcRanges,
      },
      { uptoDate, resolveOrderItem }
    );
  }, [
    serverReport.failed,
    uptoDate,
    dispatchPlans,
    issueEntries,
    issueReelLines,
    loadingSlips,
    materialIn,
    materials,
    orders,
    packingSlips,
    productions,
    purchaseOrderLines,
    purchaseOrders,
    rapcRanges,
    resolveOrderItem,
    returnEntries,
    returnReelLines,
    schedules,
  ]);
  const reportData = serverReport.failed ? clientReportData : (serverReport.result || []);

  const rangeOptions = useMemo<RangeGsmOption[]>(() => reportData.map((row) => {
    const label = getRangeGsmLabel(row);
    return { value: label, label };
  }), [reportData]);

  const filteredRows = useMemo(() => reportData.filter((row) => {
    if (selectedRangeGsm && getRangeGsmLabel(row) !== selectedRangeGsm.value) return false;
    if (!passesNetFilter(row, netFilter)) return false;
    if (!passesGroupType(row, groupType)) return false;
    return true;
  }), [groupType, netFilter, reportData, selectedRangeGsm]);

  const summary = useMemo(() => summarizeRows(filteredRows), [filteredRows]);

  const chartRows = useMemo(() => {
    const limit = getChartLimitCount(chartLimit);
    return [...filteredRows]
      .sort((a, b) => Math.abs(b.netPaperToOrder) - Math.abs(a.netPaperToOrder))
      .slice(0, limit)
      .map((row) => ({ ...row, label: getRangeGsmLabel(row) }));
  }, [chartLimit, filteredRows]);

  const handleClear = () => {
    setSelectedRangeGsm(null);
    setUptoDate(toDateInput(new Date()));
    setNetFilter("All Positive");
    setGroupType("All");
    setChartLimit("Top 30");
  };

  const handleExportPdf = () => {
    const doc = new jsPDF("l", "mm", "a4");
    doc.setFontSize(16);
    doc.text("Paper to Order Report", 14, 16);
    doc.setFontSize(9);
    doc.text(`Upto Date: ${formatDate(uptoDate)} | Range + GSM: ${selectedRangeGsm?.label || "All"} | Net Filter: ${netFilter} | Group Type: ${groupType} | Graph: ${chartLimit}`, 14, 24);

    autoTable(doc, {
      head: [["Metric", "Value"]],
      body: [
        ["Total Paper Requirement", formatQty(summary.totalPaperRequirement)],
        ["Total Closing Stock", formatQty(summary.totalClosingStock)],
        ["Total Pending PO", formatQty(summary.totalPendingPo)],
        ["MIL", formatQty(summary.mil)],
        ["Net Paper to Order", formatQty(summary.netPaperToOrder)],
        ["Total Groups", filteredRows.length],
      ],
      startY: 30,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    autoTable(doc, {
      head: [["Chart Rank", "RAPC Range + GSM", "Net Paper to Order"]],
      body: chartRows.map((row, index) => [index + 1, row.label, formatQty(row.netPaperToOrder)]),
      startY: (doc as any).lastAutoTable.finalY + 7,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    autoTable(doc, {
      head: [["RAPC Range", "GSM", "Total Paper Requirement", "Total Closing Stock", "Total Pending PO", "MIL", "Net Paper to Order"]],
      body: [
        ...filteredRows.map((row) => [
          row.rapcRange,
          row.gsm,
          formatQty(row.totalPaperRequirement),
          formatQty(row.totalClosingStock),
          formatQty(row.totalPendingPo),
          formatQty(row.mil),
          formatQty(row.netPaperToOrder),
        ]),
        ["Grand Total", "", formatQty(summary.totalPaperRequirement), formatQty(summary.totalClosingStock), formatQty(summary.totalPendingPo), formatQty(summary.mil), formatQty(summary.netPaperToOrder)],
      ],
      startY: (doc as any).lastAutoTable.finalY + 7,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.8 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    doc.save(`Paper_To_Order_${uptoDate}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 border-b border-black pb-3">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Paper To Order View</h2>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Scheduled Orders to Paper Requirement to Stock, Pending PO, MIL and Net Purchase Need</p>
        {serverReport.loading && !serverReport.failed && (
          <p className="text-xs font-bold text-indigo-700">Calculating report…</p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <MetricTile label="Total Paper Requirement" value={summary.totalPaperRequirement} className="border-blue-300 bg-blue-50 text-blue-900" />
        <MetricTile label="Closing Stock" value={summary.totalClosingStock} className="border-emerald-300 bg-emerald-50 text-emerald-900" />
        <MetricTile label="Pending PO" value={summary.totalPendingPo} className="border-amber-300 bg-amber-50 text-amber-900" />
        <MetricTile label="MIL" value={summary.mil} className="border-violet-300 bg-violet-50 text-violet-900" />
        <MetricTile label="Net Paper To Order" value={summary.netPaperToOrder} className={summary.netPaperToOrder >= 0 ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"} />
      </div>

      <div className="rounded border border-black bg-white p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(150px,0.7fr)_minmax(250px,1.2fr)_repeat(3,minmax(160px,0.8fr))_repeat(2,auto)] xl:items-center">
          <input type="date" value={uptoDate} onChange={(e) => setUptoDate(e.target.value)} title="Upto Date" className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" />
          <Select
            value={selectedRangeGsm}
            onChange={(option) => setSelectedRangeGsm(option as RangeGsmOption | null)}
            options={rangeOptions}
            isClearable
            placeholder="RAPC Range + GSM"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
            styles={{
              control: (provided) => ({ ...provided, minHeight: 42, borderColor: "black", borderWidth: 2, borderRadius: 4 }),
              menu: (provided) => ({ ...provided, zIndex: 9999 }),
              menuPortal: (provided) => ({ ...provided, zIndex: 9999 }),
            }}
          />
          <select value={netFilter} onChange={(e) => setNetFilter(e.target.value as NetFilter)} className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600">
            {NET_FILTER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={groupType} onChange={(e) => setGroupType(e.target.value as GroupTypeFilter)} className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600">
            {GROUP_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={chartLimit} onChange={(e) => setChartLimit(e.target.value as ChartLimit)} className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600">
            {CHART_LIMIT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button type="button" onClick={handleClear} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50"><RotateCcw size={14} />Clear</button>
          <button type="button" onClick={handleExportPdf} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded border border-rose-700 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100"><FileText size={14} />PDF</button>
        </div>
      </div>

      <div className="rounded border-2 border-black bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black uppercase text-black">Net Paper To Order Graph</h3>
          <span className="text-xs font-bold text-slate-500">{chartRows.length.toLocaleString()} group(s)</span>
        </div>
        <div className="h-[420px] min-h-[300px]">
          {chartRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-500">No chart data for the selected filters.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 30, bottom: 8, left: 70 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => Number(value).toLocaleString()} />
                <YAxis type="category" dataKey="label" width={95} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatQty(Number(value))} labelFormatter={(label) => `RAPC Range + GSM: ${label}`} />
                <Bar dataKey="netPaperToOrder" radius={[0, 4, 4, 0]} onClick={(row) => setDetailRow(row.payload as ReportRow)}>
                  {chartRows.map((row) => <Cell key={row.label} fill={row.netPaperToOrder >= 0 ? "#e11d48" : "#059669"} cursor="pointer" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded border-2 border-black bg-white shadow-sm">
        <div className="max-h-[calc(100vh-250px)] w-full overflow-auto">
          <table className="w-full min-w-max border-collapse text-[12px]">
            <thead className="sticky top-0 z-20">
              <tr>
                {["RAPC Range", "GSM", "Total Paper Requirement", "Total Closing Stock", "Total Pending PO", "MIL", "Net Paper To Order"].map((heading) => (
                  <th key={heading} className="sticky top-0 z-20 whitespace-nowrap border-2 border-black bg-indigo-700 px-3 py-3 text-left text-xs font-black uppercase text-white">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="border-2 border-black px-6 py-10 text-center text-sm font-medium text-black">No rows found for the selected filters.</td></tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={makeKey(row.rapcRange, row.gsm)} onClick={() => setDetailRow(row)} className="cursor-pointer text-black hover:bg-slate-50">
                    <td className="border-2 border-black px-3 py-3 font-bold">{row.rapcRange}</td>
                    <td className="border-2 border-black px-3 py-3 text-right">{row.gsm}</td>
                    <td className="border-2 border-black bg-blue-50/50 px-3 py-3 text-right">{formatQty(row.totalPaperRequirement)}</td>
                    <td className="border-2 border-black bg-emerald-50 px-3 py-3 text-right font-semibold text-emerald-900">{formatQty(row.totalClosingStock)}</td>
                    <td className="border-2 border-black bg-amber-50 px-3 py-3 text-right text-amber-900">{formatQty(row.totalPendingPo)}</td>
                    <td className="border-2 border-black bg-violet-50 px-3 py-3 text-right text-violet-900">{formatQty(row.mil)}</td>
                    <td className={`border-2 border-black px-3 py-3 text-right font-black ${row.netPaperToOrder >= 0 ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>{formatQty(row.netPaperToOrder)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRows.length > 0 ? (
              <tfoot className="sticky bottom-0 z-10 bg-slate-100">
                <tr>
                  <td className="border-2 border-black px-3 py-3 text-sm font-black text-black" colSpan={2}>Grand Total</td>
                  <td className="border-2 border-black bg-blue-50 px-3 py-3 text-right text-sm font-black text-black">{formatQty(summary.totalPaperRequirement)}</td>
                  <td className="border-2 border-black bg-emerald-50 px-3 py-3 text-right text-sm font-black text-emerald-900">{formatQty(summary.totalClosingStock)}</td>
                  <td className="border-2 border-black bg-amber-50 px-3 py-3 text-right text-sm font-black text-amber-900">{formatQty(summary.totalPendingPo)}</td>
                  <td className="border-2 border-black bg-violet-50 px-3 py-3 text-right text-sm font-black text-violet-900">{formatQty(summary.mil)}</td>
                  <td className={`border-2 border-black px-3 py-3 text-right text-sm font-black ${summary.netPaperToOrder >= 0 ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>{formatQty(summary.netPaperToOrder)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {detailRow ? <CalculationDetailModal row={detailRow} onClose={() => setDetailRow(null)} /> : null}
    </div>
  );
}

function MetricTile({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded border p-4 ${className}`}>
      <div className="text-xs font-black uppercase opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-black">{formatQty(value)}</div>
    </div>
  );
}

function CalculationDetailModal({ row, onClose }: { row: ReportRow; onClose: () => void }) {
  const formula = row.totalClosingStock > row.mil ? "Requirement - Closing Stock - Pending PO" : "(MIL - Closing Stock) + (Requirement - Closing Stock - Pending PO)";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded border-2 border-black bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b-2 border-black p-4">
          <div>
            <h3 className="text-base font-black uppercase text-black">Calculation Details</h3>
            <div className="mt-1 text-sm font-bold text-slate-600">{getRangeGsmLabel(row)}</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded border border-black bg-white text-black hover:bg-slate-100" aria-label="Close calculation details" title="Close"><X size={16} /></button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <DetailValue label="RAPC Range" value={row.rapcRange} />
          <DetailValue label="GSM" value={row.gsm} />
          <DetailValue label="Total Paper Requirement" value={formatQty(row.totalPaperRequirement)} />
          <DetailValue label="Total Closing Stock" value={formatQty(row.totalClosingStock)} />
          <DetailValue label="Total Pending PO" value={formatQty(row.totalPendingPo)} />
          <DetailValue label="MIL" value={formatQty(row.mil)} />
          <DetailValue label="Net Paper to Order" value={formatQty(row.netPaperToOrder)} />
          <DetailValue label="Formula Applied" value={formula} />
        </div>
      </div>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-black bg-slate-50 p-3">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-black">{value}</div>
    </div>
  );
}
