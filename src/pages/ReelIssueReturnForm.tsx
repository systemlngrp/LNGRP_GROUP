import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, BarChart3, Package2 } from "lucide-react";
import { useData } from "../hooks/useData";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Material,
  MaterialGroup,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Production,
  ProductionProcessing,
  Setting,
} from "../types";
import { generateTransactionNo } from "../lib/serial";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";

import { TableControls } from "../components/TableControls";
import { getAvailableReelPackingSlips } from "../lib/materialMovement";
import {
  buildProductionCorrugatedSheetUsageMap,
  buildProductionMaterialUsageMap,
  syncProductionWorkflowFromUsage,
} from "../lib/productionMaterialUsage";
import { isCorrugationLinerComplete } from "../lib/productionProcessingProgress";

type ReelLineDraft = {
  id: string;
  materialId: string;
};

function createEmptyReelLine(): ReelLineDraft {
  return { id: crypto.randomUUID(), materialId: "" };
}

function normalizeDate(value?: string | null) {
  return String(value || "").slice(0, 10);
}

function normalizeText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function formatCurrencyDisplay(value: number) {
  return `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ReelIssueReturnForm() {
  const [searchTerm, setSearchTerm] = useState('');

  // Simple DOM-based table row filter bound to the search input
  useEffect(() => {
    const q = searchTerm.trim().toLowerCase();
    const rows = document.querySelectorAll('table tbody tr');
    rows.forEach((row) => {
      const txt = (row.textContent || '').toLowerCase();
      (row as HTMLElement).style.display = q && !txt.includes(q) ? 'none' : '';
    });
  }, [searchTerm]);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [materials] = useData<Material>("materials", []);
  const [settings] = useData<Setting>("settings", []);
  const ourReelNoStartNumber = settings[0]?.ourReelNoStartNumber || 1;
  const [materialGroups] = useData<MaterialGroup>("material-groups", []);
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", []);
  const [materialIn] = useData<MaterialIn>("material-in", []);
  const [productions, setProductions] = useData<Production>("productions", []);
  const [processing] = useData<ProductionProcessing>("production_processing", []);

  const [materialIssues, setMaterialIssues] = useData<MaterialIssue>("material-issues", []);
  const [materialIssueLines, setMaterialIssueLines] = useData<MaterialIssueLine>("material-issue-lines", []);
  const [materialIssueReelLines, setMaterialIssueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", []);

  const [materialReturns] = useData<MaterialReturn>("material-returns", []);
  const [materialReturnLines] = useData<MaterialReturnLine>("material-return-lines", []);
  const [materialReturnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", []);

  const requestedDate = normalizeDate(searchParams.get("date"));
  const requestedProductionId = String(searchParams.get("productionId") || "").trim();
  const lockDate = searchParams.get("lockDate") === "1";
  const lockJob = searchParams.get("lockJob") === "1";

  const [date, setDate] = useState(() => requestedDate || new Date().toISOString().split("T")[0]);
  const [productionId, setProductionId] = useState(() => requestedProductionId);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [issueLines, setIssueLines] = useState<ReelLineDraft[]>([createEmptyReelLine()]);
  const [selectedIssueReels, setSelectedIssueReels] = useState<Record<string, string[]>>({});

  const selectedProduction = productions.find((production) => production.id === productionId) || null;
  const linerComplete = isCorrugationLinerComplete(processing, productionId);

  const getReelInvoiceRate = (slipId: string): number => {
    const slip = packingSlips.find((row) => row.id === slipId);
    if (!slip) {
      return Number(materials.find((row) => row.id === slipId)?.openingRate || 0);
    }
    const mrr = materialIn.find((row) => row.id === slip.materialInId);

    const line = mrr?.lines.find((row) => row.id === slip.materialLineId);
    const material = materials.find((row) => row.id === slip.materialId);
    return Number(line?.invoiceRate || line?.poRate || line?.rate || material?.openingRate || 0);
  };

  const consumptionSummary = useMemo(() => {
    let totalIssueWt = 0;
    let totalIssueVal = 0;

    Object.values(selectedIssueReels)
      .flat()
      .forEach((slipId) => {
        const slip = packingSlips.find((row) => row.id === slipId) ||
          getAvailableReelPackingSlips(slipId, packingSlips, materialIssueReelLines, materialReturnReelLines, materials, ourReelNoStartNumber)
            .find((row) => row.id === slipId);
        if (!slip) return;
        const weight = Number(slip.weightKg || 0);
        const rate = getReelInvoiceRate(slipId);
        totalIssueWt += weight;
        totalIssueVal += weight * rate;
      });

    return {
      issueWt: totalIssueWt,
      issueVal: totalIssueVal,
    };
  }, [selectedIssueReels, packingSlips, materialIn]);

  const jobOptions = useMemo(
    () =>
      productions
        .filter((production) => production.status !== "Cancelled")
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .map((production) => ({
          value: production.id,
          label: `${production.transactionNo}${production.date ? ` | ${production.date.split("T")[0]}` : ""}`,
        })),
    [productions]
  );

  const reelGroupIds = useMemo(
    () =>
      new Set(
        materialGroups
          .filter((group) => normalizeText(group.name) === "reel")
          .map((group) => group.id)
      ),
    [materialGroups]
  );

  const reelMaterialOptions = useMemo(
    () =>
      materials
        .filter((material) => {
          const isActive = normalizeText(material.active || "Yes") !== "no";
          const isReelType = normalizeText(material.type) === "reel";
          const isReelGroup = material.materialGroupId ? reelGroupIds.has(material.materialGroupId) : false;
          return isActive && (isReelType || isReelGroup);
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((material) => ({
          value: material.id,
          label: `${material.name}${material.erpCode ? ` (${material.erpCode})` : ""}`,
        })),
    [materials, reelGroupIds]
  );

  const getIssueAvailableReels = (materialId: string, currentLineId: string) => {
    const selectedElsewhere = new Set(
      Object.entries(selectedIssueReels)
        .filter(([lineId]) => lineId !== currentLineId)
        .flatMap(([, ids]) => ids)
    );
    return getAvailableReelPackingSlips(materialId, packingSlips, materialIssueReelLines, materialReturnReelLines, materials, ourReelNoStartNumber).filter(
      (slip) => !selectedElsewhere.has(slip.id)
    );
  };

  const addIssueLine = () => setIssueLines((prev) => [...prev, createEmptyReelLine()]);

  const removeIssueLine = (lineId: string) => {
    setIssueLines((prev) => (prev.length === 1 ? [createEmptyReelLine()] : prev.filter((line) => line.id !== lineId)));
    setSelectedIssueReels((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  };

  const updateSelectedIssueReels = (lineId: string, materialId: string, packingSlipId: string, checked: boolean) => {
    if (checked && !linerComplete) {
      alert("Complete Corrugation Liner as Full before issuing reels.");
      return;
    }
    setSelectedIssueReels((prev) => {
      const current = new Set(prev[lineId] || []);
      if (checked) current.add(packingSlipId);
      else current.delete(packingSlipId);

      const selectedElsewhere = new Set(
        Object.entries(prev)
          .filter(([id]) => id !== lineId)
          .flatMap(([, reelIds]) => reelIds)
      );
      if (checked && selectedElsewhere.has(packingSlipId)) {
        alert("This reel is already selected in another issue line.");
        return prev;
      }

      return { ...prev, [lineId]: Array.from(current) };
    });

  };

  const computeIssueLineWeight = (line: ReelLineDraft) => {
    const ids = selectedIssueReels[line.id] || [];
    return getAvailableReelPackingSlips(line.materialId, packingSlips, materialIssueReelLines, materialReturnReelLines, materials, ourReelNoStartNumber)
      .filter((slip) => ids.includes(slip.id))
      .reduce((sum, slip) => sum + Number(slip.weightKg || 0), 0);
  };

  const hasAnyIssue = issueLines.some((line) => line.materialId && (selectedIssueReels[line.id] || []).length > 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!date || !productionId) return;
    if (!hasAnyIssue) {
      alert("Select at least one reel to issue.");
      return;
    }
    if (hasAnyIssue && !linerComplete) {
      alert("Complete Corrugation Liner as Full before issuing reels.");
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const nextMaterialIssues = [...materialIssues];
      const nextMaterialIssueLines = [...materialIssueLines];
      const nextMaterialIssueReelLines = [...materialIssueReelLines];
      const nextMaterialReturns = [...materialReturns];
      const nextMaterialReturnLines = [...materialReturnLines];
      const nextMaterialReturnReelLines = [...materialReturnReelLines];

      if (hasAnyIssue) {
        const issueId = crypto.randomUUID();
        const issueNo = generateTransactionNo(
          "MIS",
          materialIssues.map((row) => ({ transactionNo: row.issueNo, date: row.date })),
          date
        );
        const issue: MaterialIssue = {
          id: issueId,
          issueNo,
          date,
          issueType: "Job",
          productionId,
          jobNo: selectedProduction?.transactionNo || "",
          remarks: remarks.trim() || undefined,
          updatedBy: "System User",
          updateTimestamp: timestamp,
        };

        const createdLines: MaterialIssueLine[] = [];
        const createdReelLines: MaterialIssueReelLine[] = [];

        issueLines
          .filter((line) => line.materialId && (selectedIssueReels[line.id] || []).length > 0)
          .forEach((line) => {
            const issueLineId = crypto.randomUUID();
            const totalWeight = computeIssueLineWeight(line);
            const reelIds = selectedIssueReels[line.id] || [];
            const totalValue = getAvailableReelPackingSlips(line.materialId, packingSlips, materialIssueReelLines, materialReturnReelLines, materials, ourReelNoStartNumber)
              .filter((slip) => reelIds.includes(slip.id))
              .reduce((sum, slip) => sum + Number(slip.weightKg || 0) * getReelInvoiceRate(slip.id), 0);
            const savedAmount = Number(totalValue.toFixed(2));
            const savedRate = totalWeight > 0 ? Number((savedAmount / totalWeight).toFixed(2)) : 0;
            const material = materials.find((row) => row.id === line.materialId);
            createdLines.push({
              id: issueLineId,
              materialIssueId: issueId,
              materialId: line.materialId,
              qty: Number(totalWeight.toFixed(2)),
              uom: "KG",
              lastPurchaseRate: savedRate,
              openingRate: Number(Number(material?.openingRate || 0).toFixed(2)),
              rate: savedRate,
              amount: savedAmount,
              updatedBy: "System User",
              updateTimestamp: timestamp,
            });
            getAvailableReelPackingSlips(line.materialId, packingSlips, materialIssueReelLines, materialReturnReelLines, materials, ourReelNoStartNumber)
              .filter((slip) => reelIds.includes(slip.id))
              .forEach((slip) => {
                createdReelLines.push({
                  id: crypto.randomUUID(),
                  materialIssueId: issueId,
                  materialIssueLineId: issueLineId,
                  materialId: line.materialId,
                  packingSlipId: slip.id,
                  ourReelNo: slip.ourReelNo,
                  weightKg: Number(slip.weightKg || 0),
                  productionId,
                  jobNo: selectedProduction?.transactionNo || "",
                  updatedBy: "System User",
                  updateTimestamp: timestamp,
                });
              });
          });

        nextMaterialIssues.unshift(issue);
        nextMaterialIssueLines.push(...createdLines);
        await setMaterialIssues(nextMaterialIssues);
        await setMaterialIssueLines(nextMaterialIssueLines);
        if (createdReelLines.length > 0) {
          nextMaterialIssueReelLines.push(...createdReelLines);
          await setMaterialIssueReelLines(nextMaterialIssueReelLines);
        }
      }

      if (productionId) {
        const usageMap = buildProductionMaterialUsageMap(
          nextMaterialIssues,
          nextMaterialIssueLines,
          nextMaterialReturns,
          nextMaterialReturnLines,
          nextMaterialIssueReelLines,
          nextMaterialReturnReelLines
        );
        const corrugatedSheetUsageMap = buildProductionCorrugatedSheetUsageMap(
          materials,
          nextMaterialIssues,
          nextMaterialIssueLines,
          nextMaterialReturns,
          nextMaterialReturnLines
        );
        const netUsage = usageMap.get(productionId) || 0;
        const hasCorrugatedSheetUsage = Number(corrugatedSheetUsageMap.get(productionId) || 0) > 0;
        await setProductions((prev) =>
          prev.map((production) =>
            production.id === productionId ? syncProductionWorkflowFromUsage(production, netUsage, timestamp, hasCorrugatedSheetUsage) : production
          )
        );
      }

      setRemarks("");
      setIssueLines([createEmptyReelLine()]);
      setSelectedIssueReels({});
      if (!lockDate) setDate(new Date().toISOString().split("T")[0]);
      if (!lockJob) setProductionId("");
      alert("Saved reel issue successfully.");
      navigate("/production/pending-consumption");
    } catch (error) {
      console.error("Failed to save reel issue:", error);
      alert("Failed to save reel issue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6 overflow-hidden">
      <div className="min-w-0 overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.28)]">
        <div className="bg-[linear-gradient(135deg,rgba(30,41,59,1),rgba(79,70,229,0.96))] px-5 py-5 text-white md:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/15">
              <Package2 size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Manual Reel Issue</h2>
              <p className="text-sm font-medium text-white/75">Select available reels and issue them against the chosen job.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="min-w-0 space-y-6 p-3 sm:p-5 md:p-6">
          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))] p-4 shadow-sm md:p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Date" required>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={lockDate}
                  className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:opacity-80"
                />
              </Field>
              <Field label="Job No." required>
                <Select
                  options={jobOptions}
                  value={productionId}
                  onChange={setProductionId}
                  required
                  placeholder="Select Job..."
                  disabled={lockJob}
                />
              </Field>
              <Field label="Remarks" className="md:col-span-2">
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add optional notes..."
                  className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </Field>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight text-slate-950">Issue Reels</h3>
                <p className="text-sm font-medium text-slate-500">Choose a material and issue from the currently available reels.</p>
              </div>
              <button type="button" onClick={addIssueLine} disabled={!linerComplete} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                <Plus size={16} /> Add
              </button>
            </div>
            {productionId && !linerComplete ? (
              <div className="mt-4 rounded border border-amber-700 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                Complete Corrugation Liner as Full before issuing reels.
              </div>
            ) : null}

            {issueLines.map((line) => {
              const availableReels = line.materialId ? getIssueAvailableReels(line.materialId, line.id) : [];
              const selectedIds = selectedIssueReels[line.id] || [];
              const totalWeight = line.materialId ? computeIssueLineWeight(line) : 0;
              return (
                <div key={line.id} className="mt-4 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.86),rgba(255,255,255,1))] p-4 shadow-sm">
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="w-full max-w-xl space-y-1">
                      <label className="text-sm font-bold text-slate-700">Material</label>
                      <Select
                        options={reelMaterialOptions}
                        disabled={!linerComplete}
                        value={line.materialId}
                        onChange={(value) => {
                          setIssueLines((prev) => prev.map((row) => (row.id === line.id ? { ...row, materialId: value } : row)));
                          setSelectedIssueReels((prev) => ({ ...prev, [line.id]: [] }));
                        }}
                        placeholder="Select reel material..."
                      />
                    </div>
                    {line.materialId && (
                        <div className="w-full space-y-1 sm:w-32">
                        <label className="text-sm font-black uppercase tracking-wide text-indigo-700">Invoice Rate</label>
                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-center font-black text-indigo-700 shadow-sm">
                          {formatCurrencyDisplay(selectedIds[0] ? getReelInvoiceRate(selectedIds[0]) : 0)}
                        </div>
                      </div>
                    )}
                    <button type="button" onClick={() => removeIssueLine(line.id)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-rose-600 transition hover:bg-rose-100 hover:text-rose-700 sm:mt-6 sm:w-10 sm:px-0" title="Remove line">
                      <Trash2 size={18} /><span className="text-xs font-bold uppercase sm:hidden">Remove Material</span>
                    </button>
                  </div>

                  {line.materialId ? (
                    <>
                      <div className="mt-3 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                        Selected Weight: <span className="ml-1 font-black">{totalWeight.toFixed(2)} KG</span>
                      </div>
                      <div className="mt-4 space-y-3 md:hidden">
                        {availableReels.length === 0 ? <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-center text-sm font-medium text-slate-500">No available reels for this material.</div> : availableReels.map((slip) => {
                          const selected = selectedIds.includes(slip.id);
                          return <label key={slip.id} className={`block rounded border-2 bg-white p-3 shadow-sm ${selected ? "border-indigo-700" : "border-black"}`}>
                            <div className="flex items-start justify-between gap-3 border-b border-black pb-2"><div className="min-w-0"><div className="text-[10px] font-black uppercase text-slate-500">Our Reel No.</div><div className="break-all text-xl font-black">{slip.ourReelNo}</div></div><input type="checkbox" disabled={!linerComplete} checked={selected} onChange={(e) => updateSelectedIssueReels(line.id, line.materialId, slip.id, e.target.checked)} className="h-6 w-6 shrink-0 rounded border-slate-300 text-indigo-600" /></div>
                            <div className="mt-3 grid grid-cols-2 gap-2"><div className="min-w-0 rounded border border-slate-300 p-2"><div className="text-[10px] font-black uppercase text-slate-500">Supplier Reel</div><div className="break-words text-sm font-black">{slip.supplierReelNo || "-"}</div></div><div className="rounded border border-indigo-200 bg-indigo-50 p-2"><div className="text-[10px] font-black uppercase text-indigo-700">Invoice Rate</div><div className="text-sm font-black">{formatCurrencyDisplay(getReelInvoiceRate(slip.id))}</div></div><div className="col-span-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-right"><div className="text-[10px] font-black uppercase text-emerald-700">Available Weight</div><div className="text-lg font-black text-emerald-900">{Number(slip.weightKg || 0).toFixed(2)} KG</div></div></div>
                          </label>;
                        })}
                      </div>
                      <div className="mt-4 hidden overflow-hidden rounded-[20px] border border-slate-200 md:block">
                        <div className="overflow-x-auto">

      <TableControls searchTerm={searchTerm} onSearchChange={setSearchTerm} />

      <table className="min-w-full border-collapse">
                            <thead className="sticky top-0 z-30 bg-slate-800 text-white">
                              <tr>
                                {["Select", "Our Reel No.", "Supplier Reel No.", "Invoice Rate", "Available Weight KG"].map((heading) => (
                                  <th key={heading} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.16em]">
                                    {heading}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {availableReels.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-4 py-8 text-center text-sm font-medium text-slate-500">
                                    No available reels for this material.
                                  </td>
                                </tr>
                              ) : (
                                availableReels.map((slip, index) => {
                                  const availableQty = Number(slip.weightKg || 0);
                                  return (
                                  <tr key={slip.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center align-top">
                                      <input
                                        type="checkbox"
                                        disabled={!linerComplete}
                                        checked={selectedIds.includes(slip.id)}
                                        onChange={(e) => updateSelectedIssueReels(line.id, line.materialId, slip.id, e.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 align-top">{slip.ourReelNo}</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 align-top">{slip.supplierReelNo || "-"}</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-sm font-bold text-indigo-700 align-top">{formatCurrencyDisplay(getReelInvoiceRate(slip.id))}</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-sm font-semibold text-emerald-700">{availableQty.toFixed(2)}</td>
                                  </tr>
                                )})
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-[24px] border border-slate-200 shadow-sm">
            <div className="bg-[linear-gradient(135deg,rgba(15,23,42,1),rgba(49,46,129,0.95))] p-6 text-white">
              <h3 className="mb-5 flex items-center gap-2 border-b border-white/15 pb-3 text-lg font-black uppercase tracking-tighter">
                <BarChart3 size={20} />
                Issue Summary
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Issue Weight</div>
                    <div className="text-xl font-black">{Number(consumptionSummary.issueWt || 0).toFixed(2)} <span className="text-xs text-slate-400">KG</span></div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Issue Value</div>
                    <div className="text-xl font-black">{formatCurrencyDisplay(consumptionSummary.issueVal)}</div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !productionId || !hasAnyIssue || !linerComplete}
              className="inline-flex min-w-[220px] items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(99,102,241,1),rgba(168,85,247,0.95))] px-6 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_35px_-18px_rgba(79,70,229,0.85)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Spinner size={22} className="text-white" /> : "Save Reel Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required = false,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}

