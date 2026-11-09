import { Fragment, useEffect, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { Company, Firm, Material, MaterialIn, MaterialInPackingSlip, Service, Supplier, Setting } from "../types";
import { formatDate } from "../lib/serial";
import { cn } from "../lib/utils";
import { Search, ChevronRight, ChevronDown, Download, QrCode, ArrowUp, ArrowDown, Check, MessageSquareText, X } from "lucide-react";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { Spinner } from "../components/Spinner";
import { useNpdItemNames } from "../hooks/useNpdItems";
import { downloadMaterialInPdf } from "../lib/materialInPdf";
import { downloadMrrReelLabelsPdf } from "../lib/mrrReelLabelsPdf";
import { buildMrrReelLabelData } from "../lib/mrrReelLabelData";
import { useConfirm } from "../components/ConfirmDialog";
import { Select as FirmSelect } from "../components/Select";
import { getFirmDisplayName, getFirmDisplayNameById } from "../lib/firmDisplay";

type Stage = "All Approval" | "Pending PH" | "Pending Accounts" | "Pending MD";
type SortField = "timestamp" | "gateEntryNo" | "transactionNo" | "date" | "value";
type SortDirection = "asc" | "desc";

export function MrrApprovals() {
  const confirm = useConfirm();
  const [materialIn, setMaterialIn] = useData<MaterialIn>("material-in", [], {
    firmScope: "all",
    storageKey: "material-in-all-firms",
  });
  const [materials] = useData<Material>("materials", []);
  const npdItems = useNpdItemNames(); // names only (screen and PDF use just the item name)
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { cacheToLocalStorage: false });
  const [services] = useData<Service>("services", []);
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", [], {
    firmScope: "all",
    storageKey: "material-in-packing-slips-all-firms",
  });
  const [settings] = useData<Setting>("settings", []);
  
  const [activeStage, setActiveStage] = useState<Stage>("All Approval");
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [reelLabelMenuId, setReelLabelMenuId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [openRemarkId, setOpenRemarkId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("transactionNo");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const getSeriesNumber = (value?: string) => {
    const suffix = String(value || "").trim().split("/").pop() || "";
    const parsed = Number(suffix);
    return Number.isFinite(parsed) ? parsed : -1;
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "timestamp" || field === "date" || field === "value" ? "desc" : "asc");
  };

  const renderSortIcon = (field: SortField) =>
    sortField === field ? (
      sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
    ) : (
      <ArrowDown size={12} className="opacity-40" />
    );

  const getSupplierName = (id: string) => {
    const supplier = suppliers.find(s => s.id === id);
    if (supplier) return supplier.name;
    const company = companies.find(c => c.id === id);
    if (company) return company.name;
    return id;
  };

  // Item value of an MRR (sum of its lines), as shown in the Item Value column.
  const getItemValue = (mrr: MaterialIn) => (mrr.lines || []).reduce((sum, line) => sum + (line.actualValue || line.value || 0), 0);

  const getFirmName = (mrr: MaterialIn) => {
    return getFirmDisplayNameById(mrr.firmId || mrr.destinationFirmId, firms, mrr.firmName);
  };

  const stages: { label: string; value: Stage }[] = [
    { label: "All Approval", value: "All Approval" },
    { label: "Plant Head", value: "Pending PH" },
    { label: "Accounts", value: "Pending Accounts" },
    { label: "MD Approval", value: "Pending MD" },
  ];

  const approvalStatuses: Stage[] = ["Pending PH", "Pending Accounts", "Pending MD"];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    stages.forEach(s => {
      c[s.value] = s.value === "All Approval"
        ? materialIn.filter(m => approvalStatuses.includes(m.status as Stage)).length
        : materialIn.filter(m => m.status === s.value).length;
    });
    return c;
  }, [materialIn]);

  const filteredList = useMemo(() => {
    return materialIn
      .filter(m => activeStage === "All Approval" ? approvalStatuses.includes(m.status as Stage) : m.status === activeStage)
      .filter(m => !firmFilter || String(m.firmId || m.destinationFirmId || "") === firmFilter)
      .filter(m => !supplierFilter || getSupplierName(m.supplierId) === supplierFilter)
      .filter(m => (!fromDate || m.date >= fromDate) && (!toDate || m.date <= toDate))
      .filter(m => {
        const supplierName = getSupplierName(m.supplierId);
        const firmName = getFirmName(m);
        const searchStr = `${m.transactionNo} ${m.gateEntryNo || ""} ${firmName} ${supplierName} ${m.invoiceNo} ${m.mrrType || ""}`.toLowerCase();
        return searchStr.includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => {
        let comparison = 0;

        if (sortField === "gateEntryNo") {
          comparison = getSeriesNumber(a.gateEntryNo) - getSeriesNumber(b.gateEntryNo);
        } else if (sortField === "transactionNo") {
          comparison = getSeriesNumber(a.transactionNo) - getSeriesNumber(b.transactionNo);
        } else if (sortField === "date") {
          comparison = String(a.date || "").localeCompare(String(b.date || ""));
        } else if (sortField === "value") {
          comparison = getItemValue(a) - getItemValue(b);
        } else {
          comparison = new Date(a.updateTimestamp || a.timestamp).getTime() - new Date(b.updateTimestamp || b.timestamp).getTime();
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [materialIn, activeStage, searchTerm, suppliers, companies, firms, firmFilter, supplierFilter, fromDate, toDate, sortField, sortDirection]);

  const firmOptions = useMemo(() => firms.filter((firm) => materialIn.some((m) => m.firmId === firm.id || m.destinationFirmId === firm.id)).map((firm) => ({ value: firm.id, label: getFirmDisplayName(firm) })), [firms, materialIn]);
  const supplierOptions = useMemo(() => Array.from(new Set(materialIn.map((m) => getSupplierName(m.supplierId)).filter(Boolean))).sort().map((name) => ({ value: name, label: name })), [materialIn, suppliers, companies]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredList.map(m => m.id));
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => prev.includes(id) ? prev.filter(expandedId => expandedId !== id) : [...prev, id]);
  };

  const handleAction = async (mrrId: string, action: "Approve" | "Reject") => {
    const mrr = materialIn.find(m => m.id === mrrId);
    if (!mrr) return;

    const currentStage = mrr.status as Stage;
    if (!["Pending PH", "Pending Accounts", "Pending MD"].includes(currentStage)) {
      alert(`No approval action is available for status ${mrr.status || "-"}.`);
      return;
    }

    const remark = remarks[mrrId] || "";
    if (action === "Reject" && !remark.trim()) {
      alert("Please provide a remark for rejection.");
      return;
    }

    setIsSubmitting(mrrId);
    const timestamp = new Date().toISOString();
    const email = currentStage === "Pending PH" ? "ph@lngrp.in" : 
                  currentStage === "Pending Accounts" ? "accounts@lngrp.in" : 
                  currentStage === "Pending MD" ? "md@lngrp.in" : "system@lngrp.in";

    let nextStatus: MaterialIn["status"] = mrr.status;
    const patch: Partial<MaterialIn> = { updateTimestamp: timestamp, updatedBy: email };

    if (action === "Approve") {
      if (currentStage === "Pending PH") {
        nextStatus = "Pending Accounts";
        patch.phTimestamp = timestamp;
        patch.phEmailId = email;
        patch.plant_head_remark = remark;
      }
      else if (currentStage === "Pending Accounts") {
        nextStatus = "Pending MD";
        patch.accTimestamp = timestamp;
        patch.accEmailId = email;
        patch.accounts_remark = remark;

        // Auto Debit Note Logic
        const totalMrrWeight = mrr.lines.reduce((s, l) => s + (l.actualQty || l.qty || 0), 0);
        const totalInvWeight = mrr.lines.reduce((s, l) => s + (l.invoiceQty || 0), 0);
        
        if (Math.abs(totalMrrWeight - totalInvWeight) > 0.01) {
           patch.debitNote = `DN-${mrr.transactionNo.split('-').pop()}`;
           patch.debitNoteDate = timestamp.split('T')[0];
           const weightDiff = totalInvWeight - totalMrrWeight;
           if (weightDiff > 0) {
             const avgRate = mrr.lines.reduce((s, l) => s + (l.invoiceRate || 0), 0) / mrr.lines.length;
             patch.debitNoteAmount = Number((weightDiff * avgRate).toFixed(2));
           }
        }
      }
      else if (currentStage === "Pending MD") {
        nextStatus = "Pending Tally";
        patch.mdTimestamp = timestamp;
        patch.mdEmailId = email;
        patch.md_approval_remark = remark;
      }
    } else {
      nextStatus = "Pending PH";
      if (currentStage === "Pending PH") patch.plant_head_remark = `REJECTED: ${remark}`;
      if (currentStage === "Pending Accounts") patch.accounts_remark = `REJECTED: ${remark}`;
      if (currentStage === "Pending MD") patch.md_approval_remark = `REJECTED: ${remark}`;
    }

    patch.status = nextStatus;

    try {
      await setMaterialIn(prev => prev.map(m => m.id === mrrId ? { ...m, ...patch } : m));
      setRemarks(prev => {
        const next = { ...prev };
        delete next[mrrId];
        return next;
      });
      setSelectedIds(prev => prev.filter(i => i !== mrrId));
    } catch (err) {
      console.error("Action failed:", err);
      alert("Failed to update MRR status.");
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    const actionableIds = selectedIds.filter((id) => {
      const mrr = materialIn.find((m) => m.id === id);
      return mrr && ["Pending PH", "Pending Accounts", "Pending MD"].includes(mrr.status || "");
    });
    if (actionableIds.length === 0) {
      alert("No selected MRR is available for approval.");
      return;
    }
    if (!await confirm(`Are you sure you want to approve ${actionableIds.length} MRRs?`)) return;
    for (const id of actionableIds) {
      await handleAction(id, "Approve");
    }
  };

  const downloadPdf = async (mrr: MaterialIn) => {
    await downloadMaterialInPdf({
      mrr,
      materials,
      npdItems,
      services,
      suppliers,
      companies,
      setting: settings[0] || null,
      firms,
      packingSlips,
    });
  };

  const downloadReelLabelsPdf = async (mrr: MaterialIn, paperSize: "A4" | "A3" = "A4") => {
    if (mrr.mrrType !== "Reel") {
      alert("Reel Labels PDF is available only for Reel MRR.");
      return;
    }

    try {
      const result = await downloadMrrReelLabelsPdf({
        mrr,
        packingSlips,
        materials,
        suppliers,
        companies,
        setting: settings[0] || null,
        firms,
        paperSize,
      });
      if (result.warnings.length > 0) {
        alert(`Generated ${result.count} labels with ${result.warnings.length} warning(s).`);
      }
    } catch (error) {
      console.error("Failed to generate reel labels PDF", error);
      alert(error instanceof Error ? error.message : "Failed to generate reel labels PDF.");
    }
  };

  const getMaterialSpecs = (material: Material) => {
    const specs = [];
    if (material.size) specs.push(`Size: ${material.size} CM`);
    if (material.gsm) specs.push(`GSM: ${material.gsm}`);
    if (material.bf) specs.push(`BF: ${material.bf}`);
    const specStr = specs.join(" X ");
    return specStr ? `${material.name} - ${specStr}` : material.name;
  };

  const getItemSpecs = (line: MaterialIn["lines"][0], mrrType?: MaterialIn["mrrType"]) => {
    const isServiceReturn = mrrType === "Service Return" || line.lineType === "Service";
    if (isServiceReturn) {
      const baseLabel = line.sourceGatePassItemDescription?.trim() || line.itemName?.trim() || line.itemId;
      const resolvedServiceName = services.find((service) => service.id === (line.serviceId || line.itemId))?.name?.trim() || line.serviceName?.trim();
      if (resolvedServiceName) {
        return `${baseLabel} (${resolvedServiceName})`;
      }
      return baseLabel;
    }

    const npdItem = npdItems.find(i => i.id === line.itemId);
    const material = materials.find(m => m.id === line.itemId);
    const isFgType = mrrType === "Rejection In" || mrrType === "FG Purchase";

    if (isFgType) {
      if (npdItem) return npdItem.name;
      if (material) return getMaterialSpecs(material);
      return line.itemName?.trim() || line.itemId;
    }

    if (material) return getMaterialSpecs(material);
    if (npdItem) return npdItem.name;
    return line.itemName?.trim() || line.itemId;
  };

  const isActionable = (mrr: MaterialIn) => ACTIONABLE_STATUSES.includes(mrr.status || "");
  const filtersActive = Boolean(searchTerm || firmFilter || supplierFilter || fromDate || toDate);
  const pagination = useClientPagination(filteredList, 25);
  const { setPage } = pagination;
  // Any stage, search or filter change starts again from page 1.
  useEffect(() => {
    setPage(1);
  }, [activeStage, searchTerm, firmFilter, supplierFilter, fromDate, toDate, sortField, sortDirection, setPage]);
  const allSelected = filteredList.length > 0 && selectedIds.length === filteredList.length;

  const sortHeader = (label: string, field: SortField, align: "left" | "right" = "left") => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className={cn("inline-flex items-center gap-1 uppercase", align === "right" && "justify-end")}
    >
      {label}
      {renderSortIcon(field)}
    </button>
  );

  // Approval buttons shared by the table row and the phone card.
  const renderActions = (m: MaterialIn, size: "sm" | "lg") => {
    const button = size === "lg" ? "h-10 w-10" : "h-8 w-8";
    const icon = size === "lg" ? 16 : 14;
    const actionable = isActionable(m);
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => downloadPdf(m)}
          className={cn(button, "inline-flex items-center justify-center rounded-md border-2 border-red-600 bg-red-50 text-red-600 hover:bg-red-100")}
          title="Download PDF"
          aria-label="Download PDF"
        >
          <Download size={icon} />
        </button>
        {m.mrrType === "Reel" ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setReelLabelMenuId((current) => (current === m.id ? null : m.id))}
              className={cn(button, "inline-flex items-center justify-center rounded-md border-2 border-slate-700 bg-white text-slate-800 hover:bg-slate-100")}
              title="Reel Labels PDF"
              aria-label="Reel Labels PDF"
            >
              <QrCode size={icon} />
            </button>
            {reelLabelMenuId === m.id ? (
              <div className="absolute right-0 top-full z-40 mt-1 w-24 overflow-hidden rounded-md border-2 border-black bg-white shadow-lg">
                {(["A4", "A3"] as const).map((paper) => (
                  <button
                    key={paper}
                    type="button"
                    onClick={async () => {
                      setReelLabelMenuId(null);
                      await downloadReelLabelsPdf(m, paper);
                    }}
                    className="block w-full border-b border-slate-200 px-3 py-2 text-left text-xs font-bold last:border-b-0 hover:bg-slate-100"
                  >
                    {paper}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {actionable ? (
          <>
            <button
              type="button"
              onClick={() => setOpenRemarkId((current) => (current === m.id ? null : m.id))}
              className={cn(
                button,
                "relative inline-flex items-center justify-center rounded-md border-2 border-indigo-600 hover:bg-indigo-50",
                remarks[m.id]?.trim() ? "bg-indigo-100 text-indigo-700" : "bg-white text-indigo-700"
              )}
              title="Remark (needed to reject)"
              aria-label="Remark"
            >
              <MessageSquareText size={icon} />
              {remarks[m.id]?.trim() ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-indigo-600" /> : null}
            </button>
            <button
              type="button"
              disabled={!!isSubmitting}
              onClick={() => handleAction(m.id, "Reject")}
              className={cn(button, "inline-flex items-center justify-center rounded-md border-2 border-red-600 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50")}
              title="Reject"
              aria-label="Reject"
            >
              <X size={icon} />
            </button>
            <button
              type="button"
              disabled={!!isSubmitting}
              onClick={() => handleAction(m.id, "Approve")}
              className={cn(button, "inline-flex items-center justify-center rounded-md border-2 border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50")}
              title="Approve"
              aria-label="Approve"
            >
              {isSubmitting === m.id ? <Spinner size={12} className="text-white" /> : <Check size={icon} />}
            </button>
          </>
        ) : (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">No action</span>
        )}
      </div>
    );
  };

  const renderRemarkBox = (m: MaterialIn) =>
    openRemarkId === m.id && isActionable(m) ? (
      <div className="rounded-md border-2 border-indigo-600 bg-indigo-50 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase text-indigo-800">Remark</span>
          <button type="button" onClick={() => setOpenRemarkId(null)} className="rounded p-0.5 text-slate-600 hover:bg-white" aria-label="Close remark">
            <X size={14} />
          </button>
        </div>
        <textarea
          value={remarks[m.id] || ""}
          onChange={(e) => setRemarks((prev) => ({ ...prev, [m.id]: e.target.value }))}
          rows={2}
          className="w-full rounded border border-black bg-white p-2 text-sm outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </div>
    ) : null;

  // Line details (and reel labels for Reel MRRs), opened with the arrow.
  const renderDetails = (m: MaterialIn) => {
    const reelLabels = m.mrrType === "Reel"
      ? buildMrrReelLabelData({ mrr: m, packingSlips, materials, suppliers, companies }).labels
      : [];
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
          <table className="min-w-[640px] w-full border-collapse text-xs">
            <thead className="bg-slate-100 text-[11px] uppercase text-slate-700">
              <tr>
                <th className="px-2 py-2 text-left">Item</th>
                <th className="px-2 py-2 text-right">MRR Qty</th>
                <th className="px-2 py-2 text-right">Inv Qty</th>
                <th className="px-2 py-2 text-right">PO Rate</th>
                <th className="px-2 py-2 text-right">Inv Rate</th>
                <th className="px-2 py-2 text-right">GST%</th>
                <th className="px-2 py-2 text-right">Item Value</th>
              </tr>
            </thead>
            <tbody>
              {m.lines.map((l, i) => (
                <tr key={i} className="border-t border-slate-200">
                  <td className="px-2 py-2 font-semibold">{getItemSpecs(l, m.mrrType)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(l.actualQty || l.qty || 0).toFixed(2)} {l.uom || ""}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(l.invoiceQty || 0).toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(l.poRate || 0).toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(l.invoiceRate || 0).toFixed(2)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(l.gstRate || 0)}%</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">{Number(l.actualValue || l.value || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {m.mrrType === "Reel" ? (
          <div className="overflow-hidden rounded-md border border-indigo-200 bg-white">
            <div className="border-b border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black uppercase text-indigo-800">Reel label details</div>
            {reelLabels.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs font-semibold text-slate-500">No reel details saved for this MRR.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full border-collapse text-xs">
                  <thead className="bg-indigo-700 text-[11px] uppercase text-white">
                    <tr>
                      <th className="px-2 py-2 text-center">SL</th>
                      <th className="px-2 py-2 text-left">Our Reel No.</th>
                      <th className="px-2 py-2 text-left">Supplier Reel No.</th>
                      <th className="px-2 py-2 text-left">ERP Code</th>
                      <th className="px-2 py-2 text-right">Size</th>
                      <th className="px-2 py-2 text-right">GSM</th>
                      <th className="px-2 py-2 text-right">BF</th>
                      <th className="px-2 py-2 text-right">Weight (KG)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reelLabels.map((label, index) => (
                      <tr key={label.packingSlipId} className="border-t border-slate-200 odd:bg-slate-50">
                        <td className="px-2 py-2 text-center">{index + 1}</td>
                        <td className="px-2 py-2 font-black text-indigo-800">{label.reelNo}</td>
                        <td className="px-2 py-2">{label.suppReel || "-"}</td>
                        <td className="px-2 py-2">{label.code || "-"}</td>
                        <td className="px-2 py-2 text-right">{label.sizeCm || "-"}</td>
                        <td className="px-2 py-2 text-right">{label.gsm || "-"}</td>
                        <td className="px-2 py-2 text-right">{label.bf || "-"}</td>
                        <td className="px-2 py-2 text-right font-bold">{Number(label.weightKg || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending MRR Approvals</h2>
      </div>

      {/* Stage tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Approval stage">
        {stages.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={activeStage === s.value}
            onClick={() => {
              setActiveStage(s.value);
              setSelectedIds([]);
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border-2 px-3 py-2 text-sm font-bold transition",
              activeStage === s.value ? "border-indigo-700 bg-indigo-700 text-white" : "border-black bg-white text-black hover:bg-slate-50"
            )}
          >
            {s.label}
            <span className={cn("rounded-full px-2 text-xs font-black", activeStage === s.value ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-700")}>
              {counts[s.value] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded border border-black bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.5fr)_repeat(4,minmax(140px,1fr))_auto] lg:items-center">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search MRR, GE, firm, party, invoice..."
            className="w-full rounded border-2 border-black py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <FirmSelect value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="Firms" />
        <FirmSelect value={supplierFilter} onChange={setSupplierFilter} options={supplierOptions} placeholder="Parties" />
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" className="w-full rounded border-2 border-black px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" className="w-full rounded border-2 border-black px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none" />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => { setSearchTerm(""); setFirmFilter(""); setSupplierFilter(""); setFromDate(""); setToDate(""); }}
            className="rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50"
          >
            Clear Filters
          </button>
        ) : null}
      </div>

      {/* Bulk approval: shown once something is selected */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-indigo-700 bg-indigo-50 px-3 py-2">
          <span className="text-sm font-black text-indigo-900">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedIds([])} className="rounded border border-black bg-white px-3 py-1.5 text-sm font-bold hover:bg-slate-50">
              Clear
            </button>
            <button
              type="button"
              disabled={!!isSubmitting}
              onClick={handleBulkApprove}
              className="inline-flex items-center gap-1.5 rounded border-2 border-emerald-800 bg-emerald-600 px-4 py-1.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? <Spinner size={14} className="text-white" /> : <Check size={16} />} Approve Selected
            </button>
          </div>
        </div>
      ) : null}

      {/* Desktop table */}
      <div className={cn("overflow-x-auto rounded border border-black bg-white", filteredList.length === 0 ? "block" : "hidden md:block")}>
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
            <tr>
              <th className="w-10 border border-black px-2 py-3" aria-label="Details" />
              <th className="w-10 border border-black px-2 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-indigo-600" aria-label="Select all" />
              </th>
              <th className="border border-black px-3 py-3 text-left">{sortHeader("MRR No", "transactionNo")}</th>
              <th className="border border-black px-3 py-3 text-left">{sortHeader("GE No", "gateEntryNo")}</th>
              <th className="border border-black px-3 py-3 text-left">{sortHeader("Date", "date")}</th>
              <th className="border border-black px-3 py-3 text-left">Firm</th>
              <th className="border border-black px-3 py-3 text-left">Party</th>
              <th className="border border-black px-3 py-3 text-left">Type</th>
              <th className="border border-black px-3 py-3 text-left">Status</th>
              <th className="border border-black px-3 py-3 text-right">MRR Qty</th>
              <th className="border border-black px-3 py-3 text-right">Inv Qty</th>
              <th className="border border-black px-3 py-3 text-right">{sortHeader("Item Value", "value", "right")}</th>
              <th className="border border-black px-3 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={13} className="h-16" aria-label="No records" />
              </tr>
            ) : (
              pagination.paginatedItems.map((m) => {
                const isExpanded = expandedIds.includes(m.id);
                const mrrQty = m.lines.reduce((sum, l) => sum + (l.actualQty || l.qty || 0), 0);
                const invQty = m.lines.reduce((sum, l) => sum + (l.invoiceQty || 0), 0);
                return (
                  <Fragment key={m.id}>
                    <tr className={cn("align-middle hover:bg-slate-50", selectedIds.includes(m.id) && "bg-indigo-50/60")}>
                      <td className="border border-black px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(m.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100"
                          aria-label={isExpanded ? "Hide items" : "Show items"}
                          title={isExpanded ? "Hide items" : "Show items"}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="border border-black px-2 py-2 text-center">
                        <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} className="h-4 w-4 accent-indigo-600" aria-label={`Select ${m.transactionNo}`} />
                      </td>
                      <td className="border border-black px-3 py-2 font-bold">{m.transactionNo}</td>
                      <td className="border border-black px-3 py-2">{m.gateEntryNo || "-"}</td>
                      <td className="border border-black px-3 py-2">{formatDate(m.date)}</td>
                      <td className="border border-black px-3 py-2 font-semibold">{getFirmName(m)}</td>
                      <td className="border border-black px-3 py-2">{getSupplierName(m.supplierId)}</td>
                      <td className="border border-black px-3 py-2">{m.mrrType || "-"}</td>
                      <td className="border border-black px-3 py-2"><StatusBadge status={m.status} /></td>
                      <td className="border border-black px-3 py-2 text-right tabular-nums">{mrrQty.toFixed(2)}</td>
                      <td className="border border-black px-3 py-2 text-right tabular-nums">{invQty.toFixed(2)}</td>
                      <td className="border border-black px-3 py-2 text-right font-black tabular-nums">{getItemValue(m).toFixed(2)}</td>
                      <td className="border border-black px-3 py-2">
                        {renderActions(m, "sm")}
                        {openRemarkId === m.id ? <div className="mt-2 min-w-[220px]">{renderRemarkBox(m)}</div> : null}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-slate-50">
                        <td colSpan={13} className="border border-black px-4 py-3">{renderDetails(m)}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      <div className="space-y-3 md:hidden">
        {filteredList.length > 0 ? (
          <label className="flex items-center gap-2 px-1 text-sm font-bold">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-indigo-600" />
            Select all ({filteredList.length})
          </label>
        ) : null}
        {pagination.paginatedItems.map((m) => {
          const isExpanded = expandedIds.includes(m.id);
          const mrrQty = m.lines.reduce((sum, l) => sum + (l.actualQty || l.qty || 0), 0);
          const invQty = m.lines.reduce((sum, l) => sum + (l.invoiceQty || 0), 0);
          return (
            <div key={m.id} className={cn("rounded-md border-2 border-black bg-white p-3", selectedIds.includes(m.id) && "border-indigo-700 bg-indigo-50/50")}>
              <div className="flex items-start gap-2">
                <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" aria-label={`Select ${m.transactionNo}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-black">{m.transactionNo}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-600">
                    {formatDate(m.date)} · {getFirmName(m)} · {m.mrrType || "-"}{m.gateEntryNo ? ` · ${m.gateEntryNo}` : ""}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{getSupplierName(m.supplierId)}</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                <div><div className="font-bold text-slate-500">MRR Qty</div><div className="font-bold tabular-nums">{mrrQty.toFixed(2)}</div></div>
                <div><div className="font-bold text-slate-500">Inv Qty</div><div className="font-bold tabular-nums">{invQty.toFixed(2)}</div></div>
                <div className="text-right"><div className="font-bold text-slate-500">Item Value</div><div className="text-sm font-black tabular-nums">{getItemValue(m).toFixed(2)}</div></div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpanded(m.id)}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 text-xs font-bold"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {m.lines.length} {m.lines.length === 1 ? "item" : "items"}
                </button>
                {renderActions(m, "lg")}
              </div>
              {openRemarkId === m.id ? <div className="mt-2">{renderRemarkBox(m)}</div> : null}
              {isExpanded ? <div className="mt-2">{renderDetails(m)}</div> : null}
            </div>
          );
        })}
      </div>

      <ClientPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </div>
  );
}

const ACTIONABLE_STATUSES = ["Pending PH", "Pending Accounts", "Pending MD"];

const STATUS_STYLES: Record<string, string> = {
  "Pending PH": "bg-amber-100 text-amber-900 border-amber-300",
  "Pending Accounts": "bg-sky-100 text-sky-900 border-sky-300",
  "Pending MD": "bg-violet-100 text-violet-900 border-violet-300",
};

function StatusBadge({ status }: { status?: string }) {
  const label = status === "Pending PH" ? "Plant Head" : status === "Pending Accounts" ? "Accounts" : status === "Pending MD" ? "MD" : status || "-";
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold", STATUS_STYLES[status || ""] || "border-slate-300 bg-slate-100 text-slate-700")}>
      {label}
    </span>
  );
}
