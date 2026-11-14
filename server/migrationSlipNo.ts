// Migration only: lets an Admin save a Direct loading slip under a chosen
// number in its firm's series (for example old scrap sales loaded from Tally
// in date order: LNCB-1/LS/26-27/00001, 00002, ...), instead of drawing the
// next number from the counter.
//
// The number must be "<firm prefix>/LS/<fy>/<5 digits>", where the prefix is
// the slip's own firm and <fy> comes from the slip date. It must not belong to
// another slip. Afterwards the firm's counter is set to the highest number in
// use in that series, so the next normal slip always follows on.

export type MigrationSlipNo = { slipNo: string; seriesKey: string; number: number };

export function parseMigrationSlipNo(value: unknown, firmPrefix: string, fy: string): MigrationSlipNo | null {
  const slipNo = String(value ?? "").trim();
  const seriesKey = `${firmPrefix}/LS/${fy}`;
  if (!firmPrefix || !fy || !slipNo.startsWith(`${seriesKey}/`)) return null;
  const tail = slipNo.slice(seriesKey.length + 1);
  if (!/^\d{5}$/.test(tail)) return null;
  const number = Number.parseInt(tail, 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return { slipNo, seriesKey, number };
}

export function migrationSlipNoError(
  parsed: MigrationSlipNo | null,
  expectedSeries: string,
  usedByOtherIds: string[],
): string | null {
  if (!parsed) return `Migration slip number must look like ${expectedSeries}/00001.`;
  if (usedByOtherIds.length) return `${parsed.slipNo} already belongs to another loading slip.`;
  return null;
}

// Highest number in use in the series once this slip is saved; the counter is
// set to it (other numbers are those of the other slips in the series).
export function migrationSlipCounterValue(parsed: MigrationSlipNo, otherSlipNos: string[]): number {
  let max = parsed.number;
  for (const value of otherSlipNos) {
    const text = String(value || "").trim();
    if (!text.startsWith(`${parsed.seriesKey}/`)) continue;
    const number = Number.parseInt(text.slice(parsed.seriesKey.length + 1), 10);
    if (Number.isFinite(number) && number > max) max = number;
  }
  return max;
}
