import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { PreDispatchInspection, PrintingQcCheck, Production } from "../types";
import { buildPdiReportRow, findLatestInspection, type NpdPdiItem, type PdiReportRow } from "../lib/pdiReportData";
import { jobDateCellClass, jobNumberCellClass } from "../lib/jobCellColors";

const COLUMNS = ["Job. No.", "Date", "Party Name", "Item Name", "ERP Code", "Previous Customer Complaint", "Required Length", "Achieved Length", "Min length", "Max Length", "Required Width", "Achieved Width", "Width Min", "Width Max", "Required Height", "Achieved Height", "Height Min", "Height Max", "CS Act / CS STD", "B.GSM", "Box Weight (Grams)", "Artwork", "Printing Artwork Check", "Printing Color Check", "Box Squaring Check", "Flap Gap Check", "Joint Pasting / Delamination Check", "Remarks [IF ANY]", "Box Photo [FRONT]", "Box Photo [BACK]", "Result", "QC Person Name", "PDI TIME", "Ply", "Standard CS", "STD CS", "Actual CS"] as const;
const GROUPS = [
  { label: "PROGRAM", start: 0, end: 5, color: "bg-[#244b13] text-white" },
  { label: "TARGET SIZE Vs ACTUAL", start: 6, end: 17, color: "bg-[#201249] text-white" },
  { label: "Technical Checks", start: 18, end: 20, color: "bg-[#4b1230] text-white" },
  { label: "VISUAL CHECKS", start: 21, end: 29, color: "bg-[#a000f5] text-white" },
  { label: "SUMMARY REPORT", start: 30, end: 36, color: "bg-[#ffff00] text-black" },
] as const;
const headerColor = (index: number) => {
  if (index < 5) return "bg-[#0b3760] text-white";
  if (index === 5) return "bg-[#ffff00] text-red-600";
  if ([6, 7].includes(index)) return "bg-[#ffe699] text-black";
  if ([8, 9, 12, 13, 16, 17].includes(index)) return "bg-[#ffff00] text-black";
  if ([10, 11].includes(index)) return "bg-[#b4a7d6] text-black";
  if ([14, 15].includes(index)) return "bg-[#a2c4c9] text-black";
  if (index < 21) return "bg-[#cc4125] text-white";
  if (index < 30) return "bg-[#e7cdd8] text-black";
  if (index < 32) return "bg-[#fff2cc] text-black";
  return "bg-[#ee00ee] text-black";
};
const NPD_COLUMNS = new Set(["Required Length", "Required Width", "Required Height", "Artwork", "Ply", "Standard CS", "STD CS"]);
const NPD_RANGE_COLUMNS = new Set(["Min length", "Max Length", "Width Min", "Width Max", "Height Min", "Height Max"]);
const PDI_TECHNICAL_COLUMNS = new Set(["CS Act / CS STD", "B.GSM", "Box Weight (Grams)"]);
const PDI_COLUMNS = new Set(["Achieved Length", "Achieved Width", "Achieved Height", "Printing Artwork Check", "Printing Color Check", "Box Squaring Check", "Flap Gap Check", "Joint Pasting / Delamination Check", "Remarks [IF ANY]", "Box Photo [FRONT]", "Box Photo [BACK]", "Result", "QC Person Name", "PDI TIME", "Actual CS"]);
const sourceCellClass = (column: string) => NPD_RANGE_COLUMNS.has(column) ? "bg-[#ffff00]" : PDI_TECHNICAL_COLUMNS.has(column) ? "bg-[#cc4125]" : NPD_COLUMNS.has(column) ? "bg-[#c8daf7]" : PDI_COLUMNS.has(column) ? "bg-[#b5d6a7]" : "";
const s = (v: unknown) => String(v ?? "").trim(); const key = (v: unknown) => s(v).toLowerCase(); const same = (a: unknown, b: unknown) => key(a) === key(b); const isLink = (v: unknown) => /^https?:\/\//i.test(s(v)) || s(v).startsWith("/uploads/"); const LinkCell = ({ value }: { value: unknown }) => isLink(value) ? <a href={s(value)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 font-bold text-white"><ExternalLink size={13} />Open</a> : <>{s(value)}</>;

export function PdiReport() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" }); const [checks] = useData<PrintingQcCheck>("printing_qc_checks", []); const [inspections] = useData<PreDispatchInspection>("pre_dispatch_inspections", [], { firmScope: "all" }); const items = useNpdItems(); const [search, setSearch] = useState(""); const [jobFilter, setJobFilter] = useState(""); const [partyFilter, setPartyFilter] = useState(""); const [itemFilter, setItemFilter] = useState(""); const [resultFilter, setResultFilter] = useState(""); const [visible, setVisible] = useState<number[]>(() => COLUMNS.map((_, i) => i));
  const rows = useMemo<PdiReportRow[]>(() => productions
    .filter((production) => production.status !== "Cancelled")
    .map((production) => {
      const job = s(production.transactionNo || production.jobCardNo);
      const printing = checks.filter((check) => same(check.jobNo, job))
        .sort((left, right) => s(left.timestamp).localeCompare(s(right.timestamp))).at(-1);
      const inspection = findLatestInspection(inspections, s(production.id), job);
      const erp = s(production.erpCode || inspection?.erpCode || printing?.erp);
      const item = items.find((candidate) =>
        (s(production.itemId) && same(candidate.id, production.itemId)) ||
        (s(production.npdId) && same(candidate.id, production.npdId)) ||
        (erp && same(candidate.erp, erp))
      ) as NpdPdiItem | undefined;
      return buildPdiReportRow(production, item, inspection, printing);
    })
    .filter((row) => (!jobFilter || row["Job. No."] === jobFilter) && (!partyFilter || row["Party Name"] === partyFilter) && (!itemFilter || row["Item Name"] === itemFilter) && (!resultFilter || row.Result === resultFilter) && (!search.trim() || Object.values(row).some((value) => key(value).includes(key(search))))),
    [checks, inspections, itemFilter, items, partyFilter, productions, resultFilter, search, jobFilter]);
  const options = useMemo(() => ({ jobs: [...new Set(rows.map((r) => s(r["Job. No."])))].sort(), parties: [...new Set(rows.map((r) => s(r["Party Name"])).filter(Boolean))].sort(), items: [...new Set(rows.map((r) => s(r["Item Name"])).filter(Boolean))].sort(), results: [...new Set(rows.map((r) => s(r.Result)).filter(Boolean))].sort() }), [rows]); const selected = visible.filter((i) => i < COLUMNS.length); const visibleGroups = GROUPS.map((group) => ({ ...group, columns: selected.filter((i) => i >= group.start && i <= group.end) })).filter((group) => group.columns.length); const clear = () => { setSearch(""); setJobFilter(""); setPartyFilter(""); setItemFilter(""); setResultFilter(""); };
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">PDI Report</h2></div><div className="grid grid-cols-1 gap-2 rounded border border-black bg-white p-3 md:grid-cols-6"><div className="relative md:col-span-2"><Search className="absolute left-2 top-2.5 text-slate-500" size={16} /><input className="w-full rounded border border-black py-2 pl-8 pr-2" placeholder="Search job / party / item / ERP / QC" value={search} onChange={(e) => setSearch(e.target.value)} /></div>{[[jobFilter, setJobFilter, "All Jobs", options.jobs], [partyFilter, setPartyFilter, "All Parties", options.parties], [itemFilter, setItemFilter, "All Items", options.items], [resultFilter, setResultFilter, "All Results", options.results]].map(([value, setter, label, values]: any) => <select key={label} value={value} onChange={(e) => setter(e.target.value)} className="rounded border border-black p-2 text-sm"><option value="">{label}</option>{values.map((v: string) => <option key={v}>{v}</option>)}</select>)}<button type="button" onClick={clear} className="rounded border border-black px-3 py-2 font-bold">Clear Filters</button><details className="relative"><summary className="cursor-pointer rounded border border-black px-3 py-2 font-bold">Columns ({selected.length}/{COLUMNS.length})</summary><div className="absolute right-0 z-20 mt-1 max-h-96 w-80 overflow-auto rounded border-2 border-black bg-white p-3 shadow-lg">{COLUMNS.map((column, i) => <label key={column} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={selected.includes(i)} onChange={() => setVisible((v) => v.includes(i) ? v.filter((x) => x !== i) : [...v, i].sort((a, b) => a - b))} /><span>{column}</span></label>)}</div></details></div><div className="overflow-auto rounded border-2 border-black bg-white"><div className="border-b border-black bg-[#0b3640] px-4 py-3 text-center text-lg font-extrabold text-white">PRE-DISPATCH INSPECTION REPORT [LIVE VIEW]</div><table className="min-w-[2200px] border-collapse text-[11px]"><thead><tr>{visibleGroups.map((group) => <th key={group.label} colSpan={group.columns.length} className={"border border-black px-3 py-3 text-center text-base font-extrabold " + group.color}>{group.label}</th>)}</tr><tr>{selected.map((i) => <th key={COLUMNS[i]} className={"min-w-[100px] whitespace-normal border border-black px-2 py-3 text-center text-xs font-bold leading-tight " + headerColor(i)}>{COLUMNS[i]}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, ri) => <tr key={`${row["Job. No."]}-${ri}`} className="odd:bg-white even:bg-slate-50">{selected.map((i) => <td key={COLUMNS[i]} className={"whitespace-nowrap border border-black px-2 py-2 " + (i === 0 ? jobNumberCellClass(row.Date, row.Result) : i < 5 ? jobDateCellClass(row.Date) : sourceCellClass(COLUMNS[i]))}>{["Artwork", "Box Photo [FRONT]", "Box Photo [BACK]"].includes(COLUMNS[i]) ? <LinkCell value={row[COLUMNS[i]]} /> : row[COLUMNS[i]] ?? ""}</td>)}</tr>) : <tr><td colSpan={selected.length || 1} className="p-8 text-center">No PDI records found.</td></tr>}</tbody></table></div></div>;
}
