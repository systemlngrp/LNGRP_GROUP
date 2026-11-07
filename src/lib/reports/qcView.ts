// QC View rows: shared by the page (browser fallback) and the server report
// engine. Same values the page calculated before; per-job searches over the
// full lists are replaced by lookups built once (same first/last/latest rules).
import type { BoardLineQcCheck, ControlRecord, DispatchPlan, LoadingSlip, Material, MaterialIssue, MaterialIssueLine, MaterialIssueReelLine, MaterialReturn, MaterialReturnLine, MaterialReturnReelLine, PreDispatchInspection, PrintingQcCheck, Production, ProductionProcessing, QcBlockRecord, QcUpdateRecord, Setting } from "../../types";
import { buildProductionCorrugatedSheetUsageMap, buildProductionMaterialUsageMap, getProductionActualPaperUsed, hasPaperNotRequiredBypass, hasProductionCorrugatedSheetUsage } from "../productionMaterialUsage";
import { isCorrugationLinerComplete, isMachineStepFull } from "../productionProcessingProgress";
import { dateKey } from "../jobCellColors";
import { findLatestInspection } from "../pdiReportData";
import { buildJobLoadingRecords } from "../jobLoadingRecords";
import { calculateSamplingPlanQty, resolvePlanQuantity } from "../samplingPlanQty";

export type QcRow = Record<string, string | number>;
export const s = (v: unknown) => String(v ?? "").trim();
export const key = (v: unknown) => s(v).toLowerCase();
export const n = (v: unknown): string | number => v === "" || v == null ? "" : Number.isFinite(Number(v)) ? Number(v) : s(v);
export const isUrl = (v: unknown) => /^https?:\/\//i.test(s(v));
export const formatDate = (value: unknown) => { const normalized = dateKey(value); return normalized ? `${normalized.slice(8, 10)}-${normalized.slice(5, 7)}-${normalized.slice(0, 4)}` : s(value); };
export const formatFlapHeightFlap = (left: unknown, height: unknown, right: unknown) => { const values = [s(left), s(height), s(right)]; return values.some(Boolean) ? values.join(" - ") : ""; };
export const whole = (value: unknown): string | number => { if (value === "" || value == null) return ""; const numeric = Number(value); return Number.isFinite(numeric) ? Math.round(numeric) : s(value); };
export const formatWholeFlapHeightFlap = (left: unknown, height: unknown, right: unknown) => { const values = [left, height, right].map(whole); return values.some((value) => value !== "") ? values.join(" - ") : ""; };
export const checkColumnValues = (checkNo: unknown, operatorValue: string, driveValue: string, cuttingValue: string | number) => {
  const index = Number.parseInt(s(checkNo), 10);
  const values = ["", "", "", ""];
  if (index < 1 || index > 4) return { checks: values, cutting: ["", "", "", ""] };
  const combined = [operatorValue && `OS ${operatorValue}`, driveValue && `DS ${driveValue}`].filter(Boolean).join(" | ");
  values[index - 1] = combined;
  const cutting = ["", "", "", ""];
  cutting[index - 1] = String(cuttingValue);
  return { checks: values, cutting };
};

export const hasPositiveQuantity = (value: unknown) => Number(value || 0) > 0;

export function getQcProductionStatus(production: Production, actualPaperUsed: number, hasCorrugatedSheetUsage: boolean, processing: ProductionProcessing[]) {
  if (production.status === "Cancelled" || production.cancelTimestamp || production.tallyTimestamp || production.status === "Completed") return s(production.status);
  if (!hasPaperNotRequiredBypass(production) && actualPaperUsed <= 0 && !hasCorrugatedSheetUsage) return "Pending Reel Issue";
  if (!isCorrugationLinerComplete(processing, s(production.id))) return "Pending Corrugation";
  if (!isMachineStepFull(processing, s(production.id), "Printing")) return "Pending Printing";
  return s(production.status);
}


export type QcViewLists = {
  productions: Production[];
  processing: ProductionProcessing[];
  boardline: BoardLineQcCheck[];
  printing: PrintingQcCheck[];
  inspections: PreDispatchInspection[];
  loadingSlips: LoadingSlip[];
  plans: DispatchPlan[];
  settings: Setting[];
  materials: Material[];
  materialIssues: MaterialIssue[];
  materialIssueLines: MaterialIssueLine[];
  materialIssueReelLines: MaterialIssueReelLine[];
  materialReturns: MaterialReturn[];
  materialReturnLines: MaterialReturnLine[];
  materialReturnReelLines: MaterialReturnReelLine[];
  qcUpdates: QcUpdateRecord[];
  blockRecords: QcBlockRecord[];
  controlRecords: ControlRecord[];
};

/** Items as the page uses them: NPD items with artwork = url and spec = artwork. */
export function toQcItems(npdItems: any[]) {
  return npdItems.map((item) => ({ ...item, artwork: item.url, spec: item.artwork }));
}

/** All rows before the page's search/filters. */
export function computeQcViewRows(lists: QcViewLists, items: any[]): QcRow[] {
  const { productions, processing, boardline, printing, inspections, loadingSlips, plans, settings, materials, materialIssues, materialIssueLines, materialIssueReelLines, materialReturns, materialReturnLines, materialReturnReelLines, qcUpdates, blockRecords, controlRecords } = lists;
  const materialUsageMap = buildProductionMaterialUsageMap(materialIssues, materialIssueLines, materialReturns, materialReturnLines, materialIssueReelLines, materialReturnReelLines, productions);
  const corrugatedSheetUsageMap = buildProductionCorrugatedSheetUsageMap(materials, materialIssues, materialIssueLines, materialReturns, materialReturnLines);
  const loadingByJob = buildJobLoadingRecords(productions, loadingSlips, plans);

  // Last QC check per job (was .filter(...).at(-1) per job).
  const lastByJob = <T extends { jobNo?: string }>(rows: T[]) => {
    const map = new Map<string, T>();
    rows.forEach((row) => map.set(key(row.jobNo), row));
    return map;
  };
  const lastBoardlineByJob = lastByJob(boardline as any[]) as Map<string, BoardLineQcCheck>;
  const lastPrintingByJob = lastByJob(printing as any[]) as Map<string, PrintingQcCheck>;
  // Latest record per ERP by updateTimestamp; the earliest row wins ties (same
  // as the stable descending sort + first element used before).
  const latestByErp = <T extends { updateTimestamp?: string; erpCode?: string; erpNo?: string }>(rows: T[]) => {
    const map = new Map<string, T>();
    rows.forEach((row) => {
      const erpKey = key(row.erpCode || row.erpNo);
      const current = map.get(erpKey);
      if (!current || s(row.updateTimestamp).localeCompare(s(current.updateTimestamp)) > 0) map.set(erpKey, row);
    });
    return map;
  };
  const latestQcUpdateByErp = latestByErp(qcUpdates as any[]) as Map<string, QcUpdateRecord>;
  const latestBlockByErp = latestByErp(blockRecords as any[]) as Map<string, QcBlockRecord>;
  const latestControlByErp = latestByErp(controlRecords as any[]) as Map<string, ControlRecord>;
  // First item matching id, NPD id or ERP (was items.find per job).
  const firstIndex = (values: string[]) => {
    const map = new Map<string, number>();
    values.forEach((value, index) => { if (!map.has(value)) map.set(value, index); });
    return map;
  };
  const itemIndexById = firstIndex(items.map((i: any) => key(i.id)));
  const itemIndexByErp = firstIndex(items.map((i: any) => key(i.erp)));
  const findItem = (p: Production, erp: string) => {
    const candidates = [itemIndexById.get(key(p.itemId)), itemIndexById.get(key((p as any).npdId)), itemIndexByErp.get(key(erp))]
      .filter((index): index is number => index !== undefined);
    return candidates.length ? items[Math.min(...candidates)] : undefined;
  };
  // Processing rows per job (exact productionId, as the status checks compare).
  const processingByProductionId = new Map<string, ProductionProcessing[]>();
  processing.forEach((row) => {
    const list = processingByProductionId.get(row.productionId);
    if (list) list.push(row);
    else processingByProductionId.set(row.productionId, [row]);
  });
  // Processing quantity per machine by job id or job no (rows matching either, once).
  const qtyIndexById = new Map<string, number[]>();
  const qtyIndexByJob = new Map<string, number[]>();
  processing.forEach((record, index) => {
    const machine = key(record.machineName);
    const byId = `${machine}|${key(record.productionId)}`;
    const byJob = `${machine}|${key(record.jobNo)}`;
    (qtyIndexById.get(byId) || qtyIndexById.set(byId, []).get(byId)!).push(index);
    (qtyIndexByJob.get(byJob) || qtyIndexByJob.set(byJob, []).get(byJob)!).push(index);
  });
  const processingQuantity = (production: Production, job: string, machine: string) => {
    const a = qtyIndexById.get(`${key(machine)}|${key(production.id)}`) || [];
    const b = qtyIndexByJob.get(`${key(machine)}|${key(job)}`) || [];
    let total = 0;
    let i = 0;
    let j = 0;
    let last = -1;
    while (i < a.length || j < b.length) {
      const next = j >= b.length || (i < a.length && a[i] <= b[j]) ? a[i++] : b[j++];
      if (next === last) continue;
      last = next;
      const record = processing[next];
      total += hasPositiveQuantity(record.qty) ? Number(record.qty) : 0;
    }
    return total;
  };

  return productions.filter((p) => p.status !== "Cancelled" && !(key(p.closeBy) === "yes" && s(p.closeDate)) && s(p.transactionNo || p.jobCardNo)).map((p) => { const job = s(p.transactionNo || p.jobCardNo); const b = lastBoardlineByJob.get(key(job)); const pr = lastPrintingByJob.get(key(job)); const erp = s(p.erpCode || b?.erp || pr?.erp); const item = findItem(p, erp); const itemName = s((p as any).itemName || item?.name || b?.itemName || pr?.itemName); const qcUpdate = latestQcUpdateByErp.get(key(erp)); const block = latestBlockByErp.get(key(erp)); const control = latestControlByErp.get(key(erp)); const pdi = findLatestInspection(inspections, s(p.id), job); const pdiResult = s(pdi?.result); const planQty = resolvePlanQuantity(p.plannedQty, p.qty, b?.planQty, pr?.planQty); const operatorCheck = formatWholeFlapHeightFlap(b?.flapAchievedOs, b?.heightAchievedOs, b?.flapLAchievedOs); const driveCheck = formatWholeFlapHeightFlap(b?.flapAchievedDs, b?.heightAchievedDs, b?.flapLAchievedDs); const mappedChecks = checkColumnValues(b?.checkNo, operatorCheck, driveCheck, whole(b?.cuttingSizeMm)); const tolerance = Number(settings[0]?.qcBgsmTolerancePercent ?? 3); const bgsmTolerance = tolerance >= 0 ? tolerance : 3; const requiredBgsm = Number(b?.boardGsm || 0); const bgsmMin = whole(requiredBgsm * (1 - bgsmTolerance / 100)); const bgsmMax = whole(requiredBgsm * (1 + bgsmTolerance / 100)); return { __rowKey: s(p.id) || `${job}|${s(p.date)}|${erp}`, "Job No.": job, Date: formatDate(p.date), "Party Name": s(p.companyName || b?.partyName || pr?.partyName), "Item Name": itemName, "ERP Code": erp, "Plan Quantity": planQty, "Item Status": getQcProductionStatus(p, getProductionActualPaperUsed(p, materialUsageMap), hasProductionCorrugatedSheetUsage(p, corrugatedSheetUsageMap), processingByProductionId.get(s(p.id)) || []), Artwork: s(item?.artwork), Spec: s(item?.spec), "File No.": s((qcUpdate as any)?.fileNo), "Index No": s((qcUpdate as any)?.indexNo), "Sample No.": s(qcUpdate?.sampleNo), "Block Location": s((block as any)?.blockLocation), "Block No.": s((block as any)?.blockNo), "Sample Location": s(qcUpdate?.location), "Sample No. (Control)": s((control as any)?.sampleNo), "Boardline AUTO-CORRECTION Message": [b?.systemAutoCorrection1, b?.systemAutoCorrection2, b?.systemAutoCorrection3, b?.systemAutoCorrection4, b?.systemAutoCorrection5].filter(Boolean).join(" | "), "Previous Customer Complaint": s(b?.previousCustomerComplaintWarning || pr?.previousCustomerComplaintWarning), "PDI RESULT": pdiResult, "Boardline Production": n(processingQuantity(p, job, "Corrugation Liner")), "Printing Production": n(processingQuantity(p, job, "Printing")), "Loaded Quantity": n((loadingByJob.get(p.id) || []).reduce((total, record) => total + record.qty, 0)), Length: n(p.length || b?.length || pr?.lengthId), Width: n(p.breadth || b?.width || pr?.widthId), Height: n(p.height || b?.heightOd || pr?.heightId), "L-OD": n(b?.length), "W-OD": n(b?.width), "H-OD": n(b?.heightOd), FLAP: n(b?.flap), Ply: n(b?.ply), "No. Of parts": s(b?.part), "SAMPLING PLAN QTY": calculateSamplingPlanQty(planQty, settings[0]), "Required Size": s(b?.standard) || formatFlapHeightFlap(b?.flap, b?.heightOd, b?.flap) || s(pr?.standardBoxSize), "Check 1": mappedChecks.checks[0], "Check 2": mappedChecks.checks[1], "Check 3": mappedChecks.checks[2], "Check 4": mappedChecks.checks[3], "Required Cutting Size": whole(b?.cuttingSizeRequired), "Cutting Check 1": mappedChecks.cutting[0], "Cutting Check 2": mappedChecks.cutting[1], "Cutting Check 3": mappedChecks.cutting[2], "Cutting Check 4": mappedChecks.cutting[3], "Required B.GSM": whole(b?.boardGsm), "BGSM MIN": bgsmMin, "BGSM MAX": bgsmMax, "GSM Check 1": bgsmMin, "GSM Check 2": bgsmMax, "GSM Check 3": bgsmMin, "GSM Check 4": bgsmMax, "PLY": whole(b?.ply), "Flute Check": s(b?.typeOfFlute), "Moisture Check": whole(b?.moisture), "Board Thickness Achieved": whole(b?.boardThickness || pr?.boardThickness), "BS Achieved": whole((b as any)?.bsAchieved || (pr as any)?.bsAchieved), "Board Weight Achieved (Grams)": whole(b?.sheetWeightGrams || pr?.boxWeightGrams), "QC Remarks": s(b?.boardlineRemarks || pr?.column40) }; });
}
