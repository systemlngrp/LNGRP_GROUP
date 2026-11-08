import type { MaterialIssueReelLine, MaterialReturnReelLine, Production } from "../types";
import { getAllReturnableReelLines } from "./materialMovement";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export function areUnitOneReelsComplete(
  productionId: string | undefined,
  jobNo: string | undefined,
  issueReels: MaterialIssueReelLine[],
  returnReels: MaterialReturnReelLine[],
  productions: Pick<Production, "id" | "transactionNo" | "jobCardNo">[] = [],
) {
  const issues = issueReels.filter((row) =>
    row.productionId === productionId || normalize(row.jobNo) === normalize(jobNo),
  );
  if (!issues.length) return false;

  const production = productions.find((row) =>
    row.id === productionId || normalize(row.transactionNo) === normalize(jobNo) || normalize(row.jobCardNo) === normalize(jobNo),
  ) || { id: productionId || "", transactionNo: jobNo || "", jobCardNo: jobNo || "" };

  return getAllReturnableReelLines(issues, returnReels, [production]).length === 0;
}

/**
 * Same answers as areUnitOneReelsComplete for many jobs: the reel lists are
 * indexed once, and each job only looks at the reel lines that can belong to
 * it (in their original order). Results are cached per job.
 */
export function buildUnitOneReelsChecker(
  issueReels: MaterialIssueReelLine[],
  returnReels: MaterialReturnReelLine[],
  productions: Pick<Production, "id" | "transactionNo" | "jobCardNo">[] = [],
) {
  const group = <T,>(rows: T[], keyOf: (row: T) => unknown) => {
    const map = new Map<unknown, number[]>();
    rows.forEach((row, index) => {
      const key = keyOf(row);
      const list = map.get(key);
      if (list) list.push(index);
      else map.set(key, [index]);
    });
    return map;
  };
  const firstIndex = <T,>(rows: T[], keyOf: (row: T) => unknown) => {
    const map = new Map<unknown, number>();
    rows.forEach((row, index) => { const key = keyOf(row); if (!map.has(key)) map.set(key, index); });
    return map;
  };
  const issuesByProductionId = group(issueReels, (row) => row.productionId);
  const issuesByJobNo = group(issueReels, (row) => normalize(row.jobNo));
  const productionById = firstIndex(productions, (row) => row.id);
  const productionByTransactionNo = firstIndex(productions, (row) => normalize(row.transactionNo));
  const productionByJobCardNo = firstIndex(productions, (row) => normalize(row.jobCardNo));
  const returnsByProductionId = group(returnReels, (row) => String(row.productionId || "").trim());
  const returnsByJobNo = group(returnReels, (row) => normalize(row.jobNo));
  const merge = (...lists: Array<number[] | undefined>) => Array.from(new Set(lists.flatMap((list) => list || []))).sort((a, b) => a - b);
  const cache = new Map<string, boolean>();

  return (productionId: string | undefined, jobNo: unknown) => {
    const idKey = productionId === undefined ? "u" : productionId === null ? "n" : `s${productionId}`;
    const cacheKey = `${idKey}\u0001${normalize(jobNo)}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const issues = merge(issuesByProductionId.get(productionId), issuesByJobNo.get(normalize(jobNo))).map((index) => issueReels[index]);
    let result = false;
    if (issues.length) {
      const candidates = [productionById.get(productionId), productionByTransactionNo.get(normalize(jobNo)), productionByJobCardNo.get(normalize(jobNo))].filter((value): value is number => value !== undefined);
      const production = candidates.length ? productions[Math.min(...candidates)] : { id: productionId || "", transactionNo: (jobNo || "") as string, jobCardNo: (jobNo || "") as string };
      // A return line can only cancel these issues if it resolves to the same
      // job: by its own job id, or by this job's numbers.
      const resolvedIds = new Set<string>([String(production.id || "").trim()]);
      issues.forEach((row) => resolvedIds.add(String(row.productionId || "").trim()));
      const returnIndexes = merge(
        ...Array.from(resolvedIds).filter(Boolean).map((id) => returnsByProductionId.get(id)),
        returnsByJobNo.get(normalize(production.transactionNo)),
        returnsByJobNo.get(normalize(production.jobCardNo)),
      );
      result = getAllReturnableReelLines(issues, returnIndexes.map((index) => returnReels[index]), [production]).length === 0;
    }
    cache.set(cacheKey, result);
    return result;
  };
}
