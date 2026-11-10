import React, { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useData } from "../hooks/useData";
import { SortHeader, useTableSort } from "../lib/tableSort";
import type {
  FixedDailyExpense,
  FixedMonthlyExpense,
  Invoice,
  InvoiceLineItem,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturnReelLine,
  Production,
  ProductionProcessing,
} from "../types";
import {
  applyConversionCostInputs,
  computeConversionCostBase,
  defaultInputs,
  factoryBuckets,
  formatDecimal,
  formatMoney,
  getCurrentMonthRange,
} from "../lib/reports/conversionCostDetails";
import type { ConversionCostBase, MisInputs } from "../lib/reports/conversionCostDetails";
import { useServerReport } from "../hooks/useServerReport";

const EMPTY_BASE: ConversionCostBase = {
  factoryRows: factoryBuckets.map((bucket, index) => ({ slNo: index + 1, label: bucket.label, amount: 0 })), matchingConsumableIssueLines: 0, totalPayable: 0, totalProduction: 0, totalActualPaperUsed: 0,
  totalSold: 0, totalWastageKg: 0, totalSaleBasic: 0, actualPaperUsedCost: 0,
};
const CONVERSION_COST_DETAILS_TABLES = ["material_issues", "material_issue_lines", "materials", "material_in", "material_in_packing_slips", "material_issue_reel_lines", "material_return_reel_lines", "fixed_monthly_expenses", "fixed_daily_expenses", "productions", "production_processing", "invoices", "invoice_line_items"];

export function ConversionCostDetailsReport() {
  const currentRange = useMemo(getCurrentMonthRange, []);
  const [fromDate, setFromDate] = useState(currentRange.from);
  const [toDate, setToDate] = useState(currentRange.to);
  const [inputs, setInputs] = useState<MisInputs>(defaultInputs);

  // Date-range totals are calculated on the server; the manual inputs are
  // applied here. If the server cannot run it, every list is loaded and the
  // totals are calculated here as before.
  const serverReport = useServerReport<ConversionCostBase>("conversion-cost-details", { fromDate, toDate }, CONVERSION_COST_DETAILS_TABLES);
  const browserFallback = serverReport.failed;
  const listOptions = { enabled: browserFallback };
  const [materialIssues] = useData<MaterialIssue>("material-issues", [], listOptions);
  const [issueLines] = useData<MaterialIssueLine>("material-issue-lines", [], listOptions);
  const [materials] = useData<Material>("materials", [], listOptions);
  const [materialIn] = useData<MaterialIn>("material-in", [], listOptions);
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", [], listOptions);
  const [issueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], listOptions);
  const [returnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], listOptions);
  const [fixedExpenses] = useData<FixedMonthlyExpense>("fixed_monthly_expenses", [], listOptions);
  const [fixedDailyExpenses] = useData<FixedDailyExpense>("fixed_daily_expenses", [], listOptions);
  const [productions] = useData<Production>("productions", [], listOptions);
  const [processing] = useData<ProductionProcessing>("production_processing", [], listOptions);
  const [invoices] = useData<Invoice>("invoices", [], listOptions);
  const [invoiceLines] = useData<InvoiceLineItem>("invoice_line_items", [], listOptions);

  const clientBase = useMemo<ConversionCostBase | null>(
    () => (browserFallback
      ? computeConversionCostBase({ materialIssues, issueLines, materials, materialIn, packingSlips, issueReelLines, returnReelLines, fixedExpenses, fixedDailyExpenses, productions, processing, invoices, invoiceLines }, fromDate, toDate)
      : null),
    [browserFallback, fixedDailyExpenses, fixedExpenses, fromDate, invoiceLines, invoices, issueLines, issueReelLines, materialIn, materialIssues, materials, packingSlips, processing, productions, returnReelLines, toDate]
  );
  const base = (browserFallback ? clientBase : serverReport.result) || EMPTY_BASE;
  const report = useMemo(() => applyConversionCostInputs(base, inputs), [base, inputs]);
  const resetReport = () => {
    setFromDate(currentRange.from);
    setToDate(currentRange.to);
    setInputs(defaultInputs);
  };
  const factoryDisplayRows = report.factoryRows;
  // Factory Consumption table column sort (the MIS statement keeps its fixed layout).
  const { sorted: sortedFactoryRows, sort: factorySort, toggle: toggleFactorySort } = useTableSort(factoryDisplayRows, (row, key) =>
    key === "label" ? row.label : key === "perKg" ? Number(report.expensePerKg(row.amount) || 0) : Number(row.amount || 0)
  , [report]);

  const renderInputCell = (key: keyof MisInputs) => (
    <input
      type="number"
      step="any"
      value={inputs[key] || ""}
      onChange={(event) => {
        const value = event.target.value;
        setInputs((prev) => ({
          ...prev,
          [key]: value === "" ? 0 : Number(value),
        }));
      }}
      className="w-full border-0 bg-transparent text-right font-black outline-none focus:bg-white focus:ring-1 focus:ring-gray-900"
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-900 pb-3">
        <div><h1 className="text-2xl font-black uppercase tracking-tight">Conversion Cost Details</h1></div>
        <button className="inline-flex items-center gap-2 rounded border border-gray-900 px-3 py-2 text-sm font-bold" type="button" onClick={resetReport}>
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      <div className="border border-gray-900 bg-white p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:max-w-xl">
          <label className="text-xs font-black uppercase text-slate-700">
            From Date
            <input className="mt-1 h-9 w-full border border-gray-900 px-2 text-sm font-bold" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="text-xs font-black uppercase text-slate-700">
            To Date
            <input className="mt-1 h-9 w-full border border-gray-900 px-2 text-sm font-bold" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-x-auto border border-gray-900 bg-white">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-900 bg-teal-700 p-2 text-center text-white" colSpan={4}>
                  FACTORY CONSUMPTION DETAILS
                </th>
              </tr>
              <tr className="bg-orange-100">
                <th className="border border-gray-900 p-2 text-center">Sl No.</th>
                <th className="border border-gray-900 p-2 text-left"><SortHeader label="Particulars" sortKey="label" sort={factorySort} onToggle={toggleFactorySort} align="left" /></th>
                <th className="border border-gray-900 p-2 text-right"><SortHeader label="Payable amount" sortKey="amount" sort={factorySort} onToggle={toggleFactorySort} align="right" /></th>
                <th className="border border-gray-900 p-2 text-right"><SortHeader label="Cost Per Kg" sortKey="perKg" sort={factorySort} onToggle={toggleFactorySort} align="right" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedFactoryRows.map((row) => (
                <tr key={row.label}>
                  <td className="border border-gray-900 p-2 text-center font-bold">{row.slNo}</td>
                  <td className="border border-gray-900 p-2 font-bold">{row.label}</td>
                  <td className="border border-gray-900 p-2 text-right font-bold">{formatMoney(row.amount)}</td>
                  <td className="border border-gray-900 p-2 text-right font-bold">{formatDecimal(report.expensePerKg(row.amount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-yellow-300 font-black">
                <td className="border border-gray-900 p-2 text-right" colSpan={2}>
                  Total Payable
                </td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(report.totalPayable)}</td>
                <td className="border border-gray-900 p-2 text-right">{formatDecimal(report.factoryConversionPerKg)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="overflow-x-auto border border-gray-900 bg-white">
          <table className="w-full min-w-[610px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-900 bg-red-950 p-2 text-center text-white" colSpan={4}>
                  MIS REPORT
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-rose-200 font-black">
                <td className="border border-gray-900 p-2">FFG Value</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(report.adjustedSales)}</td>
                <td className="border border-gray-900 p-2" colSpan={2} />
              </tr>
              <tr className="bg-rose-200 font-black">
                <td className="border border-gray-900 p-2">Actual Paper Used</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(report.actualPaperUsedCost)}</td>
                <td className="border border-gray-900 p-2" colSpan={2} />
              </tr>
              <tr className="bg-rose-200 font-black">
                <td className="border border-gray-900 p-2">Total Sold Value (Invoiced)</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(report.totalSaleBasic)}</td>
                <td className="border border-gray-900 p-2" colSpan={2} />
              </tr>
              <tr className="bg-rose-200 font-black">
                <td className="border border-gray-900 p-2">Wastage Percent</td>
                <td className="border border-gray-900 p-2 text-right">{formatDecimal(report.wastagePercent)}%</td>
                <td className="border border-gray-900 p-2" />
                <td className="border border-gray-900 p-2" />
              </tr>
              <tr className="bg-rose-300 font-black">
                <td className="border border-gray-900 p-2">Total Sale (Basic)</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(report.totalSaleBasic)}</td>
                <td className="border border-gray-900 p-2" />
                <td className="border border-gray-900 p-2" />
              </tr>
              <tr className="bg-rose-200 font-black">
                <td className="border border-gray-900 p-2">Sales Return (Basic)</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(inputs.salesReturnBasic)}</td>
                <td className="border border-gray-900 p-2" />
                <td className="border border-gray-900 p-2" />
              </tr>
              <tr className="bg-cyan-100 font-black">
                <td className="border border-gray-900 p-2">FG - WIP Opening Valuation</td>
                <td className="border border-gray-900 p-1 text-right">{renderInputCell("fgWipOpening")}</td>
                <td className="border border-gray-900 p-2 text-center">LNGRP SALE -Purchase</td>
                <td className="border border-gray-900 p-1 text-right">{renderInputCell("lngrpOpening")}</td>
              </tr>
              <tr className="bg-cyan-100 font-black">
                <td className="border border-gray-900 p-2">FG - WIP Closing Valuation</td>
                <td className="border border-gray-900 p-1 text-right">{renderInputCell("fgWipClosing")}</td>
                <td className="border border-gray-900 p-2" />
                <td className="border border-gray-900 p-1 text-right">{renderInputCell("lngrpClosing")}</td>
              </tr>
              <tr className="bg-cyan-200 font-black">
                <td className="border border-gray-900 p-2">SP/Kg</td>
                <td className="border border-gray-900 p-2 text-right">{formatDecimal(report.spPerKg)}</td>
                <td className="border border-gray-900 p-2" colSpan={2} />
              </tr>
              <tr className="bg-cyan-200 font-black">
                <td className="border border-gray-900 p-2">Paper Cost</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(report.paperCost)}</td>
                <td className="border border-gray-900 p-2" colSpan={2} />
              </tr>
              <tr className="bg-cyan-200 font-black">
                <td className="border border-gray-900 p-2">Paper %</td>
                <td className="border border-gray-900 p-2 text-right">{formatDecimal(report.paperPercent)}%</td>
                <td className="border border-gray-900 p-2" colSpan={2} />
              </tr>
              {[
                ["Factory Conversion Cost", report.totalPayable],
                ["HO Salary", inputs.hoSalary],
                ["Management Salary", inputs.managementSalary],
                ["All EMI", inputs.allEmi],
                ["Donation, Fastags, Misc. Exp", inputs.miscExpense],
              ].map(([label, amount]) => (
                <tr key={String(label)} className="bg-red-100 font-black">
                  <td className="border border-gray-900 p-2">{label}</td>
                  <td className="border border-gray-900 p-2 text-right">{formatMoney(Number(amount))}</td>
                  <td className="border border-gray-900 p-2 text-right text-blue-700" colSpan={2}>
                    {formatDecimal(report.expensePerKg(Number(amount)))}
                  </td>
                </tr>
              ))}
              <tr className="bg-red-500 font-black text-white">
                <td className="border border-gray-900 p-2">RESULT</td>
                <td className="border border-gray-900 p-2 text-center">LOSS</td>
                <td className="border border-gray-900 p-2 text-right" colSpan={2}>
                  {formatDecimal(report.result)}
                </td>
              </tr>
              <tr className="bg-yellow-300 font-black text-red-700">
                <td className="border border-gray-900 p-2">Loss Amount</td>
                <td className="border border-gray-900 p-2 text-right" colSpan={3}>
                  {formatMoney(report.lossAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
