// Matching a supplier name read from an invoice to Supplier Master.
const LEGAL_WORDS = /\b(m\s*s|messrs|pvt|private|ltd|limited|llp|l\s*l\s*p|co|company|corporation|inc|the|cr|dr)\b/g;

/** Name in a comparable form: lower case, Shri/Sri = Shree, no punctuation or legal suffixes. */
export function normalizeSupplierName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(shri|sri|shre)\b/g, "shree")
    .replace(LEGAL_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Party = { id: string; name: string };

/**
 * Supplier Master first (exact, then one name containing the other, longest
 * supplier name wins), and only then other parties such as companies.
 */
export function findInvoiceSupplier<T extends Party>(invoiceName: unknown, suppliers: T[], others: T[] = []): T | null {
  const search = normalizeSupplierName(invoiceName);
  if (!search) return null;
  for (const list of [suppliers, others]) {
    const named = list.map((party) => ({ party, name: normalizeSupplierName(party.name) })).filter((row) => row.name);
    const exact = named.find((row) => row.name === search);
    if (exact) return exact.party;
    const partial = named
      .filter((row) => row.name.includes(search) || search.includes(row.name))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (partial) return partial.party;
  }
  return null;
}
