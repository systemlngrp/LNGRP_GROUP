// Job-wise reel consumption: shared by the page (browser fallback) and the
// server report engine. Same calculation the page used before.
import type { Material, MaterialIn, MaterialInPackingSlip, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing } from "../../types";
import { normalizeMachineName } from "../productionMachineNames";

export type JobwiseReelConsumptionRow = {
  productionId: string;
  jobNo: string;
  corrugationDate: string;
  jobFfg: number;
  jobRate: number;
  jobValue: number;
  reelIssued: number;
  reelReturned: number;
  reelConsumed: number;
  consumedValue: number;
  gp: number;
  gpPercent: number;
};

export function getReelRateForSlip({
  slip,
  materialInMap,
  materialMap,
}: {
  slip?: MaterialInPackingSlip;
  materialInMap: Map<string, MaterialIn>;
  materialMap: Map<string, Material>;
}) {
  if (!slip) return 0;
  const receipt = materialInMap.get(slip.materialInId);
  const line = receipt?.lines.find((entry) => entry.id === slip.materialLineId);
  const material = materialMap.get(slip.materialId);
  return Number(line?.invoiceRate ?? line?.poRate ?? line?.rate ?? material?.openingRate ?? 0);
}

export type JobwiseReelConsumptionLists = {
  productions: Production[];
  processing: ProductionProcessing[];
  materials: Material[];
  materialIn: MaterialIn[];
  packingSlips: MaterialInPackingSlip[];
  issueReelLines: MaterialIssueReelLine[];
  returnReelLines: MaterialReturnReelLine[];
};

/** All jobs with their consumption; search/date/GP filters and sorting stay in the page. */
export function computeJobwiseReelConsumptionRows(lists: JobwiseReelConsumptionLists): JobwiseReelConsumptionRow[] {
  const { productions, processing, materials, materialIn, packingSlips, issueReelLines, returnReelLines } = lists;
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const materialInMap = new Map(materialIn.map((entry) => [entry.id, entry]));
  const packingSlipMap = new Map(packingSlips.map((slip) => [slip.id, slip]));

  const corrugationDateMap = new Map<string, string>();
  processing.forEach((entry) => {
    if (!normalizeMachineName(entry.machineName).startsWith("Corrugation")) return;
    const existing = corrugationDateMap.get(entry.productionId);
    if (!existing || new Date(entry.date).getTime() > new Date(existing).getTime()) {
      corrugationDateMap.set(entry.productionId, entry.date);
    }
  });

  const sumByProduction = (lines: Array<MaterialIssueReelLine | MaterialReturnReelLine>) => {
    const totals = new Map<string, { weight: number; value: number }>();
    lines.forEach((line) => {
      const current = totals.get(line.productionId) || { weight: 0, value: 0 };
      const slip = packingSlipMap.get(line.packingSlipId);
      const rate = getReelRateForSlip({ slip, materialInMap, materialMap });
      current.weight += Number(line.weightKg || 0);
      current.value += Number(line.weightKg || 0) * rate;
      totals.set(line.productionId, current);
    });
    return totals;
  };
  const issuedByProduction = sumByProduction(issueReelLines);
  const returnedByProduction = sumByProduction(returnReelLines);

  return productions
    .filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp && Number(production.prodFromFFG || 0) > 0)
    .map((production) => {
      const issued = issuedByProduction.get(production.id) || { weight: 0, value: 0 };
      const returned = returnedByProduction.get(production.id) || { weight: 0, value: 0 };
      const jobFfg = Number(production.prodFromFFG || 0);
      const jobRate = Number(production.rate || 0);
      const jobValue = jobFfg * jobRate;
      const reelIssued = Number(Number(issued.weight || 0).toFixed(2));
      const reelReturned = Number(Number(returned.weight || 0).toFixed(2));
      const reelConsumed = Number((reelIssued - reelReturned).toFixed(2));
      const consumedValue = Number(Number(issued.value - returned.value || 0).toFixed(2));
      const gp = Number(Number(jobValue - consumedValue || 0).toFixed(2));
      const gpPercent = jobValue > 0 ? Number(((gp / jobValue) * 100).toFixed(2)) : 0;
      return {
        productionId: production.id,
        jobNo: String(production.transactionNo || production.jobCardNo || ""),
        corrugationDate: corrugationDateMap.get(production.id) || "",
        jobFfg,
        jobRate,
        jobValue: Number(jobValue.toFixed(2)),
        reelIssued,
        reelReturned,
        reelConsumed,
        consumedValue,
        gp,
        gpPercent,
      };
    });
}
