import React, { useEffect, useMemo, useState } from "react";
import { ReelSpecs, formatReelSpecs } from "../components/ReelSpecs";
import { useData } from "../hooks/useData";
import { MaterialIssue, MaterialIssueLine, MaterialIssueReelLine, Material } from "../types";
import { Select } from "../components/Select";
import { Trash2, Package, Layers, Disc, Search } from "lucide-react";
import { formatDate } from "../lib/serial";
import { isAutoProductionInterFirmIssue } from "../lib/materialIssueClassification";
import { ClientPagination } from "../components/ClientPagination";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

function isWithoutJobIssue(issueType?: string) {
  const t = String(issueType || "").trim().toLowerCase();
  return t === "general" || t === "without job" || t === "withoutjob" || t === "without_job";
}

function formatNumber(value: number) {
  const rounded = Math.round(Number(value || 0) * 100) / 100;
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  return rounded.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function resolveLineRate(line: MaterialIssueLine | undefined, material: Material | undefined) {
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

const issueTypeOptions = [
  { value: "all", label: "Types" },
  { value: "job", label: "Job Specific" },
  { value: "general", label: "Without Job" },
];

export function MaterialIssueMaster() {
  const [materialIssues, setMaterialIssues] = useData<MaterialIssue>("material-issues", [], { firmScope: "all" });
  const [issueLines] = useData<MaterialIssueLine>("material-issue-lines", [], { firmScope: "all" });
  const [reelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { firmScope: "all" });
  const [materials] = useData<Material>("materials", [], { firmScope: "all" });

  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Tabs: General material, MANUAL reel issues, QR (scanned) reel issues.
  const [activeTab, setActiveTab] = useState<"general" | "manual" | "qr">("general");
  const [reelView, setReelView] = useState<"summary" | "details">("details");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [reelFilter, setReelFilter] = useState("");

  const materialMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const issueLineMap = useMemo(() => new Map(issueLines.map((line) => [line.id, line])), [issueLines]);
  const operationalIssues = useMemo(
    () => materialIssues.filter((issue) => !isAutoProductionInterFirmIssue(issue)),
    [materialIssues]
  );
  const operationalIssueIds = useMemo(() => new Set(operationalIssues.map((issue) => issue.id)), [operationalIssues]);

  const materialOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    issueLines.forEach((line) => {
      if (!operationalIssueIds.has(line.materialIssueId)) return;
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
  }, [issueLines, reelLines, materialMap, operationalIssueIds]);

  const jobOptions = useMemo(() => {
    const jobs = new Set<string>();
    operationalIssues.forEach((issue) => {
      if (issue.jobNo) jobs.add(issue.jobNo);
    });
    reelLines.forEach((line) => {
      if (line.jobNo) jobs.add(line.jobNo);
    });
    return Array.from(jobs).sort().map((jobNo) => ({ value: jobNo, label: jobNo }));
  }, [operationalIssues, reelLines]);

  const reelOptions = useMemo(() => {
    return Array.from(new Set(reelLines.map((line) => line.ourReelNo).filter(Boolean)))
      .sort()
      .map((reelNo) => ({ value: reelNo, label: reelNo }));
  }, [reelLines]);

  const reelLineIdsByIssueLineId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    reelLines.forEach((line) => {
      const ids = map.get(line.materialIssueLineId) || new Set<string>();
      ids.add(line.ourReelNo);
      map.set(line.materialIssueLineId, ids);
    });
    return map;
  }, [reelLines]);

  const processedData = useMemo(() => {
    // Search: only the columns each tab's table shows.
    const words = searchWords(searchTerm);

    const filteredIssues = materialIssues.filter((issue) => {
      const issueDate = issue.date?.split("T")[0] || "";
      if (fromDate && issueDate < fromDate) return false;
      if (toDate && issueDate > toDate) return false;

      const isJob = !isWithoutJobIssue(issue.issueType);
      if (typeFilter === "job" && !isJob) return false;
      if (typeFilter === "general" && isJob) return false;

      return true;
    });

    const issueIds = new Set(filteredIssues.map((issue) => issue.id));
    const issueMap = new Map(filteredIssues.map((issue) => [issue.id, issue]));

    const matchesCommonFilters = (item: any) => {
      if (materialFilter && item.materialId !== materialFilter) return false;
      if (jobFilter && item.jobNo !== jobFilter) return false;
      return true;
    };

    const general = issueLines
      .filter((line) => issueIds.has(line.materialIssueId))
      .filter((line) => operationalIssueIds.has(line.materialIssueId))
      // A reel stays a reel even when its detail-row save failed or the record
      // predates reel-detail tracking. Classifying only by the presence of a
      // child reel row caused these orphaned reel issues to appear as general
      // material movements.
      .filter((line) => !reelLineIdsByIssueLineId.has(line.id))
      .filter((line) => String(materialMap.get(line.materialId)?.type || "").trim().toLowerCase() !== "reel")
      .map((line) => {
        const parent = issueMap.get(line.materialIssueId);
        if (!parent) return null;
        const material = materialMap.get(line.materialId);
        return {
          ...line,
          issueNo: parent.issueNo,
          date: parent.date,
          jobNo: parent.jobNo,
          remarks: parent.remarks,
          materialName: material?.name || "Unknown Material",
          issueType: parent.issueType,
          reelNos: Array.from(reelLineIdsByIssueLineId.get(line.id) || []).join(" "),
        };
      })
      .filter(Boolean)
      .filter((line: any) => {
        if (reelFilter && !String(line.reelNos || "").split(" ").includes(reelFilter)) return false;
        return matchesCommonFilters(line)
          && matchesTableSearch([line.issueNo, formatDate(line.date), line.jobNo, line.materialName, line.qty, line.uom, line.remarks], words);
      }) as any[];

    const reelDetails = reelLines
      .filter((line) => issueIds.has(line.materialIssueId))
      .map((reel) => {
        const parent = issueMap.get(reel.materialIssueId);
        if (!parent) return null;
        const material = materialMap.get(reel.materialId);
        const line = issueLineMap.get(reel.materialIssueLineId);
        const rate = resolveLineRate(line, material);
        const specs = material ? formatReelSpecs(material.gsm, material.bf, material.size, material.uom) : "Unknown";
        return {
          ...reel,
          issueNo: parent.issueNo,
          date: parent.date,
          jobNo: parent.jobNo,
          remarks: parent.remarks,
          // Reel issues saved before the method was recorded count as MANUAL.
          method: String(parent.issueMethod || "").toUpperCase() === "QR" ? "QR" : "MANUAL",
          specs,
          materialName: material?.name || "Unknown Material",
          issueType: parent.issueType,
          rate,
          value: Number(reel.weightKg || 0) * rate,
        };
      })
      .filter(Boolean)
      .filter((reel: any) => {
        if (reelFilter && reel.ourReelNo !== reelFilter) return false;
        return matchesCommonFilters(reel);
      }) as any[];

    const searchDetails = (rows: any[]) => rows.filter((reel) =>
      matchesTableSearch([reel.issueNo, formatDate(reel.date), reel.jobNo, reel.specs, reel.ourReelNo, formatNumber(reel.weightKg), formatNumber(reel.value)], words));

    const summarize = (rows: any[]) => {
      const summaryMap = new Map<string, any>();
      rows.forEach((reel) => {
        const key = `${reel.materialIssueId}_${reel.materialId}`;
        if (!summaryMap.has(key)) summaryMap.set(key, { ...reel, totalWeight: 0, totalValue: 0, reelCount: 0 });
        const existing = summaryMap.get(key);
        existing.totalWeight += Number(reel.weightKg || 0);
        existing.totalValue += Number(reel.value || 0);
        existing.reelCount += 1;
      });
      return Array.from(summaryMap.values())
        .filter((row) => matchesTableSearch([row.issueNo, formatDate(row.date), row.jobNo, row.specs, formatNumber(row.totalWeight), formatNumber(row.totalValue), row.reelCount], words))
        .sort((a, b) => b.date.localeCompare(a.date));
    };

    const finalGeneral = general.sort((a, b) => b.date.localeCompare(a.date));
    const finalReelDetails = reelDetails.sort((a, b) => b.date.localeCompare(a.date));
    const allManualDetails = finalReelDetails.filter((row) => row.method === "MANUAL");
    const allQrDetails = finalReelDetails.filter((row) => row.method === "QR");
    const manualDetails = searchDetails(allManualDetails);
    const qrDetails = searchDetails(allQrDetails);

    // Tiles per tab, from that tab's rows only (so they always match the table).
    const reelMetrics = (rows: any[]) => ({
      issues: new Set(rows.map((row) => row.materialIssueId)).size,
      reels: rows.length,
      weight: rows.reduce((sum, row) => sum + Number(row.weightKg || 0), 0),
      value: rows.reduce((sum, row) => sum + Number(row.value || 0), 0),
    });
    const generalIssueIds = new Set(finalGeneral.map((row) => row.materialIssueId));
    const metrics = {
      general: {
        issues: generalIssueIds.size,
        lines: finalGeneral.length,
        withoutJob: filteredIssues.filter((issue) => generalIssueIds.has(issue.id) && isWithoutJobIssue(issue.issueType)).length,
        value: finalGeneral.reduce((sum, row) => {
          const rate = resolveLineRate(row, materialMap.get(row.materialId));
          return sum + (Number(row.amount || 0) > 0 ? Number(row.amount) : Number(row.qty || 0) * rate);
        }, 0),
      },
      manual: reelMetrics(manualDetails),
      qr: reelMetrics(qrDetails),
    };

    return {
      general: finalGeneral,
      manualDetails,
      manualSummary: summarize(allManualDetails),
      qrDetails,
      qrSummary: summarize(allQrDetails),
      metrics,
    };
  }, [materialIssues, operationalIssueIds, issueLines, reelLines, reelLineIdsByIssueLineId, materialMap, issueLineMap, searchTerm, fromDate, toDate, typeFilter, materialFilter, jobFilter, reelFilter]);

  const activeRows = activeTab === "general"
    ? processedData.general
    : activeTab === "manual"
      ? (reelView === "summary" ? processedData.manualSummary : processedData.manualDetails)
      : (reelView === "summary" ? processedData.qrSummary : processedData.qrDetails);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const paginatedRows = activeRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [activeTab, reelView, searchTerm, fromDate, toDate, typeFilter, materialFilter, jobFilter, reelFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleDelete = (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    setMaterialIssues((prev) => prev.filter((row) => row.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-black">
        <div>
          <h2 className="text-xl font-bold text-black uppercase tracking-tight">Material Issue Master</h2>
        </div>
      </div>

      {/* Tiles for the selected tab only */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {activeTab === "general" ? (
          <>
            <IssueTile tone="indigo" label="Issues" value={processedData.metrics.general.issues.toLocaleString()} />
            <IssueTile tone="emerald" label="Lines" value={processedData.metrics.general.lines.toLocaleString()} />
            <IssueTile tone="amber" label="Without Job" value={processedData.metrics.general.withoutJob.toLocaleString()} />
            <IssueTile tone="rose" label="Value" value={formatNumber(processedData.metrics.general.value)} />
          </>
        ) : (
          <>
            <IssueTile tone="indigo" label="Issues" value={processedData.metrics[activeTab].issues.toLocaleString()} />
            <IssueTile tone="emerald" label="Reels" value={processedData.metrics[activeTab].reels.toLocaleString()} />
            <IssueTile tone="amber" label="Weight" value={`${formatNumber(processedData.metrics[activeTab].weight)} KG`} />
            <IssueTile tone="rose" label="Value" value={formatNumber(processedData.metrics[activeTab].value)} />
          </>
        )}
      </div>

      <div className="rounded border border-black bg-white p-3">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[minmax(260px,1.4fr)_repeat(6,minmax(140px,1fr))_auto] xl:items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search"
              className="w-full rounded border-2 border-black pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            />
          </div>
          <Select options={issueTypeOptions} value={typeFilter} onChange={(value) => setTypeFilter(value || "all")} placeholder="Types" />
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
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>
      {/* Tabs (same style on desktop and phones; scroll sideways if needed) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Issue type">
          {([
            ["general", "General Material Issue", processedData.general.length, Package],
            ["manual", "MANUAL", processedData.manualDetails.length, Layers],
            ["qr", "QR", processedData.qrDetails.length, Disc],
          ] as const).map(([value, label, count, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => setActiveTab(value)}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border-2 px-3 py-2 text-sm font-bold transition ${
                activeTab === value ? "border-indigo-700 bg-indigo-700 text-white" : "border-black bg-white text-black hover:bg-slate-50"
              }`}
            >
              <Icon size={14} /> {label}
              <span className={`rounded-full px-2 text-xs font-black ${activeTab === value ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-700"}`}>{count}</span>
            </button>
          ))}
        </div>
        {activeTab !== "general" ? (
          <div className="inline-flex overflow-hidden rounded-md border-2 border-black" role="group" aria-label="Reel view">
            {(["summary", "details"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setReelView(view)}
                className={`px-3 py-1.5 text-xs font-black uppercase ${reelView === view ? "bg-black text-white" : "bg-white text-black hover:bg-slate-50"}`}
              >
                {view === "summary" ? "Summary" : "Details"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-b shadow-sm overflow-hidden border border-black">
        <div className="overflow-x-auto">
          {activeTab === "general" && (
            <table className="min-w-full divide-y divide-black border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-100">
                <tr className="divide-x divide-black">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Issue No</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Job No</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Material</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">UOM</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                {processedData.general.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="h-16" aria-label="No records" />
                  </tr>
                ) : (
                  paginatedRows.map((row: any) => (
                    <tr key={row.id} className="divide-x divide-black hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-indigo-700">{row.issueNo}</td>
                      <td className="px-4 py-3 text-sm">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{row.jobNo || "-"}</td>
                      <td className="px-4 py-3 text-sm">{row.materialName}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-indigo-600">{row.qty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm uppercase">{row.uom}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 italic">{row.remarks || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab !== "general" && reelView === "summary" && (
            <table className="min-w-full divide-y divide-black border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-100">
                <tr className="divide-x divide-black">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Issue No</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Job No</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Material Specs</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase">Total Weight (KG)</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase">Total Value</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">Reel Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                {activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="h-16" aria-label="No records" />
                  </tr>
                ) : (
                  paginatedRows.map((row: any, idx) => (
                    <tr key={idx} className="divide-x divide-black hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-emerald-700">{row.issueNo}</td>
                      <td className="px-4 py-3 text-sm">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{row.jobNo || "-"}</td>
                      <td className="px-4 py-3 text-sm"><ReelSpecs text={row.specs} /></td>
                      <td className="px-4 py-3 text-sm text-right font-black text-emerald-600">{formatNumber(row.totalWeight)}</td>
                      <td className="px-4 py-3 text-sm text-right font-black text-cyan-700">{formatNumber(row.totalValue)}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold">{row.reelCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab !== "general" && reelView === "details" && (
            <table className="min-w-full divide-y divide-black border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-100">
                <tr className="divide-x divide-black">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Issue No</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Job No</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Material Specs</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Our Reel No</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase">Weight (KG)</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                {activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="h-16" aria-label="No records" />
                  </tr>
                ) : (
                  paginatedRows.map((row: any) => (
                    <tr key={row.id} className="divide-x divide-black hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-amber-700">{row.issueNo}</td>
                      <td className="px-4 py-3 text-sm">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 text-sm font-medium">{row.jobNo || "-"}</td>
                      <td className="px-4 py-3 text-sm"><ReelSpecs text={row.specs} /></td>
                      <td className="px-4 py-3 text-sm font-black text-slate-900">{row.ourReelNo}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-amber-600">{formatNumber(row.weightKg)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-cyan-700">{formatNumber(row.value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <ClientPagination
          page={page}
          pageSize={pageSize}
          totalItems={activeRows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[50, 100, 250]}
        />
      </div>
    </div>
  );
}

const ISSUE_TILE_TONES = {
  indigo: "bg-indigo-50 text-indigo-900",
  emerald: "bg-emerald-50 text-emerald-900",
  amber: "bg-amber-50 text-amber-900",
  rose: "bg-rose-50 text-rose-900",
} as const;

function IssueTile({ label, value, tone }: { label: string; value: string; tone: keyof typeof ISSUE_TILE_TONES }) {
  return (
    <div className={`rounded-lg border-2 border-black p-3 ${ISSUE_TILE_TONES[tone]}`}>
      <div className="text-[11px] font-black uppercase tracking-wide">{label}</div>
      <div className="text-xl font-black tabular-nums">{value}</div>
    </div>
  );
}
