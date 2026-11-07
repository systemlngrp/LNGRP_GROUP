import React, { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useData } from "../hooks/useData";
import type {
  FixedMonthlyExpense,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturnReelLine,
  Production,
} from "../types";
import { FY_MONTHS, getCurrentFinancialYear } from "../lib/financialYear";
import { computeConversionCostMonthWise, round2 } from "../lib/reports/conversionCostMonthWise";
import type { ConversionCostMonthRow } from "../lib/reports/conversionCostMonthWise";
import { useServerReport } from "../hooks/useServerReport";

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CONVERSION_COST_TABLES = ["material_issues", "material_issue_lines", "materials", "material_in", "fixed_monthly_expenses", "productions", "material_in_packing_slips", "material_issue_reel_lines", "material_return_reel_lines"];
type ConversionCostResult = { rows: ConversionCostMonthRow[]; fyOptions: string[] };

export function ConversionCostMonthWiseReport() {
  const [fy, setFy] = useState(getCurrentFinancialYear());
  const [monthFilter, setMonthFilter] = useState("");

  // Calculated on the server; if it cannot, the lists are loaded and
  // calculated here as before.
  const serverReport = useServerReport<ConversionCostResult>("conversion-cost-month-wise", { fy }, CONVERSION_COST_TABLES);
  const browserFallback = serverReport.failed;
  const [materialIssues] = useData<MaterialIssue>("material-issues", [], { enabled: browserFallback });
  const [issueLines] = useData<MaterialIssueLine>("material-issue-lines", [], { enabled: browserFallback });
  const [materials] = useData<Material>("materials", [], { enabled: browserFallback });
  const [materialIn] = useData<MaterialIn>("material-in", [], { enabled: browserFallback });
  const [fixedExpenses] = useData<FixedMonthlyExpense>("fixed_monthly_expenses", [], { enabled: browserFallback });
  const [productions] = useData<Production>("productions", [], { enabled: browserFallback });
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", [], { enabled: browserFallback });
  const [issueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { enabled: browserFallback });
  const [returnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { enabled: browserFallback });

  const clientResult = useMemo<ConversionCostResult | null>(
    () => (browserFallback ? computeConversionCostMonthWise({ materialIssues, issueLines, materials, materialIn, fixedExpenses, productions, packingSlips, issueReelLines, returnReelLines }, fy) : null),
    [browserFallback, fixedExpenses, fy, issueLines, issueReelLines, materialIn, materialIssues, materials, packingSlips, productions, returnReelLines]
  );
  const result = browserFallback ? clientResult : serverReport.result;
  const fyOptions = useMemo(() => {
    const options = result?.fyOptions || [];
    // Keep the selected FY in the list while the report is calculating.
    return options.includes(fy) ? options : [fy, ...options];
  }, [fy, result]);
  const rows = useMemo(
    () => (result?.rows || []).filter((row) => !monthFilter || Number(monthFilter) === row.monthValue),
    [monthFilter, result]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          consumables: sum.consumables + row.consumables,
          fixed: sum.fixed + row.fixed,
          totalConsumption: sum.totalConsumption + row.totalConsumption,
          actualPaperUsedCost: sum.actualPaperUsedCost + row.actualPaperUsedCost,
        }),
        { consumables: 0, fixed: 0, totalConsumption: 0, actualPaperUsedCost: 0 }
      ),
    [rows]
  );

  const totalRatio = totals.actualPaperUsedCost > 0 ? round2(totals.totalConsumption / totals.actualPaperUsedCost) : 0;

  const clearFilters = () => {
    setFy(getCurrentFinancialYear());
    setMonthFilter("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-900 pb-3">
        <div><h1 className="text-2xl font-black uppercase tracking-tight">Conversion Cost Month Wise</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded border border-gray-900 p-2 text-sm font-bold" value={fy} onChange={(event) => setFy(event.target.value)}>
            {fyOptions.map((option) => (
              <option key={option} value={option}>
                FY {option}
              </option>
            ))}
          </select>
          <select className="rounded border border-gray-900 p-2 text-sm font-bold" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
            <option value="">Months</option>
            {FY_MONTHS.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <button className="inline-flex items-center gap-2 rounded border border-gray-900 px-3 py-2 text-sm font-bold" type="button" onClick={clearFilters}>
            <RotateCcw size={16} /> Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="border border-gray-900 bg-emerald-50 p-3">
          <p className="text-xs font-black uppercase text-slate-600">Consumables</p>
          <p className="text-2xl font-black text-emerald-700">{formatMoney(totals.consumables)}</p>
        </div>
        <div className="border border-gray-900 bg-blue-50 p-3">
          <p className="text-xs font-black uppercase text-slate-600">Fixed And Semi Variable Expenses</p>
          <p className="text-2xl font-black text-blue-700">{formatMoney(totals.fixed)}</p>
        </div>
        <div className="border border-gray-900 bg-amber-50 p-3">
          <p className="text-xs font-black uppercase text-slate-600">Total Conversion Cost</p>
          <p className="text-2xl font-black text-amber-700">{formatMoney(totals.consumables + totals.fixed)}</p>
        </div>
        <div className="border border-gray-900 bg-purple-50 p-3">
          <p className="text-xs font-black uppercase text-slate-600">Overall Ratio</p>
          <p className="text-2xl font-black text-purple-700">{formatNumber(totalRatio)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-900 bg-white">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-gray-900 p-2 text-left">Month</th>
              <th className="border border-gray-900 p-2 text-right">Consumables</th>
              <th className="border border-gray-900 p-2 text-right">Fixed and Semi Variable Expenses</th>
              <th className="border border-gray-900 p-2 text-right">Total Consumption</th>
              <th className="border border-gray-900 p-2 text-right">Actual Paper Used Cost</th>
              <th className="border border-gray-900 p-2 text-right">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.monthValue}>
                <td className="border border-gray-900 p-2 font-bold">{row.month}</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(row.consumables)}</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(row.fixed)}</td>
                <td className="border border-gray-900 p-2 text-right">{formatNumber(row.totalConsumption)}</td>
                <td className="border border-gray-900 p-2 text-right">{formatMoney(row.actualPaperUsedCost)}</td>
                <td className="border border-gray-900 p-2 text-right">{formatNumber(row.ratio)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 font-black text-white">
              <td className="border border-gray-900 p-2 text-right">Total</td>
              <td className="border border-gray-900 p-2 text-right">{formatMoney(totals.consumables)}</td>
              <td className="border border-gray-900 p-2 text-right">{formatMoney(totals.fixed)}</td>
              <td className="border border-gray-900 p-2 text-right">{formatNumber(totals.totalConsumption)}</td>
              <td className="border border-gray-900 p-2 text-right">{formatMoney(totals.actualPaperUsedCost)}</td>
              <td className="border border-gray-900 p-2 text-right">{formatNumber(totalRatio)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
