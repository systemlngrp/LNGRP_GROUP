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
  const [materialIssues, , materialIssuesLoading] = useData<MaterialIssue>("material_issues", [], { firmScope: "all" });
  const [materialIssueLines, , materialIssueLinesLoading] = useData<MaterialIssueLine>("material_issue_lines", [], { firmScope: "all" });
  const [materialIssueReelLines, , materialIssueReelLinesLoading] = useData<MaterialIssueReelLine>("material_issue_reel_lines", [], { firmScope: "all" });
  const [materialReturns, , materialReturnsLoading] = useData<MaterialReturn>("material_returns", [], { firmScope: "all" });
  const [materialReturnLines, , materialReturnLinesLoading] = useData<MaterialReturnLine>("material_return_lines", [], { firmScope: "all" });
  const [materialReturnReelLines, , materialReturnReelLinesLoading] = useData<MaterialReturnReelLine>("material_return_reel_lines", [], { firmScope: "all" });

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

  const issuedProductionIds = useMemo(() => {
    const productionByIssueId = new Map(materialIssues
      .filter((issue) => issue.issueType === "Job" && issue.productionId)
      .map((issue) => [issue.id, issue.productionId as string]));
    const ids = new Set<string>();
    materialIssueLines.forEach((line) => {
      const productionId = productionByIssueId.get(line.materialIssueId);
      if (productionId && Number(line.qty || 0) > 0) ids.add(productionId);
    });
    materialIssueReelLines.forEach((line) => {
      if (Number(line.weightKg || 0) <= 0) return;
      const productionId = line.productionId || productionByIssueId.get(line.materialIssueId);
      if (productionId) ids.add(productionId);
    });
    return ids;
  }, [materialIssueLines, materialIssueReelLines, materialIssues]);

  return {
    usageMap,
    issuedProductionIds,
    loading: materialIssuesLoading || materialIssueLinesLoading || materialIssueReelLinesLoading ||
      materialReturnsLoading || materialReturnLinesLoading || materialReturnReelLinesLoading,
  };
}
