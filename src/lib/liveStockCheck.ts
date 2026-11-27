import { getDataAuthHeaders } from "../hooks/useData";

export type LiveStockSlipEntity = "loading_slips" | "php_loading_slips" | "plate_loading_slips";

/**
 * Asks the server whether saving these slips would take any item's live stock
 * (physical count + production + receipts − loaded − loading wastage) below zero.
 * Returns the message to show, or "" when the save may go ahead. The server runs the
 * same check again on save, so a failed check call does not block here.
 */
export async function checkLiveStock(entity: LiveStockSlipEntity, rows: unknown[]): Promise<string> {
  try {
    const response = await fetch("/api/live-stock/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getDataAuthHeaders(false) as Record<string, string>) },
      body: JSON.stringify({ entity, rows }),
    });
    if (!response.ok) return "";
    const body = await response.json().catch(() => ({}));
    return body?.ok === false ? String(body.message || "Not enough stock.") : "";
  } catch {
    return "";
  }
}

/** Live stock per item ("FG|<erp>", "PHP|<erp>", "PLATE|<erp>"), for showing on loading screens. */
export async function fetchLiveStockLevels(): Promise<Record<string, number>> {
  try {
    const response = await fetch("/api/live-stock/levels", { headers: getDataAuthHeaders(false) as HeadersInit });
    if (!response.ok) return {};
    const body = await response.json().catch(() => ({}));
    return body?.levels || {};
  } catch {
    return {};
  }
}
