import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getRequiredMachinesForProduction } from "../lib/productionType";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, type SortState } from "../lib/tableSort";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import {
  Company,
  Firm,
  Material,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Order,
  OrderSchedule,
  Production,
  ProductionProcessing,
  Setting,
  Machine,
} from "../types";
import { formatDate } from "../lib/serial";
import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { DataSummaryTiles } from "../components/DataSummaryTiles";
import { useClientPagination } from "../hooks/useClientPagination";
import {
  buildProductionCorrugatedSheetUsageMap,
  buildProductionGrossIssuedQtyMap,
  buildProductionMaterialUsageMap,
  getProductionActualPaperUsed,
  hasProductionCorrugatedSheetUsage,
} from "../lib/productionMaterialUsage";
import { isProductionPendingConsumption, isProductionPendingFFG } from "../lib/productionStageFilters";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { parseMandatoryMachinesByType } from "../lib/mandatoryMachines";
import { isCorrugationLinerComplete, isMachineStepFull, usesPartFullProgress } from "../lib/productionProcessingProgress";

type QueueMode = "consumption" | "ffg";

type SortKey = "jobNo" | "date" | "orderNo" | "erpCode" | "company" | "item" | "prereqQty" | "qty" | "totalIssuedQty" | "actualPaperUsed" | "prodFfg" | "status";
type SortDir = "asc" | "desc";

const parseJobNo = (value: string) => {
  const raw = String(value || "").trim();
  const lastPart = raw.split("/").pop() || raw;
  const num = Number.parseInt(lastPart, 10);
  return Number.isFinite(num) ? num : null;
};

const CONFIG: Record<QueueMode, { title: string; empty: string }> = {
  consumption: {
    title: "Production: Pending Consumption",
    empty: "No pending consumption rows.",
  },
  ffg: {
    title: "Production: Pending FG",
    empty: "No pending FG rows.",
  },
};

export function ProductionStageQueue({
  title,
  emptyMessage,
  predicate,
  enableFfgEditing = false,
  enableIssueAction = false,
  enableCloseAction = false,
  hideStatusColumn = false,
  hideProdFfgColumn = false,
  hideActualPaperUsedColumn = false,
  showTotalIssuedQty = false,
  issuePrereqMachineName,
  issueActionPath = "/material-movement/reel-issue-return",
  issueActionLabel = "Issue Material",
  secondaryIssueActionPath,
  secondaryIssueActionLabel,
  showIssueSheetAction = true,
  hideSummaryTiles = false,
}: {
  title: string;
  emptyMessage: string;
  predicate: (production: Production, actualPaperUsed: number, hasCorrugatedSheetUsage: boolean) => boolean;
  enableFfgEditing?: boolean;
  enableIssueAction?: boolean;
  enableCloseAction?: boolean;
  hideStatusColumn?: boolean;
  hideProdFfgColumn?: boolean;
  hideActualPaperUsedColumn?: boolean;
  showTotalIssuedQty?: boolean;
  issuePrereqMachineName?: string;
  issueActionPath?: string;
  issueActionLabel?: string;
  secondaryIssueActionPath?: string;
  secondaryIssueActionLabel?: string;
  showIssueSheetAction?: boolean;
  hideSummaryTiles?: boolean;
}) {
  const navigate = useNavigate();
  const [productions, setProductions] = useData<Production>("productions", [], { firmScope: "all" });
  const [materials] = useData<Material>("materials", []);
  const { findItemAcrossSources, resolveOrderItem } = useOrderItemCatalog();
  const [materialIssues] = useData<MaterialIssue>("material-issues", [], { firmScope: "all" });
  const [materialIssueLines] = useData<MaterialIssueLine>("material-issue-lines", [], { firmScope: "all" });
  const [materialIssueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { firmScope: "all" });
  const [materialReturns] = useData<MaterialReturn>("material-returns", [], { firmScope: "all" });
  const [materialReturnLines] = useData<MaterialReturnLine>("material-return-lines", [], { firmScope: "all" });
  const [materialReturnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { firmScope: "all" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const [settings] = useData<Setting>("settings", []);
  const [machines] = useData<Machine>("machines", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [ffgValues, setFfgValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("jobNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const usageMap = useMemo(
    () =>
      buildProductionMaterialUsageMap(
        materialIssues,
        materialIssueLines,
        materialReturns,
        materialReturnLines,
        materialIssueReelLines,
        materialReturnReelLines,
        productions
      ),
    [materialIssueLines, materialIssueReelLines, materialIssues, materialReturnLines, materialReturnReelLines, materialReturns, productions]
  );
  const corrugatedSheetUsageMap = useMemo(
    () =>
      buildProductionCorrugatedSheetUsageMap(
        materials,
        materialIssues,
        materialIssueLines,
        materialReturns,
        materialReturnLines
      ),
    [materialIssueLines, materialIssues, materialReturnLines, materialReturns, materials]
  );
  const grossIssuedQtyMap = useMemo(
    () => buildProductionGrossIssuedQtyMap(materialIssues, materialIssueLines, materialIssueReelLines, productions),
    [materialIssueLines, materialIssueReelLines, materialIssues, productions]
  );

  const toggleSort = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("asc");
  };

  const rows = useMemo(() => {
    const words = searchWords(searchTerm);
    const mandatoryMap = parseMandatoryMachinesByType(settings[0]);
    const prereqMachine = issuePrereqMachineName ? normalizeMachineName(issuePrereqMachineName) : "";
    return productions
      .filter((production) => predicate(production, getProductionActualPaperUsed(production, usageMap), hasProductionCorrugatedSheetUsage(production, corrugatedSheetUsageMap)))
      .map((production) => {
        const schedule = schedules.find((row) => row.id === production.scheduleId);
        const order = orders.find((row) => row.id === schedule?.orderId);
        const item =
          findItemAcrossSources(
            String(production.itemId || order?.itemId || "").trim(),
            production.itemSource || order?.itemSource,
            production.erpCode || production.masterErp || order?.erpCode
          ) || resolveOrderItem(order);
        const company = companies.find((row) => row.id === order?.companyId);
        const prereqQty = prereqMachine
          ? processing
              .filter((entry) => entry.productionId === production.id && normalizeMachineName(entry.machineName) === prereqMachine)
              .reduce((sum, entry) => sum + Number(entry.qty || 0), 0)
          : 0;
        const requiredMachines = getRequiredMachinesForProduction(production, item, mandatoryMap, machines);
        return {
          production,
          order,
          item,
          company,
          actualPaperUsed: getProductionActualPaperUsed(production, usageMap),
          totalIssuedQty: grossIssuedQtyMap.get(production.id) || 0,
          requiredMachines,
          prereqQty,
        };
      })
      .filter(({ production, order, item, company, actualPaperUsed, totalIssuedQty, prereqQty }) => {
        if (firmFilter && String(production.firmId || order?.firmId || "") !== firmFilter) return false;
        const jobDate = String(production.date || "").slice(0, 10);
        if (fromDateFilter && (!jobDate || jobDate < fromDateFilter)) return false;
        if (toDateFilter && (!jobDate || jobDate > toDateFilter)) return false;
        if (companyFilter && order?.companyId !== companyFilter) return false;
        const itemKey = item?.id || `${item?.name || ""}::${production.erpCode || item?.erp || ""}`;
        if (itemFilter && itemKey !== itemFilter) return false;
        if (!words.length) return true;
        return matchesTableSearch(
          [
            production.transactionNo,
            formatDate(production.date),
            order?.orderNo,
            production.erpCode,
            company?.name,
            item?.name || "Unknown",
            issuePrereqMachineName && prereqQty > 0 ? prereqQty.toFixed(2) : "",
            production.qty,
            showTotalIssuedQty && totalIssuedQty > 0 ? totalIssuedQty.toFixed(2) : "",
            !hideActualPaperUsedColumn && actualPaperUsed > 0 ? actualPaperUsed : "",
            !hideProdFfgColumn ? production.prodFromFFG : "",
            !hideStatusColumn ? production.status : "",
          ],
          words
        );
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;

        const getString = (value: unknown) => String(value ?? "").toLowerCase();
        const getNumber = (value: unknown) => {
          const num = Number(value);
          return Number.isFinite(num) ? num : null;
        };

        let cmp = 0;
        switch (sortKey) {
          case "jobNo": {
            const nA = parseJobNo(a.production.transactionNo);
            const nB = parseJobNo(b.production.transactionNo);
            if (nA != null && nB != null) cmp = nA - nB;
            else cmp = getString(a.production.transactionNo).localeCompare(getString(b.production.transactionNo));
            break;
          }
          case "date": {
            const tA = new Date(a.production.date || 0).getTime();
            const tB = new Date(b.production.date || 0).getTime();
            cmp = tA - tB;
            break;
          }
          case "orderNo":
            cmp = getString(a.order?.orderNo).localeCompare(getString(b.order?.orderNo));
            break;
          case "erpCode":
            cmp = getString(a.production.erpCode).localeCompare(getString(b.production.erpCode));
            break;
          case "company":
            cmp = getString(a.company?.name).localeCompare(getString(b.company?.name));
            break;
          case "item":
            cmp = getString(a.item?.name).localeCompare(getString(b.item?.name));
            break;
          case "prereqQty":
            cmp = (getNumber(a.prereqQty) ?? 0) - (getNumber(b.prereqQty) ?? 0);
            break;
          case "totalIssuedQty":
            cmp = (getNumber(a.totalIssuedQty) ?? 0) - (getNumber(b.totalIssuedQty) ?? 0);
            break;
          case "qty": {
            const qA = getNumber(a.production.qty) ?? 0;
            const qB = getNumber(b.production.qty) ?? 0;
            cmp = qA - qB;
            break;
          }
          case "actualPaperUsed": {
            const pA = getNumber(a.actualPaperUsed) ?? 0;
            const pB = getNumber(b.actualPaperUsed) ?? 0;
            cmp = pA - pB;
            break;
          }
          case "prodFfg": {
            const fA = getNumber(a.production.prodFromFFG) ?? 0;
            const fB = getNumber(b.production.prodFromFFG) ?? 0;
            cmp = fA - fB;
            break;
          }
          case "status":
            cmp = getString(a.production.status).localeCompare(getString(b.production.status));
            break;
          default:
            cmp = 0;
        }

        if (cmp !== 0) return cmp * dir;

        const timeA = new Date(a.production.updateTimestamp || a.production.date || 0).getTime();
        const timeB = new Date(b.production.updateTimestamp || b.production.date || 0).getTime();
        return timeB - timeA;
      });
  }, [
    companies,
    issuePrereqMachineName,
    orders,
    predicate,
    processing,
    productions,
    resolveOrderItem,
    schedules,
    searchTerm,
    firmFilter,
    companyFilter,
    itemFilter,
    fromDateFilter,
    toDateFilter,
    settings,
    machines,
    sortDir,
    sortKey,
    usageMap,
    corrugatedSheetUsageMap,
    showTotalIssuedQty,
    hideActualPaperUsedColumn,
    hideProdFfgColumn,
    hideStatusColumn,
  ]);

  const firmOptions = useMemo(() => Array.from(new Map(rows.map((row) => { const firmId = String(row.production.firmId || row.order?.firmId || ""); return [firmId, { value: firmId, label: firmId ? getFirmDisplayNameById(firmId, firms) : "" }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [firms, rows]);
  const companyOptions = useMemo(() => Array.from(new Map(rows.map((row) => [row.order?.companyId || "", { value: row.order?.companyId || "", label: row.company?.name || "" }])).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [rows]);
  const itemOptions = useMemo(() => Array.from(new Map(rows.map((row) => { const erp = String(row.production.erpCode || row.item?.erp || ""); const name = row.item?.name || ""; const key = row.item?.id || `${name}::${erp}`; return [key, { value: key, label: erp && name && !name.toLowerCase().includes(erp.toLowerCase()) ? `${name} - ${erp}` : name || erp, searchText: `${name} ${erp}` }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [rows]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedRows,
  } = useClientPagination(rows, 25);
  const hasActiveFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => {
    setSearchTerm("");
    setFirmFilter("");
    setCompanyFilter("");
    setItemFilter("");
    setFromDateFilter("");
    setToDateFilter("");
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, firmFilter, companyFilter, itemFilter, fromDateFilter, toDateFilter, setPage]);

  // Existing two-state sort (default Job No ascending), shown with the shared header arrows.
  const headerSort: SortState = { key: sortKey, direction: sortDir };
  const onHeaderSort = (key: string) => toggleSort(key as SortKey);

  const handleSaveFfg = async (productionId: string) => {
    const rawValue = ffgValues[productionId];
    const nextValue = Number(rawValue);

    if (!rawValue || Number.isNaN(nextValue) || nextValue <= 0) return;

    const target = productions.find((production) => production.id === productionId);
    if (!target) return;

    const targetRow = rows.find((row) => row.production.id === productionId);
    const missingMachines = Array.from(
      new Set(
        (targetRow?.requiredMachines || [])
          .map((machineName) => normalizeMachineName(machineName))
          .filter(Boolean)
      )
    )
      .filter((machineName) => {
        if (usesPartFullProgress(machineName)) {
          return !isMachineStepFull(processing, productionId, machineName);
        }
        const reportedQty = processing
          .filter(
            (entry) =>
              entry.productionId === productionId &&
              normalizeMachineName(entry.machineName) === machineName
          )
          .reduce((sum, entry) => sum + Number(entry.qty || 0), 0);
        return reportedQty <= 0;
      });

    if (missingMachines.length > 0) {
      alert(`Machine reporting is mandatory before FFG: ${missingMachines.join(", ")}`);
      return;
    }

    setSavingId(productionId);
    try {
      const timestamp = new Date().toISOString();
      await setProductions((prev) =>
        prev.map((production) =>
          production.id === productionId
            ? {
                ...production,
                prodFromFFG: nextValue,
                ffgTimestamp: production.ffgTimestamp || timestamp,
                status: "Pending Tally",
                updatedBy: "System User",
                updateTimestamp: timestamp,
              }
            : production
        )
      );
      setFfgValues((prev) => ({ ...prev, [productionId]: "" }));
    } catch (error) {
      console.error("Failed to save Prod (FFG):", error);
    } finally {
      setSavingId(null);
    }
  };

  const handleCloseJob = async (productionId: string) => {
    if (!enableCloseAction) return;
    const target = productions.find((p) => p.id === productionId);
    if (!target || target.status === "Completed" || target.status === "Cancelled") return;
    if (!processing.some((entry) => entry.productionId === productionId)) {
      alert("Processing data is mandatory. Please add Production Processing entry before closing the job.");
      return;
    }

    if (closingId !== productionId) {
      setClosingId(productionId);
      setTimeout(() => setClosingId(null), 3000);
      return;
    }

    const timestamp = new Date().toISOString();
    try {
      await setProductions((prev) =>
        prev.map((p) =>
          p.id === productionId
            ? {
                ...p,
                status: "Completed",
                tallyTimestamp: p.tallyTimestamp || timestamp,
                updateTimestamp: timestamp,
                updatedBy: "System User",
              }
            : p
        )
      );
    } catch (error) {
      console.error("Failed to close job:", error);
      alert("Failed to close job. Please try again.");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">{title}</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {!hideSummaryTiles ? (
        <DataSummaryTiles
          totalRecords={0}
          filteredRecords={rows.length}
          showingRecords={paginatedRows.length}
          pageLabel={`${page} / ${Math.max(1, Math.ceil(totalItems / pageSize))}`}
          hideTotalRecords
          filteredRecordsLabel="Total Records"
        />
      ) : null}

      <div className="overflow-x-auto rounded border border-black bg-white">
          <table className="min-w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 divide-x divide-black">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">SL No</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Job No." sortKey="jobNo" sort={headerSort} onToggle={onHeaderSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Date" sortKey="date" sort={headerSort} onToggle={onHeaderSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Order No." sortKey="orderNo" sort={headerSort} onToggle={onHeaderSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="ERP Code" sortKey="erpCode" sort={headerSort} onToggle={onHeaderSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Company" sortKey="company" sort={headerSort} onToggle={onHeaderSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Item" sortKey="item" sort={headerSort} onToggle={onHeaderSort} align="left" /></th>
                {issuePrereqMachineName ? (
                  <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap">
                    <SortHeader label={normalizeMachineName(issuePrereqMachineName)} sortKey="prereqQty" sort={headerSort} onToggle={onHeaderSort} align="right" />
                  </th>
                ) : null}
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Qty (Kgs)" sortKey="qty" sort={headerSort} onToggle={onHeaderSort} align="right" /></th>
                {showTotalIssuedQty ? (
                  <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap">
                    <SortHeader label="Total Issued Qty" sortKey="totalIssuedQty" sort={headerSort} onToggle={onHeaderSort} align="right" />
                  </th>
                ) : null}
                {!hideActualPaperUsedColumn ? (
                  <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Actual Paper Used" sortKey="actualPaperUsed" sort={headerSort} onToggle={onHeaderSort} align="right" /></th>
                ) : null}
                {!hideProdFfgColumn ? (
                  <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Prod (FG)" sortKey="prodFfg" sort={headerSort} onToggle={onHeaderSort} align="right" /></th>
                ) : null}
                {!hideStatusColumn ? (
                  <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Status" sortKey="status" sort={headerSort} onToggle={onHeaderSort} align="left" /></th>
                ) : null}
                {enableCloseAction ? (
                  <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Close</th>
                ) : null}
                {enableFfgEditing ? <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Update</th> : null}
                {enableIssueAction ? <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Action</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      (11 - (hideStatusColumn ? 1 : 0) - (hideProdFfgColumn ? 1 : 0) - (hideActualPaperUsedColumn ? 1 : 0)) +
                      (showTotalIssuedQty ? 1 : 0) +
                      (issuePrereqMachineName ? 1 : 0) +
                      (enableCloseAction ? 1 : 0) +
                      (enableFfgEditing ? 1 : 0) +
                      (enableIssueAction ? 1 : 0)
                    }
                    className="h-16"
                    aria-label="No records"
                  />
                </tr>
              ) : (
                paginatedRows.map(({ production, order, item, company, actualPaperUsed, totalIssuedQty, prereqQty, requiredMachines }, index) => (
                  <tr key={production.id} className="hover:bg-slate-50 divide-x divide-black">
                    <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{(page - 1) * pageSize + index + 1}</td>
                    <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{production.transactionNo}</td>
                    <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{formatDate(production.date)}</td>
                    <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{order?.orderNo || "-"}</td>
                    <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{production.erpCode || "-"}</td>
                    <td className="min-w-[150px] max-w-[220px] whitespace-normal break-words px-4 py-4 text-xs leading-5 text-black border border-black">{company?.name || "-"}</td>
                    <td className="min-w-[220px] max-w-[360px] whitespace-normal break-words px-4 py-4 text-xs leading-5 text-black border border-black">
                      <div className="space-y-1">
                        <div>{item?.name || "Unknown"}</div>

                      </div>
                    </td>
                    {issuePrereqMachineName ? (
                      <td className="px-4 py-4 text-right text-xs font-black text-emerald-700 border border-black whitespace-nowrap">
                        {prereqQty > 0 ? prereqQty.toFixed(2) : "-"}
                      </td>
                    ) : null}
                    <td className="px-4 py-4 text-right text-xs font-medium text-emerald-700 border border-black whitespace-nowrap">{production.qty}</td>
                    {showTotalIssuedQty ? (
                      <td className="px-4 py-4 text-right text-xs font-medium text-black border border-black whitespace-nowrap">
                        {totalIssuedQty > 0 ? totalIssuedQty.toFixed(2) : "-"}
                      </td>
                    ) : null}
                    {!hideActualPaperUsedColumn ? (
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{actualPaperUsed > 0 ? actualPaperUsed : "-"}</td>
                    ) : null}
                    {!hideProdFfgColumn ? (
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{production.prodFromFFG || "-"}</td>
                    ) : null}
                    {!hideStatusColumn ? (
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{production.status}</td>
                    ) : null}
                    {enableCloseAction ? (
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void handleCloseJob(production.id)}
                          disabled={production.status === "Completed" || production.status === "Cancelled"}
                          className={
                            production.status === "Completed" || production.status === "Cancelled"
                              ? "inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-black uppercase text-slate-400 cursor-not-allowed"
                              : closingId === production.id
                                ? "inline-flex items-center gap-1 rounded border border-black bg-amber-400 px-3 py-1 text-[11px] font-black uppercase text-black animate-pulse"
                                : "inline-flex items-center gap-1 rounded border border-black bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase text-white hover:bg-emerald-700"
                          }
                          title={production.status === "Completed" || production.status === "Cancelled" ? "Job already closed" : "Close Job"}
                        >
                          <CheckCircle size={12} />
                          {closingId === production.id ? "Confirm?" : "Close"}
                        </button>
                      </td>
                    ) : null}
                    {enableFfgEditing ? (
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">
                        <div className="flex flex-col gap-3 whitespace-normal">
                                                    <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.00001"
                              min={0}
                              value={ffgValues[production.id] || ""}
                              onChange={(e) => setFfgValues((prev) => ({ ...prev, [production.id]: e.target.value }))}
                              placeholder="Enter FG"
                              className="w-28 border-2 border-black rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveFfg(production.id)}
                              disabled={savingId === production.id || !ffgValues[production.id] || Number(ffgValues[production.id]) <= 0}
                              className="bg-emerald-600 text-white px-3 py-1 rounded font-bold text-[11px] uppercase border border-black disabled:opacity-50"
                            >
                              {savingId === production.id ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      </td>
                    ) : null}
                    {enableIssueAction ? (
                                            <td className="px-4 py-4 text-xs text-black border border-black">
                        {(() => {
                          const normalizedRequired = requiredMachines.map((m) => normalizeMachineName(m));
                          const requiresLiner = false;
                          const linerDone = isCorrugationLinerComplete(processing, production.id);

                          const prereqMissing = !!issuePrereqMachineName && !(prereqQty > 0);

                          if (prereqMissing) {
                            return (
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled
                                  title={`${normalizeMachineName(issuePrereqMachineName || "Corrugation Liner")} entry pending`}
                                  className="bg-slate-200 text-slate-500 px-3 py-1 rounded font-bold text-[11px] uppercase border border-black cursor-not-allowed"
                                >
                                  {issueActionLabel}
                                </button>
                                {secondaryIssueActionPath && secondaryIssueActionLabel ? (
                                  <button
                                    type="button"
                                    disabled
                                    title={`${normalizeMachineName(issuePrereqMachineName || "Corrugation Liner")} entry pending`}
                                    className="bg-slate-200 text-slate-500 px-3 py-1 rounded font-bold text-[11px] uppercase border border-black cursor-not-allowed"
                                  >
                                    {secondaryIssueActionLabel}
                                  </button>
                                ) : null}
                                {showIssueSheetAction ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="bg-slate-200 text-slate-500 px-3 py-1 rounded font-bold text-[11px] uppercase border border-black cursor-not-allowed"
                                  >
                                    Issue Sheet
                                  </button>
                                ) : null}
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {!requiresLiner || linerDone ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const date = String(production.date || "").slice(0, 10);
                                      const params = new URLSearchParams({
                                        productionId: production.id,
                                        date,
                                        lockDate: "1",
                                        lockJob: "1",
                                      });
                                      navigate(`${issueActionPath}?${params.toString()}`);
                                    }}
                                    className="bg-indigo-600 text-white px-3 py-1 rounded font-bold text-[11px] uppercase border border-black"
                                  >
                                    {issueActionLabel}
                                  </button>
                                  {secondaryIssueActionPath && secondaryIssueActionLabel ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const date = String(production.date || "").slice(0, 10);
                                        const params = new URLSearchParams({
                                          productionId: production.id,
                                          date,
                                          lockDate: "1",
                                          lockJob: "1",
                                        });
                                        navigate(`${secondaryIssueActionPath}?${params.toString()}`);
                                      }}
                                      className="bg-emerald-600 text-white px-3 py-1 rounded font-bold text-[11px] uppercase border border-black"
                                    >
                                      {secondaryIssueActionLabel}
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled
                                    className="bg-slate-200 text-slate-500 px-3 py-1 rounded font-bold text-[11px] uppercase border border-black cursor-not-allowed"
                                  >
                                    {issueActionLabel}
                                  </button>
                                  {secondaryIssueActionPath && secondaryIssueActionLabel ? (
                                    <button
                                      type="button"
                                      disabled
                                      className="bg-slate-200 text-slate-500 px-3 py-1 rounded font-bold text-[11px] uppercase border border-black cursor-not-allowed"
                                    >
                                      {secondaryIssueActionLabel}
                                    </button>
                                  ) : null}
                                  <span className="inline-flex items-center rounded border border-amber-700 bg-amber-50 px-2 py-1 text-[11px] font-black uppercase text-amber-800">
                                    Add Corrugation Liner entry
                                  </span>
                                </>
                              )}
                              {showIssueSheetAction ? <button
                                type="button"
                                onClick={() => {
                                  const date = String(production.date || "").slice(0, 10);
                                  const params = new URLSearchParams({
                                    productionId: production.id,
                                    date,
                                    issueType: "Job",
                                    lockDate: "1",
                                    lockIssueType: "1",
                                    materialFilter: "corrugated-sheet",
                                  });
                                  navigate(`/material-movement/issue?${params.toString()}`);
                                }}
                                className="bg-amber-500 text-black px-3 py-1 rounded font-bold text-[11px] uppercase border border-black"
                              >
                                Issue Sheet
                              </button> : null}
                            </div>
                          );
                        })()}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </div>

      <ClientPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

export function ProductionPendingConsumption() {
  return (
    <ProductionStageQueue
      title="Production: Pending Material Issue"
      emptyMessage="No jobs pending material issue."
      predicate={isProductionPendingConsumption}
      enableIssueAction
      hideStatusColumn
      hideActualPaperUsedColumn
      showTotalIssuedQty
      hideProdFfgColumn
      hideSummaryTiles
      issueActionPath="/material-movement/reel-issue-return-scan/form"
      issueActionLabel="QR"
      secondaryIssueActionPath="/material-movement/reel-issue-return"
      secondaryIssueActionLabel="MANUAL"
    />
  );
}

export function ProductionPendingReelIssueScan() {
  return (
    <ProductionStageQueue
      title="QR Reel Issue"
      emptyMessage="No jobs pending reel issue."
      predicate={isProductionPendingConsumption}
      enableIssueAction
      hideStatusColumn
      issueActionPath="/material-movement/reel-issue-return"
      issueActionLabel="MANUAL"
      secondaryIssueActionPath="/material-movement/reel-issue-return-scan/form"
      secondaryIssueActionLabel="QR"
      showIssueSheetAction={false}
    />
  );
}

export function ProductionPendingFFG() {
  return (
    <ProductionStageQueue
      title={CONFIG.ffg.title}
      emptyMessage={CONFIG.ffg.empty}
      predicate={isProductionPendingFFG}
      enableFfgEditing
      hideStatusColumn
      hideProdFfgColumn
    />
  );
}
