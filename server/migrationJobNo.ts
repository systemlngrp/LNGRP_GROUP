// Migration only: lets an Admin create a production job under its original
// job number (for example a job that was missed when the Loading PDF history
// was migrated), without drawing a new number from the job counter.
//
// Job numbers come from a counter per financial year ("JOB/<fy>"). A number is
// kept only when it is a plain "JOB/<fy>/<n>" number that does not exist yet
// and the counter can never hand it out again:
// - in the current financial year the counter must already be past it, so the
//   counter is not touched;
// - in a closed financial year a number above that year's counter is allowed,
//   and the caller raises that closed year's counter to it.

export type MigrationJobNo = { transactionNo: string; fy: string; number: number };

export function parseMigrationJobNo(value: unknown): MigrationJobNo | null {
  const transactionNo = String(value ?? "").trim();
  const match = /^JOB\/(\d{2}-\d{2})\/(\d+)$/.exec(transactionNo);
  if (!match) return null;
  const number = Number.parseInt(match[2], 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return { transactionNo: `JOB/${match[1]}/${number}`, fy: match[1], number };
}

export function migrationJobNoError(
  parsed: MigrationJobNo | null,
  existingIds: string[],
  counterLastValue: number,
  currentFy: string,
): string | null {
  if (!parsed) return "Migration job number must look like JOB/25-26/6924.";
  if (existingIds.length) return `${parsed.transactionNo} already exists.`;
  if (parsed.fy === currentFy && parsed.number > counterLastValue) {
    return `${parsed.transactionNo} is above the job counter for ${parsed.fy} (${counterLastValue}); only old numbers can be migrated.`;
  }
  return null;
}

// True when the closed year's counter has to be raised to the migrated number.
export function migrationNeedsCounterRaise(parsed: MigrationJobNo, counterLastValue: number, currentFy: string): boolean {
  return parsed.fy !== currentFy && parsed.number > counterLastValue;
}
