import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, FileText, RotateCcw } from "lucide-react";
import { useData } from "../hooks/useData";
import type { Production, ProductionProcessing } from "../types";
import { formatDate } from "../lib/serial";
import { buildProductionWastageRows, summarizeProductionWastageRows } from "../lib/wastageReport";

const f = (v: unknown) => Number(v || 0).toFixed(2);
const q = (v: unknown) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const columns = [
  "Date","Job No","Item / ERP","Corr Qty","Print Qty","Production Qty","Actual Paper KG","Required Reel KG","Plan Qty","Paper KG/Box",
  "Warpage B","Warpage KG","Delamination B","Delamination KG","Misalignment B","Misalignment KG","Sheer Cutter B","Sheer Cutter KG",
  "2-Ply/Paper KG","Deckel KG","No Hisab","Sheet Plant Wastage KG",
  "Slotting","Delam Print","Misalign Print","Dry Sheets","Warp","Misprinting","Job Setting","P Wastage B",
  "Helper %","C Wastage %","Total C Wastage KG","Total Wastage %",
];

export function WastageReport() {
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all", storageKey: "production-processing-wastage-report" });
  const [productions] = useData<Production>("productions", []);
  const [search, setSearch] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [machine, setMachine] = useState("");
  const rows = useMemo(() => buildProductionWastageRows(processing, productions, { searchTerm: search, fromDate: from, toDate: to, machine }), [processing, productions, search, from, to, machine]);
  const summary = useMemo(() => summarizeProductionWastageRows(rows), [rows]);
  const exportRows = rows.map((r, i) => ({
    "SL No": i + 1, Date: formatDate(r.date), "Job No": r.jobNo, Item: r.itemName, ERP: r.erp, "Corrugation Qty": r.corrugationQty, "Printing Qty": r.printingQty, "Production Qty": r.qty, "Actual Paper KG": r.actualPaperUsedKg, "Required Reel KG": r.requiredReelKg, "Plan Qty": r.planQuantity, "Paper KG/Box": r.paperKgPerBox,
    "Warpage Boxes": r.warpageBoxes, "Warpage KG": r.warpageKg, "Delamination Boxes": r.delaminationBoxes, "Delamination KG": r.delaminationKg, "Misalignment Boxes": r.misalignmentBoxes, "Misalignment KG": r.misalignmentKg, "Sheer Cutter Boxes": r.sheerCutterBoxes, "Sheer Cutter KG": r.sheerCutterKg, "2-Ply/Paper KG": r.twoPlyPaperKg, "Deckel KG": r.deckelWastageKg, "No Hisab": r.noHisabKg, "Sheet Plant Wastage KG": r.sheetPlantWastageKg,
    Slotting: r.slotting, "Delamination Printing": r.delaminationPrinting, "Misalignment Printing": r.misalignmentPrinting, "Dry Sheets": r.drySheets, Warp: r.warp, Misprinting: r.misprinting, "Job Setting": r.jobSetting, "P Wastage Boxes": r.pWastageBoxes, "Helper %": r.printingWastagePercent, "C Wastage %": r.cWastagePercent, "Total C Wastage KG": r.totalCWastageKg, "Total Wastage %": r.combinedTotalWastagePercent,
  }));
  const exportExcel = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Metric: "Total Jobs", Value: summary.recordCount }, { Metric: "Actual Paper KG", Value: summary.actualPaperUsedKg }, { Metric: "Sheet Plant Wastage KG", Value: summary.sheetPlantWastageKg }, { Metric: "Helper %", Value: rows.length ? rows.reduce((s, r) => s + r.printingWastagePercent, 0) / rows.length : 0 }, { Metric: "Total C Wastage KG", Value: summary.totalCWastageKg }, { Metric: "Total Wastage %", Value: summary.totalWastagePercent }]), "Summary"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), "Job Wastage"); XLSX.writeFile(wb, "Wastage_Report.xlsx"); };
  const exportPdf = () => { const doc = new jsPDF("l", "mm", "a4"); doc.text("Job-Wise Production Wastage Report", 10, 10); autoTable(doc, { head: [["Job No", "Item", "Actual KG", "No Hisab", "Sheet Wastage KG", "P Wastage B", "Helper %", "C Wastage %", "Total C KG", "Total %"]], body: rows.map(r => [r.jobNo, r.itemName, f(r.actualPaperUsedKg), f(r.noHisabKg), f(r.sheetPlantWastageKg), f(r.pWastageBoxes), f(r.printingWastagePercent) + "%", f(r.cWastagePercent) + "%", f(r.totalCWastageKg), f(r.combinedTotalWastagePercent) + "%"]), startY: 16, styles: { fontSize: 7 }, headStyles: { fillColor: [55, 45, 190] } }); doc.save("Wastage_Report.pdf"); };
  const clear = () => { setSearch(""); setFrom(""); setTo(""); setMachine(""); };
  return <div className="space-y-4"><h2 className="border-b border-black pb-3 text-xl font-bold uppercase">Job-Wise Production Wastage Report</h2>
    <div className="grid gap-3 md:grid-cols-6"><Card label="Total Jobs" value={q(summary.recordCount)} /><Card label="Actual Paper KG" value={f(summary.actualPaperUsedKg)} /><Card label="Sheet Plant Wastage KG" value={f(summary.sheetPlantWastageKg)} /><Card label="P Wastage KG" value={f(summary.pWastageKg)} /><Card label="Total C Wastage KG" value={f(summary.totalCWastageKg)} /><Card label="Total Wastage %" value={f(summary.totalWastagePercent) + "%"} /></div>
    <div className="rounded border border-black bg-white p-3 flex flex-wrap gap-2"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job, item, ERP, operator..." className="min-w-[260px] flex-1 rounded border-2 border-black px-3 py-2" /><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded border-2 border-black px-3 py-2" /><input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded border-2 border-black px-3 py-2" /><select value={machine} onChange={e => setMachine(e.target.value)} className="rounded border-2 border-black px-3 py-2"><option value="">All Sources</option><option>Corrugation Liner</option><option>Printing</option></select><button onClick={clear} className="rounded border border-black px-3 py-2 font-bold"><RotateCcw size={14} /></button><button onClick={exportExcel} className="inline-flex items-center gap-2 rounded border border-emerald-700 bg-emerald-50 px-3 py-2 font-bold text-emerald-800"><Download size={14} />Excel</button><button onClick={exportPdf} className="inline-flex items-center gap-2 rounded border border-red-700 bg-red-50 px-3 py-2 font-bold text-red-800"><FileText size={14} />PDF</button></div>
    <div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[3800px] w-full border-collapse text-[11px]"><thead><tr className="bg-indigo-700 text-white">{columns.map(h => <th key={h} className="border border-black px-2 py-2 font-black whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="p-8 text-center">No wastage records found.</td></tr> : rows.map(r => <tr key={r.productionId}><td className="border border-black px-2 py-2">{formatDate(r.date)}</td><td className="border border-black px-2 py-2 font-bold">{r.jobNo}</td><td className="border border-black px-2 py-2">{r.itemName} / {r.erp || "-"}</td>{[r.corrugationQty,r.printingQty,r.qty,r.actualPaperUsedKg,r.requiredReelKg,r.planQuantity,r.paperKgPerBox,r.warpageBoxes,r.warpageKg,r.delaminationBoxes,r.delaminationKg,r.misalignmentBoxes,r.misalignmentKg,r.sheerCutterBoxes,r.sheerCutterKg,r.twoPlyPaperKg,r.deckelWastageKg,r.noHisabKg,r.sheetPlantWastageKg,r.slotting,r.delaminationPrinting,r.misalignmentPrinting,r.drySheets,r.warp,r.misprinting,r.jobSetting,r.pWastageBoxes].map((v,i)=><td key={i} className="border border-black px-2 py-2 text-right">{f(v)}</td>)}{[r.printingWastagePercent,r.cWastagePercent,r.totalCWastageKg,r.combinedTotalWastagePercent].map((v,i)=><td key={i} className="border border-black px-2 py-2 text-right">{i === 2 ? f(v) : `${f(v)}%`}</td>)}</tr>)}</tbody></table></div></div>;
}
function Card({ label, value }: { label: string; value: string }) { return <div className="rounded border border-cyan-300 bg-cyan-50 p-4 text-cyan-900"><div className="text-xs font-black uppercase">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>; }
