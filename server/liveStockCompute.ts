// FG (owner's rule, 27-Nov-2026 evening): jobs started in the app (from 17-Nov-2026) count
// from their own record (printed - loaded - loading wastage, all dates; closed jobs 0); the
// physical count is kept only for older stock (lots before 17-Nov, boxes with no lot), less
// what is loaded from it after the count. PHP / Plate keep the rule below.
// Live stock from a physical count (owner's rule, 27-Nov-2026):
//   Live = Opening (physical count + adjustment rows, as on the cutoff)
//        + Production (FG: printed qty; PHP/Plate: job output)
//        + Receipts (FG Purchase / Rejection In MRRs into Unit-II, not inter-firm)
//        - Dispatched (loaded qty on loading slips)
//        - Loading wastage (FG, entered on the slips)
// Only movements after the cutoff count. A movement dated the cutoff day counts
// unless its id was saved before the cutoff (cutoff.preCutoffIds). PHP / Plate job
// output counts as the change since the cutoff (cutoff.jobBaselines).

export type LiveStockItemType = "FG" | "PHP" | "PLATE";
export type LiveStockMovementKind = "production" | "receiptPurchase" | "receiptRejection" | "dispatched" | "loadingWastage";

export type LiveStockOpening = { itemType: LiveStockItemType; erp: string; itemName?: string; qty: number };

export type LiveStockMovement = {
  /** Entity the id belongs to (production_processing, loading_slips, ...): used for the cutoff list. */
  entity: string;
  id: string;
  date: string;
  itemType: LiveStockItemType;
  erp: string;
  itemName?: string;
  kind: LiveStockMovementKind;
  qty: number;
  /** Shown in the drill-down: job / slip / MRR number. */
  ref?: string;
  /** Counts whatever its date (FG jobs started in the app: their whole record counts). */
  always?: boolean;
  /** FG: which stock it belongs to - a job number, or "Opening" (old stock / receipts). */
  bucket?: string;
};

export type LiveStockJobOutput = {
  entity: string;
  id: string;
  date: string;
  itemType: Extract<LiveStockItemType, "PHP" | "PLATE">;
  erp: string;
  itemName?: string;
  output: number;
  ref?: string;
};

export type LiveStockCutoff = {
  asOn: string;
  cutoffDate: string;
  preCutoffIds: Record<string, string[]>;
  jobBaselines: Record<string, number>;
};

export type LiveStockRow = {
  itemType: LiveStockItemType;
  erp: string;
  itemName: string;
  opening: number;
  production: number;
  receiptPurchase: number;
  receiptRejection: number;
  dispatched: number;
  loadingWastage: number;
  live: number;
  movements: LiveStockMovement[];
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value: number) => Math.round(value * 100) / 100;
const dateOnly = (value: unknown) => String(value || "").trim().slice(0, 10);

/** True when the movement happened after the cutoff. */
export function countsAfterCutoff(cutoff: LiveStockCutoff, entity: string, id: string, date: string) {
  const day = dateOnly(date);
  if (!day || !cutoff.cutoffDate) return false;
  if (day > cutoff.cutoffDate) return true;
  if (day < cutoff.cutoffDate) return false;
  return !(cutoff.preCutoffIds[entity] || []).includes(String(id));
}

export function computeLiveStock(input: {
  cutoff: LiveStockCutoff;
  openings: LiveStockOpening[];
  movements: LiveStockMovement[];
  jobOutputs?: LiveStockJobOutput[];
  itemNames?: Record<string, string>;
}): LiveStockRow[] {
  const rows = new Map<string, LiveStockRow>();
  const keyOf = (itemType: string, erp: string) => `${itemType}|${String(erp || "").trim()}`;
  const rowFor = (itemType: LiveStockItemType, erp: string, itemName?: string) => {
    const key = keyOf(itemType, erp);
    let row = rows.get(key);
    if (!row) {
      row = { itemType, erp: String(erp || "").trim(), itemName: "", opening: 0, production: 0, receiptPurchase: 0, receiptRejection: 0, dispatched: 0, loadingWastage: 0, live: 0, movements: [] };
      rows.set(key, row);
    }
    if (!row.itemName && itemName) row.itemName = itemName;
    return row;
  };

  for (const opening of input.openings) {
    if (!String(opening.erp || "").trim()) continue;
    rowFor(opening.itemType, opening.erp, opening.itemName).opening += num(opening.qty);
  }

  for (const movement of input.movements) {
    if (!String(movement.erp || "").trim() || !num(movement.qty)) continue;
    if (!movement.always && !countsAfterCutoff(input.cutoff, movement.entity, movement.id, movement.date)) continue;
    const row = rowFor(movement.itemType, movement.erp, movement.itemName);
    row[movement.kind] += num(movement.qty);
    row.movements.push(movement);
  }

  for (const job of input.jobOutputs || []) {
    if (!String(job.erp || "").trim()) continue;
    const baseline = num(input.cutoff.jobBaselines[job.id]);
    const day = dateOnly(job.date);
    // Jobs that existed at the cutoff count only what was produced since; newer jobs count in full.
    const delta = job.id in input.cutoff.jobBaselines ? num(job.output) - baseline : day > input.cutoff.cutoffDate || !day ? num(job.output) : 0;
    if (!delta) continue;
    const row = rowFor(job.itemType, job.erp, job.itemName);
    row.production += delta;
    row.movements.push({ entity: job.entity, id: job.id, date: job.date, itemType: job.itemType, erp: job.erp, itemName: job.itemName, kind: "production", qty: delta, ref: job.ref });
  }

  return [...rows.values()]
    .map((row) => {
      const itemName = row.itemName || input.itemNames?.[keyOf(row.itemType, row.erp)] || "";
      const clean = {
        ...row,
        itemName,
        opening: round(row.opening),
        production: round(row.production),
        receiptPurchase: round(row.receiptPurchase),
        receiptRejection: round(row.receiptRejection),
        dispatched: round(row.dispatched),
        loadingWastage: round(row.loadingWastage),
      };
      clean.live = round(clean.opening + clean.production + clean.receiptPurchase + clean.receiptRejection - clean.dispatched - clean.loadingWastage);
      clean.movements = [...row.movements].sort((a, b) => a.date.localeCompare(b.date));
      return clean;
    })
    .sort((a, b) => a.itemType.localeCompare(b.itemType) || a.itemName.localeCompare(b.itemName) || a.erp.localeCompare(b.erp));
}
