// FG (owner's rule, 27-Nov-2026 evening): jobs started in the app (from 17-Nov-2026) count
// from their own record (printed - loaded - loading wastage, all dates; closed jobs 0); the
// physical count is kept only for older stock (lots before 17-Nov, boxes with no lot), less
// what is loaded from it after the count. PHP / Plate keep the rule below.
// Live stock from a physical count (owner's rule, 27-Nov-2026):
//   Live = Opening (physical count + adjustment rows, as on the cutoff)
//        + Production (FG: printed qty; PHP/Plate: job output)
//        + Receipts (FG Purchase MRRs of any firm but Unit-I - each its own lot, by MRR number;
//          Rejection In MRRs into Unit-II; never the automatic inter-firm ones)
//        - Dispatched (loaded qty on loading slips)
//        - Loading wastage (FG, entered on the slips)
// Only movements after the cutoff count. A movement dated the cutoff day counts
// unless its id was saved before the cutoff (cutoff.preCutoffIds). PHP / Plate job
// output counts as the change since the cutoff (cutoff.jobBaselines).
/** FG Purchase MRR numbers are their own lots, like jobs (e.g. LNKI/MRR/26-27/00049). */
export const isPurchaseBucket = (bucket) => /\/MRR\//i.test(String(bucket || ""));
const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value) => Math.round(value * 100) / 100;
const dateOnly = (value) => String(value || "").trim().slice(0, 10);
/** True when the movement happened after the cutoff. */
export function countsAfterCutoff(cutoff, entity, id, date) {
    const day = dateOnly(date);
    if (!day || !cutoff.cutoffDate)
        return false;
    if (day > cutoff.cutoffDate)
        return true;
    if (day < cutoff.cutoffDate)
        return false;
    return !(cutoff.preCutoffIds[entity] || []).includes(String(id));
}
export function computeLiveStock(input) {
    const rows = new Map();
    const keyOf = (itemType, erp) => `${itemType}|${String(erp || "").trim()}`;
    const rowFor = (itemType, erp, itemName) => {
        const key = keyOf(itemType, erp);
        let row = rows.get(key);
        if (!row) {
            row = { itemType, erp: String(erp || "").trim(), itemName: "", opening: 0, production: 0, receiptPurchase: 0, receiptRejection: 0, dispatched: 0, loadingWastage: 0, live: 0, movements: [] };
            rows.set(key, row);
        }
        if (!row.itemName && itemName)
            row.itemName = itemName;
        return row;
    };
    for (const opening of input.openings) {
        if (!String(opening.erp || "").trim())
            continue;
        rowFor(opening.itemType, opening.erp, opening.itemName).opening += num(opening.qty);
    }
    for (const movement of input.movements) {
        if (!String(movement.erp || "").trim() || !num(movement.qty))
            continue;
        if (!movement.always && !countsAfterCutoff(input.cutoff, movement.entity, movement.id, movement.date))
            continue;
        const row = rowFor(movement.itemType, movement.erp, movement.itemName);
        row[movement.kind] += num(movement.qty);
        row.movements.push(movement);
    }
    for (const job of input.jobOutputs || []) {
        if (!String(job.erp || "").trim())
            continue;
        const baseline = num(input.cutoff.jobBaselines[job.id]);
        const day = dateOnly(job.date);
        // Jobs that existed at the cutoff count only what was produced since; newer jobs count in full.
        const delta = job.id in input.cutoff.jobBaselines ? num(job.output) - baseline : day > input.cutoff.cutoffDate || !day ? num(job.output) : 0;
        if (!delta)
            continue;
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
