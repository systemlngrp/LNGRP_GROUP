import type { GateEntry, GatePass, GatePassLine, MaterialIn, MaterialLine } from "../types";
import { canCreateMrrForGateEntry } from "./gateEntryState";

export type DerivedGatePassState = "Open" | "Partially Returned" | "Closed" | "Cleared Off";

export type GatePassLineWithReturns = GatePassLine & {
  returnedQty: number;
  pendingQty: number;
  /** Job Work: qty that will not come back (line closed as Complete while short). */
  shortQty: number;
  closedComplete: boolean;
};

/** MRR types that receive goods back against a returnable gate pass. */
export const RETURN_MRR_TYPES = new Set(["Service Return", "Job Work Return"]);

export function isJobWorkGatePass(gatePass?: Pick<GatePass, "gatePassType" | "purpose"> | null) {
  return Boolean(gatePass) && (gatePass!.gatePassType || "Non-Returnable") === "Returnable" && gatePass!.purpose === "Job Work";
}

function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

export function isReturnableGatePass(gatePass: GatePass) {
  return (gatePass.gatePassType || "Non-Returnable") === "Returnable";
}

export function getReturnableReceiptLines(materialIn: MaterialIn[], gatePassId: string, excludeMaterialInId?: string) {
  return materialIn
    .filter((entry) => entry.id !== excludeMaterialInId)
    .filter((entry) => RETURN_MRR_TYPES.has(String(entry.mrrType || "")) && entry.sourceGatePassId === gatePassId)
    .filter((entry) => !["cancelled", "canceled"].includes(String((entry as any).status || "").trim().toLowerCase()))
    .flatMap((entry) => entry.lines || []);
}

export function getReturnedQtyForGatePassLine(
  materialIn: MaterialIn[],
  gatePassId: string,
  gatePassLineId: string,
  excludeMaterialInId?: string
) {
  return round2(
    getReturnableReceiptLines(materialIn, gatePassId, excludeMaterialInId)
      .filter((line) => line.sourceGatePassLineId === gatePassLineId)
      .reduce((sum, line) => sum + Number(line.actualQty ?? line.qty ?? 0), 0)
  );
}

export function getGatePassLinesWithReturns(
  gatePass: GatePass,
  materialIn: MaterialIn[],
  excludeMaterialInId?: string
): GatePassLineWithReturns[] {
  const receiptLines = isReturnableGatePass(gatePass) ? getReturnableReceiptLines(materialIn, gatePass.id, excludeMaterialInId) : [];
  return (gatePass.lines || []).map((line) => {
    const returnedQty = isReturnableGatePass(gatePass)
      ? getReturnedQtyForGatePassLine(materialIn, gatePass.id, line.id, excludeMaterialInId)
      : 0;
    const closedComplete = receiptLines.some((entry) => entry.sourceGatePassLineId === line.id && entry.jobWorkStatus === "Complete");
    const openQty = Math.max(0, round2(Number(line.qty || 0) - returnedQty));
    return {
      ...line,
      returnedQty,
      pendingQty: closedComplete ? 0 : openQty,
      shortQty: closedComplete ? openQty : 0,
      closedComplete,
    };
  });
}

export function deriveGatePassState(gatePass: GatePass, materialIn: MaterialIn[]): DerivedGatePassState {
  if (!isReturnableGatePass(gatePass)) return "Closed";
  if (gatePass.clearOffReason && gatePass.clearedOffAt) return "Cleared Off";
  const lines = getGatePassLinesWithReturns(gatePass, materialIn);
  const pendingQty = round2(lines.reduce((sum, line) => sum + Number(line.pendingQty || 0), 0));
  const returnedQty = round2(lines.reduce((sum, line) => sum + Number(line.returnedQty || 0), 0));
  if (pendingQty <= 0) return "Closed";
  if (returnedQty <= 0) return "Open";
  return "Partially Returned";
}

export function getPendingQtyForGatePass(gatePass: GatePass, materialIn: MaterialIn[]) {
  return round2(getGatePassLinesWithReturns(gatePass, materialIn).reduce((sum, line) => sum + Number(line.pendingQty || 0), 0));
}

export function hasSavedReturnableReceiptGateEntry(gatePass: GatePass, gateEntries: GateEntry[]) {
  const gatePassId = String(gatePass.id || "").trim();
  if (!gatePassId) return false;

  // Only a return gate entry still waiting for its MRR hides the pass; after the MRR,
  // a pass that is only partly back (In Progress) can be received again.
  return gateEntries.some((entry) => {
    const purpose = String(entry.purpose || "").trim();
    const sourceGatePassId = String(entry.sourceGatePassId || "").trim();
    return purpose === "Returnable Receipt" && sourceGatePassId === gatePassId && canCreateMrrForGateEntry(entry);
  });
}
export function getGatePassPrimaryPartyName(gatePass: GatePass) {
  return gatePass.companyName || gatePass.recipientName || "-";
}

export function getGatePassLineLabel(line: GatePassLine | MaterialLine) {
  return line.itemDescription || line.itemName || line.sourceGatePassItemDescription || "Unknown";
}


/** Days since the pass date (India calendar day). */
export function daysOutside(gatePass: Pick<GatePass, "date">, now = new Date()) {
  const start = new Date(String(gatePass.date || "").slice(0, 10) + "T00:00:00");
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
}

/** Qty of each job still at a job worker (open Job Work passes), keyed by production id. */
export function getQtyAtJobWorkerByJob(gatePasses: GatePass[], materialIn: MaterialIn[]) {
  const map = new Map<string, number>();
  for (const gatePass of gatePasses) {
    if (!isJobWorkGatePass(gatePass)) continue;
    if (gatePass.clearOffReason && gatePass.clearedOffAt) continue;
    for (const line of getGatePassLinesWithReturns(gatePass, materialIn)) {
      const jobId = String(line.productionId || gatePass.productionId || "").trim();
      if (!jobId || Number(line.pendingQty || 0) <= 0) continue;
      map.set(jobId, round2((map.get(jobId) || 0) + Number(line.pendingQty || 0)));
    }
  }
  return map;
}
