import React, { useEffect, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { getInvoiceGrandTotal } from "../lib/gatePasses";
import { computeAuditDashboard, roundMoney } from "../lib/reports/auditDashboard";
import type { AuditDashboardResult } from "../lib/reports/auditDashboard";
import { useServerReport } from "../hooks/useServerReport";
import type {
  AuditDashboardSnapshot,
  Invoice,
  Item,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Production,
  Supplier,
} from "../types";
import { cn } from "../lib/utils";
import { formatDate } from "../lib/serial";
import { ExcelExport } from "../components/ExcelExport";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";

const ALL_DATA_DATE_RANGE = { from: "", to: "" };
const ALL_DATA_RANGE_LABEL = "All Dates";

type AuditMetricKey =
  | "invoiceValue"
  | "consumptionValue"
  | "manufacturingValue"
  | "saleValue"
  | "debitNote"
  | "npdStockValue"
  | "npdStockQty"
  | "reelStockQty"
  | "reelStockValue";

type AuditMetric = {
  key: AuditMetricKey;
  label: string;
  appValue: number;
  tallyValue: number;
  appCount: number;
  tallyCount: number;
  difference: number;
};

type TallyValues = {
  invoiceValueTally: number;
  consumptionValueTally: number;
  manufacturingValueTally: number;
  saleValueTally: number;
  debitNoteTally: number;
  npdStockValueTally: number;
  npdStockQtyTally: number;
  reelStockQtyTally: number;
  reelStockValueTally: number;
  invoiceCountTally: number;
  consumptionCountTally: number;
  manufacturingCountTally: number;
  saleCountTally: number;
  debitNoteCountTally: number;
  npdStockCountTally: number;
  npdStockQtyCountTally: number;
  reelStockQtyCountTally: number;
  reelStockCountTally: number;
};

function formatMoney(value: number) {
  return roundMoney(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCount(value: number) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatLastSync(value: string) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return "Last Sync : -";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(parsed);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const time = `${getPart("hour")}:${getPart("minute")} ${getPart("dayPeriod").toUpperCase()}`;
  const date = `${getPart("day")}-${getPart("month")}-${getPart("year")}`;

  return `Last Sync : ${time} | ${date}`;
}

function getSnapshotId() {
  return `audit-${ALL_DATA_DATE_RANGE.from || "all"}-${ALL_DATA_DATE_RANGE.to || "all"}`;
}

function getSnapshotValues(snapshot?: AuditDashboardSnapshot): TallyValues {
  return {
    invoiceValueTally: roundMoney(Number(snapshot?.invoiceValueTally || 0)),
    consumptionValueTally: roundMoney(Number(snapshot?.consumptionValueTally || 0)),
    manufacturingValueTally: roundMoney(Number(snapshot?.manufacturingValueTally || 0)),
    saleValueTally: roundMoney(Number(snapshot?.saleValueTally || 0)),
    debitNoteTally: roundMoney(Number(snapshot?.debitNoteTally || 0)),
    npdStockValueTally: roundMoney(Number(snapshot?.npdStockValueTally || 0)),
    // npdStockQty is computed live from npdItems, not from snapshot
    npdStockQtyTally: 0,
    reelStockQtyTally: roundMoney(Number(snapshot?.reelStockQtyTally || 0)),
    reelStockValueTally: roundMoney(Number(snapshot?.reelStockValueTally || 0)),
    invoiceCountTally: Number(snapshot?.invoiceCountTally || 0),
    consumptionCountTally: Number(snapshot?.consumptionCountTally || 0),
    manufacturingCountTally: Number(snapshot?.manufacturingCountTally || 0),
    saleCountTally: Number(snapshot?.saleCountTally || 0),
    debitNoteCountTally: Number(snapshot?.debitNoteCountTally || 0),
    npdStockCountTally: Number(snapshot?.npdStockCountTally || 0),
    npdStockQtyCountTally: 0,
    reelStockQtyCountTally: Number(snapshot?.reelStockQtyCountTally || 0),
    reelStockCountTally: Number(snapshot?.reelStockCountTally || 0),
  };
}

function getSnapshotSortTime(snapshot: AuditDashboardSnapshot) {
  const parsed = new Date(snapshot.updateTimestamp || "").getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

const AUDIT_DASHBOARD_TABLES = ["material_in", "material_issues", "material_issue_lines", "material_returns", "material_return_lines", "invoices", "productions", "npd"];
const EMPTY_AUDIT_RESULT: AuditDashboardResult = {
  appValues: {
    invoiceValue: 0, invoiceCount: 0, consumptionValue: 0, consumptionCount: 0, manufacturingValue: 0, manufacturingCount: 0,
    saleValue: 0, saleCount: 0, debitNote: 0, debitNoteCount: 0, npdStockValue: 0, npdStockCount: 0, npdStockQtyTally: 0,
    npdStockQtyCountTally: 0, npdStockQtyApp: 0, npdStockQtyCountApp: 0,

  },
  negativeOpeningNpdRows: [],
};

export function AuditDashboard() {
  // App figures are calculated on the server; if it cannot, the lists are
  // loaded and calculated here as before.
  const serverReport = useServerReport<AuditDashboardResult>("audit-dashboard", {}, AUDIT_DASHBOARD_TABLES);
  const browserFallback = serverReport.failed;
  const listOptions = { enabled: browserFallback };
  const [materialIn] = useData<MaterialIn>("material-in", [], listOptions);
  const [materialIssues] = useData<MaterialIssue>("material-issues", [], listOptions);
  const [materialIssueLines] = useData<MaterialIssueLine>("material-issue-lines", [], listOptions);
  const [materialReturns] = useData<MaterialReturn>("material-returns", [], listOptions);
  const [materialReturnLines] = useData<MaterialReturnLine>("material-return-lines", [], listOptions);
  const [invoices] = useData<Invoice>("invoices", [], listOptions);
  const [productions] = useData<Production>("productions", [], listOptions);
  const npdItems = useNpdItems({ enabled: browserFallback });
  const [snapshots] = useData<AuditDashboardSnapshot>("audit_dashboard_snapshots", []);
  const [tallyValues, setTallyValues] = useState<TallyValues>(getSnapshotValues());
  const [fetchedAt, setFetchedAt] = useState("");

  const snapshotId = getSnapshotId();
  const currentSnapshot = useMemo(() => {
    const exactSnapshot = snapshots.find(
      (entry) => entry.id === snapshotId || (entry.dateFrom === ALL_DATA_DATE_RANGE.from && entry.dateTo === ALL_DATA_DATE_RANGE.to)
    );
    if (exactSnapshot) return exactSnapshot;

    return [...snapshots].sort((a, b) => getSnapshotSortTime(b) - getSnapshotSortTime(a))[0];
  }, [snapshotId, snapshots]);

  useEffect(() => {
    setTallyValues(getSnapshotValues(currentSnapshot));
    setFetchedAt(currentSnapshot?.updateTimestamp || "");
  }, [currentSnapshot]);

  const clientResult = useMemo<AuditDashboardResult | null>(
    () => (browserFallback
      ? computeAuditDashboard({ materialIn, materialIssues, materialIssueLines, materialReturns, materialReturnLines, invoices, productions }, npdItems)
      : null),
    [browserFallback, invoices, materialIn, materialIssueLines, materialIssues, materialReturnLines, materialReturns, npdItems, productions]
  );
  const auditResult = (browserFallback ? clientResult : serverReport.result) || EMPTY_AUDIT_RESULT;
  const appValues = auditResult.appValues;

  const metrics = useMemo<AuditMetric[]>(() => {
    const baseMetrics: Array<Omit<AuditMetric, "difference">> = [
      { key: "invoiceValue", label: "Invoice Value", appValue: appValues.invoiceValue, tallyValue: tallyValues.invoiceValueTally, appCount: appValues.invoiceCount, tallyCount: tallyValues.invoiceCountTally },
      { key: "consumptionValue", label: "Consumption Value", appValue: appValues.consumptionValue, tallyValue: tallyValues.consumptionValueTally, appCount: appValues.consumptionCount, tallyCount: tallyValues.consumptionCountTally },
      { key: "manufacturingValue", label: "Manufacturing Journal Audit", appValue: appValues.manufacturingValue, tallyValue: tallyValues.manufacturingValueTally, appCount: appValues.manufacturingCount, tallyCount: tallyValues.manufacturingCountTally },
      { key: "saleValue", label: "Sale Value", appValue: appValues.saleValue, tallyValue: tallyValues.saleValueTally, appCount: appValues.saleCount, tallyCount: tallyValues.saleCountTally },
      { key: "debitNote", label: "Debit Note", appValue: appValues.debitNote, tallyValue: tallyValues.debitNoteTally, appCount: appValues.debitNoteCount, tallyCount: tallyValues.debitNoteCountTally },
    ];

    return baseMetrics.map((metric) => ({ ...metric, difference: roundMoney(metric.tallyValue - metric.appValue) }));
  }, [appValues, tallyValues]);

  const differenceMetrics = metrics.filter((metric) => roundMoney(metric.difference) !== 0);
  const hasDifference = differenceMetrics.length > 0;

  const negativeOpeningNpdRows = auditResult.negativeOpeningNpdRows;
  const negativeOpeningExcelRows = useMemo(
    () =>
      negativeOpeningNpdRows.map((row) => ({
        "Item Name": row.itemName,
        ERP: row.erp,
        Opening: row.opening,
        Balance: row.balance,
        "Tally Stock": row.tallyStock == null ? "" : row.tallyStock,
        Status: "NEGATIVE OPENING",
      })),
    [negativeOpeningNpdRows]
  );

  const negativeOpeningPagination = useClientPagination(negativeOpeningNpdRows, 25);

  useEffect(() => { negativeOpeningPagination.setPage(1); }, [negativeOpeningNpdRows]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-950 md:text-2xl">Audit Dashboard</h2>
          </div>
        </div>
        <div className="border-t border-slate-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
          {formatLastSync(fetchedAt)}
        </div>
      </section>

      {hasDifference ? (
        <section className="overflow-hidden rounded-xl border-2 border-red-900 bg-red-50 shadow-[4px_4px_0px_0px_rgba(127,29,29,1)]">
          <div className="border-b-2 border-red-900 bg-red-700 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white">
            Difference Found
          </div>
          <div className="p-4">
            <div className="space-y-1 text-sm font-bold text-red-950">
              {differenceMetrics.map((metric) => (
                <div key={metric.key}>
                  {metric.label}: {formatMoney(metric.difference)}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white border-b-2 border-slate-900">
          Value Match
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-100">
              <tr className="divide-x divide-slate-900 border-b-2 border-slate-900">
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Particular</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Tally Count</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">App Count</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Tally Value</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">App Value</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Difference</th>
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 bg-white">
              {metrics.map((metric, index) => {
                const mismatched = roundMoney(metric.difference) !== 0; return (
                  <tr key={metric.key} className={cn("divide-x divide-slate-900", index % 2 === 0 ? "bg-white" : "bg-slate-50")}>
                    <td className="px-3 py-3 text-sm font-black uppercase tracking-wide text-slate-900">{metric.label}</td>
                    <td className="px-3 py-3 text-right text-sm font-black text-slate-900">{formatCount(metric.tallyCount)}</td>
                    <td className="px-3 py-3 text-right text-sm font-black text-indigo-800">{formatCount(metric.appCount)}</td>
                    <td className="px-3 py-3 text-right text-sm font-black text-slate-900">{formatMoney(metric.tallyValue)}</td>
                    <td className="px-3 py-3 text-right text-sm font-black text-indigo-800">{formatMoney(metric.appValue)}</td>
                    <td className={cn("px-3 py-3 text-right text-sm font-black", mismatched ? "text-red-700" : "text-emerald-700")}>{formatMoney(metric.difference)}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase", mismatched ? "border-red-800 bg-red-50 text-red-700" : "border-emerald-800 bg-emerald-50 text-emerald-700")}>
                        {mismatched ? "Difference" : "Matched"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white border-b-2 border-slate-900 flex justify-between items-center gap-3">
          <span>NPD Items With Negative Opening</span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] text-slate-300 font-normal">
              Showing Negative Opening Items ({negativeOpeningNpdRows.length})
            </span>
            <ExcelExport data={negativeOpeningExcelRows} fileName="NPD_Negative_Opening" sheetName="Negative Opening" className="h-7 border-white/40 bg-white px-2 py-0 text-[10px] text-slate-950 hover:bg-slate-100" />
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-100 sticky top-0 z-10">
              <tr className="divide-x divide-slate-900 border-b-2 border-slate-900">
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Item Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">ERP</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Opening</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Balance</th>
                <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Tally Stock</th>
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 bg-white">
              {negativeOpeningNpdRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs font-black uppercase tracking-wide text-emerald-700">
                    No negative opening items found.
                  </td>
                </tr>
              ) : (
                negativeOpeningPagination.paginatedItems.map((row) => (
                  <tr key={row.id} className="divide-x divide-slate-900 bg-red-50/50">
                    <td className="px-3 py-2 text-xs font-bold text-slate-900">{row.itemName || "-"}</td>
                    <td className="px-3 py-2 text-xs font-bold text-slate-900">{row.erp || "-"}</td>
                    <td className="px-3 py-2 text-right text-xs font-black text-red-700">{formatMoney(row.opening)}</td>
                    <td className="px-3 py-2 text-right text-xs font-black text-indigo-800">{formatMoney(row.balance)}</td>
                    <td className="px-3 py-2 text-right text-xs font-black text-slate-900">{row.tallyStock == null ? "-" : formatMoney(row.tallyStock)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full border border-red-800 bg-red-50 px-2 py-0.5 text-[9px] font-black uppercase text-red-700">
                        NEGATIVE OPENING
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ClientPagination
          page={negativeOpeningPagination.page}
          pageSize={negativeOpeningPagination.pageSize}
          totalItems={negativeOpeningPagination.totalItems}
          onPageChange={negativeOpeningPagination.setPage}
          onPageSizeChange={negativeOpeningPagination.setPageSize}
        />
      </section>
    </div>
  );
}









