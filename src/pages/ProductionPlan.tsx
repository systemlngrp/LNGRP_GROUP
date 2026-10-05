import React, { useEffect, useState, useMemo } from "react";
import { useData } from "../hooks/useData";
import { Production, OrderSchedule, Order, Company, SampleRequest, Item, Setting } from "../types";
import { formatDate } from "../lib/serial";
import { TableControls } from "../components/TableControls";
import { Select } from "../components/Select";
import { ExcelExport } from "../components/ExcelExport";
import { ClientPagination } from "../components/ClientPagination";
import { Spinner } from "../components/Spinner";
import { FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportsAllowed } from "../lib/exportPolicy";
import { fetchNpdItems } from "../lib/npdItems";
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
  const [npdItems, setNpdItems] = useState<Item[]>([]);
  const [npdLoading, setNpdLoading] = useState(true);

  useEffect(() => {
    setNpdLoading(true);
    fetchNpdItems()
      .then(setNpdItems)
      .catch((error) => {
        console.error("Failed to fetch NPD items for Production Plan:", error);
        setNpdItems([]);
      })
      .finally(() => setNpdLoading(false));
  }, []);

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
    settingsLoading ||
    npdLoading;

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
        return p.transactionNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order?.orderNo || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        resolvedCompany.name.toLowerCase().includes(searchTerm.toLowerCase());
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
  }, [productions, selectedDate, searchTerm, companyFilter, itemFilter, npdItems, schedules, orders, companies]);

  const companyOptions = useMemo(() => Array.from(new Map(filteredList.map((row) => [
    row.productionPlanCompanyId || row.productionPlanCompanyName,
    { value: row.productionPlanCompanyId || row.productionPlanCompanyName, label: row.productionPlanCompanyName },
  ])).values()).filter((option) => option.value && option.label && option.label !== "-").sort((a, b) => a.label.localeCompare(b.label)), [filteredList]);
  const itemOptions = useMemo(() => Array.from(new Map(filteredList.map((row) => { const item = npdItems.find((i) => i.id === String(row.itemId || "").trim()); const erp = String(row.erpCode || ""); const name = item?.name || ""; const key = item?.id || `${name}::${erp}`; return [key, { value: key, label: erp && name && !name.toLowerCase().includes(erp.toLowerCase()) ? `${name} - ${erp}` : name || erp, searchText: `${name} ${erp}` }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [filteredList, npdItems]);
  const sortedList = useMemo(() => sortProductionPlanRows(filteredList), [filteredList]);
  const statusRows = useMemo(
    () => deriveProductionPlanStatuses(sortedList, sampleJobNumbers, requiredRealization),
    [sortedList, sampleJobNumbers, requiredRealization]
  );
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedList,
  } = useClientPagination(statusRows, 25);

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
    const doc = new jsPDF('landscape', 'mm', 'a3');
    doc.setFontSize(16);
    doc.text(`Production Plan - ${formatDate(selectedDate)}`, 14, 15);
    doc.setFontSize(10);
    
    const exportData = statusRows.map((p, index) => {
      const schedule = schedules.find(s => s.id === p.scheduleId);
      const order = orders.find(o => o.id === schedule?.orderId);
      const company = resolveProductionPlanCompany(p, schedule, order, companies);
      const item = npdItems.find(i => i.id === String(p.itemId || "").trim());
      const value = (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
      return {
        "Sr. No.": index + 1, "Job No": p.transactionNo || "-", "Company Name": company.name,
        "Item Name": item?.name || "-", "ERP CODE": p.erpCode || "-", "UPS": format2(p.ups), "Plan QTY": format2(p.qty),
        "Reel As Per Calculation": format2(p.reelAsPerCalc), "REEL Actual with TRIMMING": format2(p.reelActualWithTrimming),
        "CUTTING with TRIMMING": format2(p.cuttingWithTrimming), "PLY": format2(p.ply), "FLUTE": p.flute || "-",
        "L1": format2(p.l1), "F1": format2(p.f1), "L2": format2(p.l2), "F2": format2(p.f2), "L3": format2(p.l3), "GSM": format2(p.gsm),
        "TOTAL Paper WEIGHT": format2(p.totalPaperWeight), "Planned Production in Meter": format2(p.plannedProductionInMeter),
        "REMARK": p.remarks || "-", "REALIZATION PER KG": format2(p.realizationPerKg), "SHEET WEIGHT": format2(p.sheetWeight),
        "Least Sheet Weight": format2(p.leastGsm), "Flute Batch": p.fluteBatches || "-", "Job Sequence": p.sequence || "-",
        "Date": formatDate(p.date), "Rate": format2(p.rate), "Value": format2(value), "Sample": p.isSample ? "Yes" : "No",
      } as Record<string, string | number>;
    });
    if (exportData.length === 0) return;

    const tableColumn = Object.keys(exportData[0]);
    const tableRows = exportData.map(row => Object.values(row));

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: 1 },
      headStyles: { fillColor: [200, 200, 200], textColor: 0, fontStyle: 'bold' },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const production = statusRows[data.row.index];
        if (!production) return;
        if (!production.shouldHighlight) return;
        data.cell.styles.fillColor = [255, 153, 153];
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
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded font-bold hover:bg-red-700 transition shadow border border-black text-sm"
              >
                <FileText size={16} /> PDF
              </button>
            </>
          ) : null}
        </div>
      </div>

      {sequenceError ? <div className="rounded border border-red-700 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{sequenceError}</div> : null}

      <div className="grid gap-3 md:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1fr)_minmax(260px,1.1fr)_auto] md:items-center">
        <TableControls
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search jobs..."
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
            <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
              <Spinner size={28} />
              <span>Loading production plan...</span>
            </div>
          </div>
        ) : (
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="min-w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 sticky top-0 z-10">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Sr. No.</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Job No</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Company Name</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Item Name</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">ERP CODE</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">UPS</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Plan QTY</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Reel As Per Calculation</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">REEL Actual with TRIMMING</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">CUTTING with TRIMMING</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">PLY</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">FLUTE</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">L1</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">F1</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">L2</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">F2</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">L3</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">GSM</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">TOTAL Paper WEIGHT</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Planned Production in Meter</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">REMARK</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">REALIZATION PER KG</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">SHEET WEIGHT</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Least Sheet Weight</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Flute Batch</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Job Sequence</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Rate</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Value</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-black uppercase border border-black whitespace-nowrap">Sample</th>
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
