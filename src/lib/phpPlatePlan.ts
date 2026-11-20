// PHP / Plate Production Plan for one date: jobs scheduled for that date in
// Shift (Day, Night) then Sequence order. Shared by the page and the server
// (WhatsApp PDF), so both show the same rows.
import type { Company, Firm, Order, OrderSchedule, Production } from "../types";
import type { OrderCatalogItem } from "./orderItems";
import { getFirmDisplayNameById } from "./firmDisplay";
import { resolvePhpPlateFirmId, workflowDate } from "./phpPlateFirm";

export type PhpPlateSource = "PHP" | "PLATE";

export type PhpPlatePlanRow = {
  job: Production;
  source: PhpPlateSource;
  date: string;
  shift: string;
  sequence: number | null;
  jobNo: string;
  firmId: string;
  firmName: string;
  companyName: string;
  itemName: string;
  erp: string;
  methodology: string;
  plannedQty: number;
  producedQty: number;
  balanceQty: number;
  status: "Pending" | "In Progress" | "Complete";
};

const s = (value: unknown) => String(value ?? "").trim();
const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * PHP / Plate jobs as the Production page sees them: a job made by Scrap takes its
 * date, quantities and output from the linked FG job; Scrap FG jobs with no PHP /
 * Plate job of their own are added.
 */
export function buildPhpPlateWorkflowJobs(source: PhpPlateSource, sourceJobs: Production[], fgProductions: Production[]): Production[] {
  const linkField = source === "PHP" ? "phpScheduledJobId" : "plateScheduledJobId";
  const fgByLinkedId = new Map<string, Production>();
  fgProductions.forEach((production) => {
    const id = s((production as any)[linkField]);
    if (id && !fgByLinkedId.has(id)) fgByLinkedId.set(id, production);
  });
  const jobs = sourceJobs.map((job) => {
    const linked = fgByLinkedId.get(job.id);
    return linked && s(linked.methodology).toUpperCase() === "SCRAP"
      ? { ...job, methodology: linked.methodology, scheduledDate: linked.scheduledDate || job.scheduledDate, plannedQty: linked.plannedQty || job.plannedQty, productionOutputQty: linked.prodFromFFG || linked.productionOutputQty || job.productionOutputQty, sequence: linked.sequence || job.sequence, shift: linked.shift || job.shift }
      : job;
  });
  const ids = new Set(jobs.map((job) => job.id));
  const scrap = fgProductions
    .filter((production) => s(production.methodology).toUpperCase() === "SCRAP" && s((production as any)[linkField]) && !ids.has(s((production as any)[linkField])))
    .map((production) => ({
      ...production,
      id: s((production as any)[linkField]),
      scheduledDate: production.scheduledDate || production.date,
      shift: production.shift || "Day",
      productionOutputQty: production.prodFromFFG || production.productionOutputQty || 0,
    }));
  return [...jobs, ...scrap];
}

const SHIFT_ORDER = ["day", "night"];
const shiftRank = (shift: string) => {
  const index = SHIFT_ORDER.indexOf(shift.toLowerCase());
  return index === -1 ? SHIFT_ORDER.length : index;
};

/** Plan rows for one date: Shift (Day, Night, others) then Sequence (no sequence last). */
export function computePhpPlatePlanRows(args: {
  source: PhpPlateSource;
  date: string;
  jobs: Production[];
  schedules: OrderSchedule[];
  orders: Order[];
  companies: Company[];
  firms: Firm[];
  sourceItems: OrderCatalogItem[];
  filters?: { firm?: string; company?: string; item?: string; shift?: string; methodology?: string };
}): PhpPlatePlanRow[] {
  const { source, date, filters = {} } = args;
  const scheduleById = new Map(args.schedules.map((schedule) => [schedule.id, schedule]));
  const orderById = new Map(args.orders.map((order) => [order.id, order]));
  const companyById = new Map(args.companies.map((company) => [company.id, company]));
  const itemById = new Map(args.sourceItems.map((item) => [s(item.id), item]));
  const rows = args.jobs
    .filter((job) => job.status !== "Cancelled" && !job.cancelTimestamp)
    .filter((job) => s(job.scheduledDate) && workflowDate(job) === date)
    .map<PhpPlatePlanRow>((job) => {
      const schedule = scheduleById.get(s(job.scheduleId));
      const order = orderById.get(s(schedule?.orderId)) || orderById.get(s((job as any).orderId));
      const company = companyById.get(s(order?.companyId) || s((job as any).companyId));
      const firmId = resolvePhpPlateFirmId(job, args.schedules, args.orders);
      const item = itemById.get(s(job.itemId));
      const plannedQty = n(job.plannedQty || job.qty);
      const producedQty = n(job.productionOutputQty);
      const done = job.status === "Completed" || (s(job.jobCompletionTimeOutput) && producedQty > 0);
      const sequenceText = s(job.sequence);
      const sequence = sequenceText && Number.isFinite(Number(sequenceText)) ? Number(sequenceText) : null;
      return {
        job,
        source,
        date,
        shift: s(job.shift) || "-",
        sequence,
        jobNo: s(job.transactionNo || job.jobCardNo),
        firmId,
        firmName: getFirmDisplayNameById(firmId, args.firms),
        companyName: s(company?.name || job.companyName),
        itemName: s(item?.name || job.itemId),
        erp: s(job.erpCode || order?.erpCode || item?.erp),
        methodology: s(job.methodology),
        plannedQty,
        producedQty,
        balanceQty: Math.max(0, Math.round((plannedQty - producedQty) * 100) / 100),
        status: done ? "Complete" : producedQty > 0 ? "In Progress" : "Pending",
      };
    })
    .filter((row) =>
      (!filters.firm || row.firmId === filters.firm)
      && (!filters.company || row.companyName === filters.company)
      && (!filters.item || row.itemName === filters.item)
      && (!filters.shift || row.shift === filters.shift)
      && (!filters.methodology || row.methodology === filters.methodology));
  return rows.sort((a, b) =>
    shiftRank(a.shift) - shiftRank(b.shift)
    || a.shift.localeCompare(b.shift)
    || (a.sequence === null ? 1 : 0) - (b.sequence === null ? 1 : 0)
    || (a.sequence ?? 0) - (b.sequence ?? 0)
    || a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }));
}

export type PhpPlatePlanTotals = { jobs: number; planned: number; produced: number; balance: number };
export const phpPlatePlanTotals = (rows: PhpPlatePlanRow[]): PhpPlatePlanTotals => rows.reduce((sum, row) => ({
  jobs: sum.jobs + 1,
  planned: sum.planned + row.plannedQty,
  produced: sum.produced + row.producedQty,
  balance: sum.balance + row.balanceQty,
}), { jobs: 0, planned: 0, produced: 0, balance: 0 });

/** Rows split by shift (keeps the plan order). */
export function groupPhpPlatePlanByShift(rows: PhpPlatePlanRow[]) {
  const groups: Array<{ shift: string; rows: PhpPlatePlanRow[] }> = [];
  rows.forEach((row) => {
    const last = groups[groups.length - 1];
    if (last && last.shift === row.shift) last.rows.push(row);
    else groups.push({ shift: row.shift, rows: [row] });
  });
  return groups;
}
