import React, { useState, useMemo } from "react";
import { useData } from "../hooks/useData";
import { Production, OrderSchedule, Order, Company, SampleRequest, Setting } from "../types";
import { formatDate } from "../lib/serial";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { TableControls } from "../components/TableControls";
import { Select } from "../components/Select";
import { ExcelExport } from "../components/ExcelExport";
import { ClientPagination } from "../components/ClientPagination";
import { Spinner } from "../components/Spinner";
import { FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportsAllowed } from "../lib/exportPolicy";
import { useNpdItemNames } from "../hooks/useNpdItems";
import { useClientPagination } from "../hooks/useClientPagination";
import { sortProductionPlanRows } from "../lib/productionPlanSorting";
import { findRealizationTargetForDate, parseRealizationTargets } from "../lib/realizationTargets";
import { resolveProductionPlanCompany } from "../lib/productionPlanCompany";
import { buildSampleJobNumbers, deriveProductionPlanStatuses } from "../lib/productionPlanStatus";

export function ProductionPlan() {
  const [productions, setProductions, productionsLoading] = useData<Production>("productions", []);
  const [schedules, , schedulesLoading] = useData<OrderSchedule>("orders_schedule", []);
  const [orders, , ordersLoading] = useData<Order>("orders", []);
  const [companies, , companiesLoading] = useData<Company>("companies", []);
  const [sampleRequests, , sampleRequestsLoading] = useData<SampleRequest>("sample_requests", []);
  const [settings, , settingsLoading] = useData<Setting>("settings", []);
  // Only item names are shown here, so the light NPD catalog is enough. The
  // firm-wise stock list (~9 MB) reloaded on every save anywhere in the app.
  const npdItems = useNpdItemNames();

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [editingSequenceId, setEditingSequenceId] = useState<string | null>(null);
  const [editingSequence, setEditingSequence] = useState("");
  const [sequenceError, setSequenceError] = useState("");
  const [savingSequenceId, setSavingSequenceId] = useState<string | null>(null);
  const allowExports = exportsAllowed();
  const isLoading =
    productionsLoading ||
    schedulesLoading ||
    ordersLoading ||
    companiesLoading ||
    sampleRequestsLoading ||
    settingsLoading;

  const normalizeDate = (dStr: string) => {
    if (!dStr) return "";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const format2 = (value: unknown) => {
    if (value === "" || value === null || value === undefined) return "-";
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : "-";
  };

  const sampleJobNumbers = useMemo(() => buildSampleJobNumbers(sampleRequests), [sampleRequests]);

  const realizationTargets = useMemo(
    () => parseRealizationTargets(settings[0]?.realizationPerKgTargets),
    [settings]
  );
  const selectedRealizationTarget = useMemo(
    () => findRealizationTargetForDate(realizationTargets, selectedDate),
    [realizationTargets, selectedDate]
  );
  const requiredRealization = selectedRealizationTarget ? Number(selectedRealizationTarget.value || 0) * 0.98 : null;
  const beginSequenceEdit = (production: Production) => {
    setEditingSequenceId(production.id);
    setEditingSequence(String(production.sequence ?? ""));
    setSequenceError("");
  };

  const cancelSequenceEdit = () => {
    setEditingSequenceId(null);
    setEditingSequence("");
    setSequenceError("");
  };

  const saveSequence = async (production: Production) => {
    const nextSequence = editingSequence.trim();
    const duplicate = productions.some((row) => row.id !== production.id && normalizeDate(row.date) === normalizeDate(production.date) && Boolean(nextSequence) && String(row.sequence ?? "").trim().toLowerCase() === nextSequence.toLowerCase());
    if (duplicate) {
      setSequenceError(`Job Sequence "${nextSequence}" is already used on this date.`);
      return;
    }
    setSavingSequenceId(production.id);
    setSequenceError("");
    try {
      await setProductions((rows) => rows.map((row) => row.id === production.id ? { ...row, sequence: nextSequence } : row));
      cancelSequenceEdit();
    } catch (error) {
      setSequenceError((error as Error).message || "Failed to save Job Sequence.");
    } finally {
      setSavingSequenceId(null);
    }
  };

  const filteredList = useMemo(() => {
    return productions
      .filter(p => normalizeDate(p.date) === selectedDate)
      .filter(p => {
        const item = npdItems.find(i => i.id === String(p.itemId || "").trim());
        const schedule = schedules.find(s => s.id === p.scheduleId);
        const order = orders.find(o => o.id === schedule?.orderId);
        const resolvedCompany = resolveProductionPlanCompany(p, schedule, order, companies);
        
        if (companyFilter && resolvedCompany.companyId !== companyFilter && resolvedCompany.name !== companyFilter) return false;
        const itemKey = item?.id || `${item?.name || ""}::${p.erpCode || ""}`;
        if (itemFilter && itemKey !== itemFilter) return false;
        return true;
      })
      .map((production) => {
        const schedule = schedules.find(s => s.id === production.scheduleId);
        const order = orders.find(o => o.id === schedule?.orderId);
        const company = resolveProductionPlanCompany(production, schedule, order, companies);
        return {
          ...production,
          productionPlanCompanyName: company.name,
          productionPlanCompanyId: company.companyId,
          itemName: npdItems.find((item) => item.id === String(production.itemId || "").trim())?.name || "",
        };
      });
  }, [productions, selectedDate, companyFilter, itemFilter, npdItems, schedules, orders, companies]);

  const baseSortedList = useMemo(() => sortProductionPlanRows(filteredList), [filteredList]);
  const baseStatusRows = useMemo(
    () => deriveProductionPlanStatuses(baseSortedList, sampleJobNumbers, requiredRealization),
    [baseSortedList, sampleJobNumbers, requiredRealization]
  );
  // Table search: matches the shown columns as displayed (Sr. No. and the
  // editable Job Sequence skipped). Order of the sorted list is kept.
  const statusRows = useTableSearch(baseStatusRows, searchTerm, (p) => [
    p.transactionNo, p.productionPlanCompanyName, p.itemName || "-", p.erpCode || "-",
    format2(p.ups), format2(p.qty), format2(p.reelAsPerCalc), format2(p.reelActualWithTrimming), format2(p.cuttingWithTrimming),
    format2(p.ply), p.flute || "-", format2(p.l1), format2(p.f1), format2(p.l2), format2(p.f2), format2(p.l3), format2(p.gsm),
    format2(p.totalPaperWeight), format2(p.plannedProductionInMeter), p.remarks || "-", format2(p.realizationPerKg),
    format2(p.sheetWeight), format2(p.leastGsm), p.fluteBatches || "-", formatDate(p.date), format2(p.rate),
    format2((Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0)), p.isSample ? "Yes" : "No",
  ]);
  const sortedList = statusRows;

  const companyOptions = useMemo(() => Array.from(new Map(statusRows.map((row) => [
    row.productionPlanCompanyId || row.productionPlanCompanyName,
    { value: row.productionPlanCompanyId || row.productionPlanCompanyName, label: row.productionPlanCompanyName },
  ])).values()).filter((option) => option.value && option.label && option.label !== "-").sort((a, b) => a.label.localeCompare(b.label)), [statusRows]);
  const itemOptions = useMemo(() => Array.from(new Map(statusRows.map((row) => { const item = npdItems.find((i) => i.id === String(row.itemId || "").trim()); const erp = String(row.erpCode || ""); const name = item?.name || ""; const key = item?.id || `${name}::${erp}`; return [key, { value: key, label: erp && name && !name.toLowerCase().includes(erp.toLowerCase()) ? `${name} - ${erp}` : name || erp, searchText: `${name} ${erp}` }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [statusRows, npdItems]);
  // Column sort over every searched row before paging; no sort keeps the plan's own order.
  const { sorted: columnSortedRows, sort, toggle: toggleSort } = useTableSort(statusRows, (p, key) => {
    switch (key) {
      case "transactionNo": return p.transactionNo;
      case "company": return p.productionPlanCompanyName;
      case "itemName": return p.itemName || "";
      case "erpCode": return p.erpCode || "";
      case "flute": return p.flute || "";
      case "remarks": return p.remarks || "";
      case "fluteBatches": return p.fluteBatches || "";
      case "date": return p.date;
      case "value": return (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
      case "isSample": return p.isSample ? "Yes" : "No";
      default: return Number((p as any)[key] || 0);
    }
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedList,
  } = useClientPagination(columnSortedRows, 25);

  const getExportData = (data: Production[]) => {
    return data.map((p, index) => {
      const schedule = schedules.find(s => s.id === p.scheduleId);
      const order = orders.find(o => o.id === schedule?.orderId);
      const company = resolveProductionPlanCompany(p, schedule, order, companies);
      const item = npdItems.find(i => i.id === String(p.itemId || "").trim());
      const isSample = sampleJobNumbers.has(String(p.transactionNo || p.jobCardNo || "").trim());
      const value = (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);

      return {
        "Sr. No.": index + 1,
        "Date": formatDate(p.date),
        "Job Number": p.transactionNo || "-",
        "Company": company.name,
        "ERP": p.erpCode || "-",
        "Item Name": item?.name || "-",
        "Sample (Yes/No)": isSample ? "Yes" : "No",
        "Plan Quantity": format2(p.qty),
        "UPS": format2(p.ups),
        "Ply": format2(p.ply),
        "Flute": p.flute || "-",
        "L1": format2(p.l1),
        "F1": format2(p.f1),
        "L2": format2(p.l2),
        "F2": format2(p.f2),
        "L3": format2(p.l3),
        "GSM": format2(p.gsm),
        "Least GSM": format2(p.leastGsm),
        "Reel As Per Calculation": format2(p.reelAsPerCalc),
        "Reel Actual Trim": format2(p.reelActualWithTrimming),
        "Cutting Trim": format2(p.cuttingWithTrimming),
        "Planned Production (Meter)": format2(p.plannedProductionInMeter),
        "Sheet Weight": format2(p.sheetWeight),
        "Total Paper Weight": format2(p.totalPaperWeight),
        "Flute Batch": p.fluteBatches || "-",
      } as Record<string, string | number>;
    });
  };

  const handleExportPDF = () => {
    if (statusRows.length === 0) return;
    // Layout of the printed Production Plan sheet: plain grid, job number only,
    // whole numbers without decimals, total value at the end.
    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pdfNumber = (value: unknown) => {
      if (value === "" || value === null || value === undefined) return "";
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      const rounded = Math.round(num * 100) / 100;
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    };
    const jobNumber = (p: Production) => {
      const text = String(p.transactionNo || p.jobCardNo || "").trim();
      return text.match(/(\d+)\s*$/)?.[1] || text || "-";
    };
    let totalValue = 0;
    const body = statusRows.map((p) => {
      const schedule = schedules.find((row) => row.id === p.scheduleId);
      const order = orders.find((row) => row.id === schedule?.orderId);
      const company = resolveProductionPlanCompany(p, schedule, order, companies);
      const item = npdItems.find((row) => row.id === String(p.itemId || "").trim());
      const value = (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
      totalValue += value;
      return [
        jobNumber(p), company.name || "", item?.name || "", p.erpCode || "", pdfNumber(p.ups), pdfNumber(p.qty),
        pdfNumber(p.reelAsPerCalc), pdfNumber(p.reelActualWithTrimming), pdfNumber(p.cuttingWithTrimming), pdfNumber(p.ply), p.flute || "",
        pdfNumber(p.l1), pdfNumber(p.f1), pdfNumber(p.l2), pdfNumber(p.f2), pdfNumber(p.l3), pdfNumber(p.gsm),
        pdfNumber(p.totalPaperWeight), pdfNumber(p.plannedProductionInMeter), pdfNumber(p.realizationPerKg), pdfNumber(p.sheetWeight),
        pdfNumber(p.rate), value.toFixed(2), p.isSample ? "YES" : "", p.remarks || "",
      ];
    });
    const head = [[
      "Job\nNo", "Company Name", "Item Name", "ERP\nCODE", "UPS", "Plan\nQTY", "Reel As\nPer\nCalculation", "REEL\nActual\nwith\nTRIMMING",
      "CUTTING\nwith\nTRIMMING", "PLY", "FLUTE", "L1", "F1", "L2", "F2", "L3", "GSM", "TOTAL\nPaper\nWEIGHT", "Planned\nProduction\nin Meter",
      "REALIZATION\nPER KG", "SHEET\nWEIGHT", "Rate", "Value", "", "Remark",
    ]];
    const foot = [["TOTAL", ...Array(21).fill(""), totalValue.toFixed(2), "", ""]];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Production Plan", pageWidth / 2, 12, { align: "center" });
    doc.setFontSize(8);
    doc.text(`Date: ${formatDate(selectedDate)}`, pageWidth / 2, 18, { align: "center" });

    autoTable(doc, {
      head,
      body,
      foot,
      startY: 22,
      margin: { left: 6, right: 6 },
      theme: "grid",
      showFoot: "lastPage",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 5.5, cellPadding: 0.8, halign: "center", valign: "middle", textColor: 0, lineColor: 0, lineWidth: 0.15, overflow: "linebreak" },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", fontSize: 5.5 },
      footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 9 },
        1: { cellWidth: 19 },
        2: { cellWidth: 20 },
        3: { cellWidth: 11 },
        19: { cellWidth: 16 },
        22: { cellWidth: 13 },
        23: { cellWidth: 6 },
        24: { cellWidth: 11 },
      },
      didParseCell: (data) => {
        if (data.section === "foot" && data.column.index === 0) data.cell.styles.halign = "left";
      },
    });

    doc.save(`Production_Plan_${selectedDate}.pdf`);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center pb-2 border-b border-black">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Production Plan</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-black uppercase">Plan Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-2 border-black rounded p-1 text-sm focus:outline-none focus:border-indigo-600"
            />
          </div>
          {allowExports ? (
            <>
              <ExcelExport data={getExportData(sortedList)} fileName={`Production_Plan_${selectedDate}`} />
            </>
          ) : null}
        </div>
      </div>

      {sequenceError ? <div className="rounded border border-red-700 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{sequenceError}</div> : null}

      <div className="grid gap-3 md:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1fr)_minmax(260px,1.1fr)_auto] md:items-center">
        <TableControls
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search"
        />
        <Select value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="Companies" />
        <Select value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="Items" />
        {(searchTerm || companyFilter || itemFilter) ? (
          <button type="button" onClick={() => { setSearchTerm(""); setCompanyFilter(""); setItemFilter(""); }} className="rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50">Clear Filters</button>
        ) : null}
      </div>

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center px-6 py-12">
            {/* The centred loading card comes from the page loading boundary. */}
          </div>
        ) : (
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="min-w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 sticky top-0 z-10">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Sr. No.</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Job No" sortKey="transactionNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Company Name" sortKey="company" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Item Name" sortKey="itemName" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="ERP CODE" sortKey="erpCode" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="UPS" sortKey="ups" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Plan QTY" sortKey="qty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Reel As Per Calculation" sortKey="reelAsPerCalc" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="REEL Actual with TRIMMING" sortKey="reelActualWithTrimming" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="CUTTING with TRIMMING" sortKey="cuttingWithTrimming" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="PLY" sortKey="ply" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="FLUTE" sortKey="flute" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L1" sortKey="l1" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="F1" sortKey="f1" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L2" sortKey="l2" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="F2" sortKey="f2" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L3" sortKey="l3" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="GSM" sortKey="gsm" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="TOTAL Paper WEIGHT" sortKey="totalPaperWeight" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Planned Production in Meter" sortKey="plannedProductionInMeter" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="REMARK" sortKey="remarks" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="REALIZATION PER KG" sortKey="realizationPerKg" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="SHEET WEIGHT" sortKey="sheetWeight" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Least Sheet Weight" sortKey="leastGsm" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Flute Batch" sortKey="fluteBatches" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Job Sequence</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Rate" sortKey="rate" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Value" sortKey="value" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Sample" sortKey="isSample" sort={sort} onToggle={toggleSort} align="center" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {sortedList.length === 0 ? (
                <tr>
                  <td colSpan={30} className="px-6 py-8 text-center text-black font-medium">No productions found for this date.</td>
                </tr>
              ) : (
                paginatedList.map((p, index) => {
                  const schedule = schedules.find(s => s.id === p.scheduleId);
                  const order = orders.find(o => o.id === schedule?.orderId);
                  const company = resolveProductionPlanCompany(p, schedule, order, companies);
                  const item = npdItems.find(i => i.id === String(p.itemId || "").trim());
                  const isSample = Boolean(p.isSample);
                  const value = (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
                  const highlightRow = Boolean(p.shouldHighlight);

                  return (
                    <tr
                      key={p.id}
                      className={`divide-x divide-black transition-colors ${highlightRow ? "hover:bg-[#FF9999]" : "hover:bg-slate-50"}`}
                      style={highlightRow ? { backgroundColor: "#FF9999" } : undefined}
                    >
                      <td className="px-4 py-3 text-right text-[11px] font-bold text-black border border-black whitespace-nowrap">{(page - 1) * pageSize + index + 1}</td>
                      <td className="px-4 py-3 text-[11px] font-bold text-black border border-black whitespace-nowrap">{p.transactionNo}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-normal break-words min-w-[220px] max-w-[220px]" title={company.name}>{company.name}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-normal break-words min-w-[320px] max-w-[320px]" title={item?.name}>{item?.name || "-"}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-nowrap">{p.erpCode || "-"}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.ups)}</td>
                      <td className="px-4 py-3 text-right text-[11px] font-bold text-emerald-700 border border-black whitespace-nowrap">{format2(p.qty)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.reelAsPerCalc)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.reelActualWithTrimming)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.cuttingWithTrimming)}</td>
                      <td className="px-4 py-3 text-center text-[11px] text-black border border-black whitespace-nowrap">{format2(p.ply)}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-nowrap">{p.flute || "-"}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.l1)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.f1)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.l2)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.f2)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.l3)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.gsm)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.totalPaperWeight)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.plannedProductionInMeter)}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-normal break-words min-w-[220px] max-w-[220px]">{p.remarks || "-"}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.realizationPerKg)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.sheetWeight)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.leastGsm)}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-nowrap">{p.fluteBatches || "-"}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-nowrap">
                        {editingSequenceId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus value={editingSequence} disabled={savingSequenceId === p.id} onChange={(event) => setEditingSequence(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveSequence(p); if (event.key === "Escape") cancelSequenceEdit(); }} className="w-20 rounded border border-indigo-600 px-1 py-0.5 text-[11px]" />
                            <button type="button" onClick={() => void saveSequence(p)} disabled={savingSequenceId === p.id} className="font-bold text-emerald-700">✓</button>
                            <button type="button" onClick={cancelSequenceEdit} disabled={savingSequenceId === p.id} className="font-bold text-red-700">×</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => beginSequenceEdit(p)} className="min-w-8 text-left hover:text-indigo-700 hover:underline">{String(p.sequence || "-")}</button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-nowrap">{formatDate(p.date)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.rate)}</td>
                      <td className="px-4 py-3 text-right text-[11px] font-bold text-black border border-black whitespace-nowrap">{format2(value)}</td>
                      <td className="px-4 py-3 text-center text-[11px] text-black border border-black whitespace-nowrap">{isSample ? "Yes" : "No"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}
        <ClientPagination
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
