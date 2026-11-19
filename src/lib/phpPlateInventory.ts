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

/** PHP / Plate qty bought through FG Purchase MRRs (GET /api/php-plate-receipts). */
export type PhpPlateReceipt = { source: string; itemId: string; firmId: string; qty: number };

function receiptQty(receipts: PhpPlateReceipt[], row: MasterRow, source: Extract<OrderItemSource, "PHP" | "PLATE">, firmId?: string) {
  const keys = rowKeys(row);
  return receipts.reduce((sum, receipt) => {
    if (String(receipt.source || "").toUpperCase() !== source) return sum;
    if (!keys.includes(normalize(receipt.itemId))) return sum;
    if (firmId !== undefined && String(receipt.firmId || "").trim() !== firmId) return sum;
    return sum + toNumber(receipt.qty);
  }, 0);
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

export function buildPhpPlateInventoryRows(masterRows: MasterRow[], jobs: Production[], loadingSlips: LoadingSlip[], source: Extract<OrderItemSource, "PHP" | "PLATE">, receipts: PhpPlateReceipt[] = []) {
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
    const receiptQtyTotal = receiptQty(receipts, row, source);
    return {
      ...row,
      openingQty,
      receiptQty: receiptQtyTotal,
      output,
      loadedQty,
      balance: openingQty + receiptQtyTotal + output - loadedQty,
    };
  });
}

export function buildFirmWisePhpPlateInventoryRows(masterRows: MasterRow[], jobs: Production[], loadingSlips: LoadingSlip[], firms: Firm[], source: Extract<OrderItemSource, "PHP" | "PLATE">, receipts: PhpPlateReceipt[] = []) {
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
        const slipFirm = String(
          String((slip as any).interFirmFlow || "").toLowerCase() === "yes"
            ? (slip as any).sourceFirmId || (slip as any).firmId
            : (slip as any).firmId || (slip as any).destinationFirmId
        ).trim();
        if (slipFirm !== firmId || slip.status === "Cancelled") return sum;
        return sum + slip.lines.reduce((lineSum, line) => slipLineMatchesRow(line, row, source) ? lineSum + toNumber(line.loadedQty) : lineSum, 0);
      }, 0);
      const opening = String((row as any).firmId || "").trim() === firmId ? toNumber(row.openingQty) : 0;
      const receipt = receiptQty(receipts, row, source, firmId);
      firmStocks[firmId] = { opening, receipt, production, invoiced, balance: opening + receipt + production - invoiced };
    }
    return { ...row, firmStocks };
  });
}
