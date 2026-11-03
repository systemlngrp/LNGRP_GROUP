import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { useAutoRefreshEffect } from "../hooks/useAutoRefresh";
import { useNpdItemsWithStatus } from "../hooks/useNpdItems";
import { useSettledValue } from "../hooks/useSettledValue";
import { Spinner } from "../components/Spinner";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import type {
  Company,
  Consumption,
  DispatchPlan,
  Firm,
  GateEntry,
  GatePass,
  Invoice,
  InvoiceLineItem,
  Indent,
  IndentLine,
  Item,
  Machine,
  LoadingSlip,
  LoadingSlipLine,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  OperationDashboardMetricCard,
  OperationDashboardSummary,
  Order,
  OrderSchedule,
  PurchaseOrder,
  Production,
  ProductionProcessing,
  SampleRequest,
  Setting,
} from "../types";
import { exportsAllowed } from "../lib/exportPolicy";
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { getPendingTaskGroups } from "../lib/pendingTaskCounts";
import {
  computeOperationDashboard,
  type OperationDashboardLists,
  type OperationDashboardResult,
} from "../lib/operationDashboardCompute";
import { useTrackPageLoading } from "../components/DataLoadingBoundary";


type SummaryCardConfig = {
  id: string;
  tone: string;
  valueTone?: string;
};

type SummaryGroupConfig = {
  groupId: string;
  cards: SummaryCardConfig[];
};

type ClosedJobFilter = "all" | "yes" | "no";

const SUMMARY_GROUP_CONFIGS: SummaryGroupConfig[] = [
  {
    groupId: "production",
      cards: [
        { id: "production", tone: "bg-cyan-50", valueTone: "text-cyan-800" },
        { id: "linearMeter", tone: "bg-emerald-50", valueTone: "text-emerald-800" },
        { id: "todayPlanQty", tone: "bg-amber-50", valueTone: "text-amber-800" },
        { id: "todayPlanValue", tone: "bg-rose-50", valueTone: "text-rose-800" },
        { id: "tomorrowPlanQty", tone: "bg-sky-50", valueTone: "text-sky-800" },
        { id: "tomorrowPlanValue", tone: "bg-fuchsia-50", valueTone: "text-fuchsia-800" },
        { id: "actualPaperUsed", tone: "bg-violet-50", valueTone: "text-violet-800" },
        { id: "scrapSoldQty", tone: "bg-teal-50", valueTone: "text-teal-800" },
        { id: "wastage", tone: "bg-orange-50", valueTone: "text-orange-800" },
        { id: "planPaper", tone: "bg-indigo-50", valueTone: "text-indigo-800" },
        { id: "activeJobs", tone: "bg-emerald-50", valueTone: "text-emerald-800" },
        { id: "pendingTally", tone: "bg-lime-50", valueTone: "text-lime-800" }
      ],
  },
  {
    groupId: "dispatch",
    cards: [
      { id: "dispatchPlannedQty", tone: "bg-indigo-50", valueTone: "text-indigo-800" },
      { id: "dispatchLoadedQty", tone: "bg-blue-50", valueTone: "text-blue-800" },
      { id: "loadingQty", tone: "bg-violet-50", valueTone: "text-violet-800" },
      { id: "pendingPlanningValue", tone: "bg-pink-50", valueTone: "text-pink-800" },
    ],
  },
  {
    groupId: "sales",
    cards: [
      { id: "totalSales", tone: "bg-emerald-50", valueTone: "text-emerald-800" },
      { id: "todaySalesValue", tone: "bg-teal-50", valueTone: "text-teal-800" },
      { id: "invoiceCount", tone: "bg-yellow-50", valueTone: "text-yellow-800" },
    ],
  },
];



function formatMetricValue(card: OperationDashboardMetricCard) {
  if (card.status === "unavailable" || card.value === null) return "Pending";
  if (card.format === "currency") return formatCurrency(card.value);
  if (card.format === "percent") return `${Number(card.value || 0).toFixed(2)}%`;
  const text =
    typeof card.decimals === "number"
      ? Number(card.value || 0).toLocaleString("en-IN", { minimumFractionDigits: card.decimals, maximumFractionDigits: card.decimals })
      : formatNumber(card.value, false);
  return card.unit ? `${text} ${card.unit}` : text;
}

function getDefaultRange() {
  return { from: "", to: "" };
}

function getSummaryCard(summary: OperationDashboardSummary, cardId: string) {
  return summary.groups.flatMap((group) => group.cards).find((card) => card.id === cardId) || null;
}

const EMPTY_DASHBOARD_LISTS: OperationDashboardLists = {
  productions: [], firms: [], phpJobMaster: [], plateJobMaster: [], npdFirmWiseRows: [], catalogFgRows: [],
  catalogPhpRows: [], catalogPlateRows: [], catalogMaterialRows: [], materials: [], materialIn: [], packingSlips: [],
  schedules: [], orders: [], companies: [], gateEntries: [], dispatchPlans: [], processing: [], loadingSlips: [],
  materialIssues: [], materialIssueLines: [], issueReelLines: [], materialReturns: [], materialReturnLines: [],
  returnReelLines: [], invoices: [], invoiceLineItems: [], consumptions: [], sampleRequests: [], indents: [],
  indentLines: [], purchaseOrders: [], phpLoadingSlips: [], plateLoadingSlips: [], gatePasses: [], machines: [],
  settings: [],
};

export function OperationDashboard() {
  const navigate = useNavigate();
  const allowExports = exportsAllowed();
  const [dateRange, setDateRange] = useState(getDefaultRange);
  const [closedJobFilter, setClosedJobFilter] = useState<ClosedJobFilter>("no");
  const [pendingJobClosureCount, setPendingJobClosureCount] = useState<number>(0);
  const [pendingJobClosureLoading, setPendingJobClosureLoading] = useState(true);
  const [pendingJobClosureError, setPendingJobClosureError] = useState<string | null>(null);
  const [pendingJobClosureRetryKey, setPendingJobClosureRetryKey] = useState(0);
  const operationExportFileName =
    dateRange.from && dateRange.to
      ? `Operation_Dashboard_${dateRange.from}_${dateRange.to}`
      : "Operation_Dashboard_All_Dates";

  // Figures are computed on the server (/api/operations-dashboard/summary) and
  // only the results are downloaded. If the server cannot provide them (older
  // server build, error), fall back to loading every list in the browser.
  const [mode, setMode] = useState<"server" | "client">("server");
  const clientMode = mode === "client";
  const [serverResult, setServerResult] = useState<OperationDashboardResult | null>(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverRefreshKey, setServerRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const serverRequestRef = useRef(0);

  const requestServerSummary = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/operations-dashboard/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders(true) },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Dashboard summary failed (${response.status})`);
      return (await response.json()) as OperationDashboardResult;
    },
    []
  );

  useEffect(() => {
    if (clientMode) return;
    const requestId = ++serverRequestRef.current;
    const background = serverRefreshKey > 0 && serverResult !== null;
    if (!background) setServerLoading(true);
    requestServerSummary({ from: dateRange.from, to: dateRange.to, closedJobFilter })
      .then((result) => {
        if (requestId !== serverRequestRef.current) return;
        setServerResult(result);
        setServerLoading(false);
      })
      .catch((error) => {
        if (requestId !== serverRequestRef.current) return;
        console.warn("[OperationDashboard] Server summary unavailable; loading lists in the browser.", error);
        setMode("client");
        setServerLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientMode, dateRange.from, dateRange.to, closedJobFilter, serverRefreshKey, requestServerSummary]);

  useAutoRefreshEffect(() => setServerRefreshKey((value) => value + 1), !clientMode);

  // ---- Browser fallback: same lists and the same shared calculation module. ----
  const listOptions = { enabled: clientMode };
  const [productionsRaw, , productionsLoading] = useData<Production>("productions", [], listOptions);
  const [firmsRaw, , firmsLoading] = useData<Firm>("firms", [], listOptions);
  const [phpJobMasterRaw, , phpJobMasterLoading] = useData<Production>("php_job_master", [], listOptions);
  const [plateJobMasterRaw, , plateJobMasterLoading] = useData<Production>("plate_job_master", [], listOptions);
  const { rows: npdFirmWiseRowsRaw, loading: npdItemsLoading } = useNpdItemsWithStatus({ enabled: clientMode });
  const {
    fgRows: catalogFgRowsRaw,
    phpRows: catalogPhpRowsRaw,
    plateRows: catalogPlateRowsRaw,
    materialRows: catalogMaterialRowsRaw,
    loading: catalogLoading,
  } = useOrderItemCatalog({ enabled: clientMode });
  const [materialsRaw, , materialsLoading] = useData<Material>("materials", [], listOptions);
  const [materialInRaw, , materialInLoading] = useData<MaterialIn>("material-in", [], listOptions);
  const [packingSlipsRaw, , packingSlipsLoading] = useData<MaterialInPackingSlip>("material-in-packing-slips", [], listOptions);
  const [schedulesRaw, , schedulesLoading] = useData<OrderSchedule>("orders_schedule", [], listOptions);
  const [ordersRaw, , ordersLoading] = useData<Order>("orders", [], listOptions);
  const [companiesRaw, , companiesLoading] = useData<Company>("companies", [], listOptions);
  const [gateEntriesRaw, , gateEntriesLoading] = useData<GateEntry>("gate-entries", [], listOptions);
  const [dispatchPlansRaw, , dispatchPlansLoading] = useData<DispatchPlan>("dispatch_plans", [], listOptions);
  const [processingRaw, , processingLoading] = useData<ProductionProcessing>("production_processing", [], listOptions);
  const [loadingSlipsRaw, , loadingSlipsLoading] = useData<LoadingSlip>("loading_slips", [], listOptions);
  const [materialIssuesRaw, , materialIssuesLoading] = useData<MaterialIssue>("material-issues", [], listOptions);
  const [materialIssueLinesRaw, , materialIssueLinesLoading] = useData<MaterialIssueLine>("material-issue-lines", [], listOptions);
  const [issueReelLinesRaw, , issueReelLinesLoading] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], listOptions);
  const [materialReturnsRaw, , materialReturnsLoading] = useData<MaterialReturn>("material-returns", [], listOptions);
  const [materialReturnLinesRaw, , materialReturnLinesLoading] = useData<MaterialReturnLine>("material-return-lines", [], listOptions);
  const [returnReelLinesRaw, , returnReelLinesLoading] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], listOptions);
  const [invoicesRaw, , invoicesLoading] = useData<Invoice>("invoices", [], listOptions);
  const [invoiceLineItemsRaw, , invoiceLineItemsLoading] = useData<InvoiceLineItem>("invoice_line_items", [], listOptions);
  const [consumptionsRaw, , consumptionsLoading] = useData<Consumption>("consumptions", [], listOptions);
  const [sampleRequestsRaw, , sampleRequestsLoading] = useData<SampleRequest>("sample_requests", [], listOptions);
  const [indentsRaw, , indentsLoading] = useData<Indent>("indents", [], listOptions);
  const [indentLinesRaw, , indentLinesLoading] = useData<IndentLine>("indent-lines", [], listOptions);
  const [purchaseOrdersRaw, , purchaseOrdersLoading] = useData<PurchaseOrder>("purchase-orders", [], listOptions);
  const [phpLoadingSlipsRaw, , phpLoadingSlipsLoading] = useData<LoadingSlip>("php_loading_slips", [], listOptions);
  const [plateLoadingSlipsRaw, , plateLoadingSlipsLoading] = useData<LoadingSlip>("plate_loading_slips", [], listOptions);
  const [gatePassesRaw, , gatePassesLoading] = useData<GatePass>("gate_passes", [], listOptions);
  const [machinesRaw, , machinesLoading] = useData<Machine>("machines", [], listOptions);
  const [settingsRaw, , settingsLoading] = useData<Setting>("settings", [], listOptions);

  const loadingFlags = [
    productionsLoading, firmsLoading, phpJobMasterLoading, plateJobMasterLoading, npdItemsLoading, catalogLoading,
    materialsLoading, materialInLoading, packingSlipsLoading, schedulesLoading, ordersLoading, companiesLoading,
    gateEntriesLoading, dispatchPlansLoading, processingLoading, loadingSlipsLoading, materialIssuesLoading,
    materialIssueLinesLoading, issueReelLinesLoading, materialReturnsLoading, materialReturnLinesLoading,
    returnReelLinesLoading, invoicesLoading, invoiceLineItemsLoading, consumptionsLoading, sampleRequestsLoading,
    indentsLoading, indentLinesLoading, purchaseOrdersLoading, phpLoadingSlipsLoading, plateLoadingSlipsLoading,
    gatePassesLoading, machinesLoading, settingsLoading,
  ];
  const clientListsReady = clientMode && !loadingFlags.some(Boolean);
  const loadedListCount = loadingFlags.filter((isLoading) => !isLoading).length;

  // Compute once, after every list has loaded (not after each 250-row batch).
  const liveClientLists = useMemo<OperationDashboardLists>(() => ({
    productions: productionsRaw, firms: firmsRaw, phpJobMaster: phpJobMasterRaw, plateJobMaster: plateJobMasterRaw,
    npdFirmWiseRows: npdFirmWiseRowsRaw, catalogFgRows: catalogFgRowsRaw, catalogPhpRows: catalogPhpRowsRaw,
    catalogPlateRows: catalogPlateRowsRaw, catalogMaterialRows: catalogMaterialRowsRaw, materials: materialsRaw,
    materialIn: materialInRaw, packingSlips: packingSlipsRaw, schedules: schedulesRaw, orders: ordersRaw,
    companies: companiesRaw, gateEntries: gateEntriesRaw, dispatchPlans: dispatchPlansRaw, processing: processingRaw,
    loadingSlips: loadingSlipsRaw, materialIssues: materialIssuesRaw, materialIssueLines: materialIssueLinesRaw,
    issueReelLines: issueReelLinesRaw, materialReturns: materialReturnsRaw, materialReturnLines: materialReturnLinesRaw,
    returnReelLines: returnReelLinesRaw, invoices: invoicesRaw, invoiceLineItems: invoiceLineItemsRaw,
    consumptions: consumptionsRaw, sampleRequests: sampleRequestsRaw, indents: indentsRaw, indentLines: indentLinesRaw,
    purchaseOrders: purchaseOrdersRaw, phpLoadingSlips: phpLoadingSlipsRaw, plateLoadingSlips: plateLoadingSlipsRaw,
    gatePasses: gatePassesRaw, machines: machinesRaw, settings: settingsRaw,
  }),
    [
      productionsRaw,
      firmsRaw,
      phpJobMasterRaw,
      plateJobMasterRaw,
      npdFirmWiseRowsRaw,
      catalogFgRowsRaw,
      catalogPhpRowsRaw,
      catalogPlateRowsRaw,
      catalogMaterialRowsRaw,
      materialsRaw,
      materialInRaw,
      packingSlipsRaw,
      schedulesRaw,
      ordersRaw,
      companiesRaw,
      gateEntriesRaw,
      dispatchPlansRaw,
      processingRaw,
      loadingSlipsRaw,
      materialIssuesRaw,
      materialIssueLinesRaw,
      issueReelLinesRaw,
      materialReturnsRaw,
      materialReturnLinesRaw,
      returnReelLinesRaw,
      invoicesRaw,
      invoiceLineItemsRaw,
      consumptionsRaw,
      sampleRequestsRaw,
      indentsRaw,
      indentLinesRaw,
      purchaseOrdersRaw,
      phpLoadingSlipsRaw,
      plateLoadingSlipsRaw,
      gatePassesRaw,
      machinesRaw,
      settingsRaw,
    ]
  );
  const clientLists = useSettledValue(liveClientLists, clientListsReady);
  const clientResult = useMemo(
    () => (clientListsReady || clientLists.productions.length
      ? computeOperationDashboard(clientLists, { dateRange, closedJobFilter, includeExportRows: true })
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientLists, dateRange, closedJobFilter]
  );

  const emptyResult = useMemo(
    () => computeOperationDashboard(EMPTY_DASHBOARD_LISTS, { dateRange, closedJobFilter }),
    [dateRange, closedJobFilter]
  );
  const result = (clientMode ? clientResult : serverResult) || emptyResult;
  const dataReady = clientMode ? clientListsReady : !serverLoading && serverResult !== null;

  useEffect(() => {
    const refreshPendingJobClosureCount = async () => {
      setPendingJobClosureLoading(true);
      setPendingJobClosureError(null);
      try {
        const token = window.localStorage.getItem("authToken") || "";
        const response = await fetch("/api/get-pending-job-closure", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error(await response.text());
        const rows = await response.json();
        setPendingJobClosureCount(Array.isArray(rows) ? rows.length : 0);
      } catch {
        setPendingJobClosureCount(0);
        setPendingJobClosureError("Unable to load pending job closure count.");
      } finally {
        setPendingJobClosureLoading(false);
      }
    };

    void refreshPendingJobClosureCount();
  }, [pendingJobClosureRetryKey]);

  useTrackPageLoading(pendingJobClosureLoading, pendingJobClosureError, () => setPendingJobClosureRetryKey((value) => value + 1));

  const summary = result.summary;
  const processingMachineCards = result.processingMachineCards;
  const pendingTaskSummary = useMemo(
    () => getPendingTaskGroups({ ...result.pendingCounts, "/production/pending-job-closure": pendingJobClosureCount || 0 }),
    [result.pendingCounts, pendingJobClosureCount]
  );

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = clientMode
        ? clientResult?.exportRows || []
        : (await requestServerSummary({ from: dateRange.from, to: dateRange.to, closedJobFilter, includeExportRows: true })).exportRows || [];
      if (!rows.length) return;
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(wb, `${operationExportFileName}.xlsx`);
    } catch (error) {
      console.error("[OperationDashboard] Export failed", error);
      alert("Could not prepare the Excel export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className={`space-y-4 ${dataReady ? "" : "[&>*:not(:first-child)]:pointer-events-none [&>*:not(:first-child)]:opacity-40"}`}
      aria-busy={!dataReady}
    >
      {/* Top Banner Control Section */}
      <div className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <div className="bg-white px-3 py-3">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-950 md:text-2xl">
                Operation Dashboard
              </h2>
              {!dataReady ? (
                <div className="mt-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700" role="status" aria-live="polite">
                  <Spinner size={16} />
                  <span>
                    {clientMode
                      ? `Loading latest data (${loadedListCount} of ${loadingFlags.length} lists)… figures will appear once all records are loaded.`
                      : "Calculating latest figures…"}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-stretch justify-end gap-1.5">
              <DateInput value={dateRange.from} onChange={(value) => setDateRange((prev) => ({ ...prev, from: value }))} />
              <DateInput value={dateRange.to} onChange={(value) => setDateRange((prev) => ({ ...prev, to: value }))} />
              <button
                type="button"
                onClick={() => setDateRange({ from: "", to: "" })}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-md border-2 border-slate-900 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase text-rose-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] transition hover:translate-x-px hover:translate-y-px hover:shadow-none cursor-pointer font-sans"
              >
                Clear
              </button>
              <div className="flex items-center gap-1.5 rounded-md border-2 border-slate-900 bg-white px-3 py-1 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                <label htmlFor="closed-job-filter-top" className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                  Closed Job
                </label>
                <select
                  id="closed-job-filter-top"
                  value={closedJobFilter}
                  onChange={(event) => setClosedJobFilter(event.target.value as ClosedJobFilter)}
                  className="rounded border border-slate-900 bg-white px-1.5 py-0.5 text-xs font-bold outline-none cursor-pointer font-sans"
                >
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              {allowExports ? (
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exporting || !dataReady}
                  className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-1.5 text-sm font-bold uppercase text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                  title="Download Excel"
                >
                  {exporting ? <Spinner size={16} /> : <Download size={16} />}
                  <span>Excel</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Main Metric Sections in single row panels */}
      <div className="space-y-4">
        {SUMMARY_GROUP_CONFIGS.map((groupConfig) => {
          const group = summary.groups.find((entry) => entry.id === groupConfig.groupId);
          if (!group) return null;
          return (
            <section
              key={group.id}
              className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"
            >
              {/* Section Heading */}
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white border-b-2 border-slate-900">
                {group.title}
              </div>
              {/* Single Horizontal Row of Bordered Blocks */}
              <div className="flex overflow-x-auto divide-x divide-slate-900 scrollbar-thin">
                {groupConfig.cards.map((cardConfig) => {
                  const card = getSummaryCard(summary, cardConfig.id);
                  if (!card) return null;
                  return (
                    <SummaryMetricCard
                      key={card.id}
                      card={card}
                      config={cardConfig}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white border-b-2 border-slate-900">
          Production Processing
        </div>
        <div className="flex overflow-x-auto divide-x divide-slate-900 scrollbar-thin">
          {processingMachineCards.map((card, index) => (
            <SummaryMetricCard
              key={card.id}
              card={card}
              config={{
                id: card.id,
                tone: index % 2 === 0 ? "bg-cyan-50" : "bg-emerald-50",
                valueTone: index % 2 === 0 ? "text-cyan-800" : "text-emerald-800",
              }}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <div className="flex items-center justify-between gap-3 bg-red-700 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white border-b-2 border-slate-900">
          <span>Pending Tasks</span>
          <span className="rounded border border-white/30 bg-white/10 px-2 py-0.5 text-right text-[10px] tracking-[0.12em]">
            Total Pending: {pendingTaskSummary.grandTotal.toLocaleString("en-IN")}
          </span>
        </div>
        <div className="bg-white text-xs">
          {pendingTaskSummary.groups.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">
              No pending tasks found.
            </div>
          ) : (
            <div className="divide-y-2 divide-slate-900">
              {pendingTaskSummary.groups.map((group) => (
                <div key={group.section}>
                  <div className="flex items-center justify-between gap-3 bg-slate-900 px-3 py-2 text-white">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em]">{group.section}</span>
                    <span className="text-sm font-black">{group.sectionTotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="grid grid-cols-1 border-t-2 border-slate-900 sm:grid-cols-2 xl:grid-cols-4">
                    {group.rows.map((row, index) => (
                      <button
                        key={row.countKey}
                        type="button"
                        onClick={() => navigate(row.countKey)}
                        className={cn(
                          "flex min-h-[54px] items-center justify-between gap-3 border-b border-slate-900 px-3 py-2 text-left transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:border-r",
                          index % 2 === 0 ? "bg-white" : "bg-slate-50"
                        )}
                      >
                        <span className="min-w-0 text-[11px] font-bold uppercase tracking-wide text-slate-900 underline-offset-2">
                          {row.name}
                        </span>
                        <span className="shrink-0 text-sm font-black text-indigo-700">
                          {row.count.toLocaleString("en-IN")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {pendingTaskSummary.grandTotal > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t-2 border-slate-900 bg-indigo-50 px-3 py-2">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-900">Total Pending</span>
              <span className="text-base font-black text-indigo-800">
                {pendingTaskSummary.grandTotal.toLocaleString("en-IN")}
              </span>
            </div>
          ) : null}
        </div>
      </section>

    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex min-h-[34px] items-center rounded-md border-2 border-slate-900 bg-slate-50 px-2.5 py-0.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
      <input
        type="date"
        className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-black leading-tight uppercase text-slate-900 focus:ring-0 outline-none font-sans"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SummaryMetricCard({
  card,
  config,
}: {
  card: OperationDashboardMetricCard;
  config: SummaryCardConfig;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between p-3.5 min-w-[155px] flex-1 bg-white transition-colors hover:bg-slate-50/50",
        config.tone
      )}
    >
      <div>
        <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 leading-none font-sans">
          {card.label}
        </div>
        <div className={cn("mt-2.5 text-base font-black leading-none tracking-tight text-slate-950 font-sans", config.valueTone)}>
          {formatMetricValue(card)}
        </div>
      </div>
      {card.note && (
        <div className="mt-2 text-[8px] font-bold uppercase tracking-wide text-slate-500 leading-none font-sans">
          {card.note}
        </div>
      )}
    </div>
  );
}
