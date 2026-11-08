// Fast NPD stock matching.
//
// The NPD stock queries matched each loading-slip / invoice / machine line to
// its NPD item with long "a = x OR b = x OR ..." joins, which MySQL cannot do
// with an index (about 43 s per build). These functions take the plain rows
// (simple, indexed reads) and do the same matching here with lookups.
//
// They follow the SQL rules exactly:
// - text equality like the database collation (utf8mb4_unicode_ci): case and
//   accents ignored, trailing spaces ignored; NULL never equals anything;
// - LEFT JOIN: a line matching several items counts once for each of them;
//   a line matching none is kept once with no item;
// - NULLIF(x, '') / COALESCE(...) as written in the original queries.

export type Row = Record<string, any>;

/** Text key that compares like the database collation. null/undefined -> null. */
export function ck(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ +$/, "");
}

/** NULLIF(x, ''): null when the text is empty (trailing spaces ignored). */
export function nz(value: unknown): any {
  if (value === null || value === undefined) return null;
  return ck(value) === "" ? null : value;
}

export function coalesce(...values: unknown[]): any {
  for (const value of values) if (value !== null && value !== undefined) return value;
  return null;
}

export function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Rows grouped by the collation key of one column. */
export function indexBy(rows: Row[], column: string) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = ck(row[column]);
    if (key === null) continue;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function lookup(map: Map<string, Row[]>, value: unknown): Row[] {
  const key = ck(value);
  if (key === null) return [];
  return map.get(key) || [];
}

/** Distinct rows matching any of the (index, value) pairs: an OR join. */
function lookupAny(pairs: Array<[Map<string, Row[]>, unknown]>): Row[] {
  const found = new Set<Row>();
  for (const [map, value] of pairs) for (const row of lookup(map, value)) found.add(row);
  return Array.from(found);
}

/** LEFT JOIN result: the matches, or one "no match" entry. */
function orNone(rows: Row[]): Array<Row | null> {
  return rows.length ? rows : [null];
}

const isCancelled = (status: unknown) => ck(coalesce(status, "Active")) === "cancelled";

export type NpdIndexes = { byId: Map<string, Row[]>; byNpdId: Map<string, Row[]>; byErp: Map<string, Row[]> };

export function buildNpdIndexes(npdRows: Row[]): NpdIndexes {
  return { byId: indexBy(npdRows, "id"), byNpdId: indexBy(npdRows, "npdId"), byErp: indexBy(npdRows, "erp") };
}

/**
 * Invoiced quantity per NPD item (the "inv" part of the item totals query),
 * keyed by the collation key of the item id.
 */
export function computeInvoicedByItem(input: {
  npd: NpdIndexes;
  slipLines: Row[]; // loading slip id, invoiceId, status + JSON_TABLE columns
  invoices: Row[];
  dispatchPlans: Row[];
  orders: Row[];
  invoiceLineItems: Row[];
  loadingSlips: Row[]; // id, invoiceId, status
}) {
  const { npd } = input;
  const invoiceById = indexBy(input.invoices, "id");
  const planById = indexBy(input.dispatchPlans, "id");
  const orderById = indexBy(input.orders, "id");
  const slipById = indexBy(input.loadingSlips, "id");
  const totals = new Map<string, number>();
  const add = (masterId: unknown, qty: number) => {
    const key = ck(masterId);
    if (key === null) return;
    totals.set(key, (totals.get(key) || 0) + qty);
  };

  // Part 1: invoiced loading-slip lines.
  for (const line of input.slipLines) {
    if (nz(line.invoiceId) === null) continue; // COALESCE(NULLIF(ls.invoiceId, ''), '') <> 
    if (isCancelled(line.status)) continue;
    const invoices = lookup(invoiceById, line.invoiceId);
    if (!invoices.length) continue; // JOIN invoices
    for (const _invoice of invoices) {
      for (const plan of orNone(lookup(planById, line.dispatchPlanId))) {
        for (const order of orNone(plan ? lookup(orderById, plan.orderId) : [])) {
          const key = coalesce(nz(line.npdId), nz(line.itemId), nz(order?.npdId ?? null), order?.itemId ?? null, "");
          if (ck(key) === "") continue;
          const items = lookupAny([
            [npd.byId, line.npdId], [npd.byNpdId, line.npdId], [npd.byErp, line.npdId],
            [npd.byId, line.itemId], [npd.byNpdId, line.itemId], [npd.byErp, line.itemId],
            [npd.byId, order?.npdId ?? null], [npd.byNpdId, order?.npdId ?? null], [npd.byErp, order?.npdId ?? null],
            [npd.byId, order?.itemId ?? null], [npd.byNpdId, order?.itemId ?? null], [npd.byErp, order?.itemId ?? null],
          ]);
          for (const item of orNone(items)) {
            add(coalesce(item?.id ?? null, nz(line.npdId), nz(line.itemId), nz(order?.npdId ?? null), order?.itemId ?? null), num(line.loadedQty));
          }
        }
      }
    }
  }

  // Part 2: invoice lines without an invoiced (non-cancelled) loading slip.
  for (const line of input.invoiceLineItems) {
    const slips = lookup(slipById, line.loadingSlipId).filter((slip) => !isCancelled(slip.status));
    for (const slip of orNone(slips)) {
      const invoices = slip ? lookup(invoiceById, slip.invoiceId) : [];
      for (const invoice of orNone(invoices)) {
        if (invoice) continue; // WHERE ls_invoice.id IS NULL
        const items = lookupAny([
          [npd.byId, line.npdId], [npd.byNpdId, line.npdId], [npd.byErp, line.npdId],
          [npd.byId, line.itemId], [npd.byNpdId, line.itemId], [npd.byErp, line.itemId],
        ]);
        for (const item of orNone(items)) {
          add(coalesce(item?.id ?? null, nz(line.npdId), nz(line.itemId)), num(line.qty));
        }
      }
    }
  }
  return totals;
}

/** Rows of the firm-wise "machine processing outputs" query. */
export function computeProcessedOutputs(input: { npd: NpdIndexes; processing: Row[]; productions: Row[] }) {
  const { npd } = input;
  const productionById = indexBy(input.productions, "id");
  const out: Row[] = [];
  for (const entry of input.processing) {
    if (ck(coalesce(entry.completionStatus, "")) !== "full") continue;
    for (const p of lookup(productionById, entry.productionId)) {
      if (!(p.status === null || p.status === undefined || ck(p.status) !== "cancelled")) continue;
      const items = lookupAny([
        [npd.byId, p.npdId], [npd.byNpdId, p.npdId], [npd.byErp, p.npdId],
        [npd.byId, p.itemId], [npd.byNpdId, p.itemId], [npd.byErp, p.itemId],
        [npd.byErp, p.erpCode],
      ]);
      for (const item of orNone(items)) {
        out.push({
          sourceFirmId: p.sourceFirmId, destinationFirmId: p.destinationFirmId, erpCode: p.erpCode,
          itemId: p.itemId, npdId: p.npdId, resolvedNpdId: item?.id ?? null, npdItemName: item?.itemName ?? null,
          machineName: entry.machineName, qty: num(entry.qty),
        });
      }
    }
  }
  return out;
}

/** Rows of the firm-wise "invoice outputs" query. */
export function computeInvoiceOutputs(input: {
  slipLines: Row[];
  invoices: Row[];
  dispatchPlans: Row[];
  orders: Row[];
  productions: Row[];
  interFirm: Row[];
  invoiceLineItems: Row[];
}) {
  const invoiceById = indexBy(input.invoices, "id");
  const planById = indexBy(input.dispatchPlans, "id");
  const orderById = indexBy(input.orders, "id");
  const productionById = indexBy(input.productions, "id");
  const interById = indexBy(input.interFirm, "id");
  const interBySource = indexBy(input.interFirm, "sourceTransactionId");
  const out: Row[] = [];

  for (const line of input.invoiceLineItems) {
    if (line.loadingSlipId !== null && line.loadingSlipId !== undefined) continue; // IS NULL
    for (const invoice of lookup(invoiceById, line.invoiceId)) {
      for (const p of orNone(lookup(productionById, line.sourceTransactionId))) {
        const inter = lookupAny([[interById, invoice.sourceTransactionId], [interBySource, line.sourceTransactionId]]);
        for (const ip of orNone(inter)) {
          const firmId = coalesce(nz(line.sourceFirmId), nz(ip?.sourceFirmId ?? null), nz(p?.sourceFirmId ?? null), nz(invoice.sourceFirmId), nz(line.orderFirmId), nz(invoice.orderFirmId));
          const itemId = ck(coalesce(line.itemSource, "")) === "material" && ck(coalesce(nz(ip?.npdId ?? null), "")) !== ""
            ? ip!.npdId
            : coalesce(nz(line.npdId), nz(line.itemId), p?.npdId ?? null, p?.itemId ?? null, p?.erpCode ?? null, ip?.npdId ?? null, ip?.itemId ?? null);
          out.push({ invoiceNo: invoice.invoiceNo, firmId, itemId, qty: num(line.qty) });
        }
      }
    }
  }

  for (const line of input.slipLines) {
    if (isCancelled(line.status)) continue;
    for (const invoice of lookup(invoiceById, line.invoiceId)) {
      for (const plan of orNone(lookup(planById, line.dispatchPlanId))) {
        for (const order of orNone(plan ? lookup(orderById, plan.orderId) : [])) {
          for (const p of orNone(plan ? lookup(productionById, plan.productionId) : [])) {
            const inter = plan ? lookupAny([[interBySource, plan.productionId], [interBySource, plan.id]]) : [];
            for (const ip of orNone(inter)) {
              const firmId = coalesce(nz(ip?.sourceFirmId ?? null), nz(p?.sourceFirmId ?? null), nz(invoice.sourceFirmId), nz(order?.firmId ?? null), nz(invoice.orderFirmId));
              const itemId = coalesce(nz(line.npdId), nz(line.itemId), order?.npdId ?? null, order?.itemId ?? null);
              out.push({ invoiceNo: invoice.invoiceNo, firmId, itemId, qty: num(line.loadedQty) });
            }
          }
        }
      }
    }
  }
  return out;
}
