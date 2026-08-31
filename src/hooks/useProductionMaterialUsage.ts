import { useMemo } from "react";
import { useData } from "./useData";
import {
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
} from "../types";
import { buildProductionMaterialUsageMap } from "../lib/productionMaterialUsage";

export function useProductionMaterialUsage() {
  const [materialIssues, , materialIssuesLoading] = useData<MaterialIssue>("material_issues", []);
  const [materialIssueLines, , materialIssueLinesLoading] = useData<MaterialIssueLine>("material_issue_lines", []);
  const [materialIssueReelLines, , materialIssueReelLinesLoading] = useData<MaterialIssueReelLine>("material_issue_reel_lines", []);
  const [materialReturns, , materialReturnsLoading] = useData<MaterialReturn>("material_returns", []);
  const [materialReturnLines, , materialReturnLinesLoading] = useData<MaterialReturnLine>("material_return_lines", []);
  const [materialReturnReelLines, , materialReturnReelLinesLoading] = useData<MaterialReturnReelLine>("material_return_reel_lines", []);

  const usageMap = useMemo(
    () => buildProductionMaterialUsageMap(
      materialIssues,
      materialIssueLines,
      materialReturns,
      materialReturnLines,
      materialIssueReelLines,
      materialReturnReelLines
    ),
    [materialIssueLines, materialIssueReelLines, materialIssues, materialReturnLines, materialReturnReelLines, materialReturns]
  );

  return {
    usageMap,
    loading: materialIssuesLoading || materialIssueLinesLoading || materialIssueReelLinesLoading ||
      materialReturnsLoading || materialReturnLinesLoading || materialReturnReelLinesLoading,
  };
}
