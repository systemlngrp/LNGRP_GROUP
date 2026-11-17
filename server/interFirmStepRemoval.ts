// Removes a Corrugation Liner / Printing entry with the inter-firm documents it
// created (pending invoice, MRR, gate entry, invoice + lines), then closes the
// number gaps in the MRR, gate entry and invoice series and lowers the MRR/GE
// counters. Preview first (apply = false): nothing is changed.
import type mysql from "mysql2/promise";

type Doc = { id: string; no: string };
type SeriesPlan = { table: string; field: string; series: string; removed: string[]; changes: Array<{ id: string; from: string; to: string }> };

const splitNo = (no: string) => {
  const match = String(no || "").match(/^(.*?)(\d+)$/);
  return match ? { series: match[1], n: Number(match[2]), width: match[2].length } : null;
};

/** New numbers for the rows after the removed ones: each moves down by the count of removed numbers below it. */
export function planSeriesRenumber(rows: Doc[], removedNos: string[]) {
  const removed = removedNos.map(splitNo).filter(Boolean) as Array<{ series: string; n: number; width: number }>;
  if (!removed.length) return [];
  const series = removed[0].series;
  const removedNumbers = removed.map((r) => r.n).sort((a, b) => a - b);
  const lowest = removedNumbers[0];
  return rows
    .map((row) => ({ row, parsed: splitNo(row.no) }))
    .filter(({ row, parsed }) => parsed && parsed.series === series && parsed.n > lowest && !removedNos.includes(row.no))
    .sort((a, b) => a.parsed!.n - b.parsed!.n)
    .map(({ row, parsed }) => {
      const shift = removedNumbers.filter((n) => n < parsed!.n).length;
      return { id: row.id, from: row.no, to: `${series}${String(parsed!.n - shift).padStart(parsed!.width, "0")}` };
    })
    .filter((change) => change.from !== change.to);
}

export async function removeInterFirmSteps(conn: mysql.PoolConnection, processingIds: string[], apply: boolean) {
  const ids = [...new Set(processingIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) throw new Error("No processing entries given.");
  const [processingRows] = await conn.query("SELECT id, productionId, machineName, completionStatus, qty FROM production_processing WHERE id IN (?)", [ids]);
  if ((processingRows as any[]).length !== ids.length) throw new Error("One or more processing entries were not found.");
  const [pendingRows] = await conn.query("SELECT id, sourceTransactionId, linkedGateEntryId, linkedMrrId, linkedInvoiceId FROM inter_firm_pending_invoices WHERE sourceTransactionId IN (?)", [ids]);
  const pending = pendingRows as any[];
  const mrrIds = pending.map((row) => row.linkedMrrId).filter(Boolean);
  const geIds = pending.map((row) => row.linkedGateEntryId).filter(Boolean);
  const invoiceIds = pending.map((row) => row.linkedInvoiceId).filter(Boolean);
  const [mrrs] = mrrIds.length ? await conn.query("SELECT id, transactionNo, status FROM material_in WHERE id IN (?)", [mrrIds]) : [[]];
  const [ges] = geIds.length ? await conn.query("SELECT id, gateEntryNo FROM gate_entries WHERE id IN (?)", [geIds]) : [[]];
  const [invoices] = invoiceIds.length ? await conn.query("SELECT id, invoiceNo, tallyTimestamp FROM invoices WHERE id IN (?)", [invoiceIds]) : [[]];
  const posted = (invoices as any[]).filter((row) => String(row.tallyTimestamp || "").trim());
  if (posted.length) throw new Error(`Invoice already posted to Tally: ${posted.map((row) => row.invoiceNo).join(", ")}`);

  const removedMrr = (mrrs as any[]).map((row) => String(row.transactionNo));
  const removedGe = (ges as any[]).map((row) => String(row.gateEntryNo));
  const removedInvoice = (invoices as any[]).map((row) => String(row.invoiceNo));
  const like = (nos: string[]) => `${splitNo(nos[0])?.series || "~none~"}%`;
  const plans: SeriesPlan[] = [];
  if (removedMrr.length) {
    const [rows] = await conn.query("SELECT id, transactionNo AS no FROM material_in WHERE transactionNo LIKE ?", [like(removedMrr)]);
    plans.push({ table: "material_in", field: "transactionNo", series: splitNo(removedMrr[0])!.series, removed: removedMrr, changes: planSeriesRenumber(rows as Doc[], removedMrr) });
  }
  if (removedGe.length) {
    const [rows] = await conn.query("SELECT id, gateEntryNo AS no FROM gate_entries WHERE gateEntryNo LIKE ?", [like(removedGe)]);
    plans.push({ table: "gate_entries", field: "gateEntryNo", series: splitNo(removedGe[0])!.series, removed: removedGe, changes: planSeriesRenumber(rows as Doc[], removedGe) });
  }
  if (removedInvoice.length) {
    const [rows] = await conn.query("SELECT id, invoiceNo AS no, tallyTimestamp FROM invoices WHERE invoiceNo LIKE ?", [like(removedInvoice)]);
    const changes = planSeriesRenumber(rows as Doc[], removedInvoice);
    const postedLater = (rows as any[]).filter((row) => String(row.tallyTimestamp || "").trim() && changes.some((change) => change.id === row.id));
    if (postedLater.length) throw new Error(`Later invoices already posted to Tally would be renumbered: ${postedLater.map((row) => row.no).join(", ")}`);
    plans.push({ table: "invoices", field: "invoiceNo", series: splitNo(removedInvoice[0])!.series, removed: removedInvoice, changes });
  }

  const summary = {
    processing: processingRows,
    deleted: { pendingInvoices: pending.length, mrr: removedMrr, gateEntries: removedGe, invoices: removedInvoice },
    renumber: plans.map((plan) => ({ table: plan.table, series: plan.series, changes: plan.changes.map((change) => `${change.from} -> ${change.to}`) })),
    applied: false,
  };
  if (!apply) return summary;

  if (invoiceIds.length) {
    await conn.query("DELETE FROM invoice_line_items WHERE invoiceId IN (?)", [invoiceIds]);
    await conn.query("DELETE FROM invoices WHERE id IN (?)", [invoiceIds]);
  }
  if (mrrIds.length) await conn.query("DELETE FROM material_in WHERE id IN (?)", [mrrIds]);
  if (geIds.length) await conn.query("DELETE FROM gate_entries WHERE id IN (?)", [geIds]);
  if (pending.length) await conn.query("DELETE FROM inter_firm_pending_invoices WHERE id IN (?)", [pending.map((row) => row.id)]);
  await conn.query(
    "UPDATE productions SET interFirmFlow = NULL, sourceTransactionType = NULL, sourceTransactionId = NULL, linkedGateEntryId = NULL, linkedMrrId = NULL WHERE sourceTransactionId IN (?) OR (linkedMrrId IS NOT NULL AND linkedMrrId IN (?))",
    [ids, mrrIds.length ? mrrIds : ["~none~"]]
  );
  await conn.query("DELETE FROM production_processing WHERE id IN (?)", [ids]);

  // Renumber in ascending order: each target number is already free.
  for (const plan of plans) {
    for (const change of plan.changes) {
      await conn.query(`UPDATE \`${plan.table}\` SET \`${plan.field}\` = ? WHERE id = ?`, [change.to, change.id]);
      if (plan.table === "invoices") {
        await conn.query("UPDATE material_in SET invoiceNo = ? WHERE invoiceNo = ? AND linkedInvoiceId = ?", [change.to, change.from, change.id]);
        await conn.query("UPDATE gate_entries SET invoiceNo = ? WHERE invoiceNo = ?", [change.to, change.from]);
      } else if (plan.table === "material_in") {
        await conn.query("UPDATE gate_entries SET mrrNo = ? WHERE mrrId = ?", [change.to, change.id]);
      } else if (plan.table === "gate_entries") {
        await conn.query("UPDATE material_in SET gateEntryNo = ? WHERE gateEntryNo = ?", [change.to, change.from]);
      }
    }
    if (plan.table !== "invoices") {
      // MRR / GE numbers come from transaction_counters; set it to the highest number still used.
      const counterKey = plan.series.replace(/\/$/, "");
      const [maxRows] = await conn.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(\`${plan.field}\`, '/', -1) AS UNSIGNED)), 0) AS maxNo FROM \`${plan.table}\` WHERE \`${plan.field}\` LIKE ?`,
        [`${plan.series}%`]
      );
      await conn.query("UPDATE transaction_counters SET lastValue = ? WHERE counterKey = ?", [Number((maxRows as any[])[0]?.maxNo || 0), counterKey]);
    }
  }
  return { ...summary, applied: true };
}
