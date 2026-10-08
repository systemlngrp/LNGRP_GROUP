import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { ClientPagination } from "../components/ClientPagination";
import { Select } from "../components/Select";
import { useClientPagination } from "../hooks/useClientPagination";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { BoardLineQcCheck, DispatchPlan, LoadingSlip, Material, MaterialIssue, MaterialIssueLine, MaterialIssueReelLine, MaterialReturn, MaterialReturnLine, MaterialReturnReelLine, PreDispatchInspection, PrintingQcCheck, Production, ProductionProcessing } from "../types";
import { buildProductionCorrugatedSheetUsageMap, buildProductionMaterialUsageMap, getProductionActualPaperUsed, hasPaperNotRequiredBypass, hasProductionCorrugatedSheetUsage } from "../lib/productionMaterialUsage";
import { isCorrugationLinerComplete, isMachineStepFull } from "../lib/productionProcessingProgress";

const GROUPS = [
  { label: "PROGRAM", group: "bg-[#24165f] text-white", head: "bg-[#0b4773] text-white", columns: ["SL No.", "Job No.", "Date", "Party Name", "Item Name", "ERP Code", "Plan Quantity", "Item Status"] },
  { label: "RECORD KEEPING", group: "bg-[#075985] text-white", head: "bg-[#0b4773] text-white", columns: ["Artwork", "Spec"] },
  { label: "QC REMARKS", group: "bg-[#b80000] text-white", head: "bg-[#f59e0b] text-black", columns: ["Boardline AUTO-CORRECTION Message", "Previous Customer Complaint", "PDI RESULT", "QC Remarks"] },
  { label: "PROCESS REPORT", group: "bg-[#1724dc] text-white", head: "bg-[#bfd4f4] text-black", columns: ["Boardline Production", "Printing Production", "Loaded Quantity"] },
  { label: "BOX SPECIFICATION", group: "bg-[#0f766e] text-white", head: "bg-[#ccfbf1] text-black", columns: ["Length", "Width", "Height", "L-OD", "W-OD", "H-OD", "FLAP", "Ply", "No. Of parts"] },
  { label: "IN-PROCESS QC CHECK REPORT [LIVE]", group: "bg-[#b80000] text-white", head: "bg-[#0b4773] text-white", columns: ["SAMPLING PLAN QTY", "Required Size", "Check 1", "Check 2", "Check 3", "Check 4", "Required Cutting Size", "Cutting Check 1", "Cutting Check 2", "Cutting Check 3", "Cutting Check 4", "Required B.GSM", "BGSM MIN", "BGSM MAX", "GSM Check 1", "GSM Check 2", "GSM Check 3", "GSM Check 4", "Flute Check", "Moisture Check", "Board Thickness Achieved", "Board Weight Achieved (Grams)"] },
] as const;
const COLUMNS = GROUPS.flatMap((group) => [...group.columns]);
const MESSAGE_COLUMN = "Boardline AUTO-CORRECTION Message";
type Row = Record<string, string | number> & { __jobColor?: "red" | "yellow" };
const s = (v: unknown) => String(v ?? "").trim(); const key = (v: unknown) => s(v).toLowerCase(); const n = (v: unknown): string | number => v === "" || v == null ? "" : Number.isFinite(Number(v)) ? Number(v) : s(v); const isUrl = (v: unknown) => /^https?:\/\//i.test(s(v));
const dateKey = (value: unknown) => { const raw = s(value).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const match = raw.match(/^(\d{2})[-\/]?(\d{2})[-\/]?(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : ""; };
const formatDate = (value: unknown) => { const normalized = dateKey(value); return normalized ? `${normalized.slice(8, 10)}-${normalized.slice(5, 7)}-${normalized.slice(0, 4)}` : s(value); };
const validDate = (value: unknown) => {
  const normalized = dateKey(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};
const rowDateClass = (value: unknown) => {
  const date = validDate(value);
  if (!date) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date < yesterday) return "bg-red-50 text-red-700";
  if (date < today) return "bg-[#fff2cc] text-black";
  if (date.getTime() === today.getTime()) return "bg-[#00ffff] text-black";
  return "bg-slate-100 text-black";
};
const formatFlapHeightFlap = (left: unknown, height: unknown, right: unknown) => { const values = [s(left), s(height), s(right)]; return values.some(Boolean) ? values.join(" - ") : ""; };
const whole = (value: unknown): string | number => { if (value === "" || value == null) return ""; const numeric = Number(value); return Number.isFinite(numeric) ? Math.round(numeric) : s(value); };
const formatWholeFlapHeightFlap = (left: unknown, height: unknown, right: unknown) => { const values = [left, height, right].map(whole); return values.some((value) => value !== "") ? values.join(" - ") : ""; };
const checkColumnValues = (checkNo: unknown, operatorValue: string, driveValue: string, cuttingValue: string | number) => {
  const index = Number.parseInt(s(checkNo), 10);
  const values = ["", "", "", ""];
  if (index < 1 || index > 4) return { checks: values, cutting: ["", "", "", ""] };
  const combined = [operatorValue && `OS ${operatorValue}`, driveValue && `DS ${driveValue}`].filter(Boolean).join(" | ");
  values[index - 1] = combined;
  const cutting = ["", "", "", ""];
  cutting[index - 1] = cuttingValue;
  return { checks: values, cutting };
};
const LinkCell = ({ value }: { value: unknown }) => isUrl(value) ? <button type="button" onClick={() => window.open(s(value), "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 font-bold text-white"><ExternalLink size={13} />Open</button> : <>{s(value)}</>;
const SpecCell = ({ value, erp }: { value: unknown; erp: unknown }) => {
  const label = s(value);
  const erpCode = s(erp);
  return erpCode ? <a href={`/masters/spec?erp=${encodeURIComponent(erpCode)}`} className="text-blue-700 underline hover:text-blue-900" title={`Open New Spec for ERP ${erpCode}`}>{label || "Open New Spec"}</a> : <>{label}</>;
};

const isPassingPdi = (value: unknown) => ["pass", "qc pass"].includes(key(value));
const hasPositiveQuantity = (value: unknown) => Number(value || 0) > 0;

const processingQuantity = (records: ProductionProcessing[], production: Production, job: string, machine: string) =>
  records.filter((record) => key(record.machineName) === key(machine) && (key(record.productionId) === key(production.id) || key(record.jobNo) === key(job)))
    .reduce((total, record) => total + (hasPositiveQuantity(record.qty) ? Number(record.qty) : 0), 0);

function loadedQuantity({ job, productionId, loadingSlips, plans }: { job: string; productionId: string; loadingSlips: LoadingSlip[]; plans: DispatchPlan[] }) {
  const normalizedJob = key(job);
  const planIds = new Set(plans.filter((plan) => key(plan.productionId) === key(productionId)).map((plan) => key(plan.id)));
  return loadingSlips.filter((slip) => key(slip.status) !== "cancelled").reduce((total, slip) => total + (slip.lines || []).reduce((lineTotal, line) => {
    const qty = Number(line.loadedQty || 0);
    if (!hasPositiveQuantity(qty)) return lineTotal;
    const allocationQty = (line.allocations || []).filter((allocation) => allocation.sourceType === "job" && hasPositiveQuantity(allocation.qty) && (key(allocation.jobId) === key(productionId) || key(allocation.jobNo) === normalizedJob)).reduce((sum, allocation) => sum + Number(allocation.qty), 0);
    if (allocationQty > 0) return lineTotal + allocationQty;
    if (planIds.has(key(line.dispatchPlanId)) || (line.jobNos || []).map(key).includes(normalizedJob)) return lineTotal + qty;
    return lineTotal;
  }, 0), 0);
}

function getQcJobColor({ job, productionId, inspections, loadingSlips, plans }: { job: string; productionId: string; inspections: PreDispatchInspection[]; loadingSlips: LoadingSlip[]; plans: DispatchPlan[] }) {
  const normalizedJob = key(job);
  const latestPdi = inspections
    .filter((inspection) => key(inspection.jobNo) === normalizedJob || key(inspection.productionId) === key(productionId))
    .sort((a, b) => s(a.updateTimestamp || a.inspectionDate).localeCompare(s(b.updateTimestamp || b.inspectionDate)))
    .at(-1);
  const planIds = new Set(plans.filter((plan) => key(plan.productionId) === key(productionId)).map((plan) => key(plan.id)));
  const loaded = loadingSlips.some((slip) => {
    if (key(slip.status) === "cancelled") return false;
    return (slip.lines || []).some((line) => {
      if (planIds.has(key(line.dispatchPlanId))) return true;
      const directJobs = (line.jobNos || []).map(key);
      const allocatedJobs = (line.allocations || []).filter((allocation) => allocation.sourceType === "job" && hasPositiveQuantity(allocation.qty)).map((allocation) => key(allocation.jobNo));
      return allocatedJobs.includes(normalizedJob) || (hasPositiveQuantity(line.loadedQty) && directJobs.includes(normalizedJob));
    });
  });
  if (isPassingPdi(latestPdi?.result) && !loaded) return "red" as const;
  if (loaded && !isPassingPdi(latestPdi?.result)) return "yellow" as const;
  return undefined;
}

function getQcProductionStatus(production: Production, actualPaperUsed: number, hasCorrugatedSheetUsage: boolean, processing: ProductionProcessing[]) {
  if (production.status === "Cancelled" || production.cancelTimestamp || production.tallyTimestamp || production.status === "Completed") return s(production.status);
  if (!hasPaperNotRequiredBypass(production) && actualPaperUsed <= 0 && !hasCorrugatedSheetUsage) return "Pending Reel Issue";
  if (!isCorrugationLinerComplete(processing, s(production.id))) return "Pending Corrugation";
  if (!isMachineStepFull(processing, s(production.id), "Printing")) return "Pending Printing";
  return s(production.status);
}

export function QcView() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" }); const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" }); const [boardline] = useData<BoardLineQcCheck>("boardline_qc_checks", []); const [printing] = useData<PrintingQcCheck>("printing_qc_checks", []); const [inspections] = useData<PreDispatchInspection>("pre_dispatch_inspections", [], { firmScope: "all" }); const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" }); const [plans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all" }); const [materials] = useData<Material>("materials", []); const [materialIssues] = useData<MaterialIssue>("material-issues", [], { firmScope: "all" }); const [materialIssueLines] = useData<MaterialIssueLine>("material-issue-lines", [], { firmScope: "all" }); const [materialIssueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { firmScope: "all" }); const [materialReturns] = useData<MaterialReturn>("material-returns", [], { firmScope: "all" }); const [materialReturnLines] = useData<MaterialReturnLine>("material-return-lines", [], { firmScope: "all" }); const [materialReturnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { firmScope: "all" }); const items = useNpdItems();
  const materialUsageMap = useMemo(() => buildProductionMaterialUsageMap(materialIssues, materialIssueLines, materialReturns, materialReturnLines, materialIssueReelLines, materialReturnReelLines, productions), [materialIssueLines, materialIssueReelLines, materialIssues, materialReturnLines, materialReturnReelLines, materialReturns, productions]);
  const corrugatedSheetUsageMap = useMemo(() => buildProductionCorrugatedSheetUsageMap(materials, materialIssues, materialIssueLines, materialReturns, materialReturnLines), [materialIssueLines, materialIssues, materialReturnLines, materialReturns, materials]);
  const [search, setSearch] = useState(""); const [jobFilter, setJobFilter] = useState(""); const [erpFilter, setErpFilter] = useState(""); const [partyFilter, setPartyFilter] = useState(""); const [itemFilter, setItemFilter] = useState(""); const [statusFilter, setStatusFilter] = useState(""); const [resultFilter, setResultFilter] = useState("");
  const [dateSort, setDateSort] = useState<"asc" | "desc">("asc");
  const rows = useMemo<Row[]>(() => productions.filter((p) => p.status !== "Cancelled" && !(key(p.closeBy) === "yes" && s(p.closeDate))).map((p) => { const job = s(p.transactionNo || p.jobCardNo); const b = boardline.filter((q) => key(q.jobNo) === key(job)).at(-1); const pr = printing.filter((q) => key(q.jobNo) === key(job)).at(-1); const erp = s(p.erpCode || b?.erp || pr?.erp); const item = items.find((i: any) => key(i.id) === key(p.itemId) || key(i.id) === key(p.npdId) || key(i.erp) === key(erp)); const itemName = s((p as any).itemName || item?.name || b?.itemName || pr?.itemName); const pdi = inspections.filter((inspection) => key(inspection.jobNo) === key(job) || key(inspection.productionId) === key(p.id)).sort((a, b) => s(a.updateTimestamp || a.inspectionDate).localeCompare(s(b.updateTimestamp || b.inspectionDate))).at(-1); const pdiResult = s(pdi?.result); const operatorCheck = formatWholeFlapHeightFlap(b?.flapAchievedOs, b?.heightAchievedOs, b?.flapLAchievedOs); const driveCheck = formatWholeFlapHeightFlap(b?.flapAchievedDs, b?.heightAchievedDs, b?.flapLAchievedDs); const mappedChecks = checkColumnValues(b?.checkNo, operatorCheck, driveCheck, whole(b?.cuttingSizeMm)); return { "Job No.": job, Date: formatDate(p.date), "Party Name": s(p.companyName || b?.partyName || pr?.partyName), "Item Name": itemName, "ERP Code": erp, "Plan Quantity": n(p.plannedQty || p.qty || b?.planQty || pr?.planQty), "Item Status": getQcProductionStatus(p, getProductionActualPaperUsed(p, materialUsageMap), hasProductionCorrugatedSheetUsage(p, corrugatedSheetUsageMap), processing), Artwork: s(item?.artwork || pr?.standardArtwork || b?.printingArtwork), Spec: s(item?.spec || pr?.standardBoxSize || b?.standard), "Boardline AUTO-CORRECTION Message": [b?.systemAutoCorrection1, b?.systemAutoCorrection2, b?.systemAutoCorrection3, b?.systemAutoCorrection4, b?.systemAutoCorrection5].filter(Boolean).join(" | "), "Previous Customer Complaint": s(b?.previousCustomerComplaintWarning || pr?.previousCustomerComplaintWarning), "PDI RESULT": pdiResult, "Boardline Production": n(processingQuantity(processing, p, job, "Corrugation Liner")), "Printing Production": n(processingQuantity(processing, p, job, "Printing")), "Loaded Quantity": n(loadedQuantity({ job, productionId: s(p.id), loadingSlips, plans })), Length: n(p.length || b?.length || pr?.lengthId), Width: n(p.breadth || b?.width || pr?.widthId), Height: n(p.height || b?.heightOd || pr?.heightId), "L-OD": n(b?.length), "W-OD": n(b?.width), "H-OD": n(b?.heightOd), FLAP: n(b?.flap), Ply: n(b?.ply), "No. Of parts": s(b?.part), "SAMPLING PLAN QTY": n(b?.samplingPlanQty || pr?.samplingPlanQty), "Required Size": s(b?.standard) || formatFlapHeightFlap(b?.flap, b?.heightOd, b?.flap) || s(pr?.standardBoxSize), "Check 1": mappedChecks.checks[0], "Check 2": mappedChecks.checks[1], "Check 3": mappedChecks.checks[2], "Check 4": mappedChecks.checks[3], "Required Cutting Size": whole(b?.cuttingSizeRequired), "Cutting Check 1": mappedChecks.cutting[0], "Cutting Check 2": mappedChecks.cutting[1], "Cutting Check 3": mappedChecks.cutting[2], "Cutting Check 4": mappedChecks.cutting[3], "Required B.GSM": whole(b?.boardGsm), "BGSM MIN": "", "BGSM MAX": "", "GSM Check 1": whole(pr?.csAchieved), "GSM Check 2": whole(pr?.bsAchieved), "GSM Check 3": "", "GSM Check 4": "", "Flute Check": s(b?.typeOfFlute), "Moisture Check": whole(b?.moisture), "Board Thickness Achieved": whole(b?.boardThickness || pr?.boardThickness), "Board Weight Achieved (Grams)": whole(b?.sheetWeightGrams || pr?.boxWeightGrams), "QC Remarks": s(b?.boardlineRemarks || pr?.column40), __jobColor: getQcJobColor({ job, productionId: s(p.id), inspections, loadingSlips, plans }) }; }).filter((r) => (!jobFilter || r["Job No."] === jobFilter) && (!erpFilter || r["ERP Code"] === erpFilter) && (!partyFilter || r["Party Name"] === partyFilter) && (!itemFilter || r["Item Name"] === itemFilter) && (!statusFilter || r["Item Status"] === statusFilter) && (!resultFilter || r["PDI RESULT"] === resultFilter) && (!search.trim() || Object.entries(r).some(([field, v]) => field !== "__jobColor" && key(v).includes(key(search))))), [boardline, corrugatedSheetUsageMap, erpFilter, itemFilter, inspections, items, loadingSlips, materialUsageMap, partyFilter, plans, printing, processing, productions, resultFilter, search, statusFilter, jobFilter]);
  const options = useMemo(() => {
    const values = (column: string) => [...new Set(rows.map((row) => s(row[column])).filter(Boolean))].sort().map((value) => ({ value, label: value, searchText: value }));
    return { jobs: values("Job No."), erps: values("ERP Code"), parties: values("Party Name"), items: values("Item Name"), statuses: values("Item Status"), results: values("PDI RESULT") };
  }, [rows]);
  const sortedRows = useMemo(() => rows.map((row, index) => ({ row, index, date: validDate(row.Date)?.getTime() ?? null })).sort((a, b) => {
    if (a.date === null || b.date === null) return a.date === null && b.date === null ? a.index - b.index : a.date === null ? 1 : -1;
    return (dateSort === "asc" ? a.date - b.date : b.date - a.date) || a.index - b.index;
  }).map(({ row }) => row), [rows, dateSort]);
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sortedRows, 25);
  useEffect(() => setPage(1), [search, jobFilter, erpFilter, partyFilter, itemFilter, statusFilter, resultFilter, dateSort, setPage]);
  const clear = () => { setSearch(""); setJobFilter(""); setErpFilter(""); setPartyFilter(""); setItemFilter(""); setStatusFilter(""); setResultFilter(""); };
  return <div className="space-y-4">
    <h2 className="text-xl font-bold uppercase">QC View</h2>
    <div className="rounded border border-black bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-9">
        <div className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={16}/><input className="h-[34px] w-full rounded border-2 border-black pl-9 pr-3 text-sm" placeholder="Search job, ERP, party, item or QC values" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
        <Select compact value={jobFilter} onChange={setJobFilter} options={options.jobs} placeholder="All Jobs"/>
        <Select compact value={erpFilter} onChange={setErpFilter} options={options.erps} placeholder="All ERP Codes"/>
        <Select compact value={partyFilter} onChange={setPartyFilter} options={options.parties} placeholder="All Parties"/>
        <Select compact value={itemFilter} onChange={setItemFilter} options={options.items} placeholder="All Items"/>
        <Select compact value={statusFilter} onChange={setStatusFilter} options={options.statuses} placeholder="All Statuses"/>
        <Select compact value={resultFilter} onChange={setResultFilter} options={options.results} placeholder="All PDI Results"/>
        <button type="button" onClick={clear} className="inline-flex h-[34px] w-full items-center justify-center gap-2 rounded border-2 border-black px-3 text-sm font-bold hover:bg-slate-100"><X size={15}/>Clear Filters</button>
      </div>
    </div>
    <div className="max-h-[calc(100vh-290px)] overflow-auto rounded border-2 border-black bg-white">
      <table className="min-w-[4200px] border-collapse text-[11px]">
        <thead>
          <tr className="h-[34px]">{GROUPS.map((group) => <th key={group.label} colSpan={group.columns.length} className={`sticky top-0 z-20 border border-black px-3 py-2 text-center text-sm font-extrabold ${group.group}`}>{group.label}</th>)}</tr>
          <tr>{GROUPS.flatMap((group) => group.columns.map((column) => <th key={column} aria-sort={column === "Date" ? dateSort === "asc" ? "ascending" : "descending" : undefined} className={`sticky top-[34px] z-20 min-w-[92px] whitespace-normal border border-black px-2 py-2 text-center font-bold leading-tight ${group.head}`}>{column === "Date" ? <button type="button" onClick={() => setDateSort((current) => current === "asc" ? "desc" : "asc")} className="w-full font-bold" title={`Sort by date ${dateSort === "asc" ? "newest first" : "oldest first"}`}>Date {dateSort === "asc" ? "?" : "?"}</button> : column}</th>))}</tr>
        </thead>
      <tbody>{paginatedItems.length ? paginatedItems.map((row, ri) => <tr key={`${row["Job No."]}-${(page - 1) * pageSize + ri}`} className="odd:bg-white even:bg-slate-50">{COLUMNS.map((column, columnIndex) => { const jobColor = column === "Job No." ? row.__jobColor : undefined; const colorClass = jobColor === "red" ? "bg-red-200 text-red-950 font-black" : jobColor === "yellow" ? "bg-yellow-200 text-yellow-950 font-black" : columnIndex < GROUPS[0].columns.length ? rowDateClass(row.Date) : ""; const cellClass = column === MESSAGE_COLUMN ? "w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words leading-5" : "max-w-[260px] whitespace-normal break-words"; return <td key={column} className={`${cellClass} border border-black px-2 py-2 align-top ${colorClass}`}>{column === "SL No." ? (page - 1) * pageSize + ri + 1 : column === "Spec" ? <SpecCell value={row[column]} erp={row["ERP Code"]}/> : column === "Artwork" ? <LinkCell value={row[column]}/> : row[column] === "" ? "-" : row[column]}</td>; })}</tr>) : <tr><td colSpan={COLUMNS.length} className="p-8 text-center font-semibold">No open QC jobs match the selected filters.</td></tr>}</tbody>
      </table>
    </div>
    <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
  </div>;
}


