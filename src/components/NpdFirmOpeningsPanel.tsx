import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Trash2, Upload, X } from "lucide-react";
import type { Firm } from "../types";
import { Spinner } from "./Spinner";

type OpeningRow = {
  id: string;
  npdId: string;
  firmId: string;
  openingQty: number;
  openingRate: number;
  openingValue: number;
  asOnDate: string | null;
  remarks: string | null;
  erp?: string | null;
  npdCode?: string | null;
  itemName?: string | null;
  customerName?: string | null;
  uom?: string | null;
  updatedBy?: string | null;
  updateTimestamp?: string | null;
};

const TEMPLATE_HEADERS = ["Firm", "ERP Code", "Opening Qty", "Opening Rate", "As On Date", "Remarks"];
const DEFAULT_AS_ON = "2026-04-01";

function authHeaders(json = false): Record<string, string> {
  const token = window.localStorage.getItem("authToken") || "";
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(value: string | null | undefined) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "-";
}

function formatNumber(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "-";
}

export function NpdFirmOpeningsPanel({ firms, onClose, onSaved }: { firms: Firm[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [firmFilter, setFirmFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ firmId: "", erp: "", openingQty: "", openingRate: "", asOnDate: DEFAULT_AS_ON, remarks: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const firmName = useCallback((id: string) => firms.find((f) => String(f.id) === String(id))?.firmName || "Unknown Firm", [firms]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/npd-firm-openings?firmId=all", { headers: authHeaders() });
      const result = await response.json().catch(() => []);
      if (!response.ok) throw new Error(result?.error || "Failed to load openings.");
      setRows(Array.isArray(result) ? result : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (firmFilter !== "all" && String(row.firmId) !== firmFilter) return false;
      if (!term) return true;
      return [row.erp, row.itemName, row.customerName, row.npdCode, row.remarks].some((v) => String(v || "").toLowerCase().includes(term));
    });
  }, [firmFilter, rows, search]);

  const totals = useMemo(
    () => visibleRows.reduce((s, r) => ({ qty: s.qty + Number(r.openingQty || 0), value: s.value + Number(r.openingValue || 0) }), { qty: 0, value: 0 }),
    [visibleRows]
  );

  const save = async (payloadRows: Record<string, unknown>[]) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/npd-firm-openings/bulk", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ rows: payloadRows }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Saving openings failed.");
      await load();
      onSaved();
      return Number(result.saved || 0);
    } catch (err) {
      setError((err as Error).message);
      return -1;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.firmId || !form.erp.trim() || form.openingQty === "") {
      setError("Firm, ERP Code and Opening Qty are required.");
      return;
    }
    const saved = await save([{ rowNumber: 1, firmId: form.firmId, erp: form.erp.trim(), openingQty: form.openingQty, openingRate: form.openingRate, asOnDate: form.asOnDate, remarks: form.remarks }]);
    if (saved > 0) setForm((prev) => ({ ...prev, erp: "", openingQty: "", openingRate: "", remarks: "" }));
  };

  const handleDelete = async (row: OpeningRow) => {
    if (!window.confirm(`Delete ${firmName(row.firmId)} opening for ERP ${row.erp || row.npdId} (${formatNumber(row.openingQty)})?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/npd-firm-openings/${encodeURIComponent(row.id)}`, { method: "DELETE", headers: authHeaders() });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Delete failed.");
      await load();
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const data = visibleRows.length
      ? visibleRows.map((r) => ({
          Firm: firmName(r.firmId),
          "ERP Code": r.erp || "",
          "Opening Qty": Number(r.openingQty || 0),
          "Opening Rate": Number(r.openingRate || 0),
          "As On Date": formatDate(r.asOnDate),
          Remarks: r.remarks || "",
          "Item Name": r.itemName || "",
          Customer: r.customerName || "",
        }))
      : [{ Firm: firms[0]?.firmName || "", "ERP Code": "", "Opening Qty": 0, "Opening Rate": 0, "As On Date": "01-04-2026", Remarks: "" }];
    const sheet = XLSX.utils.json_to_sheet(data);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "NPD Firm Opening");
    XLSX.writeFile(book, visibleRows.length ? "npd-firm-openings.xlsx" : "npd-firm-opening-template.xlsx");
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (loaded) => {
      try {
        const workbook = XLSX.read(loaded.target?.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const header = ((XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })[0] || []) as unknown[]).map((v) => String(v).trim());
        const missing = TEMPLATE_HEADERS.filter((h) => !["Opening Rate", "As On Date", "Remarks"].includes(h) && !header.includes(h));
        if (missing.length) throw new Error(`Missing column(s): ${missing.join(", ")}. Use the template.`);
        const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
          .map((row, index) => ({ ...row, rowNumber: index + 2 }))
          .filter((row) => String(row["ERP Code"] ?? "").trim() !== "" || String(row["Firm"] ?? "").trim() !== "");
        if (!parsed.length) throw new Error("The sheet has no opening rows.");
        if (!window.confirm(`Save ${parsed.length} opening row(s)? Existing openings for the same item and firm will be replaced.`)) return;
        const saved = await save(parsed);
        if (saved >= 0) window.alert(`${saved} firm opening(s) saved.`);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-6xl rounded border-2 border-black bg-white shadow-lg">
        <div className="flex items-center justify-between border-b-2 border-black px-4 py-3">
          <h3 className="text-lg font-black uppercase tracking-tight text-black">NPD Firm Opening Stock</h3>
          <button type="button" onClick={onClose} className="rounded border border-black p-1 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-2 rounded border border-black bg-slate-50 p-3 md:grid-cols-7">
            <select value={form.firmId} onChange={(e) => setForm({ ...form, firmId: e.target.value })} className="rounded border border-black px-2 py-1 text-sm">
              <option value="">Firm</option>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>{f.firmName}</option>
              ))}
            </select>
            <input value={form.erp} onChange={(e) => setForm({ ...form, erp: e.target.value })} placeholder="ERP Code" className="rounded border border-black px-2 py-1 text-sm" />
            <input value={form.openingQty} onChange={(e) => setForm({ ...form, openingQty: e.target.value })} type="number" min="0" step="any" placeholder="Opening Qty" className="rounded border border-black px-2 py-1 text-sm" />
            <input value={form.openingRate} onChange={(e) => setForm({ ...form, openingRate: e.target.value })} type="number" min="0" step="any" placeholder="Rate (optional)" className="rounded border border-black px-2 py-1 text-sm" />
            <input value={form.asOnDate} onChange={(e) => setForm({ ...form, asOnDate: e.target.value })} type="date" className="rounded border border-black px-2 py-1 text-sm" />
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks" className="rounded border border-black px-2 py-1 text-sm" />
            <button type="submit" disabled={busy} className="rounded border border-black bg-black px-3 py-1 text-xs font-black uppercase text-white disabled:opacity-50">
              Save
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <select value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)} className="rounded border border-black px-2 py-1 text-sm">
              <option value="all">All firms</option>
              {firms.map((f) => (
                <option key={f.id} value={f.id}>{f.firmName}</option>
              ))}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ERP, item, customer" className="w-56 rounded border border-black px-2 py-1 text-sm" />
            <button type="button" onClick={downloadTemplate} className="flex items-center gap-1 rounded border border-black px-3 py-1 text-xs font-black uppercase hover:bg-slate-100">
              <Download size={14} /> {visibleRows.length ? "Export / Template" : "Template"}
            </button>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded border border-black px-3 py-1 text-xs font-black uppercase hover:bg-slate-100 disabled:opacity-50">
              <Upload size={14} /> Upload Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
            {busy || loading ? <Spinner size={16} /> : null}
            <span className="ml-auto text-xs font-bold text-black">
              {visibleRows.length} row(s) · Qty {formatNumber(totals.qty)} · Value ₹{formatNumber(totals.value)}
            </span>
          </div>

          {error ? <pre className="whitespace-pre-wrap rounded border border-red-600 bg-red-50 p-2 text-xs text-red-700">{error}</pre> : null}

          <div className="max-h-[60vh] overflow-auto rounded border border-black">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  {["Firm", "ERP", "Item Name", "Customer", "UOM", "Opening Qty", "Rate", "Value", "As On", "Remarks", "Updated By", ""].map((h) => (
                    <th key={h} className="border-b border-black px-2 py-2 text-left text-xs font-black uppercase text-black">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-200">
                    <td className="px-2 py-1">{firmName(row.firmId)}</td>
                    <td className="px-2 py-1 font-mono">{row.erp || "-"}</td>
                    <td className="px-2 py-1">{row.itemName || <span className="text-red-600">Item missing</span>}</td>
                    <td className="px-2 py-1">{row.customerName || "-"}</td>
                    <td className="px-2 py-1">{row.uom || "-"}</td>
                    <td className="px-2 py-1 text-right">{formatNumber(row.openingQty)}</td>
                    <td className="px-2 py-1 text-right">{formatNumber(row.openingRate)}</td>
                    <td className="px-2 py-1 text-right">{formatNumber(row.openingValue)}</td>
                    <td className="px-2 py-1">{formatDate(row.asOnDate)}</td>
                    <td className="px-2 py-1">{row.remarks || "-"}</td>
                    <td className="px-2 py-1 text-xs">{row.updatedBy || "-"}</td>
                    <td className="px-2 py-1">
                      <button type="button" disabled={busy} onClick={() => void handleDelete(row)} className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50" aria-label="Delete opening">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-2 py-6 text-center text-sm text-slate-500">No firm openings yet. Add one above or upload the Excel template.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600">
            Template columns: Firm (name or short name), ERP Code, Opening Qty, Opening Rate (optional, blank uses the NPD rate for value), As On Date (DD-MM-YYYY, default 01-04-2026), Remarks.
            Uploading again replaces the opening for the same item and firm.
          </p>
        </div>
      </div>
    </div>
  );
}
