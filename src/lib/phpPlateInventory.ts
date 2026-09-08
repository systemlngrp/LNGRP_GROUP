import { LoadingSlip, OrderItemSource, Production } from "../types";
import type { Firm } from "../types";

type MasterRow = {
  id: string;
  itemId?: string | number;
  openingQty?: string | number;
  [key: string]: string | number | boolean | null | undefined;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowKeys(row: MasterRow) {
  return [...new Set([row.id, row.itemId].map((value) => normalize(value)).filter(Boolean))];
}

function slipLineMatchesRow(line: LoadingSlip["lines"][number], row: MasterRow, source: Extract<OrderItemSource, "PHP" | "PLATE">) {
  const keys = rowKeys(row);
  const lineSource = String(line.itemSource || source).trim().toUpperCase();
  return lineSource === source && keys.includes(normalize(line.itemId));
}

function jobMatchesRow(job: Production, row: MasterRow, source: Extract<OrderItemSource, "PHP" | "PLATE">) {
  const keys = rowKeys(row);
  const jobSource = String(job.itemSource || source).trim().toUpperCase();
  return jobSource === source && keys.includes(normalize(job.itemId));
}

export function buildPhpPlateInventoryRows(masterRows: MasterRow[], jobs: Production[], loadingSlips: LoadingSlip[], source: Extract<OrderItemSource, "PHP" | "PLATE">) {
  return masterRows.map((row) => {
    const output = jobs.reduce((sum, job) => {
      if (job.status === "Cancelled" || job.cancelTimestamp) return sum;
      if (!jobMatchesRow(job, row, source)) return sum;
      return sum + toNumber(job.productionOutputQty);
    }, 0);

    const loadedQty = loadingSlips.reduce((sum, slip) => {
      if (slip.status === "Cancelled") return sum;
      return (
        sum +
        slip.lines.reduce((lineSum, line) => {
          if (!slipLineMatchesRow(line, row, source)) return lineSum;
          return lineSum + toNumber(line.loadedQty);
        }, 0)
      );
    }, 0);

    const openingQty = toNumber(row.openingQty);
    return {
      ...row,
      openingQty,
      output,
      loadedQty,
      balance: openingQty + output - loadedQty,
    };
  });
}

export function buildFirmWisePhpPlateInventoryRows(masterRows: MasterRow[], jobs: Production[], loadingSlips: LoadingSlip[], firms: Firm[], source: Extract<OrderItemSource, "PHP" | "PLATE">) {
  return masterRows.map((row) => {
    const firmStocks: Record<string, { opening: number; receipt: number; production: number; invoiced: number; balance: number }> = {};
    for (const firm of firms) {
      const firmId = String(firm.id || "").trim();
      const production = jobs.reduce((sum, job) => {
        const jobFirm = String(job.destinationFirmId || job.firmId || "").trim();
        return jobFirm === firmId && job.status !== "Cancelled" && !job.cancelTimestamp && jobMatchesRow(job, row, source)
          ? sum + toNumber(job.productionOutputQty)
          : sum;
      }, 0);
      const invoiced = loadingSlips.reduce((sum, slip) => {
        const slipFirm = String((slip as any).destinationFirmId || (slip as any).firmId || "").trim();
        if (slipFirm !== firmId || slip.status === "Cancelled") return sum;
        return sum + slip.lines.reduce((lineSum, line) => slipLineMatchesRow(line, row, source) ? lineSum + toNumber(line.loadedQty) : lineSum, 0);
      }, 0);
      const opening = String((row as any).firmId || "").trim() === firmId ? toNumber(row.openingQty) : 0;
      firmStocks[firmId] = { opening, receipt: 0, production, invoiced, balance: opening + production - invoiced };
    }
    return { ...row, firmStocks };
  });
}
