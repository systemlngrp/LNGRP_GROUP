import React, { useMemo, useState } from "react";
import { ReportFilterBox, SelectFilter } from "../components/ReportFilterBox";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
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
import { SortHeader, useTableSort } from "../lib/tableSort";

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
  const [searchTerm, setSearchTerm] = useState("");

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
    () => {
      const words = searchWords(searchTerm);
      return (result?.rows || []).filter((row) =>
        (!monthFilter || Number(monthFilter) === row.monthValue) &&
        matchesTableSearch(rowSearchText([row.month, formatMoney(row.consumables), formatMoney(row.fixed), formatNumber(row.totalConsumption), formatMoney(row.actualPaperUsedCost), formatNumber(row.ratio)]), words)
      );
    },
    [monthFilter, result, searchTerm]
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

  // Column sort over the month rows; Month sorts in financial-year order.
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) =>
    key === "month" ? FY_MONTHS.findIndex((entry) => entry.value === row.monthValue) : Number((row as any)[key] || 0)
  );

  const totalRatio = totals.actualPaperUsedCost > 0 ? round2(totals.totalConsumption / totals.actualPaperUsedCost) : 0;

  const clearFilters = () => {
    setFy(getCurrentFinancialYear());
    setMonthFilter("");
    setSearchTerm("");
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h1 className="text-xl font-bold uppercase tracking-tight text-black">Conversion Cost Month Wise</h1>
      </div>

      <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={Boolean(searchTerm.trim() || monthFilter || fy !== getCurrentFinancialYear())} onClear={clearFilters}>
        <SelectFilter label="FY" value={fy} onChange={(value) => setFy(value || getCurrentFinancialYear())} options={fyOptions.map((option) => ({ value: option, label: `FY ${option}` }))} />
        <SelectFilter label="Month" value={monthFilter} onChange={setMonthFilter} options={FY_MONTHS.map((month) => ({ value: String(month.value), label: month.label }))} />
      </ReportFilterBox>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
              <th className="border border-gray-900 p-2 text-left"><SortHeader label="Month" sortKey="month" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-gray-900 p-2 text-right"><SortHeader label="Consumables" sortKey="consumables" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-gray-900 p-2 text-right"><SortHeader label="Fixed and Semi Variable Expenses" sortKey="fixed" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-gray-900 p-2 text-right"><SortHeader label="Total Consumption" sortKey="totalConsumption" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-gray-900 p-2 text-right"><SortHeader label="Actual Paper Used Cost" sortKey="actualPaperUsedCost" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-gray-900 p-2 text-right"><SortHeader label="Ratio" sortKey="ratio" sort={sort} onToggle={toggleSort} align="right" /></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
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
