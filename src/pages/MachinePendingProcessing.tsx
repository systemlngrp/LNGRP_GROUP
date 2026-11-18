import { displayJobNo } from "../lib/jobNumber";
import React, { useMemo, useState, useEffect, useCallback, useDeferredValue, useRef } from "react";
import { useData } from "../hooks/useData";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Company, Firm, Order, OrderSchedule, Production, Machine, ProductionProcessing, Setting } from "../types";
import { Hammer, Search, ChevronRight, ChevronDown, ClipboardList, CheckCircle2, X, Filter } from "lucide-react";
import { parseMandatoryMachinesByType } from "../lib/mandatoryMachines";
import { Select } from "../components/Select";
import { formatDate } from "../lib/serial";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getRequiredMachinesForProduction, resolveProductionProcessingRoute } from "../lib/productionType";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { getCurrentProcessingMachine, isMachineStepFull } from "../lib/productionProcessingProgress";
import { useProductionMaterialUsage } from "../hooks/useProductionMaterialUsage";
import { hasProductionMaterialUsage } from "../lib/productionMaterialUsage";
import { resolveProductionErp, resolveProductionItem } from "../lib/productionErp";
import { getProductionOriginSource } from "../lib/productionOrigin";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { ClientPagination } from "../components/ClientPagination";
import { MachineTabs } from "../components/MachineTabs";
import { useAuth } from "../auth/AuthContext";
import { getUserVisibleMachineNames } from "../lib/userMachineAccess";
import { useClientPagination } from "../hooks/useClientPagination";

interface PendingMachineJob {
  production: Production;
  source: "FG" | "PHP" | "PLATE";
  item?: any;
  companyName: string;
  erpCode: string;
  itemName: string;
  firmName: string;
  firmId: string;
  fallbackErps: string[];
  requiredQty: number;
  ffgQty: number;
  reportedQty: number;
  pendingQty: number;
}

interface MachineGroup {
  machineId: string;
  machineName: string;
  source: "FG" | "PHP" | "PLATE";
  jobs: PendingMachineJob[];
}

export function MachinePendingProcessing({ fixedMachineName, title }: { fixedMachineName?: string; title?: string } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const filterMachineId = searchParams.get("machineId") || "";
  const fixedNormalizedMachineName = fixedMachineName ? normalizeMachineName(fixedMachineName) : "";

  const [productions, , productionsLoading] = useData<Production>("productions", [], { firmScope: "all" });
  const [phpJobs] = useData<Production>("php_job_master", [], { firmScope: "all", storageKey: "php-job-master-all-firms" });
  const [plateJobs] = useData<Production>("plate_job_master", [], { firmScope: "all", storageKey: "plate-job-master-all-firms" });
  const { itemsBySource } = useOrderItemCatalog();
  const [machines, , machinesLoading] = useData<Machine>("machines", []);
  const [processing, , processingLoading] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const [settings, , settingsLoading] = useData<Setting>("settings", []);
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });

  const [searchTerm, setSearchTerm] = useState("");
  // Filters stay folded until the Filter button is clicked (phones already fold them behind their own icon).
  const [showFilters, setShowFilters] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [machineFilter, setMachineFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState(() => String((location.state as { successMessage?: string } | null)?.successMessage || ""));

  useEffect(() => {
    const message = String((location.state as { successMessage?: string } | null)?.successMessage || "");
    if (!message) return;
    setSuccessMessage(message);
    const timer = window.setTimeout(() => {
      setSuccessMessage("");
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, location.state, navigate]);

  const dismissSuccessMessage = () => {
    setSuccessMessage("");
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  };

  useEffect(() => {
    if (filterMachineId) {
      setExpandedMachines(new Set([filterMachineId]));
    }
  }, [filterMachineId]);

  useEffect(() => {
    if (!fixedNormalizedMachineName) return;
    const fixedMachine = machines.find((machine) => normalizeMachineName(machine.name) === fixedNormalizedMachineName);
    if (fixedMachine) setExpandedMachines(new Set([fixedMachine.id]));
  }, [fixedNormalizedMachineName, machines]);

  const mandatoryMachinesMapping = useMemo(() => parseMandatoryMachinesByType(settings[0]), [settings]);
  const scheduleById = useMemo(() => new Map(schedules.map((schedule) => [schedule.id, schedule])), [schedules]);
  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const companyNameById = useMemo(() => new Map(companies.map((company) => [company.id, company.name || ""])), [companies]);
  const firmNameById = useMemo(() => new Map(firms.map((firm) => [firm.id, getFirmDisplayName(firm)])), [firms]);
  const phpJobIds = useMemo(() => new Set(phpJobs.map((job) => String(job.id))), [phpJobs]);
  const plateJobIds = useMemo(() => new Set(plateJobs.map((job) => String(job.id))), [plateJobs]);

  const resolveCompanyName = useCallback((production: Production, item?: any) => {
    const productionCompany = String(production.companyName || "").trim();
    if (productionCompany) return productionCompany;

    const schedule = scheduleById.get(String(production.scheduleId || ""));
    const order = schedule ? orderById.get(String(schedule.orderId || "")) : undefined;
    const orderCompany = order ? String(companyNameById.get(String(order.companyId || "")) || "").trim() : "";
    if (orderCompany) return orderCompany;

    return String(item?.companyName || item?.raw?.customer || item?.raw?.customerName || "").trim();
  }, [scheduleById, orderById, companyNameById]);

  // Every pending job per machine, before the page filters (filter options come from these).
  const allMachineGroups = useMemo(() => {
    const groups: Map<string, MachineGroup> = new Map();
    const machineSequence = new Map<string, number>();
    Object.values(mandatoryMachinesMapping).forEach((machineNames) => {
      machineNames.forEach((machineName, index) => {
        const normalized = normalizeMachineName(machineName);
        const current = machineSequence.get(normalized);
        if (current == null || index < current) machineSequence.set(normalized, index);
      });
    });

    // Initialize groups for relevant machines
    machines.forEach(m => {
      if (fixedNormalizedMachineName && normalizeMachineName(m.name) !== fixedNormalizedMachineName) return;
      if (filterMachineId && m.id !== filterMachineId) return;
      groups.set(m.id, { machineId: m.id, machineName: m.name, source: "FG", jobs: [] });
    });

    // Filter productions that are active and not completed
    const linkedPhpIds = new Set(productions.map((row) => String(row.phpScheduledJobId || "").trim()).filter(Boolean));
    const linkedPlateIds = new Set(productions.map((row) => String(row.plateScheduledJobId || "").trim()).filter(Boolean));
    const directPhpJobs = phpJobs
      .filter((job) => !linkedPhpIds.has(String(job.id)) && job.status !== "Completed" && job.status !== "Cancelled")
      .map((job) => ({ ...job, itemSource: "PHP" as const }));
    const directPlateJobs = plateJobs
      .filter((job) => !linkedPlateIds.has(String(job.id)) && job.status !== "Completed" && job.status !== "Cancelled")
      .map((job) => ({ ...job, itemSource: "PLATE" as const }));
    const activeProductions = [...productions, ...directPhpJobs, ...directPlateJobs].filter(p =>
      p.status !== "Completed" && 
      p.status !== "Cancelled" && 
      !p.cancelTimestamp &&
      !p.tallyTimestamp
    );

    // Machine entries grouped by job once (same order as the full list); every
    // check below only looks at one job's entries, so the answers are unchanged.
    const processingByProductionId = new Map<string, ProductionProcessing[]>();
    processing.forEach((entry) => {
      const list = processingByProductionId.get(entry.productionId);
      if (list) list.push(entry);
      else processingByProductionId.set(entry.productionId, [entry]);
    });
    const noProcessing: ProductionProcessing[] = [];

    activeProductions.forEach(p => {
      const jobProcessing = processingByProductionId.get(p.id) || noProcessing;
      const schedule = scheduleById.get(String(p.scheduleId || ""));
      const order = schedule ? orderById.get(String(schedule.orderId || "")) : undefined;
      const source = getProductionOriginSource(p, phpJobIds, plateJobIds);
      const sourceProduction = resolveProductionProcessingRoute({ ...p, itemSource: source }, phpJobs, plateJobs);
      const item = resolveProductionItem(p, order, itemsBySource, source);
      const erpCode = resolveProductionErp(p, order, item);
      const requiredMachines = Array.from(
        new Set(
          getRequiredMachinesForProduction(sourceProduction, item, mandatoryMachinesMapping, machines)
            .map((machineName) => normalizeMachineName(machineName))
            .filter(Boolean)
        )
      );
      if (!requiredMachines.length) return;
      const currentMachineName = getCurrentProcessingMachine(jobProcessing, p.id, requiredMachines);
      
      requiredMachines.forEach(machineName => {
        const normalizedRequiredMachine = normalizeMachineName(machineName);
        if (normalizedRequiredMachine !== currentMachineName) return;
        if (fixedNormalizedMachineName && normalizedRequiredMachine !== fixedNormalizedMachineName) return;
        const machine = machines.find(m => normalizeMachineName(m.name) === normalizedRequiredMachine);
        if (!machine) return;
        if (filterMachineId && machine.id !== filterMachineId) return;

        const machineProcessing = jobProcessing
          .filter(pr => pr.productionId === p.id && normalizeMachineName(pr.machineName) === normalizedRequiredMachine);
        const reportedForThisMachine = machineProcessing
          .reduce((sum, pr) => sum + Number(pr.qty || 0), 0);
        const stepIsFull = isMachineStepFull(jobProcessing, p.id, normalizedRequiredMachine);
        const pending = Math.max(0, Number(p.qty || 0) - reportedForThisMachine);

        if (!stepIsFull && (pending > 0 || reportedForThisMachine > 0)) {
          const group = groups.get(machine.id);
          if (group) {
            const firmId = String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || "");
            group.jobs.push({
              production: p,
              source,
              item,
              companyName: resolveCompanyName(p, item),
              erpCode,
              itemName: item?.name || "",
              firmId,
              firmName: firmId ? (firmNameById.get(firmId) || "Unknown firm") : "Unassigned",
              fallbackErps: [p.erpCode, p.masterErp, order?.erpCode, item?.erp].map((value) => String(value ?? "").trim()).filter(Boolean),
              requiredQty: Number(p.qty || 0),
              ffgQty: Number(p.prodFromFFG || 0),
              reportedQty: reportedForThisMachine,
              pendingQty: pending
            });
          }
        }
      });
    });

    return Array.from(groups.values())
      .filter(g => g.jobs.length > 0)
      .sort((a, b) => {
        const aSequence = machineSequence.get(normalizeMachineName(a.machineName)) ?? Number.MAX_SAFE_INTEGER;
        const bSequence = machineSequence.get(normalizeMachineName(b.machineName)) ?? Number.MAX_SAFE_INTEGER;
        return aSequence - bSequence || a.machineName.localeCompare(b.machineName);
      });
  }, [productions, phpJobs, plateJobs, phpJobIds, plateJobIds, itemsBySource, machines, processing, mandatoryMachinesMapping, filterMachineId, fixedNormalizedMachineName, resolveCompanyName, scheduleById, orderById, firmNameById]);

  // Users ticked on machines (Machine Master / Users master) only see those machines.
  const visibleMachineNames = useMemo(() => getUserVisibleMachineNames(user, machines), [machines, user]);
  const baseMachineGroups = useMemo(
    () => visibleMachineNames ? allMachineGroups.filter((group) => visibleMachineNames.has(normalizeMachineName(group.machineName))) : allMachineGroups,
    [allMachineGroups, visibleMachineNames]
  );

  // Issued-material checks are only needed for the Printing step; skip loading
  // the material issue/return lists when no Printing jobs are pending here.
  const needsMaterialUsage = useMemo(
    () => baseMachineGroups.some((group) => ["Printing", "Corrugation Liner"].includes(normalizeMachineName(group.machineName))),
    [baseMachineGroups]
  );
  const { usageMap: materialUsageMap, issuedProductionIds, loading: materialUsageLoading } = useProductionMaterialUsage({ enabled: needsMaterialUsage });
  // Typing in Search stays responsive: the long job list is re-filtered after the keystroke.
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Every filter except the machine tab (tab counts come from this).
  const filteredMachineGroups = useMemo(() => {
    const words = searchWords(deferredSearchTerm);
    return baseMachineGroups
      .map(g => ({
        ...g,
        jobs: g.jobs.filter(j => {
          // Corrugation Liner lists only jobs with reels / material issued (net of returns).
          if (normalizeMachineName(g.machineName) === "Corrugation Liner" && !materialUsageLoading && !hasProductionMaterialUsage(j.production, materialUsageMap)) return false;
          if (sourceFilter && j.source !== sourceFilter) return false;
          const jobDate = String(j.production.date || "").slice(0, 10);
          if (fromDateFilter && (!jobDate || jobDate < fromDateFilter)) return false;
          if (toDateFilter && (!jobDate || jobDate > toDateFilter)) return false;
          if (companyFilter && j.companyName !== companyFilter) return false;
          if (firmFilter && j.firmId !== firmFilter) return false;
          const itemKey = j.item?.id ? `${j.source}::${j.item.id}` : `${j.source}::${j.itemName}::${j.erpCode}`;
          if (itemFilter && itemKey !== itemFilter) return false;
          return matchesTableSearch([
            j.production.transactionNo,
            j.source,
            j.production.date,
            j.erpCode,
            j.firmName,
            j.companyName,
            j.itemName,
            j.requiredQty,
            j.ffgQty,
            j.reportedQty,
            j.pendingQty,
          ], words);
        }).sort((a, b) => b.production.transactionNo.localeCompare(a.production.transactionNo, undefined, { numeric: true, sensitivity: "base" }))
      }))
      .filter(g => g.jobs.length > 0);
  }, [baseMachineGroups, deferredSearchTerm, companyFilter, firmFilter, itemFilter, sourceFilter, fromDateFilter, toDateFilter, materialUsageLoading, materialUsageMap]);
  const machineGroups = useMemo(
    () => machineFilter ? filteredMachineGroups.filter((g) => g.machineId === machineFilter) : filteredMachineGroups,
    [filteredMachineGroups, machineFilter]
  );
  const machineTabs = useMemo(() => {
    const countById = new Map(filteredMachineGroups.map((g) => [g.machineId, g.jobs.length]));
    return baseMachineGroups.map((g) => ({ value: g.machineId, label: g.machineName, count: countById.get(g.machineId) || 0 }));
  }, [baseMachineGroups, filteredMachineGroups]);
  // A tab that is no longer available (e.g. its last job finished) falls back to All.
  useEffect(() => {
    if (machineFilter && !baseMachineGroups.some((g) => g.machineId === machineFilter)) setMachineFilter("");
  }, [baseMachineGroups, machineFilter]);

  // One sort for every machine table: all jobs are sorted together, then each
  // machine's table shows its own jobs in that order.
  const allGroupJobs = useMemo(
    () => machineGroups.flatMap((group) => group.jobs.map((job) => ({ machineId: group.machineId, job }))),
    [machineGroups]
  );
  const { sorted: sortedGroupJobs, sort, toggle: toggleSort } = useTableSort(allGroupJobs, ({ job }, key) => {
    if (key === "jobNo") return job.production.transactionNo;
    if (key === "source") return job.source;
    if (key === "date") return job.production.date;
    if (key === "erp") return job.erpCode || "";
    if (key === "firm") return job.firmName;
    if (key === "company") return job.companyName || "";
    if (key === "item") return job.itemName || "";
    if (key === "requiredQty") return job.requiredQty;
    if (key === "ffgQty") return job.ffgQty;
    if (key === "reportedQty") return job.reportedQty;
    if (key === "pendingQty") return job.pendingQty;
    return "";
  }, [], { key: "date", direction: "desc" });
  const sortedJobsByMachine = useMemo(() => {
    const map = new Map<string, PendingMachineJob[]>();
    sortedGroupJobs.forEach(({ machineId, job }) => {
      const list = map.get(machineId);
      if (list) list.push(job);
      else map.set(machineId, [job]);
    });
    return map;
  }, [sortedGroupJobs]);

  // Until jobs and machine entries are both in, every job would look pending at
  // the first machine (a count of ~1,900 instead of a few hundred), so wait.
  const coreDataLoading = productionsLoading || processingLoading || machinesLoading || settingsLoading;
  const showMachineTabs = !filterMachineId && !fixedNormalizedMachineName;
  const showMachineFilter = false; // replaced by the machine tabs
  const machineOptions = useMemo(
    () => baseMachineGroups.map((group) => ({ value: group.machineId, label: group.machineName })),
    [baseMachineGroups]
  );

  const firmOptions = useMemo(() => {
    const map = new Map<string, string>();
    baseMachineGroups.forEach((group) => group.jobs.forEach((job) => { if (job.firmId && !map.has(job.firmId)) map.set(job.firmId, job.firmName); }));
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [baseMachineGroups]);

  const sourceOptions = useMemo(() => {
    const sources = new Set<string>();
    baseMachineGroups.forEach((group) => group.jobs.forEach((job) => sources.add(job.source)));
    return Array.from(sources).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
  }, [baseMachineGroups]);

  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    baseMachineGroups.forEach((group) => group.jobs.forEach((job) => { if (job.companyName) names.add(job.companyName); }));
    return Array.from(names).sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
  }, [baseMachineGroups]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; searchText: string }>();
    baseMachineGroups.forEach((group) => group.jobs.forEach((job) => {
      const key = job.item?.id ? `${job.source}::${job.item.id}` : `${job.source}::${job.itemName}::${job.erpCode}`;
      if (!key || map.has(key)) return;
      map.set(key, { value: key, label: job.erpCode && job.itemName && !job.itemName.toLowerCase().includes(job.erpCode.toLowerCase()) ? `${job.itemName} - ${job.erpCode}` : job.itemName || job.erpCode, searchText: `${job.itemName} ${job.erpCode} ${job.fallbackErps.join(" ")}` });
    }));
    return Array.from(map.values()).filter((option) => option.label).sort((a, b) => a.label.localeCompare(b.label));
  }, [baseMachineGroups]);

  const toggleMachine = (id: string) => {
    const next = new Set(expandedMachines);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedMachines(next);
  };

  const selectedMachineName = useMemo(() => {
    if (!filterMachineId) return "";
    return machines.find(m => m.id === filterMachineId)?.name || "";
  }, [filterMachineId, machines]);

  const hasPanelFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter || sourceFilter || fromDateFilter || toDateFilter);
  const hasActiveFilters = hasPanelFilters || Boolean(machineFilter);

  const clearFilters = () => {
    setSearchTerm("");
    setFirmFilter("");
    setCompanyFilter("");
    setItemFilter("");
    setSourceFilter("");
    setFromDateFilter("");
    setToDateFilter("");
  };

  const tableHead = (
    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
      <tr className="divide-x divide-black">
        <th className="px-3 py-2 text-left"><SortHeader label="Job No" sortKey="jobNo" sort={sort} onToggle={toggleSort} align="left" /></th>
        <th className="px-3 py-2 text-left"><SortHeader label="Source" sortKey="source" sort={sort} onToggle={toggleSort} align="left" /></th>
        <th className="px-3 py-2 text-left"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
        <th className="px-3 py-2 text-left"><SortHeader label="ERP" sortKey="erp" sort={sort} onToggle={toggleSort} align="left" /></th>
        <th className="px-3 py-2 text-left"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="left" /></th>
        <th className="px-3 py-2 text-left"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="left" /></th>
        <th className="px-3 py-2 text-left"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="left" /></th>
        <th className="px-3 py-2 text-right"><SortHeader label="Plan Qty" sortKey="requiredQty" sort={sort} onToggle={toggleSort} align="right" /></th>
        <th className="px-3 py-2 text-right"><SortHeader label="FFG" sortKey="ffgQty" sort={sort} onToggle={toggleSort} align="right" /></th>
        <th className="px-3 py-2 text-right"><SortHeader label="Reported" sortKey="reportedQty" sort={sort} onToggle={toggleSort} align="right" /></th>
        <th className="px-3 py-2 text-right text-indigo-700"><SortHeader label="Pending" sortKey="pendingQty" sort={sort} onToggle={toggleSort} align="right" /></th>
        <th className="px-3 py-2 text-center">Action</th>
      </tr>
    </thead>
  );

  const filtersWereActiveRef = useRef(false);
  // Machines open collapsed; click a machine to see its jobs. When a search or
  // filter is in use, the machines that still have matching jobs open by
  // themselves so the results are visible.
  useEffect(() => {
    if (filterMachineId || fixedNormalizedMachineName) return;
    const filtersWereActive = filtersWereActiveRef.current;
    filtersWereActiveRef.current = hasActiveFilters;
    if (!hasActiveFilters) {
      // Collapse only when filters were just cleared, not on every data refresh,
      // so a machine the user opened by hand stays open.
      if (filtersWereActive) setExpandedMachines(new Set());
      return;
    }
    const machineIds = machineGroups.map((group) => group.machineId);
    setExpandedMachines((current) => {
      if (current.size === machineIds.length && machineIds.every((id) => current.has(id))) {
        return current;
      }
      return new Set(machineIds);
    });
  }, [filterMachineId, fixedNormalizedMachineName, hasActiveFilters, machineGroups]);

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="pointer-events-none fixed right-4 top-20 z-[100] w-[calc(100vw-2rem)] max-w-md sm:right-6 sm:top-24">
          <div role="status" className="pointer-events-auto flex items-start gap-3 rounded-lg border-2 border-emerald-700 bg-emerald-100 px-4 py-3 text-emerald-950 shadow-xl">
            <CheckCircle2 className="shrink-0 text-emerald-700" size={30} />
            <span className="min-w-0 flex-1 break-words text-sm font-black leading-5">{successMessage}</span>
            <button type="button" onClick={dismissSuccessMessage} aria-label="Close success message" className="rounded border border-emerald-800 bg-white p-1 text-emerald-900 hover:bg-emerald-50"><X size={18} /></button>
          </div>
        </div>
      )}
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">
          {title || (filterMachineId ? `${selectedMachineName} - Pending Jobs` : "Pending Processing")}
        </h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            title={showFilters ? "Hide filters" : "Show filters"}
            className={`relative hidden h-[38px] shrink-0 items-center gap-1.5 rounded border-2 px-3 text-xs font-black md:inline-flex ${showFilters ? "border-indigo-700 bg-indigo-700 text-white" : "border-black bg-white text-black hover:bg-slate-100"}`}
          >
            <Filter size={15} /> Filter
            {hasPanelFilters && !showFilters ? <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-red-600" aria-label="Filters in use" /> : null}
          </button>
        </div>
        <div className={`grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6 ${showFilters ? "grid" : "grid md:hidden"}`}>
          {showMachineFilter ? (
            <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Machine</span><Select compact value={machineFilter} onChange={setMachineFilter} options={machineOptions} placeholder="All" /></div>
          ) : null}
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Source</span><Select compact value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className={`flex justify-end gap-2 ${showFilters && hasPanelFilters ? "" : "md:hidden"}`}>
          {hasPanelFilters ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {showMachineTabs && !coreDataLoading ? (
        <MachineTabs tabs={machineTabs} value={machineFilter} onChange={setMachineFilter} allCount={filteredMachineGroups.reduce((sum, g) => sum + g.jobs.length, 0)} />
      ) : null}

      <div className="space-y-3">
        {coreDataLoading ? (
          <div role="status" className="rounded border border-black bg-white px-4 py-6 text-center text-sm font-black text-slate-600">Loading pending jobs…</div>
        ) : machineGroups.length === 0 ? (
          <div className="overflow-x-auto rounded border border-black bg-white">
            <table className="min-w-full divide-y divide-black border-collapse">
              {tableHead}
              <tbody className="bg-white">
                <tr><td colSpan={12} className="h-16" aria-label="No records" /></tr>
              </tbody>
            </table>
          </div>
        ) : (
          machineGroups.map((group) => (
            <div key={group.machineId} className="bg-white border border-black rounded shadow-sm">
              {!filterMachineId && !fixedNormalizedMachineName && (
                <button
                  onClick={() => toggleMachine(group.machineId)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200 transition-colors border-b border-black"
                >
                  <div className="flex items-center gap-3">
                    <Hammer size={20} className="text-indigo-600" />
                    <span className="font-bold text-lg uppercase tracking-tight">{group.machineName}</span>
                    <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-black">
                      {group.jobs.length} JOBS
                    </span>
                  </div>
                  {expandedMachines.has(group.machineId) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
              )}

              {(filterMachineId || fixedNormalizedMachineName || expandedMachines.has(group.machineId)) && (
                <div className="p-4">
                  <MachineJobsTable
                    jobs={sortedJobsByMachine.get(group.machineId) || group.jobs}
                    tableHead={tableHead}
                    renderRow={(job, idx) => {
                          const requiresMaterialIssue = ["Printing", "Corrugation Liner"].includes(normalizeMachineName(group.machineName));
                          const materialIssueBlocked = requiresMaterialIssue &&
                            (materialUsageLoading || !hasProductionMaterialUsage(job.production, materialUsageMap));
                          const materialIssueMessage = materialUsageLoading
                            ? "Checking issued material..."
                            : issuedProductionIds.has(job.production.id)
                              ? "No issued material remains after returns."
                              : "Issue material or sheet first.";
                          const openReportForm = () => {
                                  const now = new Date();
                                  const hour = now.getHours();
                                  const shift = (hour >= 8 && hour < 20) ? "Day" : "Night";
                                  const params = new URLSearchParams({
                                    productionId: job.production.id,
                                    machineId: group.machineId,
                                    lockMachine: "1",
                                    lockJob: "1",
                                    jobNo: String(job.production.jobCardNo || job.production.transactionNo || ""),
                                    machineName: group.machineName,
                                    ...(job.pendingQty > 0 ? { qty: String(job.pendingQty) } : {}),
                                    shift,
                                    erp: job.erpCode,
                                    itemName: job.itemName,
                                                                      ...(fixedNormalizedMachineName ? { returnTo: "/production/pending-printing" } : {}),
                                  });
                                  navigate(`/production-processing/form?${params.toString()}`);
                          };
                          return (
                          <tr key={`${job.production.id}-${idx}`} className="divide-x divide-black align-middle hover:bg-slate-50">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {/* Job No opens the report form. While issued material is still being checked it opens
                                  anyway (the server still refuses a Corrugation Liner report without reels); when the
                                  job really has no issued material it says why instead of doing nothing. */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (materialIssueBlocked && !materialUsageLoading) { alert(`${displayJobNo(job.production.transactionNo)}: ${materialIssueMessage}`); return; }
                                  openReportForm();
                                }}
                                title={materialIssueBlocked && !materialUsageLoading ? materialIssueMessage : "Open report form"}
                                className="font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
                              >
                                {displayJobNo(job.production.transactionNo)}
                              </button>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{job.source}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(job.production.date)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{job.erpCode || "-"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{job.firmName}</td>
                            <td className="w-[220px] min-w-[180px] max-w-[220px] px-3 py-2" title={job.companyName}>
                              <span className="line-clamp-2 break-words leading-4">{job.companyName || "-"}</span>
                            </td>
                            <td className="w-[280px] min-w-[220px] max-w-[280px] px-3 py-2 text-slate-600" title={job.itemName}>
                              <span className="line-clamp-2 break-words leading-4">{job.itemName || "-"}</span>
                            </td>
                            <td className="px-3 py-2 text-right">{job.requiredQty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">{job.ffgQty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-emerald-700">{job.reportedQty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-indigo-700 bg-indigo-50/30 font-black">{job.pendingQty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                disabled={materialIssueBlocked}
                                title={materialIssueBlocked ? materialIssueMessage : "Report production"}
                                onClick={openReportForm}
                                className="inline-flex items-center gap-1 bg-indigo-600 text-white px-3 py-1 rounded text-[10px] font-black uppercase hover:bg-indigo-700 transition shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
                              >
                                <ClipboardList size={12} />
                                Report
                              </button>
                              {materialIssueBlocked ? (
                                <div className="mt-1 text-[9px] font-black text-amber-700">{materialIssueMessage}</div>
                              ) : null}
                            </td>
                          </tr>
                          );
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PendingPrinting() {
  return <MachinePendingProcessing fixedMachineName="Printing" title="Pending Printing" />;
}

// One machine's job table, 100 rows a page: a machine can have about 2,000
// pending jobs, and drawing them all at once made the page slow.
function MachineJobsTable({ jobs, tableHead, renderRow }: { jobs: PendingMachineJob[]; tableHead: React.ReactNode; renderRow: (job: PendingMachineJob, index: number) => React.ReactNode }) {
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(jobs, 100);
  const offset = (page - 1) * pageSize;
  return (
    <>
      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full divide-y divide-black border-collapse">
          {tableHead}
          <tbody className="bg-white divide-y divide-black text-[11px] font-bold">
            {paginatedItems.map((job, index) => renderRow(job, offset + index))}
          </tbody>
        </table>
      </div>
      {totalItems > 25 ? <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[50, 100, 250, 500]} /> : null}
    </>
  );
}
