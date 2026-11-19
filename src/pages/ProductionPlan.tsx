import { FilterBox } from "../components/FilterBox";
import { displayJobNo } from "../lib/jobNumber";
import React, { useState, useMemo } from "react";
import { useData } from "../hooks/useData";
import { Production, OrderSchedule, Order, Company, SampleRequest, Setting, FluteMaster } from "../types";
import { buildFluteBatchMap, resolveFluteBatch } from "../lib/fluteBatch";
import { formatDate } from "../lib/serial";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";
import { Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportsAllowed } from "../lib/exportPolicy";
import { useNpdItemNames } from "../hooks/useNpdItems";
import { sortProductionPlanRows } from "../lib/productionPlanSorting";
import { findRealizationTargetForDate, parseRealizationTargets } from "../lib/realizationTargets";
import { resolveProductionPlanCompany } from "../lib/productionPlanCompany";
import { MultiSelect } from "../components/MultiSelect";
import { buildSampleJobNumbers, deriveProductionPlanStatuses } from "../lib/productionPlanStatus";

export function ProductionPlan() {
  const [productions, setProductions, productionsLoading] = useData<Production>("productions", []);
  const [schedules, , schedulesLoading] = useData<OrderSchedule>("orders_schedule", []);
  const [orders, , ordersLoading] = useData<Order>("orders", []);
  const [companies, , companiesLoading] = useData<Company>("companies", []);
  const [sampleRequests, , sampleRequestsLoading] = useData<SampleRequest>("sample_requests", []);
  const [settings, , settingsLoading] = useData<Setting>("settings", []);
  const [fluteMasters, , fluteMastersLoading] = useData<FluteMaster>("flute_masters", []);
  const fluteBatchMap = useMemo(() => buildFluteBatchMap(fluteMasters), [fluteMasters]);
  // Only item names are shown here, so the light NPD catalog is enough. The
  // firm-wise stock list (~9 MB) reloaded on every save anywhere in the app.
  const npdItems = useNpdItemNames();

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const [itemFilter, setItemFilter] = useState("");
  const allowExports = exportsAllowed();
  const isLoading =
    productionsLoading ||
    schedulesLoading ||
    ordersLoading ||
    companiesLoading ||
    sampleRequestsLoading ||
    settingsLoading ||
    fluteMastersLoading;

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
  // Least Sheet Weight = least GSM of the same ERP code across all
  // non-cancelled jobs (same rule as Production Master / dashboards).
  const erpLeastGsmMap = useMemo(() => {
    const map = new Map<string, number>();
    productions.forEach((p) => {
      if (p.status === "Cancelled" || p.cancelTimestamp) return;
      const erp = String(p.erpCode || "").trim();
      const gsm = Number(p.gsm || 0);
      if (erp && gsm > 0 && (!map.has(erp) || gsm < map.get(erp)!)) map.set(erp, gsm);
    });
    return map;
  }, [productions]);

  const filteredList = useMemo(() => {
    return productions
      .filter(p => normalizeDate(p.date) === selectedDate)
      .filter(p => {
        const item = npdItems.find(i => i.id === String(p.itemId || "").trim());
        const schedule = schedules.find(s => s.id === p.scheduleId);
        const order = orders.find(o => o.id === schedule?.orderId);
        const resolvedCompany = resolveProductionPlanCompany(p, schedule, order, companies);
        
        if (companyFilter.length && !companyFilter.some((selected) => selected === resolvedCompany.companyId || selected === resolvedCompany.name)) return false;
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
          leastGsm: erpLeastGsmMap.get(String(production.erpCode || "").trim()) ?? production.leastGsm,
          // Batch comes from the Flute Master, so a master change re-orders the plan.
          fluteBatches: resolveFluteBatch(production.flute, fluteBatchMap, production.fluteBatches),
          productionPlanCompanyName: company.name,
          productionPlanCompanyId: company.companyId,
          itemName: npdItems.find((item) => item.id === String(production.itemId || "").trim())?.name || "",
        };
      });
  }, [productions, selectedDate, companyFilter, itemFilter, npdItems, schedules, orders, companies, erpLeastGsmMap, fluteBatchMap]);

  const baseSortedList = useMemo(() => sortProductionPlanRows(filteredList), [filteredList]);
  const baseStatusRows = useMemo(
    () => deriveProductionPlanStatuses(baseSortedList, sampleJobNumbers, requiredRealization),
    [baseSortedList, sampleJobNumbers, requiredRealization]
  );
  // Table search: matches the shown columns as displayed (Sr. No. and the
  // Sr. No. skipped). Order of the sorted list is kept.
  const statusRows = useTableSearch(baseStatusRows, searchTerm, (p) => [
    p.transactionNo, p.productionPlanCompanyName, p.itemName || "-", p.erpCode || "-",
    format2(p.ups), format2(p.qty), format2(p.reelAsPerCalc), format2(p.reelActualWithTrimming), format2(p.cuttingWithTrimming),
    format2(p.ply), p.flute || "-", format2(p.l1), format2(p.f1), format2(p.l2), format2(p.f2), format2(p.l3), format2(p.gsm),
    format2(p.totalPaperWeight), format2(p.plannedProductionInMeter), p.remarks || "-", format2(p.realizationPerKg),
    format2(p.sheetWeight), format2(p.leastGsm), p.fluteBatches || "-", formatDate(p.date), format2(p.rate),
    format2((Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0)), p.isSample ? "Yes" : "No",
  ]);
  const sortedList = statusRows;

  // Company list = every company planned on the selected date (not narrowed by the company filter itself).
  const companyOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    productions.filter((p) => normalizeDate(p.date) === selectedDate).forEach((p) => {
      const schedule = schedules.find((s) => s.id === p.scheduleId);
      const order = orders.find((o) => o.id === schedule?.orderId);
      const company = resolveProductionPlanCompany(p, schedule, order, companies);
      const value = company.companyId || company.name;
      if (value && company.name && company.name !== "-") map.set(value, { value, label: company.name });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [productions, selectedDate, schedules, orders, companies]);
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
      case "fluteBatches": return Number(p.fluteBatches) || Number.MAX_SAFE_INTEGER;
      case "date": return p.date;
      case "value": return (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
      case "isSample": return p.isSample ? "Yes" : "No";
      default: return Number((p as any)[key] || 0);
    }
  });
  // No pagination on the Production Plan: every row is shown on one page.
  const paginatedList = columnSortedRows;
  // TOTAL row under the table: same totals as the PDF / Excel downloads.
  const viewTotals = useMemo(() => columnSortedRows.reduce(
    (sum, p) => ({
      paperWeight: sum.paperWeight + (Number(p.totalPaperWeight || 0) || 0),
      value: sum.value + (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0),
    }),
    { paperWeight: 0, value: 0 }
  ), [columnSortedRows]);

  // Excel uses the same columns as the printed plan sheet / PDF, numbers as numbers.
  const getExportData = (data: Production[]) => {
    const toNum = (value: unknown) => {
      if (value === "" || value === null || value === undefined) return "";
      const num = Number(value);
      return Number.isFinite(num) ? Math.round(num * 100) / 100 : String(value);
    };
    return data.map((p) => {
      const schedule = schedules.find(s => s.id === p.scheduleId);
      const order = orders.find(o => o.id === schedule?.orderId);
      const company = resolveProductionPlanCompany(p, schedule, order, companies);
      const item = npdItems.find(i => i.id === String(p.itemId || "").trim());
      const jobText = String(p.transactionNo || p.jobCardNo || "").trim();
      const value = (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
      return {
        "Job No": jobText.match(/(\d+)\s*$/)?.[1] || jobText || "",
        "Company Name": company.name || "",
        "Item Name": item?.name || "",
        "ERP CODE": p.erpCode || "",
        "UPS": toNum(p.ups),
        "Plan QTY": toNum(p.qty),
        "Reel As Per Calculation": toNum(p.reelAsPerCalc),
        "REEL Actual with TRIMMING": toNum(p.reelActualWithTrimming),
        "CUTTING with TRIMMING": toNum(p.cuttingWithTrimming),
        "PLY": toNum(p.ply),
        "FLUTE": p.flute || "",
        "L1": toNum(p.l1), "F1": toNum(p.f1), "L2": toNum(p.l2), "F2": toNum(p.f2), "L3": toNum(p.l3),
        "GSM": toNum(p.gsm),
        "TOTAL Paper WEIGHT": toNum(p.totalPaperWeight),
        "Planned Production in Meter": toNum(p.plannedProductionInMeter),
        "REALIZATION PER KG": toNum(p.realizationPerKg),
        "SHEET WEIGHT": toNum(p.sheetWeight),
        "Rate": toNum(p.rate),
        "Value": Math.round(value * 100) / 100,
        "Sample": (p as any).isSample ? "YES" : "",
        "Remark": p.remarks || "",
      } as Record<string, string | number>;
    });
  };

  const handleExportExcel = async () => {
    if (statusRows.length === 0) return;
    const XLSX = await import("xlsx-js-style");
    const rows = getExportData(statusRows);
    const headers = Object.keys(rows[0]);
    const lastCol = headers.length - 1;
    const valueCol = headers.indexOf("Value");
    const thin = { style: "thin", color: { rgb: "000000" } };
    const border = { top: thin, bottom: thin, left: thin, right: thin };
    const cellStyle = (bold: boolean, fill?: string) => ({
      font: { name: "Arial", sz: 9, bold },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border,
      ...(fill ? { fill: { patternType: "solid", fgColor: { rgb: fill } } } : {}),
    });
    const total = rows.reduce((sum, row) => sum + Number(row.Value || 0), 0);
    const paperWeightCol = headers.indexOf("TOTAL Paper WEIGHT");
    const totalPaperWeight = rows.reduce((sum, row) => sum + Number(row["TOTAL Paper WEIGHT"] || 0), 0);
    const aoa: (string | number)[][] = [
      ["Production Plan"],
      [`Date: ${formatDate(selectedDate)}`],
      headers,
      ...rows.map((row) => headers.map((header) => row[header] ?? "")),
      headers.map((_, index) => (index === 0 ? "TOTAL" : index === valueCol ? Math.round(total * 100) / 100 : index === paperWeightCol ? Math.round(totalPaperWeight * 100) / 100 : "")),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }, { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } }];
    ws["!cols"] = headers.map((header) => ({ wch: header === "Item Name" ? 34 : header === "Company Name" ? 28 : header === "Remark" ? 26 : Math.max(7, Math.min(14, header.length)) }));
    ws["!freeze"] = { xSplit: 0, ySplit: 3 };
    const setStyle = (r: number, c: number, style: any) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = style;
    };
    setStyle(0, 0, { font: { name: "Arial", sz: 14, bold: true }, alignment: { horizontal: "center" } });
    setStyle(1, 0, { font: { name: "Arial", sz: 10, bold: true }, alignment: { horizontal: "center" } });
    for (let c = 0; c <= lastCol; c += 1) setStyle(2, c, cellStyle(true));
    statusRows.forEach((production, index) => {
      // Same colour as on screen: realization below 98% of the target and not a sample.
      const fill = production.shouldHighlight ? "FF9999" : undefined;
      for (let c = 0; c <= lastCol; c += 1) setStyle(3 + index, c, cellStyle(false, fill));
    });
    for (let c = 0; c <= lastCol; c += 1) setStyle(3 + statusRows.length, c, cellStyle(true));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Production Plan");
    XLSX.writeFile(wb, `Production_Plan_${selectedDate}.xlsx`);
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
    let totalPaperWeight = 0;
    const body = statusRows.map((p) => {
      const schedule = schedules.find((row) => row.id === p.scheduleId);
      const order = orders.find((row) => row.id === schedule?.orderId);
      const company = resolveProductionPlanCompany(p, schedule, order, companies);
      const item = npdItems.find((row) => row.id === String(p.itemId || "").trim());
      const value = (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
      totalValue += value;
      totalPaperWeight += Number(p.totalPaperWeight || 0) || 0;
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
      "REALIZATION\nPER KG", "SHEET\nWEIGHT", "Rate", "Value", "Sample", "Remark",
    ]];
    // TOTAL row: Total Paper Weight (column 18) and Value.
    const foot = [["TOTAL", ...Array(16).fill(""), totalPaperWeight.toFixed(2), ...Array(4).fill(""), totalValue.toFixed(2), "", ""]];

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
        1: { cellWidth: 28 },
        2: { cellWidth: 34 },
        3: { cellWidth: 11 },
        19: { cellWidth: 16 },
        22: { cellWidth: 13 },
        23: { cellWidth: 9 },
        24: { cellWidth: 26 },
      },
      didParseCell: (data) => {
        if (data.section === "foot" && data.column.index === 0) data.cell.styles.halign = "left";
        // Same colour as on screen: realization below 98% of the target and not a sample.
        if (data.section === "body" && statusRows[data.row.index]?.shouldHighlight) data.cell.styles.fillColor = [255, 153, 153];
      },
    });

    doc.save(`Production_Plan_${selectedDate}.pdf`);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center pb-2 border-b border-black">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Production Plan</h2>
        <div data-header-action="true" className="flex flex-wrap items-center justify-end gap-3">
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
              <button
                type="button"
                data-export="excel"
                onClick={() => void handleExportExcel()}
                disabled={statusRows.length === 0}
                title="Download Excel"
                className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-40"
              >
                <Download size={16} />
                <span>Excel</span>
              </button>
              <button
                type="button"
                data-export="pdf"
                onClick={handleExportPDF}
                disabled={statusRows.length === 0}
                title="Download PDF"
                className="inline-flex items-center gap-2 rounded border border-red-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40"
              >
                <FileText size={16} />
                <span>PDF</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Total tiles (same totals as the TOTAL row and downloads). */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl border-2 border-black p-3 text-white md:p-4">
          <div className="text-[10px] font-black uppercase opacity-80 tracking-widest">Jobs</div>
          <div className="text-xl font-black md:text-3xl">{columnSortedRows.length}</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl border-2 border-black p-3 text-white md:p-4">
          <div className="text-[10px] font-black uppercase opacity-80 tracking-widest">Total Paper Weight</div>
          <div className="text-xl font-black md:text-3xl">{viewTotals.paperWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl border-2 border-black p-3 text-white md:p-4">
          <div className="text-[10px] font-black uppercase opacity-80 tracking-widest">Total Value</div>
          <div className="text-xl font-black md:text-3xl">{viewTotals.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* On phones the filters fold behind the filter icon (FilterBox). */}
      <FilterBox
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        active={Boolean(searchTerm || companyFilter.length || itemFilter)}
        onClear={() => { setSearchTerm(""); setCompanyFilter([]); setItemFilter(""); }}
        columns="grid-cols-1 md:grid-cols-2"
      >
        <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><MultiSelect value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
        <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
      </FilterBox>

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center px-6 py-12">
            {/* The centred loading card comes from the page loading boundary. */}
          </div>
        ) : (
        <div className="overflow-x-auto max-h-[70vh]">
          <table data-disable-table-pagination="true" className="min-w-full divide-y divide-black border-collapse border border-black">
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
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="REALIZATION PER KG" sortKey="realizationPerKg" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="SHEET WEIGHT" sortKey="sheetWeight" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Least Sheet Weight" sortKey="leastGsm" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Flute Batch" sortKey="fluteBatches" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Rate" sortKey="rate" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Value" sortKey="value" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Sample" sortKey="isSample" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="REMARK" sortKey="remarks" sort={sort} onToggle={toggleSort} align="left" /></th>
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
                      <td className="px-4 py-3 text-right text-[11px] font-bold text-black border border-black whitespace-nowrap">{index + 1}</td>
                      <td className="px-4 py-3 text-[11px] font-bold text-black border border-black whitespace-nowrap">{displayJobNo(p.transactionNo)}</td>
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
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.realizationPerKg)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.sheetWeight)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.leastGsm)}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-nowrap">{p.fluteBatches || "-"}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-nowrap">{formatDate(p.date)}</td>
                      <td className="px-4 py-3 text-right text-[11px] text-black border border-black whitespace-nowrap">{format2(p.rate)}</td>
                      <td className="px-4 py-3 text-right text-[11px] font-bold text-black border border-black whitespace-nowrap">{format2(value)}</td>
                      <td className="px-4 py-3 text-center text-[11px] text-black border border-black whitespace-nowrap">{isSample ? "Yes" : "No"}</td>
                      <td className="px-4 py-3 text-[11px] text-black border border-black whitespace-normal break-words min-w-[220px] max-w-[220px]">{p.remarks || "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {paginatedList.length > 0 ? (
              <tfoot className="bg-slate-100">
                <tr>
                  <td colSpan={18} className="px-4 py-3 text-[11px] font-bold text-black border border-black whitespace-nowrap text-left">TOTAL</td>
                  <td className="px-4 py-3 text-[11px] font-bold text-black border border-black whitespace-nowrap text-right">{viewTotals.paperWeight.toFixed(2)}</td>
                  <td colSpan={7} className="px-4 py-3 text-[11px] font-bold text-black border border-black whitespace-nowrap"></td>
                  <td className="px-4 py-3 text-[11px] font-bold text-black border border-black whitespace-nowrap text-right">{viewTotals.value.toFixed(2)}</td>
                  <td colSpan={2} className="px-4 py-3 text-[11px] font-bold text-black border border-black whitespace-nowrap"></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
