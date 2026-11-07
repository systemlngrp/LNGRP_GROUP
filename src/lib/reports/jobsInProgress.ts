// Jobs in Progress (Job Movement Tracker) base rows, shared by the browser
// and the server (/api/reports/jobs-in-progress). Moved unchanged from
// src/pages/JobsInProgressReport.tsx; search/date filters stay in the page.
import { normalizeMachineName } from "../productionMachineNames";
import type { DispatchPlan, InvoiceLineItem, LoadingSlip, Production, ProductionProcessing } from "../../types";

export type JobMovementRow = {
  productionId: string;
  jobNo: string;
  jobDate: string;
  erp: string;
  company: string;
  itemName: string;
  planQty: number;
  corrugation: number;
  fg: number;
  invoiced: number;
  loading: number;
  balance: number;
};

export function text(value: unknown) { return String(value ?? "").trim(); }
export function key(value: unknown) { return text(value).toLowerCase(); }
export function quantity(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
export function roundQuantity(value: number) { return Number(quantity(value).toFixed(2)); }
export function formatQty(value: number) { return roundQuantity(value).toFixed(2); }
export function addQuantity(map: Map<string, number>, id: string, amount: number) { if (id && Number.isFinite(amount)) map.set(id, roundQuantity((map.get(id) || 0) + amount)); }
export function getLineItemIdentity(line: { itemId?: string; itemSource?: string; npdId?: string }) { return `${key(line.itemSource)}::${key(line.itemId)}::${key(line.npdId)}`; }

export type JobsInProgressLists = {
  productions: Production[];
  processing: ProductionProcessing[];
  plans: DispatchPlan[];
  loadingSlips: LoadingSlip[];
  invoiceLineItems: InvoiceLineItem[];
};

export function computeJobsInProgressRows(lists: JobsInProgressLists, items: any[]): JobMovementRow[] {
  const { productions, processing, plans, loadingSlips, invoiceLineItems } = lists;
    const productionById = new Map(productions.map((production) => [production.id, production]));
    const productionByJob = new Map<string, Production>();
    productions.forEach((production) => { const jobNo = key(production.transactionNo || production.jobCardNo); if (jobNo) productionByJob.set(jobNo, production); });
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const loadingByProduction = new Map<string, number>();
    const loadingEvidence = new Set<string>();
    const companyByProduction = new Map<string, string>();
    const itemNameByProduction = new Map<string, string>();
    const loadingAllocationsBySlip = new Map<string, Array<{ productionId: string; qty: number; identity: string }>>();
    const resolveProductionId = (jobId: unknown, jobNo: unknown) => { const directId = text(jobId); if (directId && productionById.has(directId)) return directId; return productionByJob.get(key(jobNo))?.id || ""; };
    const recordLoadingMetadata = (productionId: string, line: LoadingSlip["lines"][number]) => {
      if (text(line.companyName)) companyByProduction.set(productionId, text(line.companyName));
      if (text(line.itemName)) itemNameByProduction.set(productionId, text(line.itemName));
    };

    loadingSlips.forEach((slip) => {
      if (slip.status === "Cancelled") return;
      const slipAllocations: Array<{ productionId: string; qty: number; identity: string }> = [];
      slip.lines.forEach((line) => {
        const plan = planById.get(line.dispatchPlanId);
        const allocations = (line.allocations || []).filter((allocation) => allocation.sourceType === "job");
        const resolvedAllocations = allocations.map((allocation) => ({ productionId: resolveProductionId(allocation.jobId, allocation.jobNo), qty: quantity(allocation.qty) })).filter((allocation) => allocation.productionId && allocation.qty > 0);
        if (resolvedAllocations.length) {
          resolvedAllocations.forEach((allocation) => { const identity = getLineItemIdentity(line); recordLoadingMetadata(allocation.productionId, line); addQuantity(loadingByProduction, allocation.productionId, allocation.qty); loadingEvidence.add(allocation.productionId); slipAllocations.push({ ...allocation, identity }); });
          return;
        }
        const planProductionId = text(plan?.productionId);
        const jobNumbers = (line.jobNos || []).map(key).filter(Boolean);
        const fallbackProductionId = planProductionId && productionById.has(planProductionId) ? planProductionId : jobNumbers.length === 1 ? productionByJob.get(jobNumbers[0])?.id || "" : "";
        if (!fallbackProductionId || quantity(line.loadedQty) <= 0) return;
        const fallback = { productionId: fallbackProductionId, qty: quantity(line.loadedQty), identity: getLineItemIdentity(line) };
        recordLoadingMetadata(fallback.productionId, line);
        addQuantity(loadingByProduction, fallback.productionId, fallback.qty); loadingEvidence.add(fallback.productionId); slipAllocations.push(fallback);
      });
      if (slipAllocations.length) loadingAllocationsBySlip.set(slip.id, slipAllocations);
    });

    plans.forEach((plan) => { const productionId = text(plan.productionId); if (productionId && !loadingEvidence.has(productionId)) addQuantity(loadingByProduction, productionId, quantity(plan.loadedQty)); });

    const invoicedByProduction = new Map<string, number>();
    invoiceLineItems.forEach((invoiceLine) => {
      const invoiceQty = quantity(invoiceLine.qty); if (invoiceQty <= 0) return;
      const allocations = loadingAllocationsBySlip.get(invoiceLine.loadingSlipId) || [];
      const invoiceIdentity = getLineItemIdentity(invoiceLine);
      const matchingAllocations = allocations.filter((allocation) => allocation.identity === invoiceIdentity || allocation.identity.split("::")[1] === key(invoiceLine.itemId) || allocation.identity.split("::")[2] === key(invoiceLine.npdId));
      const candidates = matchingAllocations.length ? matchingAllocations : allocations;
      const totalAllocated = candidates.reduce((sum, allocation) => sum + allocation.qty, 0);
      if (totalAllocated > 0) candidates.forEach((allocation) => addQuantity(invoicedByProduction, allocation.productionId, invoiceQty * allocation.qty / totalAllocated));
    });

    const corrugationByProduction = new Map<string, number>();
    processing.forEach((entry) => { if (normalizeMachineName(entry.machineName).startsWith("Corrugation")) addQuantity(corrugationByProduction, entry.productionId, quantity(entry.qty)); });

  return productions.filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp).map((production) => {
      const erp = text(production.erpCode || production.masterErp);
      const item = items.find((candidate: any) => key(candidate.id) === key(production.itemId) || key(candidate.id) === key(production.npdId) || key(candidate.erp) === key(erp));
      const planQty = quantity(production.plannedQty || production.qty); const loading = roundQuantity(loadingByProduction.get(production.id) || 0);
      return { productionId: production.id, jobNo: text(production.transactionNo || production.jobCardNo), jobDate: text(production.date), erp, company: text(production.companyName || (item as any)?.companyName || companyByProduction.get(production.id)), itemName: text((production as Production & { itemName?: string }).itemName || (item as any)?.name || (item as any)?.itemName || itemNameByProduction.get(production.id) || production.itemId), planQty, corrugation: roundQuantity(corrugationByProduction.get(production.id) || 0), fg: roundQuantity(production.prodFromFFG), invoiced: roundQuantity(invoicedByProduction.get(production.id) || 0), loading, balance: roundQuantity(Math.max(0, planQty - loading)) };
    });
}
