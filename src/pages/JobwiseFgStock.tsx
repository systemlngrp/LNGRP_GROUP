import { Fragment, useEffect, useMemo, useState } from "react";
import { Boxes, History, Layers, PackageOpen, PackagePlus, RefreshCw, Search, TriangleAlert, Warehouse, X } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getDataAuthHeaders } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { Select } from "../components/Select";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { exportsAllowed } from "../lib/exportPolicy";
import { AddToOpeningDialog } from "../components/AddToOpeningDialog";

// Job-wise FG stock: each FG item's live stock split into Opening (older stock from the
// physical count, less what is loaded from it since) and each job's balance (printed −
// loaded − loading wastage, jobs from 17-Nov-2026). One row per Opening / job.

type Movement = { kind: string; qty: number; bucket?: string };
type LiveRow = { itemType: string; erp: string; itemName: string; company?: string; opening: number; live: number; movements: Movement[] };
type StockLine = { key: string; company: string; erp: string; itemName: string; source: "Opening" | "Job"; jobNo: string; qty: number };
type GroupBy = "none" | "erp" | "company";

const n0 = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function splitRow(row: LiveRow): StockLine[] {
  const parts = new Map<string, number>([["Opening", row.opening]]);
  for (const m of row.movements) {
    const bucket = m.bucket || "Opening";
    const sign = m.kind === "dispatched" || m.kind === "loadingWastage" ? -1 : 1;
    parts.set(bucket, (parts.get(bucket) || 0) + sign * m.qty);
  }
  return [...parts.entries()]
    .map(([label, qty]) => ({ label, qty: Math.round(qty * 100) / 100 }))
    .filter((part) => Math.abs(part.qty) > 0.001)
    .map((part) => ({
      key: `${row.erp}|${part.label}`,
      company: row.company || "",
      erp: row.erp,
      itemName: row.itemName,
      source: part.label === "Opening" ? "Opening" : "Job",
      jobNo: part.label === "Opening" ? "" : part.label,
      qty: part.qty,
    }));
}

const defaultOrder = (a: StockLine, b: StockLine) =>
  (a.company || "~").localeCompare(b.company || "~") ||
  a.erp.localeCompare(b.erp, undefined, { numeric: true }) ||
  (a.source === b.source ? a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }) : a.source === "Opening" ? -1 : 1);

export function JobwiseFgStock() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const isSystemAdmin = isAdmin && [user?.userId, (user as any)?.email].some((value) => String(value || "").trim().toLowerCase() === "system.lngrp.in");
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [asOn, setAsOn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [range, setRange] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/live-stock", { headers: getDataAuthHeaders(false) as HeadersInit });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Could not load stock");
      setRows((body.rows || []).filter((row: LiveRow) => row.itemType === "FG"));
      setAsOn(body.cutoff?.asOn || "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const allLines = useMemo(() => rows.flatMap(splitRow).sort(defaultOrder), [rows]);
  const companyOptions = useMemo(() => [...new Set(allLines.map((line) => line.company).filter(Boolean))].sort().map((value) => ({ value, label: value })), [allLines]);

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return allLines.filter((line) => {
      if (company && line.company !== company) return false;
      if (sourceFilter && line.source !== sourceFilter) return false;
      if (range === "neg" && line.qty >= 0) return false;
      if (range === "upto100" && (line.qty <= 0 || line.qty > 100)) return false;
      if (range === "over100" && line.qty <= 100) return false;
      if (words.length) {
        const text = `${line.company} ${line.erp} ${line.itemName} ${line.source} ${line.jobNo}`.toLowerCase();
        if (!words.every((word) => text.includes(word))) return false;
      }
      return true;
    });
  }, [allLines, search, company, sourceFilter, range]);

  const { sorted, sort, toggle } = useTableSort(filtered, (line, key) => (key === "source" ? (line.source === "Opening" ? "" : line.jobNo) : (line as any)[key]));

  const tiles = useMemo(() => {
    const total = filtered.reduce((sum, line) => sum + line.qty, 0);
    const opening = filtered.filter((line) => line.source === "Opening").reduce((sum, line) => sum + line.qty, 0);
    return {
      total,
      opening,
      jobs: total - opening,
      items: new Set(filtered.map((line) => line.erp)).size,
      jobCount: filtered.filter((line) => line.source === "Job" && line.qty > 0).length,
      negative: filtered.filter((line) => line.qty < 0).length,
    };
  }, [filtered]);

  // Groups (by ERP or company) keep the sorted order inside each group.
  const groups = useMemo(() => {
    if (groupBy === "none") return [];
    const map = new Map<string, { key: string; title: string; sub: string; lines: StockLine[] }>();
    for (const line of sorted) {
      const key = groupBy === "erp" ? line.erp : line.company || "(No company)";
      if (!map.has(key)) map.set(key, { key, title: groupBy === "erp" ? line.erp : key, sub: groupBy === "erp" ? `${line.itemName}${line.company ? ` · ${line.company}` : ""}` : "", lines: [] });
      map.get(key)!.lines.push(line);
    }
    const list = [...map.values()];
    if (!sort) list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    return list;
  }, [groupBy, sorted, sort]);

  const toggleGroup = (key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const exportRows = () => sorted.map((line, index) => ({ "Sl No": index + 1, "Opening / Job No.": line.source === "Opening" ? "Opening" : line.jobNo, Company: line.company, ERP: line.erp, Item: line.itemName, Stock: line.qty }));
  const downloadExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(exportRows());
    sheet["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 34 }, { wch: 12 }, { wch: 55 }, { wch: 12 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Job-wise FG Stock");
    XLSX.writeFile(book, `Jobwise_FG_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const downloadPdf = () => {
    const doc = new jsPDF("l", "mm", "a4");
    doc.setFontSize(14);
    doc.text("Job-wise FG Stock", 14, 14);
    doc.setFontSize(9);
    doc.text(`Total ${n0(tiles.total)} · Opening ${n0(tiles.opening)} · In jobs ${n0(tiles.jobs)} · ${tiles.items} items · ${new Date().toLocaleString("en-IN")}`, 14, 20);
    autoTable(doc, {
      head: [["Sl", "Opening / Job No.", "Company", "ERP", "Item", "Stock"]],
      body: exportRows().map((row) => [row["Sl No"], row["Opening / Job No."], row.Company, row.ERP, row.Item, n0(row.Stock)]),
      startY: 24,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [11, 71, 115], textColor: 255 },
      columnStyles: { 0: { cellWidth: 10 }, 5: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const raw = sorted[data.row.index];
        if (raw?.qty < 0) data.cell.styles.textColor = [185, 28, 28];
        else if (raw?.source === "Opening") data.cell.styles.fillColor = [255, 247, 230];
      },
    });
    doc.save(`Jobwise_FG_Stock_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const th = "border border-black px-3 py-2.5 text-[11px] font-black uppercase tracking-wide";
  const td = "border border-black px-3 py-1.5";
  const lineRow = (line: StockLine, index: number) => (
    <tr key={line.key} className={`${line.qty < 0 ? "bg-red-50" : line.source === "Opening" ? "bg-amber-50" : index % 2 ? "bg-slate-50" : "bg-white"} hover:bg-indigo-50`}>
      <td className={`${td} text-center text-xs font-bold text-slate-500`}>{index + 1}</td>
      <td className={`${td} text-center`}>
        {line.source === "Opening"
          ? <span className="inline-block rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-800">Opening</span>
          : <span className="inline-block rounded-full border border-emerald-400 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-black text-emerald-800">{line.jobNo}</span>}
      </td>
      <td className={`${td} text-left text-xs font-semibold text-slate-700`} style={{ textAlign: "left" }}>{line.company || "-"}</td>
      <td className={`${td} text-center font-mono text-xs font-bold`}>{line.erp}</td>
      <td className={`${td} text-left text-xs font-semibold`} style={{ textAlign: "left" }}>{line.itemName}</td>
      <td style={{ textAlign: "right" }} className={`${td} text-right text-sm font-black ${line.qty < 0 ? "text-red-700" : "text-slate-900"}`}>{n0(line.qty)}</td>
    </tr>
  );

  const TILES = [
    { label: "Total FG Stock", value: n0(tiles.total), icon: Warehouse, tone: "from-indigo-600 to-violet-600" },
    { label: "Opening (old stock)", value: n0(tiles.opening), icon: PackageOpen, tone: "from-amber-500 to-orange-600" },
    { label: "In Jobs", value: n0(tiles.jobs), icon: Boxes, tone: "from-emerald-600 to-teal-600" },
    { label: "Items", value: String(tiles.items), icon: Layers, tone: "from-sky-600 to-cyan-600" },
    { label: "Jobs with Stock", value: String(tiles.jobCount), icon: Boxes, tone: "from-fuchsia-600 to-pink-600" },
    { label: "Negative Rows", value: String(tiles.negative), icon: TriangleAlert, tone: tiles.negative ? "from-red-600 to-rose-700" : "from-slate-500 to-slate-600", onClick: () => setRange(range === "neg" ? "" : "neg") },
  ];

  return (
    <div className="space-y-4 p-4 text-black">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Job-wise FG Stock</h1>
          <p className="text-xs font-semibold text-slate-600">Jobs from 17-Nov: printed − loaded − loading wastage. Opening: older stock from the physical count{asOn ? ` as on ${asOn}` : ""}, less what is loaded from it since.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-sm font-black text-white shadow hover:bg-emerald-800"><PackagePlus size={16} /> Add to Opening</button> : null}
          {isSystemAdmin ? <button type="button" onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border-2 border-black bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50"><History size={16} /> Opening History</button> : null}
          {exportsAllowed() ? <><button type="button" onClick={downloadExcel} className="rounded-md border-2 border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-700">Excel</button><button type="button" onClick={downloadPdf} className="rounded-md border-2 border-red-700 px-3 py-2 text-sm font-bold text-red-700">PDF</button></> : null}
          <button type="button" data-export="refresh" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md border-2 border-black bg-white px-3 py-2 text-sm font-bold"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </div>

      {notice ? <div className="flex items-center justify-between rounded-md border-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800"><span>{notice}</span><button type="button" onClick={() => setNotice("")}><X size={16} /></button></div> : null}
      {error ? <div className="rounded-md border-2 border-red-600 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {TILES.map((tile) => (
          <button key={tile.label} type="button" onClick={tile.onClick} className={`rounded-xl bg-gradient-to-br ${tile.tone} p-3 text-left text-white shadow-md transition ${tile.onClick ? "hover:scale-[1.02] hover:shadow-lg" : "cursor-default"}`}>
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wide opacity-90"><span>{tile.label}</span><tile.icon size={16} /></div>
            <div className="mt-1 text-2xl font-black">{tile.value}</div>
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border-2 border-black bg-white p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, ERP, item or job no." className="w-full rounded border-2 border-black py-2 pl-9 pr-3 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={company} onChange={setCompany} options={[{ value: "", label: "All" }, ...companyOptions]} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Opening / Job</span><Select compact value={sourceFilter} onChange={setSourceFilter} options={[{ value: "", label: "All" }, { value: "Opening", label: "Opening only" }, { value: "Job", label: "Jobs only" }]} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Stock</span><Select compact value={range} onChange={setRange} options={[{ value: "", label: "All" }, { value: "neg", label: "Negative" }, { value: "upto100", label: "Up to 100" }, { value: "over100", label: "More than 100" }]} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Group by</span><Select compact value={groupBy} onChange={(value) => { setGroupBy((value || "none") as GroupBy); setCollapsed(new Set()); }} options={[{ value: "none", label: "No grouping" }, { value: "erp", label: "ERP" }, { value: "company", label: "Company" }]} placeholder="No grouping" /></div>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border-2 border-black bg-white shadow-sm">
        <table className="min-w-[960px] w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gradient-to-r from-[#0b4773] via-[#1d4ed8] to-[#0f766e] text-white">
              <th className={`${th} w-14 text-center`}>Sl</th>
              <th className={`${th} text-center`}><SortHeader label="Opening / Job No." sortKey="source" sort={sort} onToggle={toggle} align="center" /></th>
              <th className={`${th} text-left`} style={{ textAlign: "left" }}><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggle} /></th>
              <th className={`${th} text-center`}><SortHeader label="ERP" sortKey="erp" sort={sort} onToggle={toggle} align="center" /></th>
              <th className={`${th} text-left`} style={{ textAlign: "left" }}><SortHeader label="Item" sortKey="itemName" sort={sort} onToggle={toggle} /></th>
              <th className={`${th} text-right`}><SortHeader label="Stock" sortKey="qty" sort={sort} onToggle={toggle} align="right" /></th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? <tr><td colSpan={6} className="p-8 text-center font-bold text-slate-500">Loading…</td></tr> : null}
            {!loading && !sorted.length ? <tr><td colSpan={6} className="p-8 text-center font-bold text-slate-500">No stock rows match.</td></tr> : null}
            {groupBy === "none"
              ? sorted.map((line, index) => lineRow(line, index))
              : groups.map((group) => {
                  const subtotal = group.lines.reduce((sum, line) => sum + line.qty, 0);
                  const isCollapsed = collapsed.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <tr className="cursor-pointer bg-gradient-to-r from-slate-800 to-slate-700 text-white" onClick={() => toggleGroup(group.key)}>
                        <td className={`${td} text-center font-black`}>{isCollapsed ? "▸" : "▾"}</td>
                        <td className={`${td} text-left`} style={{ textAlign: "left" }} colSpan={4}>
                          <span className="font-black">{group.title}</span>
                          {group.sub ? <span className="ml-2 text-xs font-semibold text-slate-200">{group.sub}</span> : null}
                          <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">{group.lines.length} rows</span>
                        </td>
                        <td className={`${td} text-right font-black ${subtotal < 0 ? "text-red-300" : ""}`}>{n0(subtotal)}</td>
                      </tr>
                      {isCollapsed ? null : group.lines.map((line, index) => lineRow(line, index))}
                    </Fragment>
                  );
                })}
          </tbody>
        </table>
      </div>

      {addOpen ? <AddToOpeningDialog source="Job-wise FG Stock" onClose={() => setAddOpen(false)} onSaved={(message) => { setNotice(message); void load(); }} /> : null}
      {historyOpen ? <OpeningHistoryDialog onClose={() => setHistoryOpen(false)} /> : null}
    </div>
  );
}

function OpeningHistoryDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/fg-opening/history", { headers: getDataAuthHeaders(false) as HeadersInit })
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => (ok ? setRows(body || []) : setError(body?.error || "Could not load history")))
      .catch(() => setError("Could not load history"));
  }, []);
  const cell = "border border-black px-2 py-1.5";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border-2 border-black bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-800 to-indigo-700 px-4 py-3 text-white">
          <div className="flex items-center gap-2 font-black uppercase"><History size={18} /> Opening Stock Additions</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/20"><X size={18} /></button>
        </div>
        <div className="overflow-auto p-3">
          {error ? <div className="rounded border-2 border-red-600 bg-red-50 p-2 text-sm font-bold text-red-700">{error}</div> : null}
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-[#0b4773] text-white">
              <tr>{["When", "By", "ERP", "Item", "Firm", "Added", "Opening before → after", "Firm opening before → after", "Reason", "From"].map((label) => <th key={label} className={`${cell} text-left font-black uppercase`}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.id} className="odd:bg-slate-50">
                  <td className={cell}>{new Date(row.updateTimestamp).toLocaleString("en-IN")}</td>
                  <td className={cell}>{row.updatedBy}</td>
                  <td className={`${cell} font-mono`}>{row.erp}</td>
                  <td className={cell}>{row.itemName}</td>
                  <td className={cell}>{row.firmName}</td>
                  <td className={`${cell} text-right font-black text-emerald-700`}>+{Number(row.qty).toLocaleString("en-IN")}</td>
                  <td className={`${cell} text-right`}>{Number(row.liveBefore).toLocaleString("en-IN")} → {Number(row.liveAfter).toLocaleString("en-IN")}</td>
                  <td className={`${cell} text-right`}>{Number(row.firmBefore).toLocaleString("en-IN")} → {Number(row.firmAfter).toLocaleString("en-IN")}</td>
                  <td className={cell}>{row.reason}</td>
                  <td className={cell}>{row.source}</td>
                </tr>
              )) : <tr><td colSpan={10} className="p-6 text-center font-bold text-slate-500">{error ? "" : "No additions yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
