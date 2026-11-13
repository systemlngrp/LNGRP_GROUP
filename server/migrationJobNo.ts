// Migration only: lets an Admin create a production job under its original
// job number (for example a job that was missed when the Loading PDF history
// was migrated), without drawing a new number from the job counter.
//
// The number is kept only when it is a plain "JOB/<fy>/<n>" number that does
// not exist yet and is not above the highest job number already used in that
// financial year, so the counter can never hand the same number out later.

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
  highestNumberInFy: number,
): string | null {
  if (!parsed) return "Migration job number must look like JOB/26-27/6924.";
  if (existingIds.length) return `${parsed.transactionNo} already exists.`;
  if (parsed.number > highestNumberInFy) {
    return `${parsed.transactionNo} is above the highest job number used in ${parsed.fy} (${highestNumberInFy}); only old numbers can be migrated.`;
  }
  return null;
}
