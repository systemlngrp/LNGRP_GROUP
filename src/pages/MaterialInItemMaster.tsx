import React, { useEffect, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { getDataAuthHeaders } from "../hooks/useData";
import { Material, MaterialIn, Item, Supplier, MaterialInPackingSlip, GateEntry, Company, MaterialIssueReelLine, MaterialReturnReelLine } from "../types";
import { Edit2, Check, X, Search, Package, Layers, Disc, Pencil } from "lucide-react";
import { Spinner } from "../components/Spinner";
import { Select } from "../components/Select";
import { ExcelExport } from "../components/ExcelExport";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { formatDate } from "../lib/serial";
import { cn } from "../lib/utils";
import { useNpdItemNames } from "../hooks/useNpdItems";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { buildReelStockRows } from "../lib/reelStock";

function makeOptions(values: Array<string | number>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((value) => ({ value, label: value }));
}

function isOpeningMrrNo(value?: string | number | null) {
  return String(value ?? "").trim() === "1";
}

export function MaterialInItemMaster() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [activeTab, setActiveTab] = useState<"others" | "reel-summary" | "reel-details">("others");
  const [materialIn, setMaterialIn] = useData<MaterialIn>("material-in", [], { firmScope: "all" });
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", [], { firmScope: "all", enabled: false, cacheToLocalStorage: false });
  const [remoteReelSummary, setRemoteReelSummary] = useState<any[]>([]);
  const [remoteSummaryMetrics, setRemoteSummaryMetrics] = useState({ receiptQty: 0, receiptValue: 0, totalReceipts: 0 });
  const [remoteSummaryLoading, setRemoteSummaryLoading] = useState(false);
  const [remoteSummaryError, setRemoteSummaryError] = useState<string | null>(null);
  const [remoteSummaryPage, setRemoteSummaryPage] = useState(1);
  const [remoteSummaryTotalPages, setRemoteSummaryTotalPages] = useState(1);
  const [remoteSummaryTotalRows, setRemoteSummaryTotalRows] = useState(0);
  const [remoteReelDetails, setRemoteReelDetails] = useState<any[]>([]);
  const [remoteDetailsLoading, setRemoteDetailsLoading] = useState(false);
  const [remoteDetailsError, setRemoteDetailsError] = useState<string | null>(null);
  const [remoteDetailsPage, setRemoteDetailsPage] = useState(1);
  const [remoteDetailsTotalPages, setRemoteDetailsTotalPages] = useState(1);
  const [remoteDetailsTotalRows, setRemoteDetailsTotalRows] = useState(0);
  const [materials] = useData<Material>("materials", []);
  // Reel Summary and Reel Details are server-paginated. Do not download every
  // issue/return line into the browser when switching tabs.
  const [issueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { cacheToLocalStorage: false, enabled: false });
  const [returnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { cacheToLocalStorage: false, enabled: false });
  // Only the gate entry no. and vehicle no. are shown here.
  const [gateEntries] = useData<GateEntry>("gate-entries", [], { firmScope: "all", fields: ["gateEntryNo", "truckNo"] });
  const npdItems = useNpdItemNames(); // names only: no stock calculation needed
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [companies] = useData<Company>("companies", []);

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [mrrFilter, setMrrFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    // Reel Details is shown only on its own tab: do not run this heavy report
    // (on open and on every keystroke) while another tab is open.
    if (activeTab !== "reel-details") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteDetailsLoading(true); setRemoteDetailsError(null);
      const params = new URLSearchParams({ page: String(remoteDetailsPage), pageSize: "100" });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (mrrFilter) params.set("mrr", mrrFilter);
      if (fromDate) params.set("dateFrom", fromDate);
      if (toDate) params.set("dateTo", toDate);
      try {
        const response = await fetch(`/api/reports/reel-details?${params}`, { headers: getDataAuthHeaders(false), signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(body?.error || response.statusText));
        setRemoteReelDetails(Array.isArray(body.rows) ? body.rows.map((row: any) => ({ ...row, specs: `${row.gsm || "-"} GSM / ${row.bf || "-"} BF / ${row.size || "-"}`, weightKg: Number(row.weightKg || 0) })) : []);
        setRemoteDetailsTotalRows(Number(body.totalRows) || 0);
        setRemoteDetailsTotalPages(Number(body.totalPages) || 1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") { setRemoteReelDetails([]); setRemoteDetailsError(error instanceof Error ? error.message : "Unable to load Reel details."); }
      } finally { if (!controller.signal.aborted) setRemoteDetailsLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeTab, fromDate, mrrFilter, remoteDetailsPage, searchTerm, toDate]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteSummaryLoading(true); setRemoteSummaryError(null);
      const params = new URLSearchParams({ page: String(remoteSummaryPage), pageSize: "100" });
      if (searchTerm.trim()) params.set("search", searchTerm.trim()); if (mrrFilter) params.set("mrr", mrrFilter); if (fromDate) params.set("dateFrom", fromDate); if (toDate) params.set("dateTo", toDate);
      try { const response = await fetch(`/api/reports/reel-summary?${params}`, { headers: getDataAuthHeaders(false), signal: controller.signal }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(String(body?.error || response.statusText)); setRemoteReelSummary(Array.isArray(body.rows) ? body.rows : []); setRemoteSummaryTotalRows(Number(body.totalRows) || 0); setRemoteSummaryTotalPages(Number(body.totalPages) || 1); setRemoteSummaryMetrics({ receiptQty: Number(body.summary?.receiptQty || 0), receiptValue: Number(body.summary?.receiptValue || 0), totalReceipts: Number(body.summary?.totalReceipts || 0) }); }
      catch (error) { if ((error as Error).name !== "AbortError") { setRemoteReelSummary([]); setRemoteSummaryMetrics({ receiptQty: 0, receiptValue: 0, totalReceipts: 0 }); setRemoteSummaryError(error instanceof Error ? error.message : "Unable to load Reel Summary."); } }
      finally { if (!controller.signal.aborted) setRemoteSummaryLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fromDate, mrrFilter, remoteSummaryPage, searchTerm, toDate]);

  useEffect(() => { setRemoteDetailsPage(1); setRemoteSummaryPage(1); }, [fromDate, mrrFilter, searchTerm, toDate]);

  const materialMap = useMemo(() => new Map(materials.map(m => [m.id, m])), [materials]);
  const mrrOptions = useMemo(() => makeOptions(materialIn.map((entry) => entry.transactionNo)), [materialIn]);
  const gateEntryMap = useMemo(() => new Map(gateEntries.map(ge => [ge.id, ge])), [gateEntries]);

  const handleEditClick = (lineId: string, currentQty: number) => {
    setEditingLineId(lineId);
    setEditQty(currentQty);
  };

  const handleCancelEdit = () => {
    setEditingLineId(null);
    setEditQty("");
  };

  const handleSaveQty = (parentId: string, lineId: string) => {
    if (editQty === "" || Number(editQty) <= 0) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setMaterialIn(prev => prev.map(m => {
        if (m.id !== parentId) return m;

        const updatedLines = m.lines.map(line => {
          if (line.id !== lineId) return line;
          return {
            ...line,
            qty: Number(editQty),
            value: Number(editQty) * (line.rate || 0)
          };
        });

        const newTotalAmount = updatedLines.reduce((sum, line) => sum + (line.value || 0), 0);

        return {
          ...m,
          lines: updatedLines,
          totalAmount: newTotalAmount
        };
      }));

      setEditingLineId(null);
      setEditQty("");
      setIsSubmitting(false);
    }, 500);
  };

  // Lookups built once; first match wins, the same as .find().
  const firstById = <T extends { id: string }>(rows: T[]) => {
    const map = new Map<string, T>();
    rows.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row); });
    return map;
  };
  const supplierById = useMemo(() => firstById(suppliers), [suppliers]);
  const companyById = useMemo(() => firstById(companies), [companies]);
  const materialById = useMemo(() => firstById(materials), [materials]);
  const npdById = useMemo(() => firstById(npdItems as any[]), [npdItems]);
  // Same as materials.find(i => i.id === a || i.id === b): earliest of the two.
  const firstOf = <T,>(rows: T[], map: Map<string, T>, a?: string, b?: string) => {
    const x = a !== undefined ? map.get(a) : undefined;
    const y = b !== undefined ? map.get(b) : undefined;
    if (!x) return y;
    if (!y) return x;
    return rows.indexOf(x) <= rows.indexOf(y) ? x : y;
  };
  const itemNameOf = (itemId?: string, materialId?: string) =>
    (firstOf(materials, materialById, itemId, materialId) as any)?.name ||
    (firstOf(npdItems as any[], npdById, itemId, materialId) as any)?.name;
  const getSupplierName = (id: string) => {
    const s = supplierById.get(id);
    if (s) return s.name;
    const c = companyById.get(id);
    if (c) return c.name;
    return id;
  };

  const processedData = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    // 1. Base Flattening for Line Items
    const allLineItems = materialIn.flatMap(m => {
      const safeLines = Array.isArray(m.lines) ? m.lines : [];
      const gateEntry = m.gateEntryId ? gateEntryMap.get(m.gateEntryId) : null;
      
      return safeLines.map(line => {
        if (!line) return null;
        
        // Date range filter
        const entryDate = m.date || "";
        if (fromDate && entryDate < fromDate) return null;
        if (toDate && entryDate > toDate) return null;
        if (mrrFilter && m.transactionNo !== mrrFilter) return null;
        return {
          ...line,
          // Older lines were saved without a value: fall back to Qty × Rate.
          value: Number(line.value || 0) > 0 ? Number(line.value) : Number(line.qty || 0) * Number(line.rate || 0),
          parentStatus: m.status,
          parentTransactionNo: m.transactionNo,
          parentDate: m.date,
          parentInvoiceNo: m.invoiceNo,
          parentSupplierId: m.supplierId,
          parentId: m.id,
          parentGateEntryNo: m.gateEntryNo || gateEntry?.gateEntryNo || "-",
          parentVehicleNo: gateEntry?.truckNo || "-",
          timestamp: m.timestamp,
          mrrType: m.mrrType || "Others",
          isOpeningMrr: isOpeningMrrNo(m.transactionNo)
        };
      }).filter((l): l is NonNullable<typeof l> => l !== null);
    });

    // 2. Reel Details Flattening
    const reelDetails = packingSlips.map(slip => {
      const parent = materialIn.find(m => m.id === slip.materialInId);
      if (!parent) return null;

      // Date range filter
      const entryDate = parent.date || "";
      if (fromDate && entryDate < fromDate) return null;
      if (toDate && entryDate > toDate) return null;
      if (mrrFilter && parent.transactionNo !== mrrFilter) return null;
      const gateEntry = parent.gateEntryId ? gateEntryMap.get(parent.gateEntryId) : null;
      const material = materialMap.get(slip.materialId);
      const specs = material ? `${material.gsm || "-"} GSM / ${material.bf || "-"} BF / ${material.size || "-"} ${(material as any).sizeUom || ""}` : "Unknown";

      return {
        ...slip,
        parentTransactionNo: parent.transactionNo,
        parentDate: parent.date,
        parentSupplierId: parent.supplierId,
        parentStatus: parent.status,
        parentGateEntryNo: parent.gateEntryNo || gateEntry?.gateEntryNo || "-",
        parentVehicleNo: gateEntry?.truckNo || "-",
        timestamp: parent.timestamp,
        specs,
        isOpeningMrr: isOpeningMrrNo(parent.transactionNo)
      };
    }).filter((l): l is NonNullable<typeof l> => l !== null);

    const filterFn = (item: any) => {
      if (!q) return true;
      const itemName = itemNameOf(item.itemId, item.materialId) || "";
      const supplierName = getSupplierName(item.parentSupplierId);
      return (
        itemName.toLowerCase().includes(q) ||
        supplierName.toLowerCase().includes(q) ||
        (item.parentTransactionNo || "").toLowerCase().includes(q) ||
        (item.parentInvoiceNo || "").toLowerCase().includes(q) ||
        (item.ourReelNo || "").toLowerCase().includes(q) ||
        (item.supplierReelNo || "").toLowerCase().includes(q) ||
        (item.parentGateEntryNo || "").toLowerCase().includes(q) ||
        (item.parentVehicleNo || "").toLowerCase().includes(q)
      );
    };

    const others = allLineItems.filter(l => l.mrrType !== "Reel").filter(filterFn);
    const reelSummary = allLineItems.filter(l => l.mrrType === "Reel").filter(filterFn);
    const filteredReelDetails = reelDetails.filter(filterFn);
    const reelStockRows = buildReelStockRows({
      materials,
      materialIn,
      packingSlips,
      issueReelLines,
      returnReelLines,
      suppliers,
    }).filter(row => {
      if (fromDate && row.mrrDate < fromDate) return false;
      if (toDate && row.mrrDate > toDate) return false;
      if (mrrFilter && row.mrrNo !== mrrFilter) return false;
      if (!q) return true;

      return [
        row.mrrNo,
        row.ourReelNo,
        row.erp,
        row.itemName,
        row.supplierName,
        row.gsm,
        row.size,
        row.bf,
      ].some(value => String(value || "").toLowerCase().includes(q));
    });

    const visibleLines = [...others, ...reelSummary];
    const openingLines = visibleLines.filter(l => l.isOpeningMrr);
    const receiptLines = visibleLines.filter(l => !l.isOpeningMrr);

    // Calculate Metrics
    const metrics = {
      openingQty: openingLines.reduce((sum, l) => sum + Number(l.actualQty ?? l.qty ?? 0), 0),
      receiptQty: remoteSummaryMetrics.receiptQty || receiptLines.reduce((sum, l) => sum + Number(l.actualQty ?? l.qty ?? 0), 0),
      openingValue: reelStockRows.reduce((sum, row) => sum + (Number(row.openingQty || 0) * Number(row.rate || 0)), 0),
      receiptValue: remoteSummaryMetrics.receiptValue || reelStockRows.reduce((sum, row) => sum + (Number(row.mrrQty || 0) * Number(row.rate || 0)), 0),
      openingReelWeight: reelStockRows.reduce((sum, row) => sum + Number(row.openingQty || 0), 0),
      receiptReelWeight: remoteSummaryMetrics.receiptQty || reelStockRows.reduce((sum, row) => sum + Number(row.mrrQty || 0), 0),
      totalReceipts: remoteSummaryMetrics.totalReceipts || new Set(receiptLines.map(l => l.parentId)).size,
      othersValue: others.reduce((sum, l) => sum + Number(l.value || 0), 0),
      // General materials only (the General tab's tiles).
      generalOpeningValue: others.filter(l => l.isOpeningMrr).reduce((sum, l) => sum + Number(l.value || 0), 0),
      generalReceiptValue: others.filter(l => !l.isOpeningMrr).reduce((sum, l) => sum + Number(l.value || 0), 0),
      generalReceipts: new Set(others.filter(l => !l.isOpeningMrr).map(l => l.parentId)).size,
      generalLines: others.filter(l => !l.isOpeningMrr).length,
      // Reel Summary is server-paginated; use the server's full filtered
      // total instead of summing only the currently loaded page/raw cache.
      reelValue: remoteSummaryMetrics.receiptValue || reelSummary.reduce((sum, l) => sum + Number(l.value || 0), 0)
    };

    return {
      others: others.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      reelSummary: reelSummary.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      reelDetails: filteredReelDetails.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      metrics
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialIn, packingSlips, materials, issueReelLines, returnReelLines, npdItems, suppliers, companies, searchTerm, fromDate, toDate, mrrFilter, materialMap, gateEntryMap, remoteSummaryMetrics, materialById, npdById, supplierById, companyById]);



  // "Others" tab: 25 rows per page (it drew every receipt line at once).
  const othersPagination = useClientPagination(processedData.others, 25);
  const { setPage: setOthersPage } = othersPagination;
  useEffect(() => { setOthersPage(1); }, [searchTerm, fromDate, toDate, mrrFilter, activeTab, setOthersPage]);

  const excelRows = useMemo(() => {
    if (activeTab === "reel-details") {
      return processedData.reelDetails.map((reel: any) => ({
        "GE No": reel.parentGateEntryNo,
        "MRR No": reel.parentTransactionNo,
        Date: formatDate(reel.parentDate),
        "Vehicle No": reel.parentVehicleNo,
        Supplier: getSupplierName(reel.parentSupplierId),
        "Material Specs": reel.specs,
        "Our Reel No": reel.ourReelNo,
        "Supplier Reel No": reel.supplierReelNo || "-",
        "Weight (KG)": Number(reel.weightKg || 0),
      }));
    }

    const data = activeTab === "others" ? othersPagination.paginatedItems : processedData.reelSummary;
    return data.map((line: any) => {
      const itemName = itemNameOf(line.itemId) || "Unknown";
      return {
        "GE No": line.parentGateEntryNo,
        "MRR No": line.parentTransactionNo,
        Date: formatDate(line.parentDate),
        "Vehicle No": line.parentVehicleNo,
        "Party": getSupplierName(line.parentSupplierId),
        "Item Name": itemName,
        "Invoice No": line.parentInvoiceNo || "-",
        Qty: Number(line.qty || 0),
        UOM: line.uom || "",
        Rate: Number(line.rate || 0),
        Value: Number(line.value || 0),
      };
    });
  }, [activeTab, processedData, materials, npdItems, suppliers, companies]);
  const renderTable = () => {
    const data = activeTab === "others" ? othersPagination.paginatedItems : 
                 activeTab === "reel-summary" ? remoteReelSummary : 
                 remoteReelDetails;

    if (activeTab === "reel-details" && remoteDetailsLoading) {
      return <div className="px-4 py-10 text-center text-indigo-700 font-bold">Loading Reel data…</div>;
    }
    if (activeTab === "reel-details" && remoteDetailsError) {
      return <div className="px-4 py-10 text-center text-red-700 font-bold">Unable to load Reel details: {remoteDetailsError}</div>;
    }
    if (activeTab === "reel-summary" && remoteSummaryLoading) return <div className="px-4 py-10 text-center text-indigo-700 font-bold">Loading Reel summary…</div>;
    if (activeTab === "reel-summary" && remoteSummaryError) return <div className="px-4 py-10 text-center text-red-700 font-bold">Unable to load Reel summary: {remoteSummaryError}</div>;
    if (data.length === 0) {
      return (
        <div className="px-4 py-8 text-center text-black font-medium italic">No items found for the current filters.</div>
      );
    }

    if (activeTab === "reel-details") {
      return (
        <>
<table data-table-pagination="true" className="min-w-full divide-y divide-black border-collapse border border-black">
          <thead className="sticky top-0 z-30 bg-slate-100 divide-x divide-black">
            <tr className="divide-x divide-black">
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">GE No</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">MRR No</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Date</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Vehicle No</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Supplier</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Material Specs</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Our Reel No</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Supplier Reel No</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black">Weight (KG)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black bg-white">
            {data.map((reel: any) => (
              <tr key={reel.id} className="hover:bg-slate-50 divide-x divide-black transition-colors text-sm">
                <td className="px-4 py-3 border border-black font-medium">{reel.parentGateEntryNo}</td>
                <td className="px-4 py-3 font-medium text-indigo-700 border border-black">{reel.parentTransactionNo}</td>
                <td className="px-4 py-3 border border-black">{formatDate(reel.parentDate)}</td>
                <td className="px-4 py-3 border border-black font-medium">{reel.parentVehicleNo}</td>
                <td className="px-4 py-3 border border-black">{getSupplierName(reel.parentSupplierId)}</td>
                <td className="px-4 py-3 border border-black">{reel.specs}</td>
                <td className="px-4 py-3 font-bold border border-black">{reel.ourReelNo}</td>
                <td className="px-4 py-3 border border-black">{reel.supplierReelNo || "-"}</td>
                <td className="px-4 py-3 text-right font-black text-amber-600 border border-black">{reel.weightKg.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-end border border-black bg-white px-3 py-2 text-xs font-bold gap-3">
          <span className="font-black" title="Total">{remoteDetailsTotalRows}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={remoteDetailsPage <= 1} onClick={() => setRemoteDetailsPage((p) => Math.max(1, p - 1))} className="rounded border border-black px-3 py-1 disabled:opacity-40" aria-label="Previous page" title="Previous page">&#8249;</button>
            <span>{remoteDetailsPage} / {remoteDetailsTotalPages}</span>
            <button type="button" disabled={remoteDetailsPage >= remoteDetailsTotalPages} onClick={() => setRemoteDetailsPage((p) => Math.min(remoteDetailsTotalPages, p + 1))} className="rounded border border-black px-3 py-1 disabled:opacity-40" aria-label="Next page" title="Next page">&#8250;</button>
          </div>
        </div>
        </>
      );
    }

    return (
      <>
      <table data-table-pagination={activeTab === "reel-summary" ? "true" : undefined} className="min-w-full divide-y divide-black border-collapse border border-black">
        <thead className="sticky top-0 z-30 bg-slate-100 divide-x divide-black">
          <tr className="divide-x divide-black">
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">GE No</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">MRR No</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Date</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">Vehicle No</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black min-w-[240px]">Party</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black min-w-[320px]">Item Name</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Invoice No</th>
            <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black">Qty</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black">UOM</th>
            <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black">Rate</th>
            <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black">Value</th>
            <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black bg-white">
          {data.map((line: any) => {
            const itemName = itemNameOf(line.itemId) || "Unknown";
            const canEditInline = canManage && line.parentStatus === "Pending PH";
            const isEditing = editingLineId === line.id;

            return (
              <tr key={line.id} className="hover:bg-slate-50 divide-x divide-black transition-colors text-sm">
                <td className="px-4 py-3 border border-black font-medium">{line.parentGateEntryNo}</td>
                <td className="px-4 py-3 font-medium text-black border border-black whitespace-nowrap">{line.parentTransactionNo}</td>
                <td className="px-4 py-3 border border-black whitespace-nowrap">{formatDate(line.parentDate)}</td>
                <td className="px-4 py-3 border border-black font-medium">{line.parentVehicleNo}</td>
                <td className="px-4 py-3 border border-black min-w-[240px] whitespace-normal break-words leading-snug">{getSupplierName(line.parentSupplierId)}</td>
                <td className="px-4 py-3 border border-black min-w-[320px] whitespace-normal break-words leading-snug">{itemName}</td>
                <td className="px-4 py-3 border border-black whitespace-nowrap font-medium">{line.parentInvoiceNo || "-"}</td>
                <td className="px-4 py-3 font-bold text-indigo-700 border border-black text-right">
                  {isEditing ? (
                    <input 
                      type="number"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value === "" ? "" : parseFloat(e.target.value))}
                      className="w-20 border-2 border-indigo-600 rounded p-1 text-black focus:outline-none focus:ring-1 focus:ring-indigo-600 text-right"
                      autoFocus
                    />
                  ) : (
                    line.qty.toLocaleString()
                  )}
                </td>
                <td className="px-4 py-3 text-black border border-black text-center uppercase">{line.uom}</td>
                <td className="px-4 py-3 text-black border border-black text-right">{line.rate?.toLocaleString()}</td>
                <td className="px-4 py-3 font-medium text-black border border-black text-right whitespace-nowrap">{line.value?.toLocaleString()}</td>
                <td className="px-4 py-3 text-center border border-black whitespace-nowrap">
                  {isEditing ? (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSaveQty(line.parentId, line.id)}
                        disabled={isSubmitting}
                        className="p-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition disabled:opacity-50 border border-emerald-700"
                      >
                        {isSubmitting ? <Spinner size={16} /> : <Check size={18} />}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSubmitting}
                        className="p-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition disabled:opacity-50 border border-red-700"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/material-in/form?edit=${line.parentId}`)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-blue-600 bg-white text-blue-600 hover:bg-blue-50"
                          title="Edit MRR"
                          aria-label="Edit MRR"
                        >
                          <Pencil size={15} />
                        </button>
                      ) : null}
                      {canEditInline ? (
                        <button
                          type="button"
                          onClick={() => handleEditClick(line.id, line.qty)}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border-2 border-indigo-600 bg-white px-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50"
                          title="Edit Qty"
                        >
                          <Edit2 size={13} /> Qty
                        </button>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {activeTab === "reel-summary" ? (
        <div className="flex items-center justify-end border border-black bg-white px-3 py-2 text-xs font-bold gap-3">
          <span className="font-black" title="Total">{remoteSummaryTotalRows}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={remoteSummaryPage <= 1} onClick={() => setRemoteSummaryPage((p) => Math.max(1, p - 1))} className="rounded border border-black px-3 py-1 disabled:opacity-40" aria-label="Previous page" title="Previous page">&#8249;</button>
            <span>{remoteSummaryPage} / {remoteSummaryTotalPages}</span>
            <button type="button" disabled={remoteSummaryPage >= remoteSummaryTotalPages} onClick={() => setRemoteSummaryPage((p) => Math.min(remoteSummaryTotalPages, p + 1))} className="rounded border border-black px-3 py-1 disabled:opacity-40" aria-label="Next page" title="Next page">&#8250;</button>
          </div>
        </div>
      ) : null}
      </>
    );
  };

  return (
    <div data-disable-table-pagination="true" className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-black">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Material Receipt Item Master</h2>
      </div>

      {/* Tiles follow the selected tab: General Materials or Reels, never combined. */}
      {activeTab === "others" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ItemMasterTile tone="indigo" label="Opening Value" value={processedData.metrics.generalOpeningValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
          <ItemMasterTile tone="emerald" label="Receipts" value={processedData.metrics.generalReceipts.toLocaleString()} note={`${processedData.metrics.generalLines.toLocaleString()} lines`} />
          <ItemMasterTile tone="amber" label="Item Value" value={processedData.metrics.generalReceiptValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
          <ItemMasterTile tone="rose" label="Total Value" value={processedData.metrics.othersValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} note="Opening + receipts" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ItemMasterTile tone="indigo" label="Opening" value={`${processedData.metrics.openingReelWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} KG`} note={`Value ${processedData.metrics.openingValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
          <ItemMasterTile tone="emerald" label="Receipts" value={`${processedData.metrics.receiptReelWeight.toLocaleString(undefined, { minimumFractionDigits: 2 })} KG`} note={`${processedData.metrics.totalReceipts.toLocaleString()} MRR`} />
          <ItemMasterTile tone="amber" label="Item Value" value={processedData.metrics.receiptValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
          <ItemMasterTile tone="rose" label="Reel Value" value={processedData.metrics.reelValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-end gap-4 bg-slate-50 p-4 border border-black rounded shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase text-slate-500">From Date</label>
          <input 
            type="date"
            value={fromDate} 
            onChange={(e) => setFromDate(e.target.value)}
            className="border border-black rounded px-2 py-1.5 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase text-slate-500">To Date</label>
          <input 
            type="date"
            value={toDate} 
            onChange={(e) => setToDate(e.target.value)}
            className="border border-black rounded px-2 py-1.5 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="w-[180px] flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase text-slate-500">MRR No</label>
          <Select compact value={mrrFilter} onChange={setMrrFilter} options={mrrOptions} placeholder="MRR" />
        </div>

        <div className="flex-1 min-w-[200px] flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase text-slate-500">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text"
              placeholder="Search MRR No, Supplier, Reel No..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-black rounded pl-8 pr-2 py-1.5 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pb-1">
          {(fromDate || toDate || mrrFilter || searchTerm) && (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
                setMrrFilter("");
                setSearchTerm("");
              }}
              className="text-[10px] font-black uppercase text-red-600 hover:text-red-800 underline"
            >
              Reset Filters
            </button>
          )}
          <ExcelExport data={excelRows} fileName={`Material_Receipt_Item_Master_${activeTab}`} sheetName="MR Item Master" />
        </div>
      </div>

      <div className="relative z-[100] flex border-b border-black mt-2 pointer-events-auto">
        <button
          type="button"
          onMouseDown={() => setActiveTab("others")}
          onClick={() => setActiveTab("others")}
          className={`relative z-40 pointer-events-auto cursor-pointer px-4 py-2 text-[10px] font-black uppercase tracking-widest border-t border-l border-r border-black -mb-[1px] flex items-center gap-2 transition-all ${
            activeTab === "others" ? "bg-white border-b-transparent text-indigo-700 shadow-[0_-2px_0_0_#4f46e5]" : "bg-slate-50 text-slate-400 opacity-70 hover:opacity-100"
          }`}
        >
          <Package size={14} /> General Material ({processedData.others.length})
        </button>
        <button
          type="button"
          onMouseDown={() => setActiveTab("reel-summary")}
          onClick={() => setActiveTab("reel-summary")}
          className={`relative z-40 pointer-events-auto cursor-pointer px-4 py-2 text-[10px] font-black uppercase tracking-widest border-t border-l border-r border-black -mb-[1px] ml-1 flex items-center gap-2 transition-all ${
            activeTab === "reel-summary" ? "bg-white border-b-transparent text-emerald-700 shadow-[0_-2px_0_0_#059669]" : "bg-slate-50 text-slate-400 opacity-70 hover:opacity-100"
          }`}
        >
          <Layers size={14} /> Reel Summary ({remoteSummaryTotalRows})
        </button>
        <button
          type="button"
          onMouseDown={() => setActiveTab("reel-details")}
          onClick={() => setActiveTab("reel-details")}
          className={`relative z-40 pointer-events-auto cursor-pointer px-4 py-2 text-[10px] font-black uppercase tracking-widest border-t border-l border-r border-black -mb-[1px] ml-1 flex items-center gap-2 transition-all ${
            activeTab === "reel-details" ? "bg-white border-b-transparent text-amber-700 shadow-[0_-2px_0_0_#d97706]" : "bg-slate-50 text-slate-400 opacity-70 hover:opacity-100"
          }`}
        >
          {/* The count is known once the tab has been opened (the report runs then). */}
          <Disc size={14} /> Reel Details{remoteDetailsTotalRows || activeTab === "reel-details" ? ` (${remoteDetailsTotalRows})` : ""}
        </button>
      </div>

      <div className="bg-white rounded-b shadow-sm overflow-hidden border border-black">
        <div className="overflow-x-auto">
          {renderTable()}
          {activeTab === "others" ? (
            <ClientPagination
              page={othersPagination.page}
              pageSize={othersPagination.pageSize}
              totalItems={othersPagination.totalItems}
              onPageChange={othersPagination.setPage}
              onPageSizeChange={othersPagination.setPageSize}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ITEM_MASTER_TILE_TONES = {
  indigo: "bg-indigo-50 text-indigo-900",
  emerald: "bg-emerald-50 text-emerald-900",
  amber: "bg-amber-50 text-amber-900",
  rose: "bg-rose-50 text-rose-900",
} as const;

function ItemMasterTile({ label, value, note, tone }: { label: string; value: string; note?: string; tone: keyof typeof ITEM_MASTER_TILE_TONES }) {
  return (
    <div className={`rounded-lg border-2 border-black p-3 ${ITEM_MASTER_TILE_TONES[tone]}`}>
      <div className="text-[11px] font-black uppercase tracking-wide">{label}</div>
      <div className="text-xl font-black tabular-nums">{value}</div>
      {note ? <div className="text-[11px] font-bold opacity-80">{note}</div> : null}
    </div>
  );
}
