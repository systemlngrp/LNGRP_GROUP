import React, { useState, useMemo } from "react";

import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { OrderSchedule, Order, Company, Item, DispatchPlan, LoadingSlip, Production, Firm } from "../types";
import { getFirmDisplayNameById, getFirmOptions } from "../lib/firmDisplay";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { cn } from "../lib/utils";
import { normalizeOrderItemSource } from "../lib/orderItems";
import { Save, Search } from "lucide-react";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useAuth } from "../auth/AuthContext";
import { buildLoadedQtyByScheduleId, getDispatchPlanPendingQty, getEffectiveDispatchPlanQty, getScheduleAvailableQty, getScheduleDispatchPendingQty } from "../lib/dispatchPlanBalances";

type SortKey = "scheduledDate" | "scheduleNo" | "orderNo" | "firmName" | "companyName" | "itemName" | "pendingQty";

export function PendingDispatchPlanning() {
  const { setActiveFirm } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');


  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", storageKey: "orders-schedule-all-firms" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const npdItems = useNpdItems();
  const { resolveOrderItem } = useOrderItemCatalog();
  const [dispatchPlans, setDispatchPlans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  // Read-only here: only the columns this screen uses are downloaded.
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms-dispatch-planning", fields: ["status", "lines"] });
  const [productions] = useData<Production>("productions", [], { firmScope: "all", storageKey: "productions-all-firms-dispatch-planning", fields: ["itemId", "status", "cancelTimestamp", "qty"] });

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedFirmId, setSelectedFirmId] = useState<string>("");
  const [itemFilter, setItemFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowPlannedQty, setRowPlannedQty] = useState<Record<string, number | "">>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("scheduledDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Same dates as before, but kept stable through the day so the schedule
  // list is not recalculated on every screen update.
  const dayKey = new Date().toDateString();
  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, [dayKey]);
  const tomorrow = useMemo(() => {
    const value = new Date(today);
    value.setDate(value.getDate() + 1);
    value.setHours(23, 59, 59, 999);
    return value;
  }, [today]);

  // Overdue / Due Today / Due Tomorrow, from the scheduled date.
  const dayIso = (value: unknown) => {
    const date = new Date(String(value || ""));
    if (isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const todayIso = dayIso(today);
  const dueStatus = (value: unknown) => {
    const day = dayIso(value);
    if (!day) return "";
    return day < todayIso ? "Overdue" : day === todayIso ? "Due Today" : "Due Tomorrow";
  };

  const isFfgFilled = (value: unknown) => {
    if (value === null || value === undefined) return false;
    const asString = String(value).trim();
    if (!asString) return false;
    const asNumber = Number(asString);
    return Number.isFinite(asNumber) ? asNumber > 0 : true;
  };

  const itemIdByScheduleId = useMemo(() => {
    const scheduleToOrderId = new Map(schedules.map((s) => [s.id, s.orderId]));
    const orderToItemId = new Map(orders.map((o) => [o.id, o.itemId]));
    const map = new Map<string, string>();
    schedules.forEach((s) => {
      const itemId = orderToItemId.get(scheduleToOrderId.get(s.id) || "") || "";
      map.set(s.id, itemId);
    });
    return map;
  }, [orders, schedules]);

  const loadedQtyByDispatchPlanId = useMemo(() => {
    const map = new Map<string, number>();
    loadingSlips.forEach((slip) => {
      if (slip.status === "Cancelled") return;
      slip.lines.forEach((line) => {
        const planId = String(line.dispatchPlanId || "").trim();
        if (!planId) return;
        map.set(planId, (map.get(planId) || 0) + Number(line.loadedQty || 0));
      });
    });
    return map;
  }, [loadingSlips]);

  const loadedQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    const planById = new Map(dispatchPlans.map((p) => [p.id, p]));
    loadingSlips.forEach((slip) => {
      if (slip.status === "Cancelled") return;
      slip.lines.forEach((line) => {
        const plan = planById.get(String(line.dispatchPlanId || ""));
        if (!plan) return;
        const itemId = itemIdByScheduleId.get(plan.scheduleId) || "";
        if (!itemId) return;
        map.set(itemId, (map.get(itemId) || 0) + Number(line.loadedQty || 0));
      });
    });
    return map;
  }, [dispatchPlans, itemIdByScheduleId, loadingSlips]);

  const pendingProductionPlanQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    productions.forEach((p) => {
      if (!p.itemId) return;
      if (p.status === "Cancelled" || p.cancelTimestamp) return;
      map.set(p.itemId, (map.get(p.itemId) || 0) + Number(p.qty || 0));
    });
    return map;
  }, [productions]);

  const reservedDispatchPlanQtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    dispatchPlans.forEach((plan) => {
      if (!plan.scheduleId) return;
      const itemId = itemIdByScheduleId.get(plan.scheduleId) || "";
      if (!itemId) return;

      const remaining = getDispatchPlanPendingQty(plan, loadedQtyByDispatchPlanId.get(plan.id) || 0);
      if (remaining <= 0) return;

      map.set(itemId, (map.get(itemId) || 0) + remaining);
    });
    return map;
  }, [dispatchPlans, itemIdByScheduleId, loadedQtyByDispatchPlanId]);

  const effectivePlannedByScheduleId = useMemo(() => {
    const map = new Map<string, number>();
    dispatchPlans.forEach((plan) => {
      const scheduleId = String(plan.scheduleId || "").trim();
      if (!scheduleId) return;
      const effective = getEffectiveDispatchPlanQty(plan);
      if (effective <= 0) return;
      map.set(scheduleId, (map.get(scheduleId) || 0) + effective);
    });
    return map;
  }, [dispatchPlans]);

  const getEffectivePlannedForSchedule = (scheduleId: string) =>
    Number(effectivePlannedByScheduleId.get(scheduleId) || 0);

  const availableToPlanByItemId = useMemo(() => {
    const map = new Map<string, number>();
    npdItems.forEach((item) => {
      const opening = Number((item as any).opening || 0);
      const receipt = Number((item as any).receipt || 0);
      const production = Number((item as any).production || 0);
      const baseStock = opening + receipt + production;

      const loaded = Number(loadedQtyByItemId.get(item.id) || 0);
      const dispatchBalance = baseStock - loaded;
      const pendingProduction = Number(pendingProductionPlanQtyByItemId.get(item.id) || 0);
      const reserved = Number(reservedDispatchPlanQtyByItemId.get(item.id) || 0);

      map.set(item.id, Math.max(0, dispatchBalance + pendingProduction - reserved));
    });
    return map;
  }, [npdItems, loadedQtyByItemId, pendingProductionPlanQtyByItemId, reservedDispatchPlanQtyByItemId]);

  // Lookups built once per data change (first record per id; plans grouped by
  // schedule in their original order), instead of list scans per schedule.
  const lookup = useMemo(() => {
    const firstById = <T extends { id: string }>(rows: T[]) => { const map = new Map<string, T>(); rows.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row); }); return map; };
    const plansBySchedule = new Map<string, typeof dispatchPlans>();
    dispatchPlans.forEach((plan) => { const key = String(plan.scheduleId || ""); const list = plansBySchedule.get(key); if (list) list.push(plan); else plansBySchedule.set(key, [plan]); });
    return { orderById: firstById(orders), companyById: firstById(companies), plansBySchedule };
  }, [orders, companies, dispatchPlans]);

  // Pending Qty (list rule, same as AppSheet): qty − cancelled − dispatched.
  // Unplanned Qty (planning limit): qty − cancelled − already planned.
  const loadedQtyByScheduleId = useMemo(() => buildLoadedQtyByScheduleId(dispatchPlans, loadingSlips), [dispatchPlans, loadingSlips]);
  const getPendingQty = (s: OrderSchedule) => getScheduleDispatchPendingQty(s, loadedQtyByScheduleId.get(String(s.id || "")) || 0);
  const getUnplannedQty = (s: OrderSchedule) => getScheduleAvailableQty(s, lookup.plansBySchedule.get(String(s.id || "")) || []);

  const basePendingSchedules = useMemo(() => {
    return schedules.filter(s => {
      const scheduledDate = new Date(s.scheduledDate);
      if (isNaN(scheduledDate.getTime())) return false;
      return scheduledDate <= tomorrow && getScheduleDispatchPendingQty(s, loadedQtyByScheduleId.get(String(s.id || "")) || 0) > 0;
    }).sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  }, [schedules, tomorrow, loadedQtyByScheduleId]);

  const availableCompanies = useMemo(() => {
    const compIds = new Set(basePendingSchedules.map(s => {
      const order = lookup.orderById.get(s.orderId);
      return order?.companyId;
    }).filter(Boolean));
    
    return companies.filter(c => compIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [basePendingSchedules, orders, companies, lookup]);

  const filterOptions = useMemo(() => {
    const firmIds = new Set<string>();
    const items = new Set<string>();
    basePendingSchedules.forEach((s) => {
      const order = lookup.orderById.get(s.orderId);
      const firmId = String(s.firmId || order?.firmId || "");
      if (firmId) firmIds.add(firmId);
      const name = resolveOrderItem(order)?.name;
      if (name) items.add(name);
    });
    return {
      firms: getFirmOptions(firms.filter((firm) => firmIds.has(String(firm.id)))),
      companies: availableCompanies.map((c) => ({ value: c.id, label: c.name })),
      items: Array.from(items).sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
      statuses: ["Overdue", "Due Today", "Due Tomorrow"].map((value) => ({ value, label: value })),
    };
  }, [basePendingSchedules, availableCompanies, firms, lookup, resolveOrderItem]);

  const filteredSchedules = useMemo(() => {
    const words = searchWords(searchTerm);
    const rows = basePendingSchedules.filter(s => {
      const order = lookup.orderById.get(s.orderId);
      const day = dayIso(s.scheduledDate);
      return (!selectedCompanyId || order?.companyId === selectedCompanyId) &&
        (!selectedFirmId || String(s.firmId || order?.firmId || "") === selectedFirmId) &&
        (!itemFilter || (resolveOrderItem(order)?.name || "") === itemFilter) &&
        (!statusFilter || dueStatus(s.scheduledDate) === statusFilter) &&
        (!fromDate || day >= fromDate) && (!toDate || day <= toDate);
    });

    return [...rows]
      .filter((schedule) => {
        if (!words.length) return true;
        const order = lookup.orderById.get(schedule.orderId);
        const company = lookup.companyById.get(order?.companyId as string);
        const item = resolveOrderItem(order);
        // Visible columns: Scheduled Date, Schedule No, Order No, Firm, Company, Item Name, Pending Qty, Unplanned Qty.
        return matchesTableSearch([
          formatDate(schedule.scheduledDate),
          dueStatus(schedule.scheduledDate),
          schedule.scheduleNo,
          order?.orderNo,
          getFirmDisplayNameById(schedule.firmId || order?.firmId, firms),
          company?.name,
          item?.name,
          getPendingQty(schedule),
          getUnplannedQty(schedule),
        ], words);
      })
      .sort((a, b) => {
      const orderA = lookup.orderById.get(a.orderId);
      const orderB = lookup.orderById.get(b.orderId);
      const companyA = lookup.companyById.get(orderA?.companyId as string)?.name || "";
      const companyB = lookup.companyById.get(orderB?.companyId as string)?.name || "";
      const itemA = resolveOrderItem(orderA)?.name || "";
      const itemB = resolveOrderItem(orderB)?.name || "";
      const pendingA = getPendingQty(a);
      const pendingB = getPendingQty(b);

      let compare = 0;
      switch (sortKey) {
        case "scheduledDate":
          compare = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
          break;
        case "orderNo":
          compare = (orderA?.orderNo || "").localeCompare(orderB?.orderNo || "", undefined, { numeric: true, sensitivity: "base" });
          break;
        case "scheduleNo":
          compare = (a.scheduleNo || "").localeCompare(b.scheduleNo || "", undefined, { numeric: true, sensitivity: "base" });
          break;
        case "firmName":
          compare = getFirmDisplayNameById(a.firmId || orderA?.firmId, firms).localeCompare(getFirmDisplayNameById(b.firmId || orderB?.firmId, firms), undefined, { numeric: true, sensitivity: "base" });
          break;
        case "companyName":
          compare = companyA.localeCompare(companyB, undefined, { sensitivity: "base" });
          break;
        case "itemName":
          compare = itemA.localeCompare(itemB, undefined, { sensitivity: "base" });
          break;
        case "pendingQty":
          compare = pendingA - pendingB;
          break;
      }

      return sortDirection === "asc" ? compare : -compare;
    });
  }, [basePendingSchedules, selectedCompanyId, selectedFirmId, itemFilter, statusFilter, fromDate, toDate, todayIso, orders, companies, firms, searchTerm, sortDirection, sortKey, effectivePlannedByScheduleId, loadedQtyByScheduleId, resolveOrderItem, lookup]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedSchedules,
  } = useClientPagination(filteredSchedules, 25);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const renderSortHeader = (label: string, key: SortKey, align: "left" | "right" = "left") => (
    <SortHeader label={<span className="font-bold">{label}</span>} sortKey={key} sort={{ key: sortKey, direction: sortDirection }} onToggle={(nextKey) => handleSort(nextKey as SortKey)} align={align} />
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const nextRowPlannedQty = { ...rowPlannedQty };
      filteredSchedules.forEach((schedule) => {
        if (nextRowPlannedQty[schedule.id] !== undefined) return;
        const effectivePlanned = getEffectivePlannedForSchedule(schedule.id);
        const balance = getScheduleAvailableQty(schedule, dispatchPlans);
        nextRowPlannedQty[schedule.id] = balance;
      });
      setRowPlannedQty(nextRowPlannedQty);
      setSelectedIds(new Set(filteredSchedules.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      if (rowPlannedQty[id] === undefined) {
        const schedule = schedules.find((row) => row.id === id);
        if (schedule) {
          const effectivePlanned = getEffectivePlannedForSchedule(id);
          const balance = getScheduleAvailableQty(schedule, dispatchPlans);
          setRowPlannedQty((prev) => ({ ...prev, [id]: balance }));
        }
      }
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const totalSessionPlannedQty = useMemo(() => {
    return Array.from(selectedIds).reduce((sum, id) => {
      const schedule = schedules.find(s => s.id === id);
      if (!schedule) return sum;
      
      const effectivePlanned = getEffectivePlannedForSchedule(id);
      const balance = getScheduleAvailableQty(schedule, dispatchPlans);
      
      const currentPlanned = rowPlannedQty[id] !== undefined ? rowPlannedQty[id] : balance;
      return sum + Number(currentPlanned || 0);
    }, 0);
  }, [selectedIds, rowPlannedQty, schedules, effectivePlannedByScheduleId]);

  const plannedNowByItemId = useMemo(() => {
    const map = new Map<string, number>();
    selectedIds.forEach((scheduleId) => {
      const schedule = schedules.find((row) => row.id === scheduleId);
      const order = orders.find((row) => row.id === schedule?.orderId);
      if (normalizeOrderItemSource(order?.itemSource) !== "FG") return;
      const itemId = itemIdByScheduleId.get(scheduleId) || "";
      if (!itemId) return;

      const effectivePlanned = getEffectivePlannedForSchedule(scheduleId);
      const schedulePendingQty = schedule ? getScheduleAvailableQty(schedule, dispatchPlans) : 0;

      const plannedQty = rowPlannedQty[scheduleId] !== undefined ? rowPlannedQty[scheduleId] : schedulePendingQty;
      map.set(itemId, (map.get(itemId) || 0) + Number(plannedQty || 0));
    });
    return map;
  }, [itemIdByScheduleId, orders, rowPlannedQty, schedules, selectedIds, effectivePlannedByScheduleId]);

  const calculationRows = useMemo(() => {
    const itemIds = Array.from(plannedNowByItemId.keys());
    return itemIds
      .map((itemId) => {
        const item = npdItems.find((row) => row.id === itemId);
        const opening = Number((item as any)?.opening || 0);
        const receipt = Number((item as any)?.receipt || 0);
        const production = Number((item as any)?.production || 0);
        const baseStock = opening + receipt + production;
        const loaded = Number(loadedQtyByItemId.get(itemId) || 0);
        const dispatchBalance = baseStock - loaded;
        const pendingProduction = Number(pendingProductionPlanQtyByItemId.get(itemId) || 0);
        const reserved = Number(reservedDispatchPlanQtyByItemId.get(itemId) || 0);
        const available = Number(availableToPlanByItemId.get(itemId) || 0);
        const plannedNow = Number(plannedNowByItemId.get(itemId) || 0);
        return {
          itemId,
          itemName: item?.name || "Unknown Item",
          opening,
          receipt,
          production,
          baseStock,
          loaded,
          dispatchBalance,
          pendingProduction,
          reserved,
          available,
          plannedNow,
          exceededBy: Math.max(0, plannedNow - available),
        };
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [
    availableToPlanByItemId,
    npdItems,
    loadedQtyByItemId,
    pendingProductionPlanQtyByItemId,
    plannedNowByItemId,
    reservedDispatchPlanQtyByItemId,
  ]);

  const { sorted: sortedCalculationRows, sort: calcSort, toggle: toggleCalcSort } = useTableSort(calculationRows, (row, key) => (key === "exceededBy" ? (row.exceededBy > 0 ? row.exceededBy : null) : (row as Record<string, unknown>)[key]));

  const metrics = useMemo(() => {
    let totalPendingQty = 0;
    let overdueCount = 0;

    basePendingSchedules.forEach(s => {
      totalPendingQty += Math.max(0, getPendingQty(s));
      
      const schedDate = new Date(s.scheduledDate);
      if (schedDate < today) overdueCount++;
    });

    return {
      pendingOrders: basePendingSchedules.length,
      pendingQty: totalPendingQty,
      overdue: overdueCount,
      activeSelection: selectedIds.size,
      activePlanned: totalSessionPlannedQty
    };
  }, [basePendingSchedules, loadedQtyByScheduleId, today, selectedIds, totalSessionPlannedQty]);

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      alert("Please select at least one order to plan.");
      return;
    }

    const violations: string[] = [];
    plannedNowByItemId.forEach((plannedNow, itemId) => {
      const available = Number(availableToPlanByItemId.get(itemId) || 0);
      if (plannedNow > available + 1e-9) {
        const itemName = npdItems.find((i) => i.id === itemId)?.name || "Unknown Item";
        violations.push(`${itemName}: Trying to plan ${plannedNow.toLocaleString()} but only ${available.toLocaleString()} is available.`);
      }
    });

    // A schedule cannot be planned beyond its unplanned qty (qty − cancelled − already planned).
    selectedIds.forEach((id) => {
      const schedule = schedules.find((row) => row.id === id);
      if (!schedule) return;
      const unplanned = getScheduleAvailableQty(schedule, dispatchPlans);
      const planned = Number(rowPlannedQty[id] !== undefined ? rowPlannedQty[id] : unplanned) || 0;
      if (planned <= 0) {
        violations.push(`${schedule.scheduleNo || id}: Planned qty must be more than 0 (already fully planned, waiting for loading).`);
      } else if (planned > unplanned + 1e-9) {
        violations.push(`${schedule.scheduleNo || id}: Trying to plan ${planned.toLocaleString()} but only ${unplanned.toLocaleString()} is not yet planned.`);
      }
    });

    if (violations.length > 0) {
      alert(`Dispatch planning limit exceeded:\n\n${violations.join("\n")}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const newPlans: DispatchPlan[] = Array.from(selectedIds).map(id => {
        const schedule = schedules.find(s => s.id === id)!;
        const order = orders.find((row) => row.id === schedule.orderId);
        const orderFirmId = String(order?.firmId || schedule.firmId || "").trim();
        if (!orderFirmId) throw new Error(`Original order firm is missing for schedule ${schedule.scheduleNo || id}.`);
        const orderFirm = firms.find((firm) => firm.id === orderFirmId);
        if (!orderFirm) throw new Error(`Original order firm could not be resolved for schedule ${schedule.scheduleNo || id}.`);
        setActiveFirm(orderFirm);
        const effectivePlanned = getEffectivePlannedForSchedule(id);
        const balance = getScheduleAvailableQty(schedule, dispatchPlans);
        
        return {
          id: crypto.randomUUID(),
          planNo: "",
          scheduleId: id,
          orderId: schedule.orderId,
          firmId: orderFirmId,
          orderFirmId,
          truckId: "",
          plannedQty: Number(rowPlannedQty[id] !== undefined ? rowPlannedQty[id] : Math.max(0, balance)),
          status: "Planned",
          date: timestamp,
          updateTimestamp: timestamp,
          updatedBy: "System User"
        };
      });

      await setDispatchPlans([...dispatchPlans, ...newPlans]);
      
      setSelectedIds(new Set());
      setRowPlannedQty({});
      alert("Dispatch plans submitted successfully!");
    } catch (err) {
      console.error("Failed to submit dispatch plans:", err);
      alert("Failed to submit dispatch plans. Please check the console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
  const hasFilters = Boolean(searchTerm.trim() || selectedFirmId || selectedCompanyId || itemFilter || statusFilter || fromDate || toDate);
  const clearFilters = () => {
    setSearchTerm(""); setSelectedFirmId(""); setSelectedCompanyId(""); setItemFilter(""); setStatusFilter(""); setFromDate(""); setToDate("");
    setSelectedIds(new Set());
  };
  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setSelectedIds(new Set()); };
  const STATUS_BADGE: Record<string, string> = {
    "Overdue": "border-red-600 bg-red-50 text-red-700",
    "Due Today": "border-amber-600 bg-amber-50 text-amber-800",
    "Due Tomorrow": "border-emerald-600 bg-emerald-50 text-emerald-800",
  };
  const statusBadge = (status: string) => status
    ? <span className={cn("inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-black uppercase", STATUS_BADGE[status])}>{status}</span>
    : <span>-</span>;
  const plannedValue = (id: string, balance: number) => (rowPlannedQty[id] !== undefined ? rowPlannedQty[id] : balance);
  const setPlanned = (id: string, value: string) => setRowPlannedQty((prev) => ({ ...prev, [id]: value === "" ? "" : Number(value) }));
  const pageAllSelected = paginatedSchedules.length > 0 && paginatedSchedules.every((schedule) => selectedIds.has(schedule.id));
  const rowInfo = (s: OrderSchedule) => {
    const order = lookup.orderById.get(s.orderId);
    return {
      order,
      company: lookup.companyById.get(order?.companyId as string),
      item: resolveOrderItem(order),
      status: dueStatus(s.scheduledDate),
      balance: getUnplannedQty(s),
      pendingQty: getPendingQty(s),
      scheduleQty: Number(s.qty || 0) || 0,
      cancelQty: Number(s.canceledQty || 0) || 0,
      dispatchedQty: loadedQtyByScheduleId.get(String(s.id || "")) || 0,
      alreadyPlannedQty: (lookup.plansBySchedule.get(String(s.id || "")) || []).reduce((sum, plan) => sum + getEffectiveDispatchPlanQty(plan), 0),
      firm: getFirmDisplayNameById(s.firmId || order?.firmId, firms),
    };
  };

  return (
    <div className={cn("space-y-4", selectedIds.size > 0 && "pb-20 md:pb-0")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Dispatch Planning</h2>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-center gap-2 rounded-lg border-2 border-black bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-emerald-700 disabled:opacity-60 md:static md:py-2"
          >
            <Save size={18} />
            {isSubmitting ? "Saving..." : `Submit Plan (${selectedIds.size}) · ${totalSessionPlannedQty.toLocaleString()}`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <div className="rounded-lg border-2 border-black bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 text-white">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Pending Orders</div>
          <div className="text-2xl font-black">{metrics.pendingOrders.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-gradient-to-br from-rose-500 to-rose-700 p-3 text-white">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Overdue</div>
          <div className="text-2xl font-black">{metrics.overdue.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-gradient-to-br from-emerald-500 to-emerald-700 p-3 text-white">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Pending Qty</div>
          <div className="text-2xl font-black">{metrics.pendingQty.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-gradient-to-br from-amber-500 to-amber-700 p-3 text-white">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Session Planned</div>
          <div className="text-2xl font-black">{metrics.activePlanned.toLocaleString()}</div>
          <div className="text-[10px] font-bold opacity-90">{metrics.activeSelection} selected</div>
        </div>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Firm</span><Select compact value={selectedFirmId} onChange={changeFilter(setSelectedFirmId)} options={filterOptions.firms} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Status</span><Select compact value={statusFilter} onChange={changeFilter(setStatusFilter)} options={filterOptions.statuses} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Company</span><Select compact value={selectedCompanyId} onChange={changeFilter(setSelectedCompanyId)} options={filterOptions.companies} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={changeFilter(setItemFilter)} options={filterOptions.items} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[280px]">
            <label className="min-w-0"><span className={LABEL}>Schedule From</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => changeFilter(setFromDate)(e.target.value)} className={DATE_INPUT} /></label>
            <label className="min-w-0"><span className={LABEL}>Schedule To</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => changeFilter(setToDate)(e.target.value)} className={DATE_INPUT} /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {calculationRows.length > 0 ? (
        <>
          <div className="overflow-hidden rounded border border-black bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-black bg-slate-50">
            <div className="text-sm font-black uppercase text-black">Dispatch Planning Calculation</div>
          </div>
          <div className="table-frozen-scroll">
            <table className="min-w-full divide-y divide-black border-collapse border border-black">
              <thead className="sticky top-0 z-30 bg-slate-100 divide-x divide-black">
                <tr className="divide-x divide-black">
                  <th className="px-3 py-2 text-left text-[11px] font-black uppercase border border-black"><SortHeader label={"Item"} sortKey="itemName" sort={calcSort} onToggle={toggleCalcSort} align="left" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Opening"} sortKey="opening" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Receipt"} sortKey="receipt" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Production"} sortKey="production" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Invoice Qty"} sortKey="loaded" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"FG Balance"} sortKey="dispatchBalance" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Pending Production"} sortKey="pendingProduction" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Pending Loading"} sortKey="reserved" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Available"} sortKey="available" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Planned Now"} sortKey="plannedNow" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase border border-black"><SortHeader label={"Exceeded"} sortKey="exceededBy" sort={calcSort} onToggle={toggleCalcSort} align="right" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black bg-white">
                {sortedCalculationRows.map((row) => (
                  <tr key={row.itemId} className={cn("divide-x divide-black", row.exceededBy > 0 && "bg-rose-50")}>
                    <td className="px-3 py-2 text-[11px] font-bold text-black border border-black min-w-[260px]">{row.itemName}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-black border border-black">{row.opening.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-black border border-black">{row.receipt.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-black border border-black">{row.production.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-black border border-black">{row.loaded.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-black border border-black">{row.dispatchBalance.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-black border border-black">{row.pendingProduction.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-black border border-black">{row.reserved.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] font-black text-black border border-black">{row.available.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[11px] font-black text-black border border-black">{row.plannedNow.toLocaleString()}</td>
                    <td className={cn("px-3 py-2 text-right text-[11px] font-black border border-black", row.exceededBy > 0 ? "text-rose-700" : "text-slate-500")}>
                      {row.exceededBy > 0 ? row.exceededBy.toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </>
      ) : null}

      {/* Phones: one card per schedule. */}
      <div className="space-y-2 md:hidden">
        {filteredSchedules.length > 0 && (
          <label className="flex items-center justify-between rounded border border-black bg-slate-100 px-3 py-2 text-xs font-bold">
            <span className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={pageAllSelected} onChange={handleSelectAll} />
              Select all
            </span>
            <span className="text-slate-600">{filteredSchedules.length.toLocaleString()} schedules</span>
          </label>
        )}
        {filteredSchedules.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-medium">No pending dispatch plans found.</div>
        ) : paginatedSchedules.map((s) => {
          const info = rowInfo(s);
          const selected = selectedIds.has(s.id);
          return (
            <div key={s.id} className={cn("rounded-lg border-2 bg-white p-3", selected ? "border-indigo-600 bg-indigo-50/60" : "border-black")}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`Select ${s.scheduleNo || "schedule"}`} className="mt-0.5 h-5 w-5 shrink-0" checked={selected} onChange={() => toggleSelect(s.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-black">{s.scheduleNo || "-"}</span>
                    {statusBadge(info.status)}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-slate-600">{formatDate(s.scheduledDate)} · {info.order?.orderNo || "-"} · {info.firm}</div>
                  <div className="mt-1 break-words text-xs font-bold text-black">{info.company?.name || "-"}</div>
                  <div className="break-words text-xs text-slate-700">{info.item?.name || "-"}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded border border-slate-300 bg-slate-50 px-2 py-1">
                  <div className="text-[10px] font-black uppercase text-slate-500">Pending Qty</div>
                  <div className="text-sm font-black text-indigo-700">{info.pendingQty.toLocaleString()}</div>
                  <div className="text-[10px] font-bold text-slate-500">Qty {info.scheduleQty.toLocaleString()} − Cancel {info.cancelQty.toLocaleString()} − Dispatched {info.dispatchedQty.toLocaleString()}</div>
                  <div className="text-[10px] font-bold text-slate-500">Planned {info.alreadyPlannedQty.toLocaleString()} · Unplanned {info.balance.toLocaleString()}</div>
                </div>
                <label className="rounded border border-slate-300 bg-slate-50 px-2 py-1">
                  <span className="block text-[10px] font-black uppercase text-slate-500">Planned Qty</span>
                  <input type="number" inputMode="numeric" value={plannedValue(s.id, info.balance)} onChange={(e) => setPlanned(s.id, e.target.value)} className="w-full rounded border border-slate-400 bg-white px-1 text-right text-sm font-bold focus:border-indigo-600 focus:outline-none" />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded border border-black bg-white shadow-sm md:block">
        <div className="table-frozen-scroll">
          <table className="min-w-full border-collapse border border-black">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr>
                <th className="w-8 border border-black px-1 py-2 text-center">
                  <input type="checkbox" aria-label="Select all on this page" className="h-4 w-4" onChange={handleSelectAll} checked={pageAllSelected} />
                </th>
                <th className="w-[92px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black">{renderSortHeader("Sch. Date / Status", "scheduledDate")}</th>
                <th className="w-[132px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black">{renderSortHeader("Schedule / Order No", "scheduleNo")}</th>
                <th className="w-[52px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black">{renderSortHeader("Firm", "firmName")}</th>
                <th className="border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black">{renderSortHeader("Company", "companyName")}</th>
                <th className="border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black">{renderSortHeader("Item Name", "itemName")}</th>
                <th className="w-[70px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black text-right whitespace-normal" title="Schedule qty">Schedule Qty</th>
                <th className="w-[70px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black text-right whitespace-normal" title="Cancelled qty on the schedule">Cancel Qty</th>
                <th className="w-[70px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black text-right whitespace-normal" title="Qty loaded on loading slips">Dispatched Qty</th>
                <th className="w-[76px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black text-right whitespace-normal" title="Schedule Qty − Cancel Qty − Dispatched Qty">{renderSortHeader("Pending Qty", "pendingQty", "right")}</th>
                <th className="w-[70px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black text-right whitespace-normal" title="Qty already on dispatch plans, less plan cancels">Already Planned Qty</th>
                <th className="w-[70px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black text-right whitespace-normal" title="Schedule Qty − Cancel Qty − Already Planned Qty">Unplanned Qty</th>
                <th className="w-[78px] border border-black px-1.5 py-2 text-[10px] font-bold uppercase leading-tight text-black">Planned Qty</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredSchedules.length === 0 ? (
                <tr><td colSpan={13} className="px-6 py-8 text-center font-medium text-black">No pending dispatch plans found.</td></tr>
              ) : paginatedSchedules.map((s) => {
                const info = rowInfo(s);
                const selected = selectedIds.has(s.id);
                const num = "whitespace-nowrap border border-black px-1.5 py-1.5 text-right text-[11px] text-black";
                return (
                  <tr key={s.id} className={cn("hover:bg-slate-50", info.status === "Overdue" && "bg-red-50/60", selected && "bg-indigo-50")}>
                    <td className="w-8 border border-black px-1 py-1.5 text-center">
                      <input type="checkbox" aria-label={`Select ${s.scheduleNo || "schedule"}`} className="h-4 w-4 cursor-pointer" checked={selected} onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td className="whitespace-nowrap border border-black px-1.5 py-1.5 text-center">
                      <div className={cn("text-[11px] font-bold", info.status === "Overdue" ? "text-red-600" : "text-black")}>{formatDate(s.scheduledDate)}</div>
                      <div className="mt-0.5">{statusBadge(info.status)}</div>
                    </td>
                    <td className="whitespace-nowrap border border-black px-1.5 py-1.5 text-[11px] text-black">
                      <div className="font-bold">{s.scheduleNo || "-"}</div>
                      <div className="text-[10px] text-slate-600">{info.order?.orderNo || "-"}</div>
                    </td>
                    <td className="whitespace-nowrap border border-black px-1.5 py-1.5 text-[11px] text-black">{info.firm}</td>
                    <td className="border border-black px-1.5 py-1.5 text-[11px] leading-tight text-black"><div className="min-w-[130px] max-w-[200px] whitespace-normal break-words">{info.company?.name || "-"}</div></td>
                    <td className="border border-black px-1.5 py-1.5 text-[11px] leading-tight text-black"><div className="min-w-[140px] max-w-[220px] whitespace-normal break-words">{info.item?.name || "-"}</div></td>
                    <td className={num}>{info.scheduleQty.toLocaleString()}</td>
                    <td className={num}>{info.cancelQty.toLocaleString()}</td>
                    <td className={num}>{info.dispatchedQty.toLocaleString()}</td>
                    <td className={cn(num, "font-bold text-indigo-700")}>{info.pendingQty.toLocaleString()}</td>
                    <td className={num}>{info.alreadyPlannedQty.toLocaleString()}</td>
                    <td className={cn(num, "font-bold text-slate-700")}>{info.balance.toLocaleString()}</td>
                    <td className="border border-black px-1 py-1">
                      <input type="number" value={plannedValue(s.id, info.balance)} onChange={(e) => setPlanned(s.id, e.target.value)} className="w-full min-w-[64px] rounded border border-slate-300 p-1 text-right text-[11px] font-bold focus:border-indigo-600 focus:outline-none" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {selectedIds.size > 0 && (
              <tfoot className="border-t-2 border-black bg-slate-100">
                <tr className="font-black">
                  <td colSpan={12} className="px-4 py-3 text-right text-xs uppercase text-slate-600">Total Planned for Submission:</td>
                  <td className="border border-black bg-indigo-50 px-4 py-3 text-right text-sm text-indigo-700">{totalSessionPlannedQty.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
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
