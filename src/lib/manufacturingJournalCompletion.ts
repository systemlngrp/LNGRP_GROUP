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
