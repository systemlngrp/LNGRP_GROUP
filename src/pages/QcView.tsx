import { useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { BoardLineQcCheck, PrintingQcCheck, Production } from "../types";

const GROUPS = [
  { label: "PROGRAM", group: "bg-[#24165f] text-white", head: "bg-[#0b4773] text-white", columns: ["Job No.", "Date", "Party Name", "Item Name", "ERP Code", "Plan Quantity", "Item Status"] },
  { label: "RECORD KEEPING", group: "bg-[#075985] text-white", head: "bg-[#0b4773] text-white", columns: ["Artwork", "Spec"] },
  { label: "QC REMARKS", group: "bg-[#b80000] text-white", head: "bg-[#f59e0b] text-black", columns: ["Boardline AUTO-CORRECTION Message", "Previous Customer Complaint", "PDI RESULT", "QC Remarks"] },
  { label: "PROCESS REPORT", group: "bg-[#1724dc] text-white", head: "bg-[#bfd4f4] text-black", columns: ["Boardline Production", "Printing Production", "Loaded Quantity"] },
  { label: "BOX SPECIFICATION", group: "bg-[#0f766e] text-white", head: "bg-[#ccfbf1] text-black", columns: ["Length", "Width", "Height", "L-OD", "W-OD", "H-OD", "FLAP", "Ply", "No. Of parts"] },
  { label: "IN-PROCESS QC CHECK REPORT [LIVE]", group: "bg-[#b80000] text-white", head: "bg-[#0b4773] text-white", columns: ["SAMPLING PLAN QTY", "Required Size", "Check 1", "Check 2", "Check 3", "Check 4", "Required Cutting Size", "Cutting Check 1", "Cutting Check 2", "Cutting Check 3", "Cutting Check 4", "Required B.GSM", "BGSM MIN", "BGSM MAX", "GSM Check 1", "GSM Check 2", "GSM Check 3", "GSM Check 4", "Flute Check", "Moisture Check", "Board Thickness Achieved", "Board Weight Achieved (Grams)"] },
] as const;
const COLUMNS = GROUPS.flatMap((group) => [...group.columns]);
type Row = Record<string, string | number>;
const s = (v: unknown) => String(v ?? "").trim(); const key = (v: unknown) => s(v).toLowerCase(); const n = (v: unknown): string | number => v === "" || v == null ? "" : Number.isFinite(Number(v)) ? Number(v) : s(v); const isUrl = (v: unknown) => /^https?:\/\//i.test(s(v));
const dateKey = (value: unknown) => { const raw = s(value).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const match = raw.match(/^(\d{2})[-\/]?(\d{2})[-\/]?(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : ""; };
const formatDate = (value: unknown) => { const normalized = dateKey(value); return normalized ? `${normalized.slice(8, 10)}-${normalized.slice(5, 7)}-${normalized.slice(0, 4)}` : s(value); };
const LinkCell = ({ value }: { value: unknown }) => isUrl(value) ? <button type="button" onClick={() => window.open(s(value), "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 font-bold text-white"><ExternalLink size={13} />Open</button> : <>{s(value)}</>;

export function QcView() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" }); const [boardline] = useData<BoardLineQcCheck>("boardline_qc_checks", []); const [printing] = useData<PrintingQcCheck>("printing_qc_checks", []); const items = useNpdItems();
  const [search, setSearch] = useState(""); const [jobFilter, setJobFilter] = useState(""); const [erpFilter, setErpFilter] = useState(""); const [partyFilter, setPartyFilter] = useState(""); const [itemFilter, setItemFilter] = useState(""); const [statusFilter, setStatusFilter] = useState(""); const [resultFilter, setResultFilter] = useState("");
  const rows = useMemo<Row[]>(() => productions.filter((p) => p.status !== "Cancelled" && !(key(p.closeBy) === "yes" && s(p.closeDate))).map((p) => { const job = s(p.transactionNo || p.jobCardNo); const b = boardline.filter((q) => key(q.jobNo) === key(job)).at(-1); const pr = printing.filter((q) => key(q.jobNo) === key(job)).at(-1); const erp = s(p.erpCode || b?.erp || pr?.erp); const item = items.find((i: any) => key(i.id) === key(p.itemId) || key(i.id) === key(p.npdId) || key(i.erp) === key(erp)); const itemName = s((p as any).itemName || item?.name || b?.itemName || pr?.itemName); return { "Job No.": job, Date: formatDate(p.date), "Party Name": s(p.companyName || b?.partyName || pr?.partyName), "Item Name": itemName, "ERP Code": erp, "Plan Quantity": n(p.plannedQty || p.qty || b?.planQty || pr?.planQty), "Item Status": s(p.status), Artwork: s(item?.artwork || pr?.standardArtwork || b?.printingArtwork), Spec: s(item?.spec || pr?.standardBoxSize || b?.standard), "Boardline AUTO-CORRECTION Message": [b?.systemAutoCorrection1, b?.systemAutoCorrection2, b?.systemAutoCorrection3, b?.systemAutoCorrection4, b?.systemAutoCorrection5].filter(Boolean).join(" | "), "Previous Customer Complaint": s(b?.previousCustomerComplaintWarning || pr?.previousCustomerComplaintWarning), "PDI RESULT": "", "Boardline Production": n((p as any).prodFromSheetPlant || p.productionOutputQty), "Printing Production": "", "Loaded Quantity": "", Length: n(p.length || b?.length || pr?.lengthId), Width: n(p.breadth || b?.width || pr?.widthId), Height: n(p.height || b?.heightOd || pr?.heightId), "L-OD": n(b?.length), "W-OD": n(b?.width), "H-OD": n(b?.heightOd), FLAP: n(b?.flap), Ply: n(b?.ply), "No. Of parts": s(b?.part), "SAMPLING PLAN QTY": n(b?.samplingPlanQty || pr?.samplingPlanQty), "Required Size": s(pr?.standardBoxSize), "Check 1": n(b?.flapAchievedOs), "Check 2": n(b?.heightAchievedOs), "Check 3": n(b?.flapAchievedDs), "Check 4": n(b?.heightAchievedDs), "Required Cutting Size": n(b?.cuttingSizeRequired), "Cutting Check 1": n(b?.cuttingSizeMm), "Cutting Check 2": "", "Cutting Check 3": "", "Cutting Check 4": "", "Required B.GSM": n(b?.boardGsm), "BGSM MIN": "", "BGSM MAX": "", "GSM Check 1": n(pr?.csAchieved), "GSM Check 2": n(pr?.bsAchieved), "GSM Check 3": "", "GSM Check 4": "", "Flute Check": s(b?.typeOfFlute), "Moisture Check": n(b?.moisture), "Board Thickness Achieved": n(b?.boardThickness || pr?.boardThickness), "Board Weight Achieved (Grams)": n(b?.sheetWeightGrams || pr?.boxWeightGrams), "QC Remarks": s(b?.boardlineRemarks || pr?.column40) }; }).filter((r) => (!jobFilter || r["Job No."] === jobFilter) && (!erpFilter || r["ERP Code"] === erpFilter) && (!partyFilter || r["Party Name"] === partyFilter) && (!itemFilter || r["Item Name"] === itemFilter) && (!statusFilter || r["Item Status"] === statusFilter) && (!resultFilter || r["PDI RESULT"] === resultFilter) && (!search.trim() || Object.values(r).some((v) => key(v).includes(key(search))))), [boardline, erpFilter, itemFilter, items, partyFilter, printing, productions, resultFilter, search, statusFilter, jobFilter]);
  const options = useMemo(() => {
    const values = (column: string) => [...new Set(rows.map((row) => s(row[column])).filter(Boolean))].sort().map((value) => ({ value, label: value, searchText: value }));
    return { jobs: values("Job No."), erps: values("ERP Code"), parties: values("Party Name"), items: values("Item Name"), statuses: values("Item Status"), results: values("PDI RESULT") };
  }, [rows]);
  const clear = () => { setSearch(""); setJobFilter(""); setErpFilter(""); setPartyFilter(""); setItemFilter(""); setStatusFilter(""); setResultFilter(""); };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">QC View</h2><span className="text-sm font-bold text-slate-700">{rows.length} records</span></div>
    <div className="rounded border border-black bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <div className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={16}/><input className="h-[34px] w-full rounded border-2 border-black pl-9 pr-3 text-sm" placeholder="Search job, ERP, party, item or QC values" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
        <Select compact value={jobFilter} onChange={setJobFilter} options={options.jobs} placeholder="All Jobs"/>
        <Select compact value={erpFilter} onChange={setErpFilter} options={options.erps} placeholder="All ERP Codes"/>
        <Select compact value={partyFilter} onChange={setPartyFilter} options={options.parties} placeholder="All Parties"/>
        <Select compact value={itemFilter} onChange={setItemFilter} options={options.items} placeholder="All Items"/>
        <Select compact value={statusFilter} onChange={setStatusFilter} options={options.statuses} placeholder="All Statuses"/>
        <Select compact value={resultFilter} onChange={setResultFilter} options={options.results} placeholder="All PDI Results"/>
      </div>
      <div className="mt-2 flex justify-end"><button type="button" onClick={clear} className="inline-flex w-full items-center justify-center gap-2 rounded border-2 border-black px-4 py-1.5 text-sm font-bold hover:bg-slate-100 sm:w-auto"><X size={15}/>Clear Filters</button></div>
    </div>
    <div className="max-h-[calc(100vh-290px)] overflow-auto rounded border-2 border-black bg-white">
      <table className="min-w-[4200px] border-collapse text-[11px]">
        <thead>
          <tr className="h-[34px]">{GROUPS.map((group) => <th key={group.label} colSpan={group.columns.length} className={`sticky top-0 z-20 border border-black px-3 py-2 text-center text-sm font-extrabold ${group.group}`}>{group.label}</th>)}</tr>
          <tr>{GROUPS.flatMap((group) => group.columns.map((column) => <th key={column} className={`sticky top-[34px] z-20 min-w-[92px] whitespace-normal border border-black px-2 py-2 text-center font-bold leading-tight ${group.head}`}>{column}</th>))}</tr>
        </thead>
        <tbody>{rows.length ? rows.map((row, ri) => <tr key={`${row["Job No."]}-${ri}`} className="odd:bg-white even:bg-slate-50 hover:bg-amber-50">{COLUMNS.map((column) => <td key={column} className="max-w-[260px] whitespace-normal break-words border border-black px-2 py-2 align-top">{column === "Artwork" || column === "Spec" ? <LinkCell value={row[column]}/> : row[column] === "" ? "-" : row[column]}</td>)}</tr>) : <tr><td colSpan={COLUMNS.length} className="p-8 text-center font-semibold">No open QC jobs match the selected filters.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
