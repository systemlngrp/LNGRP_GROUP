import { useMemo } from "react";
import { useData } from "./useData";
import {
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Production,
} from "../types";
import { buildProductionMaterialUsageMap } from "../lib/productionMaterialUsage";

export function useProductionMaterialUsage() {
  const [productions, , productionsLoading] = useData<Production>("productions", [], { firmScope: "all" });
  const [phpJobs, , phpJobsLoading] = useData<Production>("php_job_master", [], { firmScope: "all" });
  const [plateJobs, , plateJobsLoading] = useData<Production>("plate_job_master", [], { firmScope: "all" });
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
      materialReturnReelLines,
      [...productions, ...phpJobs, ...plateJobs]
    ),
    [materialIssueLines, materialIssueReelLines, materialIssues, materialReturnLines, materialReturnReelLines, materialReturns, productions, phpJobs, plateJobs]
  );

  const issuedProductionIds = useMemo(() => {
    const jobs = [...productions, ...phpJobs, ...plateJobs];
    const knownIds = new Set(jobs.map((job) => job.id));
    const idByJobNo = new Map<string, string>();
    jobs.forEach((job) => [job.transactionNo, job.jobCardNo].forEach((value) => {
      const key = String(value || "").trim().toLowerCase();
      if (key && !idByJobNo.has(key)) idByJobNo.set(key, job.id);
    }));
    const resolveId = (id?: string, jobNo?: string) => {
      const candidate = String(id || "").trim();
      return candidate && knownIds.has(candidate) ? candidate : idByJobNo.get(String(jobNo || "").trim().toLowerCase());
    };
    const productionByIssueId = new Map(materialIssues
      .filter((issue) => issue.issueType === "Job")
      .map((issue) => [issue.id, resolveId(issue.productionId, issue.jobNo)]));
    const ids = new Set<string>();
    materialIssueLines.forEach((line) => {
      const productionId = productionByIssueId.get(line.materialIssueId);
      if (productionId && Number(line.qty || 0) > 0) ids.add(productionId);
    });
    materialIssueReelLines.forEach((line) => {
      if (Number(line.weightKg || 0) <= 0) return;
      const productionId = resolveId(line.productionId, line.jobNo) || productionByIssueId.get(line.materialIssueId);
      if (productionId) ids.add(productionId);
    });
    return ids;
  }, [materialIssueLines, materialIssueReelLines, materialIssues, productions, phpJobs, plateJobs]);

  return {
    usageMap,
    issuedProductionIds,
    loading: materialIssuesLoading || materialIssueLinesLoading || materialIssueReelLinesLoading ||
      materialReturnsLoading || materialReturnLinesLoading || materialReturnReelLinesLoading ||
      productionsLoading || phpJobsLoading || plateJobsLoading,
  };
}
