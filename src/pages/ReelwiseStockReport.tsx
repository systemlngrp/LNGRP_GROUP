import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Search, Download } from "lucide-react";
import { Select } from "../components/Select";
import { exportsAllowed } from "../lib/exportPolicy";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { useAutoRefreshEffect } from "../hooks/useAutoRefresh";
import { downloadMrrReelLabelsPdf } from "../lib/mrrReelLabelsPdf";
import {
  Company,
  Firm,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  Setting,
  Supplier,
} from "../types";
import type { ReelStockCalculationRow } from "../lib/reelStock";
import { formatDate } from "../lib/utils";
import { SortHeader, applySortParams, useServerSort } from "../lib/tableSort";

type AvailabilityFilter = "all" | "gt500" | "lt500";
type ReelwiseStockRow = ReelStockCalculationRow;

const tableColumns = [
  "SL No",
  "MRR No.",
  "Our Reel No.",
  "ERP",
  "Inventory Owner",
  "Suppliers Name",
  "GSM",
  "Size",
  "BF",
  "Opening Qty",
  "MRR Qty",
  "Issued",
  "Return",
  "Net Issued",
  "Available Weight",
  "Rate",
  "Valuation",
  "Age(D days)",
  "Download",
];

// Column → server sort key (/api/reports/reelwise-stock whitelist). SL No and QR have none.
const sortKeyByColumn: Record<string, string> = {
  "MRR No.": "mrrNo",
  "Our Reel No.": "ourReelNo",
  ERP: "erp",
  "Inventory Owner": "firmName",
  "Suppliers Name": "supplierName",
  GSM: "gsm",
  Size: "size",
  BF: "bf",
  "Opening Qty": "openingQty",
  "MRR Qty": "mrrQty",
  Issued: "issuedWeight",
  Return: "returnedWeight",
  "Net Issued": "netIssuedWeight",
  "Available Weight": "availableWeight",
  Rate: "rate",
  Valuation: "valuation",
  "Age(D days)": "ageDays",
};

const formatReportDate = formatDate;

function makeOptions(values: Array<string | number>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((value) => ({ value, label: value }));
}

function formatQty(value: number) {
  return Number(value || 0).toFixed(2);
}

/** Screen numbers: drop ".00" on whole numbers. */
function showQty(value: number) {
  return (Math.round(Number(value || 0) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function safeFileName(value: string) {
  return String(value || "Reel_Stock")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "Reel_Stock";
}

export function ReelwiseStockReport() {
  const [materials] = useData<Material>("materials", [], { firmScope: "all", cacheToLocalStorage: false });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", cacheToLocalStorage: false });
  const [suppliers] = useData<Supplier>("suppliers", [], { firmScope: "all", cacheToLocalStorage: false });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", cacheToLocalStorage: false });
  const [settings] = useData<Setting>("settings", [], { cacheToLocalStorage: false });
  const [reportRows, setReportRows] = useState<ReelwiseStockRow[]>([]);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [serverSummary, setServerSummary] = useState<any>(null);
  const [serverOptions, setServerOptions] = useState<Record<string, string[]>>({ mrr: [], erp: [], gsm: [], size: [], bf: [] });
  const [searchTerm, setSearchTerm] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [stockYetToIssueOnly, setStockYetToIssueOnly] = useState(false);
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [mrrDateFrom, setMrrDateFrom] = useState("");
  const [mrrDateTo, setMrrDateTo] = useState("");
  const [excludeZeroAvailable, setExcludeZeroAvailable] = useState(false);
  const [mrrFilter, setMrrFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [gsmFilter, setGsmFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [bfFilter, setBfFilter] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // Column sort: the server sorts the whole filtered list before paging; exports follow it.
  const { sort, toggle: toggleSort } = useServerSort(() => setPage(1));

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ availability: availabilityFilter });
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (mrrFilter) params.set("mrr", mrrFilter);
    if (erpFilter) params.set("erp", erpFilter);
    if (gsmFilter) params.set("gsm", gsmFilter);
    if (sizeFilter) params.set("size", sizeFilter);
    if (bfFilter) params.set("bf", bfFilter);
    if (mrrDateFrom) params.set("dateFrom", mrrDateFrom);
    if (mrrDateTo) params.set("dateTo", mrrDateTo);
    if (minAge) params.set("minAge", minAge);
    if (maxAge) params.set("maxAge", maxAge);
    if (stockYetToIssueOnly) params.set("stockYetToIssue", "true");
    if (excludeZeroAvailable) params.set("excludeZero", "true");
    applySortParams(params, sort);
    return params;
  }, [availabilityFilter, bfFilter, erpFilter, excludeZeroAvailable, gsmFilter, maxAge, minAge, mrrDateFrom, mrrDateTo, mrrFilter, searchTerm, sizeFilter, sort, stockYetToIssueOnly]);

  // Exports cover every row matching the filters and search, not just this page.
  const [exporting, setExporting] = useState(false);
  const fetchAllRows = useCallback(async (): Promise<ReelwiseStockRow[]> => {
    const params = buildParams();
    params.set("export", "1");
    params.set("page", "1");
    const response = await fetch(`/api/reports/reelwise-stock?${params}`, { headers: getDataAuthHeaders(false) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload?.rows)) throw new Error(String(payload?.error || `Failed to load Reel Stock (${response.status}).`));
    return payload.rows as ReelwiseStockRow[];
  }, [buildParams]);

  const loadReport = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setReportLoading(true);
    setReportError(null);
    try {
      const params = buildParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const response = await fetch(`/api/reports/reelwise-stock?${params}`, {
        headers: getDataAuthHeaders(false),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || `Failed to load Reel Stock (${response.status}).`));
      if (!Array.isArray(payload?.rows)) throw new Error("Reel Stock returned an invalid response.");
      setReportRows(payload.rows as ReelwiseStockRow[]);
      setTotalRows(Number(payload.totalRows) || 0);
      setTotalPages(Number(payload.totalPages) || 1);
      setServerSummary(payload.summary || null);
      setServerOptions(payload.options || {});
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to load Reel Stock", error);
      setReportRows([]);
      setReportError(error instanceof Error ? error.message : "Failed to load Reel Stock.");
    } finally {
      setReportLoading(false);
    }
  }, [buildParams, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 300);
    return () => { window.clearTimeout(timer); abortRef.current?.abort(); };
  }, [loadReport]);

  useEffect(() => {
    setPage(1);
  }, [availabilityFilter, bfFilter, erpFilter, excludeZeroAvailable, gsmFilter, maxAge, minAge, mrrDateFrom, mrrDateTo, mrrFilter, searchTerm, sizeFilter, stockYetToIssueOnly]);

  useAutoRefreshEffect(() => {
    void loadReport();
  });

  const allRows = reportRows;

  const mrrOptions = useMemo(() => makeOptions(serverOptions.mrr || []), [serverOptions]);
  const erpOptions = useMemo(() => makeOptions(serverOptions.erp || []), [serverOptions]);
  const gsmOptions = useMemo(() => makeOptions(serverOptions.gsm || []), [serverOptions]);
  const sizeOptions = useMemo(() => makeOptions(serverOptions.size || []), [serverOptions]);
  const bfOptions = useMemo(() => makeOptions(serverOptions.bf || []), [serverOptions]);

  const rows = allRows;

  const summary = useMemo(() => {
    if (serverSummary) return serverSummary;
    return {
      totalAvailableStock: rows.reduce((sum, row) => sum + row.availableWeight, 0),
      totalReels: rows.filter((row) => row.availableWeight > 0).length,
      totalValuation: rows.reduce((sum, row) => sum + row.valuation, 0),
      totalMrrQty: rows.reduce((sum, row) => sum + row.mrrQty, 0),
      totalOpeningQty: rows.reduce((sum, row) => sum + row.openingQty, 0),
      totalIssued: rows.reduce((sum, row) => sum + row.issuedWeight, 0),
      totalReturned: rows.reduce((sum, row) => sum + row.returnedWeight, 0),
      totalNetIssued: rows.reduce((sum, row) => sum + row.netIssuedWeight, 0),
    };
  }, [rows]);


  const hasActiveFilters = Boolean(
    searchTerm ||
    availabilityFilter !== "all" ||
    stockYetToIssueOnly ||
    minAge ||
    maxAge ||
    mrrDateFrom ||
    mrrDateTo ||
    mrrFilter ||
    excludeZeroAvailable ||
    erpFilter ||
    gsmFilter ||
    sizeFilter ||
    bfFilter
  );

  const handleClearFilters = () => {
    setSearchTerm("");
    setAvailabilityFilter("all");
    setStockYetToIssueOnly(false);
    setMinAge("");
    setMaxAge("");
    setMrrDateFrom("");
    setMrrDateTo("");
    setMrrFilter("");
    setExcludeZeroAvailable(false);
    setErpFilter("");
    setGsmFilter("");
    setSizeFilter("");
    setBfFilter("");
  };


  const toExcelRows = (exportRows: ReelwiseStockRow[]) => exportRows.map((row, index) => ({
      "SL No": index + 1,
      "MRR No.": row.mrrNo,
      "Our Reel No.": row.ourReelNo,
      ERP: row.erp,
      Firm: row.firmName,
      "Suppliers Name": row.supplierName || "-",
      GSM: row.gsm || "",
      Size: row.size || "",
      BF: row.bf || "",
      "Opening Qty": Number(formatQty(row.openingQty)),
      "MRR Qty": Number(formatQty(row.mrrQty)),
      Issued: Number(formatQty(row.issuedWeight)),
      Return: Number(formatQty(row.returnedWeight)),
      "Net Issued": Number(formatQty(row.netIssuedWeight)),
      "Available Weight": Number(formatQty(row.availableWeight)),
      Rate: Number(formatQty(row.rate)),
      Valuation: Number(formatQty(row.valuation)),
      "Age(D days)": row.ageDays,
    }));

  const handleExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const exportRows = await fetchAllRows();
      if (exportRows.length === 0) return;
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(toExcelRows(exportRows));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reel Stock");
      XLSX.writeFile(wb, `Reel_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Excel download failed.");
    } finally {
      setExporting(false);
    }
  };
  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    let rows: ReelwiseStockRow[];
    try {
      rows = await fetchAllRows();
    } catch (error) {
      alert(error instanceof Error ? error.message : "PDF download failed.");
      setExporting(false);
      return;
    }
    setExporting(false);
    const doc = new jsPDF("l", "mm", "a4");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Reel Stock", 14, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated: ${formatDate(new Date())}`, 14, 20);
    doc.text(`Rows: ${rows.length}`, 270, 20, { align: "right" });

    autoTable(doc, {
      startY: 24,
      theme: "grid",
      headStyles: { fillColor: [67, 56, 202] },
      styles: { fontSize: 7.4, cellPadding: 1.6, lineColor: [0, 0, 0], lineWidth: 0.1 },
      head: [[
        "SL No",
        "MRR No.",
        "Our Reel No.",
        "ERP",
        "Firm",
        "Supplier",
        "GSM",
        "Size",
        "BF",
        "Opening Qty",
        "MRR Qty",
        "Issued",
        "Return",
        "Net Issued",
        "Available Weight",
        "Rate",
        "Valuation",
        "Age(D days)",
      ]],
      body: rows.map((row, index) => [
        String(index + 1),
        row.mrrNo,
        row.ourReelNo,
        row.erp,
        row.firmName,
        row.supplierName || "-",
        String(row.gsm || ""),
        String(row.size || ""),
        String(row.bf || ""),
        formatQty(row.openingQty),
        formatQty(row.mrrQty),
        formatQty(row.issuedWeight),
        formatQty(row.returnedWeight),
        formatQty(row.netIssuedWeight),
        formatQty(row.availableWeight),
        formatQty(row.rate),
        formatQty(row.valuation),
        String(row.ageDays),
      ]),
      columnStyles: {
        0: { halign: "right" },
        8: { halign: "right" },
        9: { halign: "right" },
        10: { halign: "right" },
        11: { halign: "right" },
        12: { halign: "right" },
        13: { halign: "right" },
        14: { halign: "right" },
        15: { halign: "right" },
        16: { halign: "right" },
      },
    });

    const fileDate = new Date().toISOString().slice(0, 10);
    doc.save(`${safeFileName(`Reel_Stock_${fileDate}`)}.pdf`);
  };

  const handleExportRowPdf = async (row: ReelwiseStockRow) => {
    let slip: MaterialInPackingSlip | undefined;
    let mrr: MaterialIn | undefined;
    let qrPayload: string;

    if (row.isOpening) {
      const availableWeight = Number(row.availableWeight || 0);
      if (!row.ourReelNo.trim()) {
        alert("Opening reel QR cannot be generated because the reel number is missing.");
        return;
      }
      if (!Number.isFinite(availableWeight) || availableWeight <= 0) {
        alert("Opening reel QR cannot be generated because available weight is zero.");
        return;
      }
      const openingId = `opening-${row.slipId}`;
      slip = {
        id: row.slipId,
        firmId: row.firmId,
        materialInId: openingId,
        materialLineId: `opening-line-${row.materialId}`,
        materialId: row.materialId,
        ourReelNo: row.ourReelNo,
        weightKg: availableWeight,
      };
      mrr = {
        id: openingId,
        firmId: row.firmId,
        transactionNo: "Opening",
        mrrType: "Reel",
        timestamp: new Date().toISOString(),
        entryEmailId: "",
        date: row.mrrDate || new Date().toISOString().slice(0, 10),
        invoiceNo: "",
        invDate: "",
        supplierId: "",
        status: "Approved",
        totalAmount: 0,
        lines: [],
      };
      qrPayload = JSON.stringify({
        source: "Opening",
        reelNo: row.ourReelNo,
        ourReelNo: row.ourReelNo,
        weight: availableWeight.toFixed(2),
        weightKg: availableWeight,
        mrrNo: "Opening",
        date: mrr.date,
        materialCode: row.erp,
      });
    } else {
      const receiptId = `report-mrr-${row.slipId}`;
      const lineId = `report-line-${row.materialId}`;
      slip = {
        id: row.slipId,
        firmId: row.firmId,
        materialInId: receiptId,
        materialLineId: lineId,
        materialId: row.materialId,
        ourReelNo: row.ourReelNo,
        weightKg: Number(row.availableWeight || 0),
      };
      mrr = {
        id: receiptId,
        firmId: row.firmId,
        transactionNo: row.mrrNo,
        mrrType: "Reel",
        timestamp: new Date().toISOString(),
        entryEmailId: "",
        date: row.mrrDate,
        invoiceNo: "",
        invDate: "",
        supplierId: "",
        status: "Approved",
        totalAmount: Number(row.availableWeight || 0) * Number(row.rate || 0),
        lines: [{
          id: lineId,
          itemId: row.materialId,
          qty: Number(row.mrrQty || row.openingQty || row.availableWeight || 0),
          uom: "KGS",
          rate: Number(row.rate || 0),
          value: Number(row.availableWeight || 0) * Number(row.rate || 0),
        }],
      };
      qrPayload = JSON.stringify({
        reelNo: row.ourReelNo,
        weight: Number(row.availableWeight || 0).toFixed(2),
      });
    }

    try {
      await downloadMrrReelLabelsPdf({
        mrr,
        packingSlips: [slip],
        materials,
        suppliers,
        companies,
        setting: settings[0] || null,
        firms,
        paperSize: "A4",
        qrPayloadByPackingSlipId: {
          [slip.id]: qrPayload,
        },
        weightKgByPackingSlipId: {
          [slip.id]: Number(row.availableWeight || 0),
        },
      });
    } catch (error) {
      console.error("Failed to generate reel QR label PDF", error);
      alert(error instanceof Error ? error.message : "Failed to generate reel QR label PDF.");
    }
  };

  return (
    <div data-disable-table-pagination="true" className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-black pb-3">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Reel Stock</h2>
        {exportsAllowed() ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void handleExportPdf()} disabled={exporting} title="Download PDF" className="rounded border border-rose-700 px-3 py-1.5 text-sm font-bold text-rose-700 disabled:opacity-50">PDF</button>
            <button type="button" onClick={() => void handleExportExcel()} disabled={exporting} title="Download Excel" className="rounded border border-emerald-700 px-3 py-1.5 text-sm font-bold text-emerald-700 disabled:opacity-50">Excel</button>
          </div>
        ) : null}
      </div>

      {reportError ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">Unable to load Reel Stock: {reportError}</div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border-2 border-black bg-amber-50 p-3 text-amber-900">
          <div className="text-[11px] font-black uppercase tracking-wide">Reels</div>
          <div className="text-xl font-black tabular-nums">{Number(summary.totalReels || 0).toLocaleString()}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-emerald-50 p-3 text-emerald-900">
          <div className="text-[11px] font-black uppercase tracking-wide">Available KG</div>
          <div className="text-xl font-black tabular-nums">{showQty(summary.totalAvailableStock)}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-rose-50 p-3 text-rose-900">
          <div className="text-[11px] font-black uppercase tracking-wide">Valuation</div>
          <div className="text-xl font-black tabular-nums">{showQty(summary.totalValuation)}</div>
        </div>
      </div>

      <div className="space-y-2 rounded border border-black bg-white p-3">
        <div className="relative w-full min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search"
            className="h-[36px] w-full rounded border-2 border-black pl-8 pr-2 text-sm font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_minmax(0,1.6fr)]">
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">MRR</span><Select compact value={mrrFilter} onChange={setMrrFilter} options={mrrOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">ERP</span><Select compact value={erpFilter} onChange={setErpFilter} options={erpOptions} placeholder="All" /></div>
          <div className="col-span-2 grid grid-cols-3 gap-2 lg:col-span-1">
            <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">GSM</span><Select compact value={gsmFilter} onChange={setGsmFilter} options={gsmOptions} placeholder="All" /></div>
            <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">Size</span><Select compact value={sizeFilter} onChange={setSizeFilter} options={sizeOptions} placeholder="All" /></div>
            <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">BF</span><Select compact value={bfFilter} onChange={setBfFilter} options={bfOptions} placeholder="All" /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_90px_90px]">
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">MRR Date From</span><input type="date" value={mrrDateFrom} max={mrrDateTo || undefined} onChange={(e) => setMrrDateFrom(e.target.value)} className="h-[34px] w-full min-w-0 rounded border-2 border-black px-2 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">MRR Date To</span><input type="date" value={mrrDateTo} min={mrrDateFrom || undefined} onChange={(e) => setMrrDateTo(e.target.value)} className="h-[34px] w-full min-w-0 rounded border-2 border-black px-2 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">Age Min (days)</span><input type="number" min="0" value={minAge} onChange={(e) => setMinAge(e.target.value)} className="h-[34px] w-full min-w-0 rounded border-2 border-black px-2 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">Age Max (days)</span><input type="number" min="0" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} className="h-[34px] w-full min-w-0 rounded border-2 border-black px-2 text-xs font-semibold focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></label>
        </div>
        <div data-mf-fold="true" data-mf-active={availabilityFilter !== "all" || stockYetToIssueOnly || excludeZeroAvailable ? "true" : "false"} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0">
            <span className="mb-0.5 block text-[10px] font-black uppercase text-slate-600">Available Stock</span>
            <div className="inline-flex h-[34px] gap-1 rounded border-2 border-black bg-white p-0.5">
              {[
                { label: "All", value: "all" as const },
                { label: "> 500", value: "gt500" as const },
                { label: "< 500", value: "lt500" as const },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAvailabilityFilter(option.value)}
                  className={`rounded px-2 text-[11px] font-black ${availabilityFilter === option.value ? "bg-indigo-600 text-white" : "bg-slate-50 text-black hover:bg-slate-100"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="inline-flex h-[34px] items-center gap-1.5 rounded border-2 border-black bg-white px-2 text-[11px] font-black uppercase text-black">
            <input type="checkbox" checked={stockYetToIssueOnly} onChange={(e) => setStockYetToIssueOnly(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
            Not issued yet
          </label>
          <label className="inline-flex h-[34px] items-center gap-1.5 rounded border-2 border-black bg-white px-2 text-[11px] font-black uppercase text-black">
            <input type="checkbox" checked={excludeZeroAvailable} onChange={(e) => setExcludeZeroAvailable(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
            Exclude 0 available
          </label>
          {hasActiveFilters ? (
            <button type="button" onClick={handleClearFilters} className="ml-auto h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-50">Clear</button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
            <tr>
              {tableColumns.map((heading) => (
                <th key={heading} className="border border-black px-2 py-2 text-left whitespace-nowrap">
                  {sortKeyByColumn[heading]
                    ? <SortHeader label={heading} sortKey={sortKeyByColumn[heading]} sort={sort} onToggle={toggleSort} align="left" />
                    : heading === "Download" ? "QR" : heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              <tr className="bg-slate-50 font-black">
                <td className="border border-black px-2 py-2" colSpan={9}>TOTAL ({totalRows.toLocaleString()})</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums text-blue-900">{showQty(summary.totalOpeningQty)}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums text-purple-900">{showQty(summary.totalMrrQty)}</td>
                <td className="border border-black px-2 py-2 text-right">-</td>
                <td className="border border-black px-2 py-2 text-right">-</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums">{showQty(summary.totalNetIssued)}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums text-emerald-900">{showQty(summary.totalAvailableStock)}</td>
                <td className="border border-black px-2 py-2 text-right">-</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums text-purple-900">{showQty(summary.totalValuation)}</td>
                <td className="border border-black px-2 py-2 text-right">-</td>
                <td className="border border-black px-2 py-2 text-right">-</td>
              </tr>
            ) : null}
            {rows.length === 0 ? (
              <tr><td colSpan={tableColumns.length} className="h-16 text-center text-sm font-bold text-indigo-900" aria-label="No records">{reportLoading ? "Loading…" : ""}</td></tr>
            ) : rows.map((row, index) => (
              <tr key={row.slipId} className="hover:bg-slate-50">
                <td className="border border-black px-2 py-2 font-bold tabular-nums">{(page - 1) * pageSize + index + 1}</td>
                <td className="border border-black px-2 py-2 font-bold whitespace-nowrap">{row.mrrNo}</td>
                <td className="border border-black px-2 py-2 font-bold whitespace-nowrap">{row.ourReelNo}</td>
                <td className="border border-black px-2 py-2 whitespace-nowrap">{row.erp}</td>
                <td className="border border-black px-2 py-2">{row.firmName}</td>
                <td className="border border-black px-2 py-2">{row.supplierName || "-"}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums">{row.gsm || ""}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums">{row.size || ""}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums">{row.bf || ""}</td>
                <td className="border border-black bg-blue-50 px-2 py-2 text-right font-bold tabular-nums text-blue-900">{showQty(row.openingQty)}</td>
                <td className="border border-black bg-purple-50 px-2 py-2 text-right font-bold tabular-nums text-purple-900">{showQty(row.mrrQty)}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums text-red-800">{showQty(row.issuedWeight)}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums text-cyan-900">{showQty(row.returnedWeight)}</td>
                <td className="border border-black px-2 py-2 text-right font-bold tabular-nums">{showQty(row.netIssuedWeight)}</td>
                <td className="border border-black bg-emerald-50 px-2 py-2 text-right font-black tabular-nums text-emerald-900">{showQty(row.availableWeight)}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums">{showQty(row.rate)}</td>
                <td className="border border-black bg-purple-50 px-2 py-2 text-right font-bold tabular-nums text-purple-900">{showQty(row.valuation)}</td>
                <td className="border border-black px-2 py-2 text-right tabular-nums text-amber-900">{row.ageDays}</td>
                <td className="border border-black px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleExportRowPdf(row)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-indigo-700 bg-white text-indigo-800 hover:bg-indigo-50"
                    title="Download reel QR label PDF"
                    aria-label="Download reel QR label PDF"
                  >
                    <Download size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 text-xs font-bold">
        <span className="font-black" title="Total">{totalRows.toLocaleString()}</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded border border-black bg-white px-1 py-1" aria-label="Rows per page">
          {[50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <button type="button" disabled={page <= 1 || reportLoading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-black bg-white px-3 py-1 disabled:opacity-50" aria-label="Previous page" title="Previous page">&#8249;</button>
        <span>{page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages || reportLoading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded border border-black bg-white px-3 py-1 disabled:opacity-50" aria-label="Next page" title="Next page">&#8250;</button>
      </div>
    </div>
  );
}
