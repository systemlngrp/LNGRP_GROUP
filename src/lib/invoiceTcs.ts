// TCS (Income-tax s.206C) collected on a sales invoice, e.g. on scrap sold to
// M/S Megha Trading. Worked out as Tally does: rate % of the taxable value
// (Tally invoice LNCB1/26-27/0423: 2% of 51,300.00 = 1,026.00). TCS is not
// sales: it is added to the invoice total only, never to the sale value.

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function normalizeTcsRate(value: unknown): number {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? round2(rate) : 0;
}

export function computeTcsAmount(taxableValue: number, rate: unknown): number {
  const tcsRate = normalizeTcsRate(rate);
  return tcsRate > 0 ? round2((Number(taxableValue) || 0) * tcsRate / 100) : 0;
}

// Default TCS rate for a new invoice to this company ("" when not applicable).
export function companyTcsRate(company?: { tcsApplicable?: string | null; tcsRate?: unknown } | null): number | "" {
  if (String(company?.tcsApplicable || "").trim().toLowerCase() !== "yes") return "";
  const rate = normalizeTcsRate(company?.tcsRate);
  return rate > 0 ? rate : "";
}
