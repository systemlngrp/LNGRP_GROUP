import type { DispatchPlan, Invoice, InvoiceLineItem, LoadingSlip, Production, QualityComplaint } from "../types";

const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
const stamp = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const latest = <T extends { date?: string; updateTimestamp?: string }>(rows: T[]) =>
  rows.slice().sort((a, b) => stamp(b.date || b.updateTimestamp) - stamp(a.date || a.updateTimestamp))[0];

export type CapaLinkedDetails = {
  deliveryNo: string;
  vehicleNo: string;
  invoiceDate: string;
  productionDate: string;
  dispatchDate: string;
};

export function findCapaLinkedDetails(
  complaint: QualityComplaint,
  productions: Production[],
  plans: DispatchPlan[],
  slips: LoadingSlip[],
  invoices: Invoice[],
  invoiceLines: InvoiceLineItem[] = [],
): CapaLinkedDetails {
  const empty = { deliveryNo: "", vehicleNo: "", invoiceDate: "", productionDate: "", dispatchDate: "" };
  if (!key(complaint.lotNo)) return empty;
  const production = latest(productions.filter((row) =>
    [row.transactionNo, row.jobCardNo].some((number) => key(number) === key(complaint.lotNo)) &&
    (!complaint.firmId || !row.firmId || row.firmId === complaint.firmId)));
  if (!production) return empty;

  const linkedPlans = plans.filter((row) => row.productionId === production.id ||
    Boolean(production.scheduleId && row.scheduleId === production.scheduleId));
  const planIds = new Set(linkedPlans.map((row) => row.id));
  const linkedSlips = slips.filter((slip) => slip.status !== "Cancelled" && slip.lines?.some((line) =>
    planIds.has(line.dispatchPlanId) || line.jobNos?.some((number) => key(number) === key(complaint.lotNo)) ||
    line.allocations?.some((allocation) => allocation.sourceType === "job" && allocation.jobId === production.id)));
  const slipIds = new Set(linkedSlips.map((slip) => slip.id));
  const invoiceIds = new Set([
    ...linkedSlips.map((slip) => slip.invoiceId).filter((id): id is string => Boolean(id)),
    ...invoiceLines.filter((line) => slipIds.has(line.loadingSlipId)).map((line) => line.invoiceId),
  ]);
  const invoice = latest(invoices.filter((row) => invoiceIds.has(row.id)));
  const dispatched = latest(linkedPlans.filter((row) => row.status === "Dispatched"));
  const slip = latest(linkedSlips);
  return {
    deliveryNo: invoice?.invoiceNo || slip?.invoiceNo || "",
    vehicleNo: slip?.truckNo || "",
    invoiceDate: invoice?.date || "",
    productionDate: production.date || "",
    dispatchDate: dispatched?.date || slip?.date || "",
  };
}
