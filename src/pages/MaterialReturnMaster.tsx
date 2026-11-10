import React, { useEffect, useMemo, useState } from "react";
import { ReelSpecs, formatReelSpecs } from "../components/ReelSpecs";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { useData } from "../hooks/useData";
import { MaterialReturn, MaterialReturnLine, MaterialReturnReelLine, Material, Production, Setting, Firm } from "../types";
import { Select } from "../components/Select";
import { Trash2, Package, Layers, Disc, Search, Download } from "lucide-react";
import { formatDate } from "../lib/serial";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { downloadReturnReelQrPdf } from "../lib/returnReelQrPdf";

function formatNumber(value: number) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  return rounded.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function resolveLineRate(line: MaterialReturnLine | undefined, material: Material | undefined) {
  const qty = Number(line?.qty || 0);
  const amount = Number(line?.amount || 0);
  if (qty > 0 && amount > 0) return amount / qty;

  const candidates = [line?.rate, line?.lastPurchaseRate, line?.openingRate, material?.openingRate];
  for (const candidate of candidates) {
    const rate = Number(candidate || 0);
    if (rate > 0) return rate;
  }
  return 0;
}

const returnTypeOptions = [
  { value: "all", label: "Types" },
  { value: "job", label: "Job Specific" },
  { value: "general", label: "General" },
];

export function MaterialReturnMaster() {
  const [materialReturns, setMaterialReturns] = useData<MaterialReturn>("material-returns", [], { firmScope: "all" });
  const [returnLines] = useData<MaterialReturnLine>("material-return-lines", [], { firmScope: "all" });
  const [reelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { firmScope: "all" });
  const [materials] = useData<Material>("materials", [], { firmScope: "all" });
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [settings] = useData<Setting>("settings", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });

  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "reel-summary" | "reel-details">("general");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [reelFilter, setReelFilter] = useState("");

  const materialMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const returnLineMap = useMemo(() => new Map(returnLines.map((line) => [line.id, line])), [returnLines]);

  const materialOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    returnLines.forEach((line) => {
      const material = materialMap.get(line.materialId);
      if (material) optionMap.set(material.id, material.name);
    });
    reelLines.forEach((line) => {
      const material = materialMap.get(line.materialId);
      if (material) optionMap.set(material.id, material.name);
    });
    return Array.from(optionMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [returnLines, reelLines, materialMap]);

  const jobOptions = useMemo(() => {
    const jobs = new Set<string>();
    materialReturns.forEach((returnEntry) => {
      if (returnEntry.jobNo) jobs.add(returnEntry.jobNo);
    });
    reelLines.forEach((line) => {
      if (line.jobNo) jobs.add(line.jobNo);
    });
    return Array.from(jobs).sort().map((jobNo) => ({ value: jobNo, label: jobNo }));
  }, [materialReturns, reelLines]);

  const reelOptions = useMemo(() => {
    return Array.from(new Set(reelLines.map((line) => line.ourReelNo).filter(Boolean)))
      .sort()
      .map((reelNo) => ({ value: reelNo, label: reelNo }));
  }, [reelLines]);

  const processedData = useMemo(() => {
    // Search: only the columns each tab's table shows.
    const words = searchWords(searchTerm);

    const filteredReturns = materialReturns.filter((returnEntry) => {
      const returnDate = returnEntry.date?.split("T")[0] || "";
      if (fromDate && returnDate < fromDate) return false;
      if (toDate && returnDate > toDate) return false;

      const isJob = returnEntry.returnType === "Job";
      if (typeFilter === "job" && !isJob) return false;
      if (typeFilter === "general" && isJob) return false;

      return true;
    });

    const returnIds = new Set(filteredReturns.map((returnEntry) => returnEntry.id));
    const returnMap = new Map(filteredReturns.map((returnEntry) => [returnEntry.id, returnEntry]));

    const matchesCommonFilters = (item: any) => {
      if (materialFilter && item.materialId !== materialFilter) return false;
      if (jobFilter && item.jobNo !== jobFilter) return false;
      return true;
    };

    const general = returnLines
      .filter((line) => returnIds.has(line.materialReturnId))
      .filter((line) => !reelLines.some((reel) => reel.materialReturnLineId === line.id))
      .filter((line) => String(materialMap.get(line.materialId)?.type || "").trim().toLowerCase() !== "reel")
      .map((line) => {
        const parent = returnMap.get(line.materialReturnId);
        if (!parent) return null;
        const material = materialMap.get(line.materialId);
        return {
          ...line,
          returnNo: parent.returnNo,
          date: parent.date,
          jobNo: parent.jobNo,
          remarks: parent.remarks,
          materialName: material?.name || "Unknown Material",
          returnType: parent.returnType,
          value: Number(line.qty || 0) * resolveLineRate(line, material),
          reelNos: reelLines
            .filter((reel) => reel.materialReturnLineId === line.id)
            .map((reel) => reel.ourReelNo)
            .join(" "),
        };
      })
      .filter(Boolean)
      .filter((line: any) => {
        if (reelFilter && !String(line.reelNos || "").split(" ").includes(reelFilter)) return false;
        return matchesCommonFilters(line)
          && matchesTableSearch([line.returnNo, formatDate(line.date), line.jobNo, line.materialName, line.qty, line.uom, line.value, line.remarks], words);
      }) as any[];

    const reelDetails = reelLines
      .filter((line) => returnIds.has(line.materialReturnId))
      .map((reel) => {
        const parent = returnMap.get(reel.materialReturnId);
        if (!parent) return null;
        const material = materialMap.get(reel.materialId);
        const line = returnLineMap.get(reel.materialReturnLineId);
        const rate = resolveLineRate(line, material);
        const specs = material ? formatReelSpecs(material.gsm, material.bf, material.size, material.uom) : "Unknown";
        return {
          ...reel,
          returnNo: parent.returnNo,
          date: parent.date,
          jobNo: parent.jobNo,
          remarks: parent.remarks,
          specs,
          materialName: material?.name || "Unknown Material",
          materialCode: material?.erpCode || "",
          returnType: parent.returnType,
          rate,
          value: Number(reel.weightKg || 0) * rate,
        };
      })
      .filter(Boolean)
      .filter((reel: any) => {
        if (reelFilter && reel.ourReelNo !== reelFilter) return false;
        return matchesCommonFilters(reel);
      }) as any[];
    const searchedReelDetails = reelDetails.filter((reel) =>
      matchesTableSearch([reel.returnNo, formatDate(reel.date), reel.jobNo, reel.specs, reel.ourReelNo, reel.weightKg, reel.value], words));

    const summaryMap = new Map<string, any>();
    reelDetails.forEach((reel) => {
      const key = `${reel.materialReturnId}_${reel.materialId}`;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          ...reel,
          totalWeight: 0,
          totalValue: 0,
          reelCount: 0,
        });
      }
      const existing = summaryMap.get(key);
      existing.totalWeight += Number(reel.weightKg || 0);
      existing.totalValue += Number(reel.value || 0);
      existing.reelCount += 1;
    });

    const finalGeneral = general.sort((a, b) => b.date.localeCompare(a.date));
    const finalReelSummary = Array.from(summaryMap.values())
      .filter((row) => matchesTableSearch([row.returnNo, formatDate(row.date), row.jobNo, row.specs, row.totalWeight, row.totalValue, row.reelCount], words))
      .sort((a, b) => b.date.localeCompare(a.date));
    const finalReelDetails = searchedReelDetails.sort((a, b) => b.date.localeCompare(a.date));
    const visibleReturnIds = new Set([...finalGeneral, ...finalReelDetails].map((row) => row.materialReturnId));
    const visibleReturns = filteredReturns.filter((returnEntry) => visibleReturnIds.has(returnEntry.id));

    const reelReturnCount = new Set(finalReelDetails.map((row) => row.materialReturnId)).size;
    const reelWeight = finalReelDetails.reduce((sum, row) => sum + Number(row.weightKg || 0), 0);
    const reelValue = finalReelDetails.reduce((sum, row) => sum + Number(row.value || 0), 0);
    const tabMetrics = {
      general: {
        count: new Set(finalGeneral.map((row) => row.materialReturnId)).size,
        countNote: `${finalGeneral.length.toLocaleString()} lines`,
        amount: finalGeneral.reduce((sum, row) => sum + Number(row.qty || 0), 0),
        value: finalGeneral.reduce((sum, row) => sum + Number(row.value || 0), 0),
      },
      "reel-summary": { count: reelReturnCount, countNote: `${finalReelSummary.length.toLocaleString()} lines`, amount: reelWeight, value: reelValue },
      "reel-details": { count: finalReelDetails.length, countNote: `${reelReturnCount.toLocaleString()} returns`, amount: reelWeight, value: reelValue },
    };
    const metrics = {
      tabs: tabMetrics,
      totalTransactions: visibleReturns.length,
      totalWeight: finalReelDetails.reduce((sum, row) => sum + Number(row.weightKg || 0), 0),
      totalValue: finalReelDetails.reduce((sum, row) => sum + Number(row.value || 0), 0),
      jobReturns: visibleReturns.filter((returnEntry) => returnEntry.returnType === "Job").length,
      generalReturns: visibleReturns.filter((returnEntry) => returnEntry.returnType !== "Job").length,
    };

    return {
      general: finalGeneral,
      reelSummary: finalReelSummary,
      reelDetails: finalReelDetails,
      metrics,
    };
  }, [materialReturns, returnLines, reelLines, materialMap, returnLineMap, searchTerm, fromDate, toDate, typeFilter, materialFilter, jobFilter, reelFilter]);

  const handleDownloadReturnQrPdf = async (row: any) => {
    try {
      await downloadReturnReelQrPdf({
        returnNo: row.returnNo || "",
        date: row.date || "",
        jobNo: row.jobNo || "",
        materialName: row.materialName || "",
        materialCode: row.materialCode || "",
        specs: row.specs || "",
        reelNo: row.ourReelNo || "",
        weight: Number(row.weightKg || 0),
        setting: settings[0] || null,
        firmId: row.firmId || undefined,
        firms,
      });
    } catch (error) {
      console.error("Failed to generate return reel QR PDF", error);
      alert(error instanceof Error ? error.message : "Failed to generate return reel QR PDF.");
    }
  };

  const handleDelete = (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    setMaterialReturns((prev) => prev.filter((row) => row.id !== id));
    setDeletingId(null);
  };

  const getJobDate = (productionId?: string) =>
    productions.find((p) => p.id === productionId)?.date || "";

  const activeMetrics = processedData.metrics.tabs[activeTab];

  const qrButton = (row: any) => (
    <button
      type="button"
      onClick={() => handleDownloadReturnQrPdf(row)}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border-2 border-indigo-700 bg-white px-2 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
      title="Download return reel QR PDF"
    >
      <Download size={12} /> QR
    </button>
  );

  const tabRows = activeTab === "general"
    ? processedData.general
    : activeTab === "reel-summary"
      ? processedData.reelSummary
      : processedData.reelDetails;
  // Column sorting on the whole filtered list (keys are the row fields each column shows).
  const { sorted: activeRows, sort, toggle: toggleSort, setSort } = useTableSort(tabRows as any[], (row: any, key) => row[key]);
  useEffect(() => { setSort(null); }, [activeTab, setSort]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems,
  } = useClientPagination(activeRows, 25);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm, fromDate, toDate, typeFilter, materialFilter, jobFilter, reelFilter, setPage]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center pb-3 border-b border-black">
        <div>
          <h2 className="text-xl font-bold text-black uppercase tracking-tight">Material Return Master</h2>
        </div>
      </div>

      {/* Tiles follow the selected tab and the active filters. */}
      <div className="grid grid-cols-3 gap-3">
        <ReturnTile tone="bg-indigo-50 text-indigo-900" label="Count" value={activeMetrics.count.toLocaleString()} note={activeMetrics.countNote} />
        <ReturnTile tone="bg-amber-50 text-amber-900" label={activeTab === "general" ? "Qty" : "KG"} value={formatNumber(activeMetrics.amount)} />
        <ReturnTile tone="bg-rose-50 text-rose-900" label="Value" value={formatNumber(activeMetrics.value)} />
      </div>

      <div className="grid gap-3 rounded border border-black bg-white p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(260px,1.4fr)_repeat(6,minmax(130px,1fr))_auto] xl:items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search"
              className="w-full rounded border-2 border-black pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            />
          </div>
          <Select options={returnTypeOptions} value={typeFilter} onChange={(value) => setTypeFilter(value || "all")} placeholder="Types" />
          <Select options={materialOptions} value={materialFilter} onChange={setMaterialFilter} placeholder="Materials" />
          <Select options={jobOptions} value={jobFilter} onChange={setJobFilter} placeholder="Jobs" />
          <Select options={reelOptions} value={reelFilter} onChange={setReelFilter} placeholder="Reels" />
          <label className="block min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          /></label>
          <label className="block min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          /></label>
          {(fromDate || toDate || typeFilter !== "all" || searchTerm || materialFilter || jobFilter || reelFilter) ? (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setTypeFilter("all");
                setSearchTerm("");
                setMaterialFilter("");
                setJobFilter("");
                setReelFilter("");
              }}
              className="rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50"
            >
              Clear
            </button>
          ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {([
          ["general", "General Material", processedData.general.length, Package],
          ["reel-summary", "Reel Summary", processedData.reelSummary.length, Layers],
          ["reel-details", "Reel Details", processedData.reelDetails.length, Disc],
        ] as const).map(([key, label, count, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-bold ${activeTab === key ? "border-indigo-700 bg-indigo-700 text-white" : "border-black bg-white text-black"}`}
          >
            <Icon size={14} /> {label}
            <span className={`rounded-full px-1.5 text-[11px] font-black ${activeTab === key ? "bg-white text-indigo-700" : "bg-slate-200 text-slate-700"}`}>{count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      {/* Desktop tables (also shown on phones when empty) */}
      <div className={`${activeRows.length === 0 ? "block" : "hidden md:block"} overflow-x-auto rounded border border-black bg-white`}>
        {activeTab === "general" && (
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
              <tr>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Return No" sortKey="returnNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Job No" sortKey="jobNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Material" sortKey="materialName" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-right"><SortHeader label="Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="UOM" sortKey="uom" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-right"><SortHeader label="Value" sortKey="value" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Remarks" sortKey="remarks" sort={sort} onToggle={toggleSort} align="left" /></th>
              </tr>
            </thead>
            <tbody>
              {activeRows.length === 0 ? (
                <tr><td colSpan={8} className="h-16" aria-label="No records" /></tr>
              ) : paginatedItems.map((row: any) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border border-black px-3 py-2 font-bold text-indigo-700">{row.returnNo}</td>
                  <td className="border border-black px-3 py-2">{formatDate(row.date)}</td>
                  <td className="border border-black px-3 py-2 font-medium">{row.jobNo || "-"}</td>
                  <td className="border border-black px-3 py-2">{row.materialName}</td>
                  <td className="border border-black px-3 py-2 text-right font-bold text-indigo-600">{formatNumber(row.qty)}</td>
                  <td className="border border-black px-3 py-2 uppercase">{row.uom}</td>
                  <td className="border border-black px-3 py-2 text-right font-bold text-cyan-700">{formatNumber(row.value)}</td>
                  <td className="border border-black px-3 py-2 text-slate-500">{row.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === "reel-summary" && (
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
              <tr>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Return No" sortKey="returnNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Job No" sortKey="jobNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Material Specs" sortKey="specs" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-right"><SortHeader label="Weight (KG)" sortKey="totalWeight" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-right"><SortHeader label="Value" sortKey="totalValue" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-center"><SortHeader label="Reels" sortKey="reelCount" sort={sort} onToggle={toggleSort} align="center" /></th>
              </tr>
            </thead>
            <tbody>
              {activeRows.length === 0 ? (
                <tr><td colSpan={7} className="h-16" aria-label="No records" /></tr>
              ) : paginatedItems.map((row: any, idx) => (
                <tr key={`${row.materialReturnId}-${row.materialId}-${idx}`} className="hover:bg-slate-50">
                  <td className="border border-black px-3 py-2 font-bold text-emerald-700">{row.returnNo}</td>
                  <td className="border border-black px-3 py-2">{formatDate(row.date)}</td>
                  <td className="border border-black px-3 py-2 font-medium">{row.jobNo || "-"}</td>
                  <td className="border border-black px-3 py-2"><ReelSpecs text={row.specs} /></td>
                  <td className="border border-black px-3 py-2 text-right font-black text-emerald-600">{formatNumber(row.totalWeight)}</td>
                  <td className="border border-black px-3 py-2 text-right font-black text-cyan-700">{formatNumber(row.totalValue)}</td>
                  <td className="border border-black px-3 py-2 text-center font-bold">{row.reelCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === "reel-details" && (
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
              <tr>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Return No" sortKey="returnNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Job No" sortKey="jobNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Material Specs" sortKey="specs" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-left"><SortHeader label="Our Reel No" sortKey="ourReelNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="border border-black px-3 py-3 text-right"><SortHeader label="Weight (KG)" sortKey="weightKg" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-right"><SortHeader label="Value" sortKey="value" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-center">QR PDF</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.length === 0 ? (
                <tr><td colSpan={8} className="h-16" aria-label="No records" /></tr>
              ) : paginatedItems.map((row: any) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border border-black px-3 py-2 font-bold text-amber-700">{row.returnNo}</td>
                  <td className="border border-black px-3 py-2">{formatDate(row.date)}</td>
                  <td className="border border-black px-3 py-2 font-medium">{row.jobNo || "-"}</td>
                  <td className="border border-black px-3 py-2"><ReelSpecs text={row.specs} /></td>
                  <td className="border border-black px-3 py-2 font-black">{row.ourReelNo}</td>
                  <td className="border border-black px-3 py-2 text-right font-bold text-amber-600">{formatNumber(row.weightKg)}</td>
                  <td className="border border-black px-3 py-2 text-right font-bold text-cyan-700">{formatNumber(row.value)}</td>
                  <td className="border border-black px-3 py-2 text-center">{qrButton(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Phone cards */}
      {activeRows.length > 0 ? (
        <div className="space-y-3 md:hidden">
          {paginatedItems.map((row: any, idx) => (
            <div key={`${row.id}-${idx}`} className="rounded-md border-2 border-black bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-black">{row.returnNo}</div>
                  <div className="text-xs font-semibold text-slate-600">{formatDate(row.date)}{row.jobNo ? ` · ${row.jobNo}` : ""}</div>
                </div>
                {activeTab === "reel-details" ? qrButton(row) : null}
              </div>
              <div className="mt-1 text-sm">
                {activeTab === "general" ? row.materialName : <ReelSpecs text={row.specs} />}
              </div>
              {activeTab === "reel-details" ? <div className="mt-1 text-xs font-bold">Reel {row.ourReelNo}</div> : null}
              <div className="mt-2 grid grid-cols-2 gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                <div>
                  <div className="font-bold text-slate-500">{activeTab === "general" ? "Qty" : activeTab === "reel-summary" ? `KG · ${row.reelCount} reels` : "KG"}</div>
                  <div className="text-sm font-black tabular-nums">{activeTab === "general" ? `${formatNumber(row.qty)} ${row.uom || ""}` : formatNumber(activeTab === "reel-summary" ? row.totalWeight : row.weightKg)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-500">Value</div>
                  <div className="text-sm font-black tabular-nums text-cyan-700">{formatNumber(activeTab === "reel-summary" ? row.totalValue : row.value)}</div>
                </div>
              </div>
              {activeTab === "general" && row.remarks ? <div className="mt-1 text-xs text-slate-600">{row.remarks}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}

function ReturnTile({ label, value, note, tone }: { label: string; value: string; note?: string; tone: string }) {
  return (
    <div className={`rounded-lg border-2 border-black p-3 ${tone}`}>
      <div className="text-[11px] font-black uppercase tracking-wide">{label}</div>
      <div className="text-xl font-black tabular-nums">{value}</div>
      {note ? <div className="text-[11px] font-semibold opacity-80">{note}</div> : null}
    </div>
  );
}
